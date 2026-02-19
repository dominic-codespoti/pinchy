//! Built-in `browser` tool — multi-action headless browser automation.
//!
//! Supports: navigate, click, links, text extraction, JS eval, screenshot.
//! Maintains a persistent session across calls so multi-step browsing works.

use serde_json::Value;
use std::sync::Arc;
use tokio::sync::Mutex;

use super::browser_service;
use crate::tools::{register_tool, ToolMeta};

/// Lazy-initialized persistent browser service + session.
static PERSISTENT: once_cell::sync::Lazy<Arc<Mutex<Option<PersistentBrowser>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(Mutex::new(None)));

struct PersistentBrowser {
    svc: browser_service::BrowserService,
    session_id: String,
    current_url: String,
}

async fn get_or_create(headless: bool) -> anyhow::Result<()> {
    let mut lock = PERSISTENT.lock().await;
    if lock.is_some() {
        return Ok(());
    }
    let svc = browser_service::BrowserService::new(headless).await?;
    let session_id = svc.create_session("default").await?;
    *lock = Some(PersistentBrowser {
        svc,
        session_id,
        current_url: String::new(),
    });
    Ok(())
}

async fn reset_session() {
    let mut lock = PERSISTENT.lock().await;
    if let Some(pb) = lock.take() {
        let _ = pb.svc.close(&pb.session_id).await;
    }
}

const MAX_CHARS: usize = 12_000;

fn truncate_result(s: &str) -> String {
    if s.len() <= MAX_CHARS {
        return s.to_string();
    }
    let truncated = &s[..s.floor_char_boundary(MAX_CHARS)];
    format!(
        "{truncated}\n\n[… truncated — {} chars total, showing first {MAX_CHARS}. Use a CSS selector to narrow results.]",
        s.len()
    )
}

/// Browser tool — dispatch by action.
pub async fn browser_tool(args: Value) -> anyhow::Result<Value> {
    let action = args["action"].as_str().unwrap_or(
        // Backwards compat: if "url" is present with no action, assume navigate
        if args.get("url").is_some() { "navigate" } else { "text" }
    );
    let headless = args["headless"].as_bool().unwrap_or(true);

    // "reset" action tears down the persistent session
    if action == "reset" {
        reset_session().await;
        return Ok(serde_json::json!({
            "ok": true,
            "message": "Browser session reset"
        }));
    }

    // Ensure we have a persistent browser session
    if let Err(e) = get_or_create(headless).await {
        return Err(anyhow::anyhow!("Failed to start browser: {e}"));
    }

    match action {
        "navigate" | "goto" => action_navigate(&args).await,
        "click" => action_click(&args).await,
        "links" => action_links(&args).await,
        "text" => action_text(&args).await,
        "eval" => action_eval(&args).await,
        "screenshot" => action_screenshot(&args).await,
        "back" => action_back(&args).await,
        _ => Err(anyhow::anyhow!(
            "Unknown browser action '{action}'. Available: navigate, click, links, text, eval, screenshot, back, reset"
        )),
    }
}

