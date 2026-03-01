//! Built-in `list_files` tool — list directory contents inside the agent
//! workspace with optional glob filtering and recursive traversal.

use serde_json::{json, Value};
use std::path::Path;

use crate::tools::{register_tool, sandbox_path, ToolMeta};

/// List files in a directory, optionally with glob pattern and recursion.
///
/// Args:
/// ```json
/// {
///   "path": ".",
///   "pattern": "*.rs",
///   "recursive": false,
///   "include_metadata": false
/// }
/// ```
pub async fn list_files(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let raw = args.get("path").and_then(Value::as_str).unwrap_or(".");

    let dir = sandbox_path(workspace, raw)?;

    if !dir.is_dir() {
        anyhow::bail!("list_files: '{}' is not a directory", dir.display());
    }

    let pattern = args.get("pattern").and_then(Value::as_str);
    let recursive = args
        .get("recursive")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let include_metadata = args
        .get("include_metadata")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    let mut entries: Vec<Value> = Vec::new();
    let max_entries = 1000;

    collect_entries(
        &dir,
        workspace,
        pattern,
        recursive,
        include_metadata,
        &mut entries,
        max_entries,
    )
    .await?;

    // Sort: directories first, then alphabetical.
    entries.sort_by(|a, b| {
        let a_dir = a["type"].as_str() == Some("directory");
        let b_dir = b["type"].as_str() == Some("directory");
        match (a_dir, b_dir) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => {
                let a_name = a["name"].as_str().unwrap_or("");
                let b_name = b["name"].as_str().unwrap_or("");
                a_name.cmp(b_name)
            }
        }
    });

    let truncated = entries.len() >= max_entries;

    if include_metadata {
        // Rich mode: keep full objects for metadata consumers.
        let mut result = json!({ "entries": entries });
        if truncated {
            result["truncated"] = json!(true);
        }
        Ok(result)
    } else {
        // Compact mode (default): flat list of paths, dirs get trailing /
        let paths: Vec<String> = entries
            .iter()
            .map(|e| {
                let p = e["path"].as_str().unwrap_or("");
                if e["type"].as_str() == Some("directory") {
                    format!("{}/", p)
                } else {
                    p.to_string()
                }
            })
            .collect();
        let mut result = json!({ "files": paths });
        if truncated {
            result["truncated"] = json!(true);
        }
        Ok(result)
    }
}

/// Directories to skip during recursive traversal — these are typically
/// large dependency or build-output trees that drown out real results.
const SKIP_DIRS: &[&str] = &[
    "node_modules",
    "venv",
    ".venv",
    "__pycache__",
    ".git",
    "site-packages",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    "dist",
    ".egg-info",
];

/// Recursively collect directory entries using breadth-first traversal so
/// that sibling files are discovered before recursing into subdirectories.
async fn collect_entries(
    dir: &Path,
    workspace: &Path,
    pattern: Option<&str>,
    recursive: bool,
    include_metadata: bool,
    entries: &mut Vec<Value>,
    max: usize,
) -> anyhow::Result<()> {
    let mut rd = tokio::fs::read_dir(dir)
        .await
        .map_err(|e| anyhow::anyhow!("list_files: cannot read {}: {e}", dir.display()))?;

    // Phase 1: read all immediate children, collecting files/dirs and
    //          deferring subdirectories for recursion.
    let mut subdirs: Vec<std::path::PathBuf> = Vec::new();

    while let Ok(Some(entry)) = rd.next_entry().await {
        if entries.len() >= max {
            return Ok(());
        }

        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files unless the pattern explicitly starts with '.'.
        if name.starts_with('.') && !pattern.map(|p| p.starts_with('.')).unwrap_or(false) {
            continue;
        }

        let ft = entry.file_type().await.ok();
        let is_dir = ft.as_ref().map(|f| f.is_dir()).unwrap_or(false);
        let entry_type = if is_dir { "directory" } else { "file" };

        // Apply glob pattern — skip non-matching *files*.
        // Directories are never skipped by the pattern so we can recurse into them.
        if let Some(pat) = pattern {
            if !is_dir && !glob_match(pat, &name) {
                continue;
            }
        }

        let rel_path = entry
            .path()
            .strip_prefix(workspace)
            .unwrap_or(&entry.path())
            .to_string_lossy()
            .to_string();

        let mut obj = json!({
            "name": name,
            "path": rel_path,
            "type": entry_type,
        });

        if include_metadata {
            if let Ok(meta) = entry.metadata().await {
                obj["size_bytes"] = json!(meta.len());
                if let Ok(modified) = meta.modified() {
                    if let Ok(dur) = modified.duration_since(std::time::UNIX_EPOCH) {
                        obj["modified"] = json!(dur.as_secs());
                    }
                }
            }
        }

        // When a pattern is active, only include matching *files* in results.
        // Directories are never included — they're just traversal nodes.
        let should_add = if pattern.is_some() { !is_dir } else { true };

        if should_add {
            entries.push(obj);
        }

        // Queue subdirectory for breadth-first recursion (skip noise dirs
        // and Python virtualenvs detected by pyvenv.cfg).
        if recursive && is_dir && !SKIP_DIRS.contains(&name.as_str()) {
            let path = entry.path();
            if !path.join("pyvenv.cfg").exists() {
                subdirs.push(path);
            }
        }
    }

    // Phase 2: recurse into subdirectories (breadth-first).
    for subdir in subdirs {
        if entries.len() >= max {
            break;
        }
        Box::pin(collect_entries(
            &subdir,
            workspace,
            pattern,
            recursive,
            include_metadata,
            entries,
            max,
        ))
        .await?;
    }

    Ok(())
}

/// Simple glob matching supporting `*` (any chars) and `?` (single char).
fn glob_match(pattern: &str, name: &str) -> bool {
    let pat = pattern.chars().peekable();
    let txt = name.chars().peekable();

    glob_match_inner(&pat.collect::<Vec<_>>(), &txt.collect::<Vec<_>>())
}

fn glob_match_inner(pattern: &[char], text: &[char]) -> bool {
    let mut pi = 0;
    let mut ti = 0;
    let mut star_pi = None;
    let mut star_ti = 0;

    while ti < text.len() {
        if pi < pattern.len() && (pattern[pi] == '?' || pattern[pi] == text[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < pattern.len() && pattern[pi] == '*' {
            star_pi = Some(pi);
            star_ti = ti;
            pi += 1;
        } else if let Some(sp) = star_pi {
            pi = sp + 1;
            star_ti += 1;
            ti = star_ti;
        } else {
            return false;
        }
    }

    while pi < pattern.len() && pattern[pi] == '*' {
        pi += 1;
    }

    pi == pattern.len()
}

/// Register the `list_files` tool metadata.
pub fn register() {
    register_tool(ToolMeta {
        name: "list_files".into(),
        description: "List files and directories inside the agent workspace. Supports glob patterns (e.g. '*.rs'), recursive traversal, and optional file metadata.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Workspace-relative directory to list (default: '.' for workspace root)."
                },
                "pattern": {
                    "type": "string",
                    "description": "Glob pattern to filter files (e.g. '*.rs', '*.md', 'test_*'). Supports * and ? wildcards."
                },
                "recursive": {
                    "type": "boolean",
                    "description": "If true, recurse into subdirectories. Default: false."
                },
                "include_metadata": {
                    "type": "boolean",
                    "description": "If true, include size_bytes and modified timestamp for each entry. Default: false."
                }
            },
            "additionalProperties": false
        }),
    });
}
