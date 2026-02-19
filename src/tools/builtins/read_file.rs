//! Built-in `read_file` tool — reads a file inside the agent workspace.
//!
//! Supports optional `start_line` / `end_line` for partial reads (1-based
//! inclusive) and optional `include_info: true` to return metadata
//! (total lines, byte size).

use serde_json::{json, Value};
use std::path::Path;

use crate::tools::{register_tool, sandbox_path, ToolMeta};

/// Read a file inside the workspace.
///
/// Args: `{ "path": "…", "start_line?": N, "end_line?": N, "include_info?": bool }`
/// Returns: `{ "content": "…", "start_line": N, "end_line": N, "total_lines?": N, "size_bytes?": N }`
pub async fn read_file(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let raw = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("read_file: missing `path` argument"))?;

    let path = sandbox_path(workspace, raw)?;

    let full_content = tokio::fs::read_to_string(&path)
        .await
        .map_err(|e| anyhow::anyhow!("read_file: cannot read {}: {e}", path.display()))?;

    let all_lines: Vec<&str> = full_content.split('\n').collect();
    let total_lines = all_lines.len();
    let size_bytes = full_content.len();

    let start = args
        .get("start_line")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize);
    let end = args
        .get("end_line")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize);

    let (content, actual_start, actual_end) = match (start, end) {
        (Some(s), Some(e)) => {
            if s < 1 || e < s || s > total_lines {
                anyhow::bail!(
                    "read_file: line range {s}..{e} out of bounds (file has {total_lines} lines)"
                );
            }
            let e = e.min(total_lines);
            let slice = &all_lines[(s - 1)..e];
            (slice.join("\n"), s, e)
        }
        (Some(s), None) => {
            if s < 1 || s > total_lines {
                anyhow::bail!(
                    "read_file: start_line {s} out of bounds (file has {total_lines} lines)"
                );
            }
            let slice = &all_lines[(s - 1)..];
            (slice.join("\n"), s, total_lines)
        }
        (None, Some(e)) => {
            let e = e.min(total_lines);
            let slice = &all_lines[..e];
            (slice.join("\n"), 1, e)
        }
        (None, None) => (full_content, 1, total_lines),
    };

    let include_info = args
        .get("include_info")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let mut result = json!({ "content": content });
    if start.is_some() || end.is_some() {
        result["start_line"] = json!(actual_start);
        result["end_line"] = json!(actual_end);
        result["total_lines"] = json!(total_lines);
    }
    if include_info {
        result["total_lines"] = json!(total_lines);
        result["size_bytes"] = json!(size_bytes);
    }

    Ok(result)
}

/// Register the `read_file` tool metadata in the global registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "read_file".into(),
        description: "Read files inside the agent workspace. Supports optional line range for partial reads and include_info for metadata.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Workspace-relative path to the file."
                },
                "start_line": {
                    "type": "integer",
                    "description": "Optional 1-based start line (inclusive). Returns from this line onwards."
                },
                "end_line": {
                    "type": "integer",
                    "description": "Optional 1-based end line (inclusive). Defaults to end of file if omitted."
                },
                "include_info": {
                    "type": "boolean",
                    "description": "If true, include total_lines and size_bytes in the response."
                }
            },
            "required": ["path"],
            "additionalProperties": false
        }),
    });
}