/// Navigate to a URL and return page text.
async fn action_navigate(args: &Value) -> anyhow::Result<Value> {
    let url = args["url"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("'navigate' action requires a 'url' string"))?;

    let selector = args["selector"].as_str();
    let extract = args["extract"].as_str().unwrap_or("text");
    let wait_ms = args["wait_ms"].as_u64();

    let mut lock = PERSISTENT.lock().await;
    let pb = lock.as_mut().unwrap();

    // Navigate with self-healing on transient failures
    let goto_result = pb.svc.goto(&pb.session_id, url).await;
    if let Err(e) = &goto_result {
        let err_str = format!("{e}");
        if err_str.contains("ERR_NAME_NOT_RESOLVED") {
            return Ok(serde_json::json!({
                "ok": false,
                "error": format!("DNS resolution failed for URL: {url}"),
                "suggestion": "The domain does not exist or is unreachable. Try: 1) Check the URL spelling, 2) Search for an alternative/mirror URL, 3) Try web.archive.org/web/{url}"
            }));
        }
        if err_str.contains("ERR_CONNECTION_REFUSED") || err_str.contains("ERR_CONNECTION_TIMED_OUT") || err_str.contains("ERR_CONNECTION_RESET") {
            return Ok(serde_json::json!({
                "ok": false,
                "error": format!("Connection failed for URL: {url}"),
                "suggestion": "The server is unreachable. Try a cached version via web.archive.org or search for a mirror."
            }));
        }
        if err_str.contains("ERR_CERT") || err_str.contains("ERR_SSL") {
            return Ok(serde_json::json!({
                "ok": false,
                "error": format!("SSL/TLS error for URL: {url}"),
                "suggestion": "The site has certificate issues. Try the http:// version or a cached copy."
            }));
        }
        return Err(goto_result.unwrap_err());
    }

    pb.current_url = url.to_string();

    // Optional wait for dynamic content
    if let Some(ms) = wait_ms {
        let wait_expr = format!("new Promise(r => setTimeout(r, {ms}))");
        let _ = pb.svc.eval(&pb.session_id, &wait_expr).await;
    }

    let content = extract_content(pb, extract, selector).await?;
    let text = content.as_str().unwrap_or("");

    Ok(serde_json::json!({
        "ok": true,
        "url": url,
        "content": truncate_result(text),
    }))
}

/// Click a link or element by CSS selector or link text, then return new page content.
async fn action_click(args: &Value) -> anyhow::Result<Value> {
    let selector = args["selector"].as_str();
    let text = args["text"].as_str();
    let index = args["index"].as_u64();
    let wait_ms = args["wait_ms"].as_u64().unwrap_or(1000);

    let mut lock = PERSISTENT.lock().await;
    let pb = lock.as_mut().unwrap();

    let click_js = if let Some(sel) = selector {
        format!(
            r#"(() => {{
                const el = document.querySelector({sel});
                if (!el) return JSON.stringify({{ok: false, error: 'No element matching selector: ' + {sel}}});
                el.scrollIntoView({{block: 'center'}});
                el.click();
                return JSON.stringify({{ok: true, clicked: el.textContent.trim().slice(0, 100)}});
            }})()"#,
            sel = serde_json::to_string(sel).unwrap_or_default()
        )
    } else if let Some(link_text) = text {
        let idx = index.unwrap_or(0);
        format!(
            r#"(() => {{
                const links = Array.from(document.querySelectorAll('a, button'));
                const needle = {text}.toLowerCase();
                const matches = links.filter(el => el.textContent.trim().toLowerCase().includes(needle));
                if (matches.length === 0) return JSON.stringify({{ok: false, error: 'No link/button containing text: ' + {text}, available_links: links.slice(0, 20).map(l => l.textContent.trim().slice(0, 80))}});
                const target = matches[Math.min({idx}, matches.length - 1)];
                target.scrollIntoView({{block: 'center'}});
                target.click();
                return JSON.stringify({{ok: true, clicked: target.textContent.trim().slice(0, 100), total_matches: matches.length}});
            }})()"#,
            text = serde_json::to_string(link_text).unwrap_or_default(),
            idx = idx,
        )
    } else {
        return Err(anyhow::anyhow!("'click' action requires either 'selector' (CSS) or 'text' (link text to find)"));
    };

    let click_result = pb.svc.eval(&pb.session_id, &click_js).await?;

    // Wait for navigation/content to settle
    let wait_expr = format!("new Promise(r => setTimeout(r, {wait_ms}))");
    let _ = pb.svc.eval(&pb.session_id, &wait_expr).await;

    // Get current URL after click
    let url_result = pb.svc.eval(&pb.session_id, "window.location.href").await?;
    let new_url = url_result.as_str().unwrap_or("").to_string();
    pb.current_url = new_url.clone();

    // Parse click result
    let click_info: Value = if let Value::String(s) = &click_result {
        serde_json::from_str(s).unwrap_or(click_result.clone())
    } else {
        click_result
    };

    if click_info.get("ok") == Some(&Value::Bool(false)) {
        return Ok(click_info);
    }

    // Extract page content after click
    let extract = args["extract"].as_str().unwrap_or("text");
    let content_selector = args["content_selector"].as_str();
    let content = extract_content(pb, extract, content_selector).await?;
    let text_out = content.as_str().unwrap_or("");

    Ok(serde_json::json!({
        "ok": true,
        "clicked": click_info.get("clicked"),
        "url": new_url,
        "content": truncate_result(text_out),
    }))
}

