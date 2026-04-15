//! High-level browser research tool — batched web research in a single call.
//!
//! Uses `playwright-cli` internally via `exec_shell` but orchestrates multiple
//! steps (open → snapshot → analyze → extract) and returns structured findings.
//!
//! Tool: `browser_research { url, query, max_pages?, extract_selectors? }`

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::time::Duration;
use tracing::{debug, error, info, warn};

use crate::tools::exec_shell;
use crate::tools::{register_tool_deferred, ToolMeta};

/// Arguments for the browser_research tool.
#[derive(Debug, Deserialize)]
struct ResearchArgs {
    /// Starting URL to navigate to
    url: String,
    /// The research question or search query
    query: String,
    /// Maximum number of linked pages to visit (default: 1)
    #[serde(default = "default_max_pages")]
    max_pages: usize,
    /// Optional CSS selectors to extract specific data
    #[serde(default)]
    extract_selectors: Option<HashMap<String, String>>,
    /// Whether to take screenshots of visited pages
    #[serde(default)]
    take_screenshots: bool,
}

fn default_max_pages() -> usize {
    1
}

/// Research finding from a page.
#[derive(Debug, Serialize)]
struct PageFinding {
    url: String,
    title: Option<String>,
    summary: String,
    extracted_data: Option<Value>,
    screenshot_path: Option<String>,
}

/// Overall research result.
#[derive(Debug, Serialize)]
struct ResearchResult {
    success: bool,
    query: String,
    pages_visited: usize,
    findings: Vec<PageFinding>,
    summary: String,
    error: Option<String>,
    screenshot_on_error: Option<String>,
}

/// Execute browser research: navigate, analyze, and extract findings.
pub async fn browser_research(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let args: ResearchArgs = serde_json::from_value(args)
        .map_err(|e| anyhow::anyhow!("browser_research: invalid arguments: {e}"))?;

    info!(
        url = %args.url,
        query = %args.query,
        max_pages = args.max_pages,
        "starting browser research"
    );

    let mut findings = Vec::new();
    let mut errors = Vec::new();
    let mut screenshot_on_error = None;

    // Step 1: Open the initial page with retries
    let session_name = format!(
        "research_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    );

    let open_result = retry_with_backoff(
        || open_page(workspace, &args.url, &session_name),
        3,
        Duration::from_millis(500),
    )
    .await;

    if let Err(e) = open_result {
        error!(error = %e, "failed to open initial page");
        // Try to capture error screenshot
        if let Ok(screenshot) = capture_screenshot(workspace, &session_name, "error_open").await {
            screenshot_on_error = Some(screenshot);
        }
        close_session(workspace, &session_name).await.ok();
        return Ok(json!(ResearchResult {
            success: false,
            query: args.query,
            pages_visited: 0,
            findings,
            summary: format!("Failed to open {}: {}", args.url, e),
            error: Some(format!("{}", e)),
            screenshot_on_error,
        }));
    }

    // Step 2: Get snapshot and analyze
    let mut current_url = args.url.clone();
    let mut pages_visited = 0;

    while pages_visited < args.max_pages {
        debug!(url = %current_url, page = pages_visited + 1, "researching page");

        // Get page snapshot
        let snapshot_result = retry_with_backoff(
            || get_snapshot(workspace, &session_name),
            2,
            Duration::from_millis(300),
        )
        .await;

        match snapshot_result {
            Ok((snapshot, title)) => {
                // Extract relevant information
                let extracted_data = if let Some(ref selectors) = args.extract_selectors {
                    extract_with_selectors(workspace, &session_name, selectors)
                        .await
                        .ok()
                } else {
                    None
                };

                // Take screenshot if requested
                let screenshot_path = if args.take_screenshots {
                    let path = format!("research_page_{}.png", pages_visited + 1);
                    capture_screenshot(workspace, &session_name, &path)
                        .await
                        .ok()
                } else {
                    None
                };

                // Generate summary from snapshot (first 2000 chars for brevity)
                let summary = generate_summary(&snapshot, &args.query);

                findings.push(PageFinding {
                    url: current_url.clone(),
                    title,
                    summary: summary.clone(),
                    extracted_data,
                    screenshot_path,
                });

                pages_visited += 1;

                // Try to find and follow relevant links if we need more pages
                if pages_visited < args.max_pages {
                    if let Some(next_url) = find_relevant_link(&snapshot, &args.query) {
                        let goto_result = retry_with_backoff(
                            || goto_url(workspace, &next_url, &session_name),
                            2,
                            Duration::from_millis(300),
                        )
                        .await;

                        if goto_result.is_ok() {
                            current_url = next_url;
                            continue;
                        }
                    }
                }
                break;
            }
            Err(e) => {
                warn!(error = %e, url = %current_url, "failed to get snapshot");
                errors.push(format!("Snapshot failed for {}: {}", current_url, e));
                break;
            }
        }
    }

    // Step 3: Cleanup
    if let Err(e) = close_session(workspace, &session_name).await {
        warn!(error = %e, "failed to close browser session");
    }

    // Compile results
    let summary = compile_summary(&findings, &args.query, &errors);

    let result = ResearchResult {
        success: !findings.is_empty(),
        query: args.query,
        pages_visited,
        findings,
        summary,
        error: if errors.is_empty() {
            None
        } else {
            Some(errors.join("; "))
        },
        screenshot_on_error,
    };

    Ok(json!(result))
}

/// Open a page in a new browser session.
async fn open_page(workspace: &Path, url: &str, session: &str) -> anyhow::Result<()> {
    let command = format!("playwright-cli -s={} open '{}'", session, escape_url(url));
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "open failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    // Wait a moment for page to settle
    tokio::time::sleep(Duration::from_millis(500)).await;
    Ok(())
}

/// Navigate to a URL in existing session.
async fn goto_url(workspace: &Path, url: &str, session: &str) -> anyhow::Result<()> {
    let command = format!("playwright-cli -s={} goto '{}'", session, escape_url(url));
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        anyhow::bail!(
            "goto failed: {}",
            result["stderr"].as_str().unwrap_or("unknown error")
        );
    }

    tokio::time::sleep(Duration::from_millis(500)).await;
    Ok(())
}

