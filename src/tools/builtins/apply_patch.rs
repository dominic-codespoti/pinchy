//! Apply unified-diff patches to workspace files.

use crate::tools::{register_tool, ToolMeta};
use serde_json::Value;
use std::path::Path;

/// Apply a unified diff patch. Supports multi-file patches.
pub async fn apply_patch(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let patch_text = args["patch"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("apply_patch requires a 'patch' string"))?;

    let mut applied = Vec::new();
    let mut errors = Vec::new();

    for file_patch in parse_patches(patch_text) {
        let target = if file_patch.path.starts_with('/') {
            std::path::PathBuf::from(&file_patch.path)
        } else {
            workspace.join(&file_patch.path)
        };

        // Security: ensure the target is inside the workspace
        let canonical_ws = workspace
            .canonicalize()
            .unwrap_or_else(|_| workspace.to_path_buf());
        let canonical_target = if target.exists() {
            target.canonicalize().unwrap_or_else(|_| target.clone())
        } else {
            // For new files, check the parent
            let parent = target.parent().unwrap_or(workspace);
            let parent_canon = parent
                .canonicalize()
                .unwrap_or_else(|_| parent.to_path_buf());
            parent_canon.join(target.file_name().unwrap_or_default())
        };

        if !canonical_target.starts_with(&canonical_ws) {
            errors.push(serde_json::json!({
                "file": file_patch.path,
                "error": "path escapes workspace"
            }));
            continue;
        }

        match apply_file_patch(&target, &file_patch).await {
            Ok(()) => applied.push(file_patch.path.clone()),
            Err(e) => errors.push(serde_json::json!({
                "file": file_patch.path,
                "error": e.to_string()
            })),
        }
    }

    Ok(serde_json::json!({
        "applied": applied,
        "errors": errors,
    }))
}

struct FilePatch {
    path: String,
    hunks: Vec<Hunk>,
    is_new_file: bool,
}

struct Hunk {
    old_start: usize,
    // Lines prefixed with ' ' (context) or '-' (remove)
    old_lines: Vec<String>,
    // Lines prefixed with ' ' (context) or '+' (add)
    new_lines: Vec<String>,
}

fn parse_patches(text: &str) -> Vec<FilePatch> {
    let lines: Vec<&str> = text.lines().collect();
    let mut patches = Vec::new();
    let mut i = 0;

    while i < lines.len() {
        // Find next file header
        if lines[i].starts_with("--- ") && i + 1 < lines.len() && lines[i + 1].starts_with("+++ ") {
            let old_path = lines[i]
                .trim_start_matches("--- ")
                .trim_start_matches("a/")
                .trim();
            let new_path = lines[i + 1]
                .trim_start_matches("+++ ")
                .trim_start_matches("b/")
                .trim();

            let is_new_file = old_path == "/dev/null";
            let path = new_path.to_string();

            i += 2;
            let mut hunks = Vec::new();

            // Parse hunks
            while i < lines.len() && !lines[i].starts_with("--- ") {
                if lines[i].starts_with("@@ ") {
                    if let Some(old_start) = parse_hunk_header(lines[i]) {
                        let mut old_lines = Vec::new();
                        let mut new_lines = Vec::new();
                        i += 1;

                        while i < lines.len()
                            && !lines[i].starts_with("@@ ")
                            && !lines[i].starts_with("--- ")
                        {
                            let line = lines[i];
                            if let Some(stripped) = line.strip_prefix('-') {
                                old_lines.push(stripped.to_string());
                            } else if let Some(stripped) = line.strip_prefix('+') {
                                new_lines.push(stripped.to_string());
                            } else if let Some(stripped) = line.strip_prefix(' ') {
                                old_lines.push(stripped.to_string());
                                new_lines.push(stripped.to_string());
                            } else if line == "\\ No newline at end of file" {
                                // skip
                            } else {
                                // Treat as context line (some diffs omit the leading space)
                                old_lines.push(line.to_string());
                                new_lines.push(line.to_string());
                            }
                            i += 1;
                        }

                        hunks.push(Hunk {
                            old_start,
                            old_lines,
                            new_lines,
                        });
                    } else {
                        i += 1;
                    }
                } else {
                    i += 1;
                }
            }

            patches.push(FilePatch {
                path,
                hunks,
                is_new_file,
            });
        } else {
            i += 1;
        }
    }

    patches
}

