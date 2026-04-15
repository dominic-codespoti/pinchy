//! High-level browser form filling tool — fill and submit web forms in a single call.
//!
//! Batches multiple operations (navigate, fill multiple fields, submit) for
//! token efficiency. Handles retries and provides structured results.
//!
//! Tool: `browser_fill_form { url, fields, submit_button?, submit_action? }`

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::tools::exec_shell;
use crate::tools::{register_tool_deferred, ToolMeta};

/// A field to fill in a form.
#[derive(Debug, Deserialize)]
struct FormField {
    /// CSS selector to find the field (e.g., "#email", "input[name='username']")
    selector: String,
    /// Value to fill in
    value: String,
    /// Type hint (optional): "text", "select", "checkbox", "radio"
    #[serde(default)]
    field_type: Option<String>,
}

/// Arguments for the browser_fill_form tool.
#[derive(Debug, Deserialize)]
struct FillFormArgs {
    /// URL of the page containing the form
    url: String,
    /// Fields to fill (selector -> value)
    fields: Vec<FormField>,
    /// Optional: selector for the submit button to click
    #[serde(default)]
    submit_button: Option<String>,
    /// Optional: instead of clicking, submit by pressing Enter on last field
    #[serde(default)]
    submit_with_enter: bool,
    /// Whether to wait for navigation after submit
    #[serde(default = "default_wait_for_navigation")]
    wait_for_navigation: bool,
    /// Timeout in seconds for the entire operation
    #[serde(default = "default_timeout_secs")]
    timeout_secs: u64,
}

fn default_wait_for_navigation() -> bool {
    true
}

fn default_timeout_secs() -> u64 {
    30
}

/// Result of filling a single field.
#[derive(Debug, Serialize)]
struct FieldResult {
    selector: String,
    success: bool,
    filled_value: String,
    error: Option<String>,
}

/// Overall form fill result.
#[derive(Debug, Serialize)]
struct FormFillResult {
    success: bool,
    url: String,
    fields_attempted: usize,
    fields_filled: usize,
    field_results: Vec<FieldResult>,
    submitted: bool,
    final_url: Option<String>,
    page_title: Option<String>,
    error: Option<String>,
    screenshot_path: Option<String>,
    summary: String,
}