/// Get page snapshot and extract title.
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

/// Extract data using CSS selectors.
async fn extract_with_selectors(
    workspace: &Path,
    session: &str,
    selectors: &HashMap<String, String>,
) -> anyhow::Result<Value> {
    let mut extracted = serde_json::Map::new();

    for (key, selector) in selectors {
        // Use eval to query selector
        let js_code = format!(
            "() => {{ const el = document.querySelector('{}'); return el ? el.textContent : null; }}",
            selector.replace('\\', "\\\\").replace('\'', "\\'")
        );
        let command = format!("playwright-cli -s={} eval '{}'", session, js_code);
        let result = exec_shell(workspace, json!({ "command": command })).await?;

        let value: Value = result["stdout"]
            .as_str()
            .and_then(|s: &str| {
                if s.is_empty() || s == "null" {
                    None
                } else {
                    Some(s)
                }
            })
            .map(|s: &str| json!(s.trim()))
            .unwrap_or(json!(null));

        extracted.insert(key.clone(), value);
    }

    Ok(Value::Object(extracted))
}

/// Capture screenshot and save to workspace.
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
    let result = exec_shell(workspace, json!({ "command": command })).await?;

    if result["exit_code"] != 0 {
        // Try force close all
        let _ = exec_shell(
            workspace,
            json!({ "command": "playwright-cli close-all".to_string() }),
        )
        .await;
    }

    Ok(())
}

