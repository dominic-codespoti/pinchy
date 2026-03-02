//! File watcher — auto-ingest files into agent memory.
//!
//! When configured, watches directories and automatically saves
//! changed text files as memory entries keyed by their relative path.

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use notify_debouncer_mini::{new_debouncer, DebouncedEventKind};
use tokio::sync::mpsc;
use tracing::{debug, info, warn};

/// Start file watchers for an agent.
///
/// Returns a join handle for the watcher task. The task runs until
/// the cancellation token is triggered or the channel is dropped.
pub fn start_agent_watcher(
    agent_id: String,
    workspace: PathBuf,
    watch_paths: Vec<String>,
    cancel: tokio_util::sync::CancellationToken,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        if watch_paths.is_empty() {
            return;
        }

        let (tx, mut rx) = mpsc::channel::<Vec<PathBuf>>(64);

        // Spawn a blocking thread for the notify watcher (it uses OS APIs).
        let paths_for_watcher: Vec<PathBuf> = watch_paths
            .iter()
            .map(|p| {
                let pb = PathBuf::from(p);
                if pb.is_absolute() {
                    pb
                } else {
                    workspace.join(p)
                }
            })
            .collect();

        let tx2 = tx.clone();
        let _watcher_thread = std::thread::spawn(move || {
            let rt = tokio::runtime::Handle::current();
            let tx = tx2;

            let (notify_tx, notify_rx) = std::sync::mpsc::channel();
            let mut debouncer = match new_debouncer(Duration::from_secs(2), notify_tx) {
                Ok(d) => d,
                Err(e) => {
                    tracing::error!(error = %e, "failed to create file watcher");
                    return;
                }
            };

            for path in &paths_for_watcher {
                if let Err(e) = debouncer.watcher().watch(
                    path,
                    notify_debouncer_mini::notify::RecursiveMode::Recursive,
                ) {
                    warn!(path = %path.display(), error = %e, "failed to watch path");
                }
            }

            info!(
                agent = %"watcher",
                paths = ?paths_for_watcher.iter().map(|p| p.display().to_string()).collect::<Vec<_>>(),
                "file watcher started"
            );

            loop {
                match notify_rx.recv_timeout(Duration::from_secs(5)) {
                    Ok(Ok(events)) => {
                        let changed: Vec<PathBuf> = events
                            .into_iter()
                            .filter(|e| e.kind == DebouncedEventKind::Any)
                            .map(|e| e.path)
                            .collect();
                        if !changed.is_empty() {
                            let _ = rt.block_on(tx.send(changed));
                        }
                    }
                    Ok(Err(e)) => {
                        warn!(error = %e, "file watcher error");
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Check if we should stop (best-effort).
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        break;
                    }
                }
            }
        });

        // Process changed files.
        loop {
            tokio::select! {
                _ = cancel.cancelled() => {
                    debug!(agent = %agent_id, "file watcher shutting down");
                    break;
                }
                Some(paths) = rx.recv() => {
                    ingest_files(&agent_id, &workspace, &watch_paths, paths).await;
                }
            }
        }
    })
}

/// Ingest changed files into the agent's memory store.
async fn ingest_files(
    agent_id: &str,
    workspace: &Path,
    watch_roots: &[String],
    paths: Vec<PathBuf>,
) {
    let store = match crate::memory::MemoryStore::open(workspace) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            warn!(agent = %agent_id, error = %e, "failed to open memory store for file ingest");
            return;
        }
    };

    for path in paths {
        // Skip binary/large files.
        if !is_text_file(&path) {
            continue;
        }

        let content = match tokio::fs::read_to_string(&path).await {
            Ok(c) => c,
            Err(_) => continue,
        };

        // Skip large files (>100KB).
        if content.len() > 100_000 {
            debug!(path = %path.display(), "skipping large file for memory ingest");
            continue;
        }

        // Key: relative path from any watch root.
        let key = relative_key(watch_roots, &path);
        let tags = vec!["file-watch".to_string(), "auto-ingest".to_string()];

        let store2 = Arc::clone(&store);
        let key2 = key.clone();
        let content2 = content.clone();
        if let Err(e) = tokio::task::spawn_blocking(move || {
            store2.save(&key2, &content2, &tags)?;
            // Clear cached embedding so it gets recomputed.
            let _ = store2.delete_embedding(&key2);
            Ok::<_, anyhow::Error>(())
        })
        .await
        .unwrap_or_else(|e| Err(anyhow::anyhow!("{e}")))
        {
            warn!(key = %key, error = %e, "failed to ingest file into memory");
        } else {
            debug!(key = %key, agent = %agent_id, "ingested file into memory");
        }
    }
}

fn relative_key(watch_roots: &[String], path: &Path) -> String {
    for root in watch_roots {
        let root_path = PathBuf::from(root);
        if let Ok(rel) = path.strip_prefix(&root_path) {
            return format!("file:{}", rel.display());
        }
    }
    format!(
        "file:{}",
        path.file_name().unwrap_or_default().to_string_lossy()
    )
}

fn is_text_file(path: &Path) -> bool {
    let text_exts = [
        "txt",
        "md",
        "rs",
        "py",
        "js",
        "ts",
        "json",
        "yaml",
        "yml",
        "toml",
        "html",
        "css",
        "sh",
        "bash",
        "zsh",
        "fish",
        "conf",
        "cfg",
        "ini",
        "xml",
        "csv",
        "log",
        "env",
        "dockerfile",
        "makefile",
        "gitignore",
        "tsx",
        "jsx",
        "vue",
        "svelte",
        "rb",
        "go",
        "java",
        "c",
        "cpp",
        "h",
        "hpp",
        "sql",
        "graphql",
        "proto",
        "lock",
    ];
    match path.extension() {
        Some(ext) => {
            let ext = ext.to_string_lossy().to_lowercase();
            text_exts.contains(&ext.as_str())
        }
        None => {
            // Check for known extensionless files
            let name = path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_lowercase();
            matches!(
                name.as_str(),
                "makefile" | "dockerfile" | ".gitignore" | ".env" | "readme"
            )
        }
    }
}
