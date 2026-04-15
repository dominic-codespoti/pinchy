//! High-level browser screenshot tool — capture page or element screenshots.
//!
//! Simplifies taking screenshots with options for full page, specific elements,
//! or visible viewport. Handles retries and returns structured results.
//!
//! Tool: `browser_screenshot { url, selector?, full_page?, filename?, viewport? }`

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::tools::exec_shell;
use crate::tools::{register_tool_deferred, ToolMeta};

/// Viewport dimensions.
#[derive(Debug, Deserialize, Default, Clone, Serialize)]
struct Viewport {
    width: Option<u32>,
    height: Option<u32>,
}

/// Arguments for the browser_screenshot tool.
#[derive(Debug, Deserialize)]
struct ScreenshotArgs {
    /// URL to navigate to (if not already on a page)
    url: String,
    /// Optional CSS selector to screenshot specific element
    #[serde(default)]
    selector: Option<String>,
    /// Take full page screenshot (default: false)
    #[serde(default)]
    full_page: bool,
    /// Output filename (default: auto-generated)
    #[serde(default)]
    filename: Option<String>,
    /// Set viewport size before screenshot
    #[serde(default)]
    viewport: Option<Viewport>,
    /// Delay in milliseconds before taking screenshot (for dynamic content)
    #[serde(default)]
    delay_ms: u64,
    /// Session name to reuse (optional)
    #[serde(default)]
    session: Option<String>,
}

/// Screenshot result.
#[derive(Debug, Serialize)]
struct ScreenshotResult {
    success: bool,
    url: String,
    filepath: Option<String>,
    full_page: bool,
    element_selector: Option<String>,
    viewport: Option<Viewport>,
    page_title: Option<String>,
    error: Option<String>,
    summary: String,
}

/// Execute browser screenshot: navigate and capture.
pub async fn browser_screenshot(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let args: ScreenshotArgs = serde_json::from_value(args)
        .map_err(|e| anyhow::anyhow!("browser_screenshot: invalid arguments: {e}"))?;

    info!(
        url = %args.url,
        full_page = args.full_page,
        "starting browser screenshot"
    );

    // Generate filename if not provided
    let filename = args.filename.unwrap_or_else(|| {
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        if args.full_page {
            format!("screenshot_full_{}.png", timestamp)
        } else if args.selector.is_some() {
            format!("screenshot_element_{}.png", timestamp)
        } else {
            format!("screenshot_{}.png", timestamp)
        }
    });

    // Ensure filename has .png extension
    let filename = if filename.ends_with(".png") {
        filename
    } else {
        format!("{}.png", filename)
    };

    let session_name = args.session.unwrap_or_else(|| {
        format!(
            "screenshot_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        )
    });

    let output_path = workspace.join(&filename);

    // Step 1: Open the page
    debug!("opening page");
    if let Err(e) = open_page_with_retry(workspace, &args.url, &session_name).await {
        error!(error = %e, "failed to open page");
        close_session(workspace, &session_name).await.ok();
        return Ok(json!(ScreenshotResult {
            success: false,
            url: args.url.clone(),
            filepath: None,
            full_page: args.full_page,
            element_selector: args.selector.clone(),
            viewport: args.viewport.clone(),
            page_title: None,
            error: Some(format!("Failed to open page: {}", e)),
            summary: format!("Screenshot failed: Could not open {}", args.url),
        }));
    }

    // Step 2: Set viewport if specified
    if let Some(ref viewport) = args.viewport {
        if let (Some(w), Some(h)) = (viewport.width, viewport.height) {
            debug!(width = w, height = h, "setting viewport");
            if let Err(e) = set_viewport(workspace, &session_name, w, h).await {
                warn!(error = %e, "failed to set viewport, continuing anyway");
            }
        }
    }

    // Step 3: Get page title
    let page_title = match get_page_title(workspace, &session_name).await {
        Ok(title) => Some(title),
        Err(e) => {
            warn!(error = %e, "failed to get page title");
            None
        }
    };

    // Step 4: Wait for specified delay
    if args.delay_ms > 0 {
        debug!(delay = args.delay_ms, "waiting before screenshot");
        tokio::time::sleep(Duration::from_millis(args.delay_ms)).await;
    }

    // Step 5: Take screenshot
    let screenshot_result = if let Some(ref selector) = args.selector {
        // Element screenshot
        take_element_screenshot(workspace, &session_name, selector, &output_path).await
    } else {
        // Full page or viewport screenshot
        take_page_screenshot(workspace, &session_name, args.full_page, &output_path).await
    };

    let (success, error, filepath) = match screenshot_result {
        Ok(path) => {
            info!(path = %path.display(), "screenshot saved");
            (true, None, Some(path.display().to_string()))
        }
        Err(e) => {
            error!(error = %e, "screenshot failed");
            (false, Some(format!("Screenshot failed: {}", e)), None)
        }
    };

    // Step 6: Cleanup
    close_session(workspace, &session_name).await.ok();

    // Compile result
    let summary = compile_summary(&args.url, success, filepath.as_deref(), args.full_page);

    let result = ScreenshotResult {
        success,
        url: args.url,
        filepath,
        full_page: args.full_page,
        element_selector: args.selector,
        viewport: args.viewport,
        page_title,
        error,
        summary,
    };

    Ok(json!(result))
}

/// Open a page with retry logic.
async fn open_page_with_retry(workspace: &Path, url: &str, session: &str) -> anyhow::Result<()> {
    let mut last_error = None;
    for attempt in 0..3 {
        let command = format!("playwright-cli -s={} open '{}'", session, escape_url(url));
        match exec_shell(workspace, json!({ "command": command })).await {
            Ok(result) => {
                if result["exit_code"] == 0 {
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    return Ok(());
                } else {
                    let err = result["stderr"]
                        .as_str()
                        .unwrap_or("unknown error")
                        .to_string();
                    last_error = Some(err);
                }
            }
            Err(e) => {
                last_error = Some(format!("{}", e));
            }
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_millis(500 * (attempt + 1) as u64)).await;
        }
    }
    Err(anyhow::anyhow!(
        "failed after 3 attempts: {}",
        last_error.unwrap_or_else(|| "unknown".to_string())
    ))
}

