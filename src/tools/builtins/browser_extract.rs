//! High-level browser data extraction tool — extract structured data via CSS selectors.
//!
//! Extracts data from web pages using CSS selectors and returns structured JSON.
//! Supports extracting single values, lists, and nested structures.
//!
//! Tool: `browser_extract { url, selectors, multi_page?, pagination_selector? }`

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::tools::exec_shell;
use crate::tools::{register_tool_deferred, ToolMeta};

/// Extraction rule for a single field.
#[derive(Debug, Deserialize, Clone)]
struct ExtractionRule {
    /// CSS selector to find the element(s)
    selector: String,
    /// Attribute to extract (e.g., "text", "href", "src", "innerHTML")
    #[serde(default = "default_attribute")]
    attribute: String,
    /// Whether to extract all matching elements (default: first only)
    #[serde(default)]
    multiple: bool,
}

fn default_attribute() -> String {
    "text".to_string()
}

/// Arguments for the browser_extract tool.
#[derive(Debug, Deserialize)]
struct ExtractArgs {
    /// URL to extract data from
    url: String,
    /// CSS selectors to extract (key -> extraction rule)
    selectors: HashMap<String, ExtractionRule>,
    /// Maximum wait time in seconds for page load
    #[serde(default = "default_timeout_secs")]
    timeout_secs: u64,
    /// Whether to enable JavaScript execution (for SPAs)
    #[serde(default = "default_wait_for_js")]
    wait_for_js: bool,
    /// Delay in milliseconds after load before extracting
    #[serde(default)]
    delay_ms: u64,
    /// Session name to reuse (optional)
    #[serde(default)]
    session: Option<String>,
}

fn default_timeout_secs() -> u64 {
    30
}

fn default_wait_for_js() -> bool {
    true
}

/// Extracted data result.
#[derive(Debug, Serialize)]
struct ExtractResult {
    success: bool,
    url: String,
    data: Value,
    fields_extracted: usize,
    page_title: Option<String>,
    error: Option<String>,
    partial_data: Option<Value>,
    summary: String,
}

/// Field extraction result with status.
#[derive(Debug, Serialize)]
struct FieldExtraction {
    field: String,
    selector: String,
    success: bool,
    values_count: usize,
    error: Option<String>,
}

