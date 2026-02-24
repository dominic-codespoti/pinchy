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
    // Try to truncate at a paragraph boundary
    let search_zone = &s[..s.floor_char_boundary(MAX_CHARS)];
    let cut = search_zone
        .rfind("\n\n")
        .unwrap_or_else(|| s.floor_char_boundary(MAX_CHARS));
    let truncated = &s[..cut];
    format!(
        "{truncated}\n\n[… truncated — {} chars total, showing first {}. Use a CSS selector to narrow.]",
        s.len(),
        cut,
    )
}

/// Browser tool — dispatch by action.
pub async fn browser_tool(args: Value) -> anyhow::Result<Value> {
    let action = args["action"].as_str().unwrap_or(
        // Backwards compat: if "url" is present with no action, assume navigate
        if args.get("url").is_some() {
            "navigate"
        } else {
            "text"
        },
    );
    let headless = args["headless"].as_bool().unwrap_or(true);

    // "reset" action tears down the persistent session
    if action == "reset" {
        reset_session().await;
        return Ok(serde_json::json!({ "reset": true }));
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
        if err_str.contains("ERR_CONNECTION_REFUSED")
            || err_str.contains("ERR_CONNECTION_TIMED_OUT")
            || err_str.contains("ERR_CONNECTION_RESET")
        {
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
        return Err(anyhow::anyhow!(
            "'click' action requires either 'selector' (CSS) or 'text' (link text to find)"
        ));
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
        "clicked": click_info.get("clicked"),
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
        "result": result,
    }))
}

/// Take a screenshot.
async fn action_screenshot(_args: &Value) -> anyhow::Result<Value> {
    let lock = PERSISTENT.lock().await;
    let pb = lock.as_ref().unwrap();

    let bytes = pb.svc.screenshot(&pb.session_id).await?;

    Ok(serde_json::json!({
        "size_bytes": bytes.len(),
    }))
}

/// Go back in browser history.
async fn action_back(_args: &Value) -> anyhow::Result<Value> {
    let mut lock = PERSISTENT.lock().await;
    let pb = lock.as_mut().unwrap();

    let _ = pb.svc.eval(&pb.session_id, "window.history.back()").await;
    let _ = pb
        .svc
        .eval(&pb.session_id, "new Promise(r => setTimeout(r, 1000))")
        .await;

    let url_result = pb.svc.eval(&pb.session_id, "window.location.href").await?;
    let new_url = url_result.as_str().unwrap_or("").to_string();
    pb.current_url = new_url.clone();

    let content = extract_content(pb, "text", None).await?;
    let text = content.as_str().unwrap_or("");

    Ok(serde_json::json!({
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
            "(() => {{ const el = document.querySelector({sel});
                return el ? el.outerHTML : '[no element matching selector]'; }})()",
            sel = serde_json::to_string(sel).unwrap_or_default(),
        ),
        ("html", None) => "document.documentElement.outerHTML".to_string(),
        (_, Some(sel)) => format!(
            r#"(() => {{
                const el = document.querySelector({sel});
                if (!el) return '[no element matching selector]';
                {CLEAN_AND_CONVERT_JS}
                return cleanAndConvert(el);
            }})()"#,
            sel = serde_json::to_string(sel).unwrap_or_default(),
            CLEAN_AND_CONVERT_JS = CLEAN_AND_CONVERT_JS,
        ),
        _ => format!(
            r#"(() => {{
                {CLEAN_AND_CONVERT_JS}
                {FIND_MAIN_CONTENT_JS}
                const root = findMainContent();
                return cleanAndConvert(root);
            }})()"#,
            CLEAN_AND_CONVERT_JS = CLEAN_AND_CONVERT_JS,
            FIND_MAIN_CONTENT_JS = FIND_MAIN_CONTENT_JS,
        ),
    };

    pb.svc.eval(&pb.session_id, &js_expr).await
}