/// Extract all links from the current page (or a subset via selector).
async fn action_links(args: &Value) -> anyhow::Result<Value> {
    let selector = args["selector"].as_str();
    let limit = args["limit"].as_u64().unwrap_or(50) as usize;

    let lock = PERSISTENT.lock().await;
    let pb = lock.as_ref().unwrap();

    let js = if let Some(sel) = selector {
        format!(
            r#"(() => {{
                const container = document.querySelector({sel});
                if (!container) return JSON.stringify([]);
                const links = Array.from(container.querySelectorAll('a[href]'));
                return JSON.stringify(links.slice(0, {limit}).map((a, i) => ({{
                    index: i,
                    text: a.textContent.trim().slice(0, 120),
                    href: a.href
                }})));
            }})()"#,
            sel = serde_json::to_string(sel).unwrap_or_default(),
            limit = limit,
        )
    } else {
        format!(
            r#"(() => {{
                const links = Array.from(document.querySelectorAll('a[href]'));
                const seen = new Set();
                const result = [];
                for (const a of links) {{
                    const href = a.href;
                    const text = a.textContent.trim();
                    if (!text || seen.has(href)) continue;
                    seen.add(href);
                    result.push({{ index: result.length, text: text.slice(0, 120), href }});
                    if (result.length >= {limit}) break;
                }}
                return JSON.stringify(result);
            }})()"#,
            limit = limit,
        )
    };

    let result = pb.svc.eval(&pb.session_id, &js).await?;
    let links: Value = if let Value::String(s) = &result {
        serde_json::from_str(s).unwrap_or(Value::Array(vec![]))
    } else {
        result
    };

    Ok(serde_json::json!({
        "ok": true,
        "url": pb.current_url,
        "links": links,
    }))
}

/// Extract text from the current page (without re-navigating).
async fn action_text(args: &Value) -> anyhow::Result<Value> {
    let selector = args["selector"].as_str();
    let extract = args["extract"].as_str().unwrap_or("text");

    let lock = PERSISTENT.lock().await;
    let pb = lock.as_ref().unwrap();

    let content = extract_content(pb, extract, selector).await?;
    let text = content.as_str().unwrap_or("");

    Ok(serde_json::json!({
        "ok": true,
        "url": pb.current_url,
        "content": truncate_result(text),
    }))
}

/// Evaluate arbitrary JS in the current page.
async fn action_eval(args: &Value) -> anyhow::Result<Value> {
    let expression = args["expression"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("'eval' action requires an 'expression' string"))?;

    let lock = PERSISTENT.lock().await;
    let pb = lock.as_ref().unwrap();

    let result = pb.svc.eval(&pb.session_id, expression).await?;

    Ok(serde_json::json!({
        "ok": true,
        "url": pb.current_url,
        "result": result,
    }))
}

/// Take a screenshot.
async fn action_screenshot(_args: &Value) -> anyhow::Result<Value> {
    let lock = PERSISTENT.lock().await;
    let pb = lock.as_ref().unwrap();

    let bytes = pb.svc.screenshot(&pb.session_id).await?;

    Ok(serde_json::json!({
        "ok": true,
        "url": pb.current_url,
        "size_bytes": bytes.len(),
        "message": "Screenshot captured (binary data omitted from response)"
    }))
}