/// Set viewport size.
async fn set_viewport(
    workspace: &Path,
    session: &str,
    width: u32,
    height: u32,
) -> anyhow::Result<()> {
    let command = format!("playwright-cli -s={} resize {} {}", session, width, height);
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "resize failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    Ok(())
}

/// Get page title via JavaScript.
async fn get_page_title(workspace: &Path, session: &str) -> anyhow::Result<String> {
    let command = format!(
        "playwright-cli -s={} eval \"() => document.title\"",
        session
    );
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "eval failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    let title = result["stdout"]
        .as_str()
        .unwrap_or("")
        .trim()
        .trim_matches('"')
        .to_string();

    Ok(title)
}

/// Take screenshot of the entire page.
async fn take_page_screenshot(
    workspace: &Path,
    session: &str,
    full_page: bool,
    output_path: &Path,
) -> anyhow::Result<std::path::PathBuf> {
    let full_page_flag = if full_page { " --full-page" } else { "" };
    let command = format!(
        "playwright-cli -s={} screenshot --filename='{}'{}",
        session,
        output_path.display(),
        full_page_flag
    );
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "screenshot failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    Ok(output_path.to_path_buf())
}

/// Take screenshot of a specific element.
async fn take_element_screenshot(
    workspace: &Path,
    session: &str,
    selector: &str,
    output_path: &Path,
) -> anyhow::Result<std::path::PathBuf> {
    let command = format!(
        "playwright-cli -s={} screenshot '{}' --filename='{}'",
        session,
        escape_selector(selector),
        output_path.display()
    );
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "element screenshot failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    Ok(output_path.to_path_buf())
}

/// Close browser session.
async fn close_session(workspace: &Path, session: &str) -> anyhow::Result<()> {
    let command = format!("playwright-cli -s={} close", session);
    let _ = exec_shell(workspace, json!({ "command": command })).await;
    Ok(())
}

/// Escape URL for shell safety.
fn escape_url(url: &str) -> String {
    url.replace('\\', "\\\\").replace('\'', "'\"'\"'")
}