/// Execute browser extraction: navigate and extract structured data.
pub async fn browser_extract(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let args: ExtractArgs = serde_json::from_value(args)
        .map_err(|e| anyhow::anyhow!("browser_extract: invalid arguments: {e}"))?;

    if args.selectors.is_empty() {
        anyhow::bail!("browser_extract: at least one selector is required");
    }

    info!(
        url = %args.url,
        selectors = args.selectors.len(),
        "starting browser extraction"
    );

    let session_name = args.session.unwrap_or_else(|| {
        format!(
            "extract_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs()
        )
    });

    let timeout = Duration::from_secs(args.timeout_secs);
    let deadline = tokio::time::Instant::now() + timeout;

    let mut extraction_status = Vec::new();
    let mut extracted_data = serde_json::Map::new();
    let mut any_success = false;
    let mut any_failure = false;

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
            return Ok(json!(ExtractResult {
                success: false,
                url: args.url.clone(),
                data: json!(null),
                fields_extracted: 0,
                page_title: None,
                error: Some(format!("Failed to open page: {}", e)),
                partial_data: None,
                summary: format!("Extraction failed: Could not open {}", args.url),
            }));
        }
        Err(_) => {
            error!("timeout opening page");
            close_session(workspace, &session_name).await.ok();
            return Ok(json!(ExtractResult {
                success: false,
                url: args.url.clone(),
                data: json!(null),
                fields_extracted: 0,
                page_title: None,
                error: Some("Timeout opening page".to_string()),
                partial_data: None,
                summary: format!("Extraction failed: Timeout opening {}", args.url),
            }));
        }
    }

    // Step 2: Wait for JavaScript if needed
    if args.wait_for_js {
        debug!("waiting for JavaScript execution");
        tokio::time::sleep(Duration::from_millis(1000)).await;
    }

    // Step 3: Get page title
    let page_title = match get_page_title(workspace, &session_name).await {
        Ok(title) => Some(title),
        Err(e) => {
            warn!(error = %e, "failed to get page title");
            None
        }
    };

    // Step 4: Additional delay if specified
    if args.delay_ms > 0 {
        debug!(delay = args.delay_ms, "waiting before extraction");
        tokio::time::sleep(Duration::from_millis(args.delay_ms)).await;
    }

    // Step 5: Extract data for each selector
    for (field_name, rule) in &args.selectors {
        debug!(field = %field_name, selector = %rule.selector, "extracting field");

        match extract_field(workspace, &session_name, field_name, rule).await {
            Ok(value) => {
                any_success = true;
                let count = match &value {
                    Value::Array(arr) => arr.len(),
                    Value::Null => 0,
                    _ => 1,
                };
                extracted_data.insert(field_name.clone(), value);
                extraction_status.push(FieldExtraction {
                    field: field_name.clone(),
                    selector: rule.selector.clone(),
                    success: true,
                    values_count: count,
                    error: None,
                });
            }
            Err(e) => {
                any_failure = true;
                warn!(field = %field_name, error = %e, "failed to extract field");
                extracted_data.insert(field_name.clone(), json!(null));
                extraction_status.push(FieldExtraction {
                    field: field_name.clone(),
                    selector: rule.selector.clone(),
                    success: false,
                    values_count: 0,
                    error: Some(format!("{}", e)),
                });
            }
        }
    }

    // Step 6: Cleanup
    close_session(workspace, &session_name).await.ok();

    // Compile result
    let success = any_success && !any_failure;
    let partial_success = any_success && any_failure;
    let fields_extracted = extracted_data.len();

    let summary = compile_summary(
        &args.url,
        &extraction_status,
        success,
        partial_success,
        fields_extracted,
    );

    let result = ExtractResult {
        success,
        url: args.url,
        data: Value::Object(extracted_data.clone()),
        fields_extracted,
        page_title,
        error: if any_failure {
            Some("Some fields failed to extract".to_string())
        } else {
            None
        },
        partial_data: if partial_success {
            Some(Value::Object(extracted_data))
        } else {
            None
        },
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

/// Extract a single field using CSS selector.
async fn extract_field(
    workspace: &Path,
    session: &str,
    _field_name: &str,
    rule: &ExtractionRule,
) -> anyhow::Result<Value> {
    let selector_escaped = escape_selector(&rule.selector);

    if rule.multiple {
        // Extract all matching elements
        let js_code = format!(
            r#"() => {{
                const elements = document.querySelectorAll('{}');
                return Array.from(elements).map(el => {{
                    const item = {{}};
                    // Extract main attribute
                    item._value = {};
                    return item._value;
                }});
            }}"#,
            selector_escaped,
            get_attribute_extraction(&rule.attribute)
        );

        let command = format!(
            "playwright-cli -s={} eval '{}'",
            session,
            js_code.replace('\'', "'\"'\"'")
        );
        let result = exec_shell(workspace, json!({ "command": command })).await?;

        if result["exit_code"] != 0 {
            anyhow::bail!(
                "extraction failed: {}",
                result["stderr"].as_str().unwrap_or("unknown error")
            );
        }

        // Parse the result
        let output = result["stdout"].as_str().unwrap_or("[]").trim();
        let values: Vec<String> = parse_js_array_output(output);

        Ok(Value::Array(values.into_iter().map(|v| json!(v)).collect()))
    } else {
        // Extract single element
        let js_code = format!(
            r#"() => {{
                const el = document.querySelector('{}');
                return el ? {} : null;
            }}"#,
            selector_escaped,
            get_attribute_extraction(&rule.attribute)
        );

        let command = format!(
            "playwright-cli -s={} eval '{}'",
            session,
            js_code.replace('\'', "'\"'\"'")
        );
        let result = exec_shell(workspace, json!({ "command": command })).await?;

        if result["exit_code"] != 0 {
            anyhow::bail!(
                "extraction failed: {}",
                result["stderr"].as_str().unwrap_or("unknown error")
            );
        }

        let output = result["stdout"].as_str().unwrap_or("null").trim();
        if output == "null" || output.is_empty() {
            Ok(json!(null))
        } else {
            // Try to parse as JSON, fallback to string
            match serde_json::from_str::<Value>(output) {
                Ok(val) => Ok(val),
                Err(_) => Ok(json!(output.trim_matches('"'))),
            }
        }
    }
}

/// Generate JavaScript code to extract an attribute.
fn get_attribute_extraction(attribute: &str) -> String {
    match attribute {
        "text" => "el.textContent?.trim()".to_string(),
        "innerHTML" => "el.innerHTML".to_string(),
        "outerHTML" => "el.outerHTML".to_string(),
        _ => format!("el.getAttribute('{}')", attribute),
    }
}