/// Go back in browser history.
async fn action_back(_args: &Value) -> anyhow::Result<Value> {
    let mut lock = PERSISTENT.lock().await;
    let pb = lock.as_mut().unwrap();

    let _ = pb.svc.eval(&pb.session_id, "window.history.back()").await;
    let _ = pb.svc.eval(&pb.session_id, "new Promise(r => setTimeout(r, 1000))").await;

    let url_result = pb.svc.eval(&pb.session_id, "window.location.href").await?;
    let new_url = url_result.as_str().unwrap_or("").to_string();
    pb.current_url = new_url.clone();

    let content = extract_content(pb, "text", None).await?;
    let text = content.as_str().unwrap_or("");

    Ok(serde_json::json!({
        "ok": true,
        "url": new_url,
        "content": truncate_result(text),
    }))
}

/// Helper: extract page content based on mode and optional selector.
async fn extract_content(
    pb: &PersistentBrowser,
    extract: &str,
    selector: Option<&str>,
) -> anyhow::Result<Value> {
    let js_expr = match (extract, selector) {
        ("html", Some(sel)) => format!(
            "(() => {{ const el = document.querySelector({sel}); return el ? el.outerHTML : '[no element matching selector]'; }})()",
            sel = serde_json::to_string(sel).unwrap_or_default(),
        ),
        ("html", None) => "document.documentElement.outerHTML".to_string(),
        (_, Some(sel)) => format!(
            "(() => {{ const el = document.querySelector({sel}); return el ? el.innerText : '[no element matching selector]'; }})()",
            sel = serde_json::to_string(sel).unwrap_or_default(),
        ),
        _ => r#"(() => {
            document.querySelectorAll('script, style, noscript, svg, iframe').forEach(e => e.remove());
            return document.body.innerText;
        })()"#
            .to_string(),
    };

    pb.svc.eval(&pb.session_id, &js_expr).await
}

/// Register the `browser` tool metadata in the global registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "browser".into(),
        description: "Multi-action headless browser with persistent session. Navigate to URLs, click links/buttons by text or CSS selector, extract all links from a page, read page text, evaluate JS, go back, or reset. The session persists across calls so you can browse multi-step.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["navigate", "click", "links", "text", "eval", "screenshot", "back", "reset"],
                    "description": "Action to perform (default: 'navigate' if url given, else 'text'). navigate=go to URL. click=click link/button. links=list page links. text=re-read current page. eval=run JS. back=go back. reset=close session."
                },
                "url": {
                    "type": "string",
                    "description": "URL to navigate to (for 'navigate' action)"
                },
                "selector": {
                    "type": "string",
                    "description": "CSS selector — for 'click' targets an element, for 'navigate'/'text'/'links' narrows extraction scope"
                },
                "text": {
                    "type": "string",
                    "description": "For 'click': find and click a link/button whose text contains this string"
                },
                "index": {
                    "type": "integer",
                    "description": "For 'click' with 'text': which match to click if multiple (0-based, default 0)"
                },
                "extract": {
                    "type": "string",
                    "enum": ["text", "html"],
                    "description": "'text' (default) for readable text, 'html' for raw HTML"
                },
                "expression": {
                    "type": "string",
                    "description": "JavaScript expression to evaluate (for 'eval' action)"
                },
                "wait_ms": {
                    "type": "integer",
                    "description": "Wait N ms after navigation/click for dynamic content to load"
                },
                "content_selector": {
                    "type": "string",
                    "description": "For 'click': CSS selector to extract content from after clicking (separate from click target)"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max links to return for 'links' action (default 50)"
                },
                "headless": {
                    "type": "boolean",
                    "description": "Run headless (true, default) or visible (false). Only affects first launch."
                }
            },
            "required": []
        }),
    });
}