/// JS function: remove noise elements, then convert DOM to clean markdown-like text.
const CLEAN_AND_CONVERT_JS: &str = r#"
function cleanAndConvert(root) {
    if (!root) return document.title || '[empty page]';
    const clone = root.cloneNode(true);
    const noiseSel = 'script,style,noscript,svg,iframe,nav,footer,header,.cookie,.cookies,.consent,.banner,.popup,.modal,.overlay,.ad,.ads,.advert,.advertisement,.sidebar,.side-bar,.widget,.social,.share,.sharing,.comments,.comment-form,[role="navigation"],[role="banner"],[role="complementary"],[role="contentinfo"],[aria-hidden="true"],.sr-only,.visually-hidden,.skip-link,.breadcrumb,.pagination,.related,.recommended,.newsletter,.subscribe,.signup,.sign-up,form';
    clone.querySelectorAll(noiseSel).forEach(e => e.remove());

    // Convert DOM to markdown-like text
    function walk(node) {
        if (node.nodeType === 3) {
            return node.textContent.replace(/[ \t]+/g, ' ');
        }
        if (node.nodeType !== 1) return '';
        const tag = node.tagName.toLowerCase();
        // Skip hidden elements
        const style = node.style;
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return '';

        let inner = Array.from(node.childNodes).map(walk).join('');
        inner = inner.replace(/\n{3,}/g, '\n\n');

        switch (tag) {
            case 'h1': return '\n\n# ' + inner.trim() + '\n\n';
            case 'h2': return '\n\n## ' + inner.trim() + '\n\n';
            case 'h3': return '\n\n### ' + inner.trim() + '\n\n';
            case 'h4': case 'h5': case 'h6':
                return '\n\n#### ' + inner.trim() + '\n\n';
            case 'p': case 'div': case 'section': case 'article': case 'main':
                return '\n\n' + inner.trim() + '\n\n';
            case 'br': return '\n';
            case 'li': return '\n- ' + inner.trim();
            case 'ul': case 'ol': return '\n' + inner + '\n';
            case 'blockquote': return '\n\n> ' + inner.trim().replace(/\n/g, '\n> ') + '\n\n';
            case 'pre': case 'code':
                if (tag === 'pre' || (node.parentElement && node.parentElement.tagName === 'PRE'))
                    return '\n```\n' + node.textContent.trim() + '\n```\n';
                return '`' + inner.trim() + '`';
            case 'a': {
                const href = node.getAttribute('href');
                const text = inner.trim();
                if (!text) return '';
                if (href && !href.startsWith('#') && !href.startsWith('javascript:'))
                    return '[' + text + '](' + href + ')';
                return text;
            }
            case 'img': {
                const alt = node.getAttribute('alt');
                return alt ? '[image: ' + alt.trim() + ']' : '';
            }
            case 'strong': case 'b': return '**' + inner.trim() + '**';
            case 'em': case 'i': return '*' + inner.trim() + '*';
            case 'table': return '\n\n' + tableToText(node) + '\n\n';
            case 'thead': case 'tbody': case 'tfoot': case 'tr':
            case 'td': case 'th': return inner; // handled by tableToText
            default: return inner;
        }
    }

    function tableToText(table) {
        const rows = Array.from(table.querySelectorAll('tr'));
        if (!rows.length) return '';
        const matrix = rows.map(r =>
            Array.from(r.querySelectorAll('td,th')).map(c => c.textContent.trim().replace(/\s+/g,' '))
        );
        // Header separator
        let out = '';
        matrix.forEach((row, i) => {
            out += '| ' + row.join(' | ') + ' |\n';
            if (i === 0) out += '| ' + row.map(() => '---').join(' | ') + ' |\n';
        });
        return out.trim();
    }

    let result = walk(clone);
    // Collapse whitespace
    result = result.replace(/[ \t]+$/gm, '');
    result = result.replace(/\n{3,}/g, '\n\n');
    result = result.trim();
    return result || document.title || '[empty page]';
}
"#;

/// JS function: find the main content element using Readability-inspired heuristics.
const FIND_MAIN_CONTENT_JS: &str = r#"
function findMainContent() {
    // 1. Try semantic elements first
    const candidates = ['article', 'main', '[role="main"]', '.post-content',
        '.article-content', '.entry-content', '.content', '#content',
        '.post', '.article-body', '.story-body'];
    for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el && el.textContent.trim().length > 200) return el;
    }

    // 2. Score all substantial block elements
    const blocks = document.querySelectorAll('div, section, article, main, td');
    let best = null;
    let bestScore = 0;

    const negRe = /comment|meta|footer|footnote|sidebar|widget|ad-|social|share|promo|related|nav|menu|breadcrumb|cookie|consent|banner|popup|modal/i;
    const posRe = /article|body|content|entry|main|page|post|text|blog|story|prose/i;

    for (const block of blocks) {
        const text = block.textContent || '';
        const textLen = text.trim().length;
        if (textLen < 100) continue;

        let score = 0;
        // Text length is the primary signal
        score += Math.min(textLen / 100, 30);

        // Paragraph density
        const paras = block.querySelectorAll('p');
        score += Math.min(paras.length * 3, 30);

        // Class/id signals
        const classId = (block.className + ' ' + block.id).toLowerCase();
        if (posRe.test(classId)) score += 15;
        if (negRe.test(classId)) score -= 25;

        // Link density penalty — boilerplate has high link density
        const linkText = Array.from(block.querySelectorAll('a')).reduce((s, a) => s + (a.textContent||'').length, 0);
        const linkDensity = textLen > 0 ? linkText / textLen : 0;
        if (linkDensity > 0.4) score -= 20;

        // Nesting bonus: prefer elements that aren't huge containers
        if (block.querySelectorAll('div, section').length > 15) score -= 5;

        if (score > bestScore) {
            bestScore = score;
            best = block;
        }
    }

    return best || document.body || document.documentElement;
}
"#;

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