/// Escape CSS selector for shell.
fn escape_selector(selector: &str) -> String {
    selector
        .replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('"', "\\\"")
}

/// Compile summary string.
fn compile_summary(url: &str, success: bool, filepath: Option<&str>, full_page: bool) -> String {
    if success {
        let screenshot_type = if full_page {
            "full page screenshot"
        } else {
            "screenshot"
        };
        format!(
            "Successfully captured {} of {} and saved to {}",
            screenshot_type,
            url,
            filepath.unwrap_or("unknown path")
        )
    } else {
        format!("Failed to capture screenshot of {}", url)
    }
}

/// Register the browser_screenshot tool.
pub fn register() {
    register_tool_deferred(ToolMeta {
        name: "browser_screenshot".into(),
        description: "High-level screenshot tool. Navigates to a URL and captures a screenshot of the full page, visible viewport, or a specific element. Supports custom viewport sizes and delay for dynamic content. Auto-retries on failures.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to navigate to for the screenshot"
                },
                "selector": {
                    "type": "string",
                    "description": "CSS selector for specific element to screenshot (optional, captures full page or viewport if not set)"
                },
                "full_page": {
                    "type": "boolean",
                    "description": "Capture full page screenshot (scrolling to include all content, default: false)"
                },
                "filename": {
                    "type": "string",
                    "description": "Output filename for the screenshot (optional, auto-generated if not set)"
                },
                "viewport": {
                    "type": "object",
                    "description": "Set viewport size before screenshot (optional)",
                    "properties": {
                        "width": { "type": "integer" },
                        "height": { "type": "integer" }
                    }
                },
                "delay_ms": {
                    "type": "integer",
                    "description": "Delay in milliseconds before taking screenshot (for dynamic content, default: 0)"
                },
                "session": {
                    "type": "string",
                    "description": "Session name to reuse (optional, useful for multiple screenshots of same page)"
                }
            },
            "required": ["url"]
        }),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_escape_url() {
        assert_eq!(escape_url("https://example.com"), "https://example.com");
        assert_eq!(
            escape_url("https://example.com?q='test'"),
            "https://example.com?q='\"'\"'test'\"'\"'"
        );
    }

    #[test]
    fn test_escape_selector() {
        assert_eq!(escape_selector("#header"), "#header");
        assert_eq!(
            escape_selector("div[class='main']"),
            "div[class=\\'main\\']"
        );
    }

    #[test]
    fn test_compile_summary_success() {
        let summary = compile_summary(
            "https://example.com",
            true,
            Some("/tmp/screenshot.png"),
            true,
        );
        assert!(summary.contains("Successfully captured"));
        assert!(summary.contains("full page screenshot"));
        assert!(summary.contains("/tmp/screenshot.png"));
    }

    #[test]
    fn test_compile_summary_failure() {
        let summary = compile_summary("https://example.com", false, None, false);
        assert!(summary.contains("Failed to capture"));
    }

    #[test]
    fn test_screenshot_args_deserialization() {
        let json = json!({
            "url": "https://example.com",
            "selector": "#main-content",
            "filename": "capture.png",
            "viewport": { "width": 1280, "height": 800 },
            "delay_ms": 1000
        });

        let args: ScreenshotArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.url, "https://example.com");
        assert_eq!(args.selector, Some("#main-content".to_string()));
        assert_eq!(args.filename, Some("capture.png".to_string()));
        assert_eq!(args.viewport.as_ref().unwrap().width, Some(1280));
        assert_eq!(args.viewport.as_ref().unwrap().height, Some(800));
        assert_eq!(args.delay_ms, 1000);
    }

    #[test]
    fn test_filename_generation() {
        // Test full_page
        let args: ScreenshotArgs = serde_json::from_value(json!({
            "url": "https://example.com",
            "full_page": true
        }))
        .unwrap();
        assert!(args.filename.is_none()); // Would be generated at runtime

        // Test with selector
        let args: ScreenshotArgs = serde_json::from_value(json!({
            "url": "https://example.com",
            "selector": "#header"
        }))
        .unwrap();
        assert!(args.filename.is_none());
    }
}
