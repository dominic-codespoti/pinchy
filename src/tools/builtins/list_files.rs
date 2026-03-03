//! Built-in `list_files` tool — list directory contents inside the agent
//! workspace with optional glob filtering and recursive traversal.

use serde_json::{json, Value};
use std::path::Path;

use crate::tools::{register_tool, sandbox_path, ToolMeta};

/// Lightweight entry used for collecting & sorting before converting to
/// JSON, avoiding heap-allocated `serde_json::Value` during the sort (#9).
struct DirEntry {
    name: String,
    rel_path: String,
    is_dir: bool,
    size_bytes: Option<u64>,
    modified_secs: Option<u64>,
}

/// List files in a directory, optionally with glob pattern and recursion.
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

    let mut entries: Vec<DirEntry> = Vec::new();
    let max_entries = 1000;
    let max_depth = 20; // Guard against symlink loops / extreme nesting (#8).

    let opts = CollectOpts {
        workspace,
        pattern,
        recursive,
        include_metadata,
        max: max_entries,
        max_depth,
    };

    collect_entries(&dir, &opts, &mut entries, 0).await?;

    // Sort: directories first, then alphabetical (#9 — sort on typed fields).
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then_with(|| a.name.cmp(&b.name)));

    let truncated = entries.len() >= max_entries;

    if include_metadata {
        let json_entries: Vec<Value> = entries
            .iter()
            .map(|e| {
                let mut obj = json!({
                    "name": e.name,
                    "path": e.rel_path,
                    "type": if e.is_dir { "directory" } else { "file" },
                });
                if let Some(sz) = e.size_bytes {
                    obj["size_bytes"] = json!(sz);
                }
                if let Some(ts) = e.modified_secs {
                    obj["modified"] = json!(ts);
                }
                obj
            })
            .collect();
        let mut result = json!({ "entries": json_entries });
        if truncated {
            result["truncated"] = json!(true);
        }
        Ok(result)
    } else {
        let paths: Vec<String> = entries
            .iter()
            .map(|e| {
                if e.is_dir {
                    format!("{}/", e.rel_path)
                } else {
                    e.rel_path.clone()
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

/// Options for recursive directory traversal.
struct CollectOpts<'a> {
    workspace: &'a Path,
    pattern: Option<&'a str>,
    recursive: bool,
    include_metadata: bool,
    max: usize,
    max_depth: usize,
}

/// Recursively collect directory entries using breadth-first traversal so
/// that sibling files are discovered before recursing into subdirectories.
///
/// `depth` / `max_depth` guard against symlink loops (#8).
async fn collect_entries(
    dir: &Path,
    opts: &CollectOpts<'_>,
    entries: &mut Vec<DirEntry>,
    depth: usize,
) -> anyhow::Result<()> {
    if depth > opts.max_depth {
        return Ok(());
    }

    let mut rd = tokio::fs::read_dir(dir)
        .await
        .map_err(|e| anyhow::anyhow!("list_files: cannot read {}: {e}", dir.display()))?;

    let mut subdirs: Vec<std::path::PathBuf> = Vec::new();

    while let Ok(Some(entry)) = rd.next_entry().await {
        if entries.len() >= opts.max {
            return Ok(());
        }

        let name = entry.file_name().to_string_lossy().to_string();

        if name.starts_with('.') && !opts.pattern.map(|p| p.starts_with('.')).unwrap_or(false) {
            continue;
        }

        let ft = entry.file_type().await.ok();
        let is_dir = ft.as_ref().map(|f| f.is_dir()).unwrap_or(false);

        if let Some(pat) = opts.pattern {
            if !is_dir && !glob_match(pat, &name) {
                continue;
            }
        }

        let rel_path = entry
            .path()
            .strip_prefix(opts.workspace)
            .unwrap_or(&entry.path())
            .to_string_lossy()
            .to_string();

        let (size_bytes, modified_secs) = if opts.include_metadata {
            if let Ok(meta) = entry.metadata().await {
                let sz = Some(meta.len());
                let ts = meta
                    .modified()
                    .ok()
                    .and_then(|m| m.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs());
                (sz, ts)
            } else {
                (None, None)
            }
        } else {
            (None, None)
        };

        let should_add = if opts.pattern.is_some() {
            !is_dir
        } else {
            true
        };

        if should_add {
            entries.push(DirEntry {
                name: name.clone(),
                rel_path,
                is_dir,
                size_bytes,
                modified_secs,
            });
        }

        if opts.recursive && is_dir && !SKIP_DIRS.contains(&name.as_str()) {
            let path = entry.path();
            if !path.join("pyvenv.cfg").exists() {
                subdirs.push(path);
            }
        }
    }

    for subdir in subdirs {
        if entries.len() >= opts.max {
            break;
        }
        Box::pin(collect_entries(&subdir, opts, entries, depth + 1)).await?;
    }

    Ok(())
}

/// Simple glob matching supporting `*` (any chars) and `?` (single char).
///
/// Operates on byte indices into `&str` to avoid allocating `Vec<char>` (#16).
fn glob_match(pattern: &str, name: &str) -> bool {
    let pat = pattern.as_bytes();
    let txt = name.as_bytes();
    let mut pi = 0usize;
    let mut ti = 0usize;
    let mut star_pi: Option<usize> = None;
    let mut star_ti = 0usize;

    while ti < txt.len() {
        if pi < pat.len() && (pat[pi] == b'?' || pat[pi] == txt[ti]) {
            pi += 1;
            ti += 1;
        } else if pi < pat.len() && pat[pi] == b'*' {
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

    while pi < pat.len() && pat[pi] == b'*' {
        pi += 1;
    }

    pi == pat.len()
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
