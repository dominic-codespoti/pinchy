//! Built-in `write_file` tool — creates/overwrites/appends to a file inside the agent workspace.

use serde_json::{json, Value};
use std::path::Path;

use crate::tools::{register_tool, sandbox_path, ToolMeta};

/// Write (create / overwrite / append) a file inside the workspace.
///
/// Args: `{ "path": "…", "content": "…", "append?": bool }`
/// Returns: `{ "written": true, "bytes": <n>, "appended?": bool }`
pub async fn write_file(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let raw = args
        .get("path")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("write_file: missing `path` argument"))?;

    let content = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("write_file: missing `content` argument"))?;

    let append = args
        .get("append")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let path = sandbox_path(workspace, raw)?;

    // Ensure parent directories exist.
    if let Some(parent) = path.parent() {
        tokio::fs::create_dir_all(parent).await?;
    }

    let bytes = content.len();

    if append {
        use tokio::io::AsyncWriteExt;
        let mut file = tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
            .map_err(|e| anyhow::anyhow!("write_file: cannot open {}: {e}", path.display()))?;
        file.write_all(content.as_bytes())
            .await
            .map_err(|e| anyhow::anyhow!("write_file: cannot append to {}: {e}", path.display()))?;
    } else {
        tokio::fs::write(&path, content)
            .await
            .map_err(|e| anyhow::anyhow!("write_file: cannot write {}: {e}", path.display()))?;
    }

    let mut result = json!({ "written": true, "bytes": bytes });
    if append {
        result["appended"] = json!(true);
    }
    Ok(result)
}

/// Register the `write_file` tool metadata in the global registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "write_file".into(),
        description: "Create, overwrite, or append to a file inside the agent workspace.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Relative or absolute path to the file (must be inside the workspace)."
                },
                "content": {
                    "type": "string",
                    "description": "The content to write to the file."
                },
                "append": {
                    "type": "boolean",
                    "description": "If true, append content to the file instead of overwriting. Default: false."
                }
            },
            "required": ["path", "content"],
            "additionalProperties": false
        }),
    });
}