/// Parse "@@ -old_start,old_count +new_start,new_count @@"
fn parse_hunk_header(line: &str) -> Option<usize> {
    let after_at = line.strip_prefix("@@ -")?;
    let comma_or_space = after_at.find([',', ' '])?;
    after_at[..comma_or_space].parse::<usize>().ok()
}

async fn apply_file_patch(target: &std::path::Path, patch: &FilePatch) -> anyhow::Result<()> {
    if patch.is_new_file {
        if let Some(parent) = target.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let content: String = patch
            .hunks
            .iter()
            .flat_map(|h| h.new_lines.iter())
            .map(|l| format!("{l}\n"))
            .collect();
        tokio::fs::write(target, content).await?;
        return Ok(());
    }

    let original = tokio::fs::read_to_string(target)
        .await
        .map_err(|e| anyhow::anyhow!("cannot read {}: {e}", target.display()))?;

    let mut lines: Vec<String> = original.lines().map(String::from).collect();

    // Apply hunks in reverse order so line numbers remain valid
    let mut hunks: Vec<&Hunk> = patch.hunks.iter().collect();
    hunks.sort_by(|a, b| b.old_start.cmp(&a.old_start));

    for hunk in hunks {
        let start = if hunk.old_start == 0 {
            0
        } else {
            hunk.old_start - 1
        };
        let old_count = hunk.old_lines.len();

        let pos = find_hunk_position(&lines, &hunk.old_lines, start);

        match pos {
            Some(actual_start) => {
                let end = actual_start + old_count;
                let clamped_end = end.min(lines.len());
                lines.splice(actual_start..clamped_end, hunk.new_lines.iter().cloned());
            }
            None => {
                return Err(anyhow::anyhow!(
                    "hunk at line {} did not match file content",
                    hunk.old_start
                ));
            }
        }
    }

    let mut result = lines.join("\n");
    if original.ends_with('\n') && !result.ends_with('\n') {
        result.push('\n');
    }

    tokio::fs::write(target, result).await?;
    Ok(())
}

/// Find where a hunk's old lines actually appear in the file.
/// Tries the expected position first, then searches ±50 lines.
fn find_hunk_position(
    file_lines: &[String],
    old_lines: &[String],
    expected: usize,
) -> Option<usize> {
    if old_lines.is_empty() {
        return Some(expected.min(file_lines.len()));
    }

    if matches_at(file_lines, old_lines, expected) {
        return Some(expected);
    }

    for offset in 1..=50 {
        if expected + offset < file_lines.len()
            && matches_at(file_lines, old_lines, expected + offset)
        {
            return Some(expected + offset);
        }
        if offset <= expected && matches_at(file_lines, old_lines, expected - offset) {
            return Some(expected - offset);
        }
    }

    None
}

fn matches_at(file_lines: &[String], old_lines: &[String], start: usize) -> bool {
    if start + old_lines.len() > file_lines.len() {
        return false;
    }
    for (i, old) in old_lines.iter().enumerate() {
        if file_lines[start + i].trim_end() != old.trim_end() {
            return false;
        }
    }
    true
}

pub fn register() {
    register_tool(ToolMeta {
        name: "apply_patch".into(),
        description: "Apply a unified diff patch to one or more files. Useful for bulk multi-file edits. Provide a standard unified diff (as produced by `diff -u` or `git diff`).".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "patch": {
                    "type": "string",
                    "description": "Unified diff patch text (supports multi-file patches)"
                }
            },
            "required": ["patch"]
        }),
    });
}
