//! Built-in `edit_file` tool — surgically edit a file inside the agent
//! workspace by line range or by search-and-replace.
//!
//! Modes:
//! - `"replace"` (default) — replace a contiguous range of lines
//! - `"insert"` — insert content before a given line
//! - `"search_replace"` — find literal text and replace it (no line numbers needed)

use serde_json::{json, Value};
use std::path::Path;

use crate::tools::{register_tool, sandbox_path, ToolMeta};

/// Edit a file by replacing a line range, inserting lines, or
/// performing text search-and-replace.
pub async fn edit_file(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let raw = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("edit_file: missing `path` argument"))?;

    let path = sandbox_path(workspace, raw)?;

    // Read existing file.
    let existing = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| anyhow::anyhow!("edit_file: cannot read {}: {e}", path.display()))?;

    let mode = args
        .get("mode")
        .and_then(Value::as_str)
        .unwrap_or("replace");

    let output = match mode {
        "search_replace" => do_search_replace(&existing, &args)?,
        "insert" => do_insert(&existing, &args)?,
        "replace" | _ => do_line_replace(&existing, &args)?,
    };

    let bytes = output.len();

    // Ensure parent directories exist.
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    tokio::fs::write(&path, &output)
        .await
        .map_err(|e| anyhow::anyhow!("edit_file: cannot write {}: {e}", path.display()))?;

    let new_total = output.split('\n').count();
    Ok(json!({
        "edited": true,
        "bytes": bytes,
        "total_lines": new_total,
        "mode": mode,
    }))
}

/// `search_replace` mode — find literal text and replace it.
///
/// Args: `{ "search": "old text", "content": "new text", "replace_all?": bool }`
fn do_search_replace(existing: &str, args: &Value) -> anyhow::Result<String> {
    let search = args
        .get("search")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            anyhow::anyhow!("edit_file (search_replace): missing `search` argument")
        })?;

    let replacement = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| {
            anyhow::anyhow!("edit_file (search_replace): missing `content` argument (use empty string to delete)")
        })?;

    if search.is_empty() {
        anyhow::bail!("edit_file (search_replace): `search` must not be empty");
    }

    if !existing.contains(search) {
        anyhow::bail!(
            "edit_file (search_replace): search text not found in file"
        );
    }

    let replace_all = args
        .get("replace_all")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let output = if replace_all {
        existing.replace(search, replacement)
    } else {
        existing.replacen(search, replacement, 1)
    };

    Ok(output)
}

/// `insert` mode — insert new lines before `start_line`.
fn do_insert(existing: &str, args: &Value) -> anyhow::Result<String> {
    let content = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("edit_file (insert): missing `content` argument"))?;

    let lines: Vec<&str> = existing.split('\n').collect();
    let total_lines = lines.len();

    let at = args
        .get("start_line")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| anyhow::anyhow!("edit_file (insert): missing `start_line`"))?
        as usize;

    if at < 1 || at > total_lines + 1 {
        anyhow::bail!(
            "edit_file (insert): start_line {at} out of range (file has {total_lines} lines)"
        );
    }

    let new_lines: Vec<&str> = content.split('\n').collect();
    let idx = at - 1;
    let mut result: Vec<&str> = Vec::with_capacity(lines.len() + new_lines.len());
    result.extend_from_slice(&lines[..idx]);
    result.extend_from_slice(&new_lines);
    result.extend_from_slice(&lines[idx..]);

    Ok(result.join("\n"))
}

/// `replace` mode (default) — replace a contiguous range of lines.
fn do_line_replace(existing: &str, args: &Value) -> anyhow::Result<String> {
    let content = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("edit_file: missing `content` argument"))?;

    let mut lines: Vec<&str> = existing.split('\n').collect();
    let total_lines = lines.len();

    let start = args
        .get("start_line")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| anyhow::anyhow!("edit_file: missing `start_line`"))?
        as usize;

    let end = args
        .get("end_line")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(start);

    if start < 1 || end < start || end > total_lines {
        anyhow::bail!(
            "edit_file: line range {start}..{end} out of bounds (file has {total_lines} lines)"
        );
    }

    let new_lines: Vec<&str> = if content.is_empty() {
        Vec::new()
    } else {
        content.split('\n').collect()
    };

    let si = start - 1;
    let ei = end;

    let mut result: Vec<&str> = Vec::with_capacity(lines.len());
    result.extend_from_slice(&lines[..si]);
    result.extend_from_slice(&new_lines);
    result.extend_from_slice(&lines[ei..]);
    lines = result;

    Ok(lines.join("\n"))
}

/// Register the `edit_file` tool metadata.
pub fn register() {
    register_tool(ToolMeta {
        name: "edit_file".into(),
        description: "Surgically edit a file: replace a line range, insert lines, or search-and-replace text. More efficient than rewriting entire files.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Workspace-relative path to the file to edit."
                },
                "start_line": {
                    "type": "integer",
                    "description": "1-based start line (inclusive). Required for replace/insert modes."
                },
                "end_line": {
                    "type": "integer",
                    "description": "1-based end line (inclusive). Defaults to start_line for single-line edits. Only for replace mode."
                },
                "content": {
                    "type": "string",
                    "description": "Replacement or insertion content. Use empty string to delete lines."
                },
                "search": {
                    "type": "string",
                    "description": "Literal text to find (for search_replace mode). Must exist in the file."
                },
                "replace_all": {
                    "type": "boolean",
                    "description": "If true and mode is search_replace, replace ALL occurrences. Default: false (first only)."
                },
                "mode": {
                    "type": "string",
                    "enum": ["replace", "insert", "search_replace"],
                    "description": "Edit mode: 'replace' (default) replaces a line range, 'insert' inserts before start_line, 'search_replace' finds and replaces literal text."
                }
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    });
}