/// Parse JavaScript array output string.
fn parse_js_array_output(output: &str) -> Vec<String> {
    // Handle Playwright CLI output format - usually JSON array
    if output.starts_with('[') && output.ends_with(']') {
        if let Ok(arr) = serde_json::from_str::<Vec<String>>(output) {
            return arr;
        }
    }
    // Fallback: split by common delimiters
    output
        .trim_matches(['[', ']', '"'])
        .split(',')
        .map(|s| s.trim().trim_matches('"').to_string())
        .filter(|s| !s.is_empty() && s != "null")
        .collect()
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
fn compile_summary(
    url: &str,
    extractions: &[FieldExtraction],
    success: bool,
    partial: bool,
    total_fields: usize,
) -> String {
    let successful = extractions.iter().filter(|e| e.success).count();

    let mut parts = vec![
        format!("Extracted {} fields from {}", total_fields, url),
        format!("Successful: {}/{}", successful, extractions.len()),
    ];

    for extraction in extractions {
        let status = if extraction.success { "✓" } else { "✗" };
        let count = if extraction.values_count > 0 {
            format!(" ({} values)", extraction.values_count)
        } else {
            String::new()
        };
        parts.push(format!("  {} {}{}", status, extraction.field, count));
    }

    let status_str = if success {
        "SUCCESS"
    } else if partial {
        "PARTIAL SUCCESS"
    } else {
        "FAILED"
    };
    parts.push(format!("Overall: {}", status_str));

    parts.join("\n")
}

/// Register the browser_extract tool.
pub fn register() {
    register_tool_deferred(ToolMeta {
        name: "browser_extract".into(),
        description: "High-level data extraction tool. Navigates to a URL and extracts structured data using CSS selectors. Supports single values, multiple values, and nested extraction. Returns structured JSON with extraction status for each field.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "URL to extract data from"
                },
                "selectors": {
                    "type": "object",
                    "description": "CSS selectors to extract data (key: field name, value: extraction rule)",
                    "additionalProperties": {
                        "type": "object",
                        "properties": {
                            "selector": {
                                "type": "string",
                                "description": "CSS selector to find element(s)"
                            },
                            "attribute": {
                                "type": "string",
                                "description": "Attribute to extract: 'text', 'href', 'src', 'innerHTML', etc. (default: 'text')"
                            },
                            "multiple": {
                                "type": "boolean",
                                "description": "Extract all matching elements (default: false, only first)"
                            }
                        },
                        "required": ["selector"]
                    }
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Maximum wait time in seconds for page load (default: 30)"
                },
                "wait_for_js": {
                    "type": "boolean",
                    "description": "Wait for JavaScript execution (for SPAs, default: true)"
                },
                "delay_ms": {
                    "type": "integer",
                    "description": "Delay in milliseconds after load before extracting (default: 0)"
                },
                "session": {
                    "type": "string",
                    "description": "Session name to reuse (optional)"
                }
            },
            "required": ["url", "selectors"]
        }),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_get_attribute_extraction() {
        assert_eq!(get_attribute_extraction("text"), "el.textContent?.trim()");
        assert_eq!(get_attribute_extraction("href"), "el.getAttribute('href')");
        assert_eq!(get_attribute_extraction("innerHTML"), "el.innerHTML");
    }

    #[test]
    fn test_parse_js_array_output() {
        // Test JSON array
        let result = parse_js_array_output("[\"a\", \"b\", \"c\"]");
        assert_eq!(result, vec!["a", "b", "c"]);

        // Test simple format
        let result = parse_js_array_output("a, b, c");
        assert_eq!(result, vec!["a", "b", "c"]);
    }

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
        assert_eq!(escape_selector(".item"), ".item");
        assert_eq!(
            escape_selector("div[class='main']"),
            "div[class=\\'main\\']"
        );
    }

    #[test]
    fn test_compile_summary() {
        let extractions = vec![
            FieldExtraction {
                field: "title".to_string(),
                selector: "h1".to_string(),
                success: true,
                values_count: 1,
                error: None,
            },
            FieldExtraction {
                field: "links".to_string(),
                selector: "a".to_string(),
                success: false,
                values_count: 0,
                error: Some("not found".to_string()),
            },
        ];
        let summary = compile_summary("https://example.com", &extractions, false, true, 2);
        assert!(summary.contains("2 fields"));
        assert!(summary.contains("PARTIAL SUCCESS"));
    }

    #[test]
    fn test_extraction_rule_deserialization() {
        let json = json!({
            "selector": "h1",
            "attribute": "text",
            "multiple": false
        });

        let rule: ExtractionRule = serde_json::from_value(json).unwrap();
        assert_eq!(rule.selector, "h1");
        assert_eq!(rule.attribute, "text");
        assert!(!rule.multiple);
    }

    #[test]
    fn test_extract_args_deserialization() {
        let json = json!({
            "url": "https://example.com",
            "selectors": {
                "title": { "selector": "h1" },
                "links": { "selector": "a", "attribute": "href", "multiple": true }
            },
            "delay_ms": 500
        });

        let args: ExtractArgs = serde_json::from_value(json).unwrap();
        assert_eq!(args.url, "https://example.com");
        assert_eq!(args.selectors.len(), 2);
        assert!(args.selectors.contains_key("title"));
        assert!(args.selectors.contains_key("links"));
        assert_eq!(args.delay_ms, 500);
    }
}