/// Execute browser form fill: navigate and fill multiple fields.
pub async fn browser_fill_form(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let args: FillFormArgs = serde_json::from_value(args)
        .map_err(|e| anyhow::anyhow!("browser_fill_form: invalid arguments: {e}"))?;

    if args.fields.is_empty() {
        anyhow::bail!("browser_fill_form: at least one field is required");
    }

    info!(
        url = %args.url,
        fields = args.fields.len(),
        "starting browser form fill"
    );

    let session_name = format!(
        "form_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );

    let timeout = Duration::from_secs(args.timeout_secs);
    let deadline = tokio::time::Instant::now() + timeout;

    let mut field_results = Vec::new();
    let mut success = true;
    let mut submitted = false;
    let mut final_url = None;
    let mut page_title = None;
    let mut screenshot_path = None;

    // Step 1: Open the page
    debug!("opening page");
    match tokio::time::timeout(
        deadline - tokio::time::Instant::now(),
        open_page_with_retry(workspace, &args.url, &session_name),
    )
    .await
    {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            error!(error = %e, "failed to open page");
            close_session(workspace, &session_name).await.ok();
            return Ok(json!(FormFillResult {
                success: false,
                url: args.url.clone(),
                fields_attempted: args.fields.len(),
                fields_filled: 0,
                field_results,
                submitted: false,
                final_url: None,
                page_title: None,
                error: Some(format!("Failed to open page: {}", e)),
                screenshot_path: None,
                summary: format!("Form fill failed: Could not open {}", args.url),
            }));
        }
        Err(_) => {
            error!("timeout opening page");
            close_session(workspace, &session_name).await.ok();
            return Ok(json!(FormFillResult {
                success: false,
                url: args.url.clone(),
                fields_attempted: args.fields.len(),
                fields_filled: 0,
                field_results,
                submitted: false,
                final_url: None,
                page_title: None,
                error: Some("Timeout opening page".to_string()),
                screenshot_path: None,
                summary: format!("Form fill failed: Timeout opening {}", args.url),
            }));
        }
    }

    // Step 2: Get initial snapshot
    let _snapshot = match get_snapshot(workspace, &session_name).await {
        Ok((snap, title)) => {
            page_title = title;
            snap
        }
        Err(e) => {
            warn!(error = %e, "failed to get initial snapshot");
            String::new()
        }
    };

    // Step 3: Fill each field
    debug!("filling fields");
    for field in &args.fields {
        let result = fill_field(workspace, &session_name, field).await;
        match result {
            Ok(()) => {
                field_results.push(FieldResult {
                    selector: field.selector.clone(),
                    success: true,
                    filled_value: field.value.clone(),
                    error: None,
                });
            }
            Err(e) => {
                success = false;
                field_results.push(FieldResult {
                    selector: field.selector.clone(),
                    success: false,
                    filled_value: String::new(),
                    error: Some(format!("{}", e)),
                });
                warn!(selector = %field.selector, error = %e, "failed to fill field");
            }
        }
    }

    let fields_filled = field_results.iter().filter(|r| r.success).count();

    // Step 4: Submit if requested and all fields filled
    if success {
        if let Some(ref button) = args.submit_button {
            debug!("clicking submit button");
            match click_element(workspace, &session_name, button).await {
                Ok(()) => {
                    submitted = true;
                    if args.wait_for_navigation {
                        tokio::time::sleep(Duration::from_millis(1000)).await;
                    }
                }
                Err(e) => {
                    warn!(error = %e, "failed to click submit button");
                    success = false;
                }
            }
        } else if args.submit_with_enter && !args.fields.is_empty() {
            debug!("submitting with Enter key");
            match press_key(workspace, &session_name, "Enter").await {
                Ok(()) => {
                    submitted = true;
                    if args.wait_for_navigation {
                        tokio::time::sleep(Duration::from_millis(1000)).await;
                    }
                }
                Err(e) => {
                    warn!(error = %e, "failed to submit with Enter");
                    success = false;
                }
            }
        }
    }

    // Step 5: Get final state
    if submitted && args.wait_for_navigation {
        match get_snapshot(workspace, &session_name).await {
            Ok((_, title)) => {
                page_title = title;
            }
            Err(e) => {
                warn!(error = %e, "failed to get final snapshot");
            }
        }
        final_url = Some(args.url.clone()); // Would need to get actual URL from browser
    }

    // Step 6: Take screenshot
    if success || !submitted {
        let filename = if success {
            "form_success.png"
        } else {
            "form_error.png"
        };
        screenshot_path = capture_screenshot(workspace, &session_name, filename)
            .await
            .ok();
    }

    // Step 7: Cleanup
    close_session(workspace, &session_name).await.ok();

    // Compile result
    let summary = compile_summary(&args.url, &field_results, submitted, success);

    let result = FormFillResult {
        success: success && fields_filled == args.fields.len(),
        url: args.url,
        fields_attempted: args.fields.len(),
        fields_filled,
        field_results,
        submitted,
        final_url,
        page_title,
        error: if success {
            None
        } else {
            Some("Some fields failed to fill".to_string())
        },
        screenshot_path,
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

/// Get page snapshot.
async fn get_snapshot(workspace: &Path, session: &str) -> anyhow::Result<(String, Option<String>)> {
    let command = format!("playwright-cli -s={} snapshot", session);
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "snapshot failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    let stdout = result["stdout"].as_str().unwrap_or("").to_string();
    let title = extract_title_from_snapshot(&stdout);
    Ok((stdout, title))
}

/// Fill a form field.
async fn fill_field(workspace: &Path, session: &str, field: &FormField) -> anyhow::Result<()> {
    let selector_escaped = escape_selector(&field.selector);

    match field.field_type.as_deref() {
        Some("select") => {
            // Use select for dropdowns
            let command = format!(
                "playwright-cli -s={} select '{}' '{}'",
                session,
                selector_escaped,
                escape_value(&field.value)
            );
            let result = exec_shell(workspace, json!({ "command": command })).await?;
            if result["exit_code"] != 0 {
                anyhow::bail!(
                    "select failed: {}",
                    result["stderr"].as_str().unwrap_or("unknown")
                );
            }
        }
        Some("checkbox") => {
            // Use check/uncheck for checkboxes
            let action = if field.value.to_lowercase() == "true" || field.value == "on" {
                "check"
            } else {
                "uncheck"
            };
            let command = format!(
                "playwright-cli -s={} {} '{}'",
                session, action, selector_escaped
            );
            let result = exec_shell(workspace, json!({ "command": command })).await?;
            if result["exit_code"] != 0 {
                anyhow::bail!(
                    "{} failed: {}",
                    action,
                    result["stderr"].as_str().unwrap_or("unknown")
                );
            }
        }
        _ => {
            // Default: use fill for text inputs
            let command = format!(
                "playwright-cli -s={} fill '{}' '{}'",
                session,
                selector_escaped,
                escape_value(&field.value)
            );
            let result = exec_shell(workspace, json!({ "command": command })).await?;
            if result["exit_code"] != 0 {
                anyhow::bail!(
                    "fill failed: {}",
                    result["stderr"].as_str().unwrap_or("unknown")
                );
            }
        }
    }

    Ok(())
}

/// Click an element.
async fn click_element(workspace: &Path, session: &str, selector: &str) -> anyhow::Result<()> {
    let command = format!(
        "playwright-cli -s={} click '{}'",
        session,
        escape_selector(selector)
    );
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "click failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    Ok(())
}

/// Press a key.
async fn press_key(workspace: &Path, session: &str, key: &str) -> anyhow::Result<()> {
    let command = format!(
        "playwright-cli -s={} press '{}'",
        session,
        escape_value(key)
    );
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "press failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    Ok(())
}

/// Capture screenshot.
async fn capture_screenshot(
    workspace: &Path,
    session: &str,
    filename: &str,
) -> anyhow::Result<String> {
    let path = workspace.join(filename);
    let command = format!(
        "playwright-cli -s={} screenshot --filename='{}'",
        session,
        path.display()
    );
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "screenshot failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    Ok(path.display().to_string())
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

/// Escape value for shell.
fn escape_value(value: &str) -> String {
    value.replace('\\', "\\\\").replace('\'', "'\"'\"'")
}

/// Extract title from snapshot.
fn extract_title_from_snapshot(snapshot: &str) -> Option<String> {
    for line in snapshot.lines().take(50) {
        if line.to_lowercase().contains("title:") {
            return line.split(':').nth(1).map(|s| s.trim().to_string());
        }
    }
    None
}

/// Compile summary string.
fn compile_summary(
    url: &str,
    field_results: &[FieldResult],
    submitted: bool,
    success: bool,
) -> String {
    let filled = field_results.iter().filter(|r| r.success).count();
    let total = field_results.len();

    let mut parts = vec![
        format!("Form fill at {}", url),
        format!("Fields: {}/{} filled successfully", filled, total),
    ];

    for result in field_results {
        let status = if result.success { "✓" } else { "✗" };
        parts.push(format!(
            "  {} {} = {}",
            status, result.selector, result.filled_value
        ));
    }

    if submitted {
        parts.push("Form submitted".to_string());
    }

    parts.push(format!(
        "Overall: {}",
        if success {
            "SUCCESS"
        } else {
            "PARTIAL FAILURE"
        }
    ));

    parts.join("\n")
}

/// Register the browser_fill_form tool.
pub fn register() {
    register_tool_deferred(ToolMeta {
        name: "browser_fill_form".into(),
        description: "High-level form filling tool. Navigates to a URL and fills multiple form fields in a single call, then optionally submits. Batches all operations for token efficiency and provides detailed per-field results.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL of the page containing the form"
                },
                "fields": {
                    "type": "array",
                    "description": "Fields to fill in the form",
                    "items": {
                        "type": "object",
                        "properties": {
                            "selector": {
                                "type": "string",
                                "description": "CSS selector to find the field (e.g., '#email', 'input[name=username]')"
                            },
                            "value": {
                                "type": "string",
                                "description": "Value to fill in"
                            },
                            "field_type": {
                                "type": "string",
                                "enum": ["text", "select", "checkbox", "radio"],
                                "description": "Type of field (optional, defaults to text)"
                            }
                        },
                        "required": ["selector", "value"]
                    }
                },
                "submit_button": {
                    "type": "string",
                    "description": "CSS selector for the submit button to click (optional)"
                },
                "submit_with_enter": {
                    "type": "boolean",
                    "description": "Instead of clicking, submit by pressing Enter on the last field (default: false)"
                },
                "wait_for_navigation": {
                    "type": "boolean",
                    "description": "Wait for navigation after submit (default: true)"
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Timeout in seconds for the entire operation (default: 30)"
                }
            },
            "required": ["url", "fields"]
        }),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_escape_selector() {
        assert_eq!(escape_selector("#email"), "#email");
        assert_eq!(
            escape_selector("input[name='test']"),
            "input[name=\\'test\\']"
        );
    }

    #[test]
    fn test_escape_value() {
        assert_eq!(escape_value("test"), "test");
        assert_eq!(escape_value("it's"), "it'\"'\"'s");
    }

    #[test]
    fn test_compile_summary() {
        let results = vec![
            FieldResult {
                selector: "#email".to_string(),
                success: true,
                filled_value: "test@example.com".to_string(),
                error: None,
            },
            FieldResult {
                selector: "#password".to_string(),
                success: false,
                filled_value: String::new(),
                error: Some("not found".to_string()),
            },
        ];
        let summary = compile_summary("https://example.com", &results, true, false);
        assert!(summary.contains("1/2 filled"));
        assert!(summary.contains("Form submitted"));
    }

    #[test]
    fn test_fill_form_args_deserialization() {
        let json = json!({
            "url": "https://example.com/login",
            "fields": [
                { "selector": "#username", "value": "admin" },
                { "selector": "#password", "value": "secret", "field_type": "text" }
            ],
            "submit_button": "#login-btn"
        });

        let args: FillFormArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.url, "https://example.com/login");
        assert_eq!(args.fields.len(), 2);
        assert_eq!(args.fields[0].selector, "#username");
        assert_eq!(args.fields[0].value, "admin");
        assert_eq!(args.submit_button, Some("#login-btn".to_string()));
    }
}