/// Retry an async operation with exponential backoff.
async fn retry_with_backoff<F, Fut, T>(
    operation: F,
    max_retries: usize,
    initial_delay: Duration,
) -> anyhow::Result<T>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = anyhow::Result<T>>,
{
    let mut delay = initial_delay;
    let mut last_error = None;

    for attempt in 0..max_retries {
        match operation().await {
            Ok(result) => return Ok(result),
            Err(e) => {
                last_error = Some(e);
                if attempt < max_retries - 1 {
                    tokio::time::sleep(delay).await;
                    delay *= 2;
                }
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow::anyhow!("all retries failed")))
}

/// Escape URL for shell safety.
fn escape_url(url: &str) -> String {
    // Basic escaping - in production, consider a proper shell escaping library
    url.replace('\\', "\\\\").replace('\'', "'\"'\"'")
}

/// Extract title from snapshot text (heuristic).
fn extract_title_from_snapshot(snapshot: &str) -> Option<String> {
    // Look for title in common patterns
    for line in snapshot.lines().take(50) {
        if line.to_lowercase().contains("title:") {
            return line.split(':').nth(1).map(|s| s.trim().to_string());
        }
    }
    None
}

/// Generate a summary from snapshot based on query relevance.
fn generate_summary(snapshot: &str, query: &str) -> String {
    let query_lower = query.to_lowercase();
    let query_terms: Vec<&str> = query_lower.split_whitespace().collect();
    let lines: Vec<&str> = snapshot.lines().collect();

    // Find most relevant lines
    let mut scored_lines: Vec<(usize, &str)> = lines
        .iter()
        .map(|line| {
            let line_lower = line.to_lowercase();
            let score = query_terms
                .iter()
                .filter(|term| line_lower.contains(*term))
                .count();
            (score, *line)
        })
        .filter(|(score, _)| *score > 0)
        .collect();

    scored_lines.sort_by(|a, b| b.0.cmp(&a.0));

    // Take top relevant lines
    let summary: String = scored_lines
        .into_iter()
        .take(10)
        .map(|(_, line)| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");

    if summary.is_empty() {
        // Fallback: take first non-empty lines
        snapshot
            .lines()
            .filter(|l| !l.trim().is_empty())
            .take(5)
            .collect::<Vec<_>>()
            .join(" | ")
    } else {
        summary
    }
}

/// Try to find a relevant link to follow.
fn find_relevant_link(_snapshot: &str, _query: &str) -> Option<String> {
    // This is a placeholder - in a real implementation, we'd parse the snapshot
    // for links and score them by relevance to the query
    None
}

/// Compile final summary from all findings.
fn compile_summary(findings: &[PageFinding], query: &str, errors: &[String]) -> String {
    let mut parts = Vec::new();

    parts.push(format!("Research query: '{}'", query));
    parts.push(format!("Pages visited: {}", findings.len()));

    if !findings.is_empty() {
        parts.push("\nKey findings:".to_string());
        for (i, finding) in findings.iter().enumerate() {
            parts.push(format!(
                "\n{}. {}",
                i + 1,
                finding.title.as_deref().unwrap_or("Untitled")
            ));
            parts.push(format!("   URL: {}", finding.url));
            parts.push(format!(
                "   Summary: {}",
                &finding.summary[..finding.summary.len().min(200)]
            ));
        }
    }

    if !errors.is_empty() {
        parts.push(format!("\nErrors encountered: {}", errors.len()));
    }

    parts.join("\n")
}

/// Register the browser_research tool.
pub fn register() {
    register_tool_deferred(ToolMeta {
        name: "browser_research".into(),
        description: "High-level web research tool. Navigates to a URL, searches for information related to a query, and extracts findings. Batches multiple operations (open, snapshot, extract) into one call for token efficiency. Auto-retries on transient failures.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "url": {
                    "type": "string",
                    "description": "Starting URL to navigate to"
                },
                "query": {
                    "type": "string",
                    "description": "The research question or search query to find answers for"
                },
                "max_pages": {
                    "type": "integer",
                    "description": "Maximum number of linked pages to visit (default: 1)",
                    "default": 1
                },
                "extract_selectors": {
                    "type": "object",
                    "description": "Optional CSS selectors to extract specific data (key: field name, value: CSS selector)",
                    "additionalProperties": { "type": "string" }
                },
                "take_screenshots": {
                    "type": "boolean",
                    "description": "Whether to take screenshots of visited pages (default: false)",
                    "default": false
                }
            },
            "required": ["url", "query"]
        }),
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_title_from_snapshot() {
        let snapshot = r#"Some content
Title: Test Page
More content"#;
        assert_eq!(
            extract_title_from_snapshot(snapshot),
            Some("Test Page".to_string())
        );
    }

    #[test]
    fn test_generate_summary() {
        let snapshot = r#"Line 1 about Rust programming
Line 2 about Python
Line 3 about Rust async"#;
        let query = "Rust programming";
        let summary = generate_summary(snapshot, query);
        assert!(summary.contains("Rust"));
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
    fn test_compile_summary() {
        let findings = vec![PageFinding {
            url: "https://example.com".to_string(),
            title: Some("Test Page".to_string()),
            summary: "This is a test summary".to_string(),
            extracted_data: None,
            screenshot_path: None,
        }];
        let summary = compile_summary(&findings, "test query", &[]);
        assert!(summary.contains("test query"));
        assert!(summary.contains("Test Page"));
    }
}
