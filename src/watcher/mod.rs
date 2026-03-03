//! File watcher — auto-ingest files into agent memory.
//!
//! When configured, watches directories and automatically saves
//! changed text files as memory entries keyed by their relative path.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
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

        // Open the memory store once and reuse for all batches (#1).
        let store = match crate::memory::MemoryStore::open(&workspace) {
            Ok(s) => Arc::new(s),
            Err(e) => {
                warn!(agent = %agent_id, error = %e, "failed to open memory store for watcher");
                return;
            }
        };

        let (tx, mut rx) = mpsc::channel::<Vec<PathBuf>>(64);

        // Resolve watch paths to absolute form for both the watcher and
        // the relative_key function (#7).
        let resolved_paths: Vec<PathBuf> = watch_paths
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

        // Shared flag so the OS thread can observe cancellation (#3).
        let should_stop = Arc::new(AtomicBool::new(false));
        let should_stop2 = Arc::clone(&should_stop);
        let paths_for_watcher = resolved_paths.clone();

        let tx2 = tx.clone();
        let _watcher_thread = std::thread::spawn(move || {
            // Capture a Handle only for sends — we use try_send via the
            // blocking std mpsc bridge to avoid block_on panics on
            // runtime shutdown (#3).
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
                // Check the stop flag so the thread exits promptly on
                // cancellation rather than lingering forever (#3).
                if should_stop2.load(Ordering::Relaxed) {
                    debug!("watcher OS thread: stop flag set, exiting");
                    break;
                }

                match notify_rx.recv_timeout(Duration::from_secs(2)) {
                    Ok(Ok(events)) => {
                        let changed: Vec<PathBuf> = events
                            .into_iter()
                            .filter(|e| e.kind == DebouncedEventKind::Any)
                            .map(|e| e.path)
                            .collect();
                        if !changed.is_empty() {
                            // Use blocking_send only if we still have a
                            // receiver; otherwise the thread exits.
                            if tx.blocking_send(changed).is_err() {
                                break;
                            }
                        }
                    }
                    Ok(Err(e)) => {
                        warn!(error = %e, "file watcher error");
                    }
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                        // Loop back to re-check the stop flag.
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
                    // Signal the OS thread to exit (#3).
                    should_stop.store(true, Ordering::Relaxed);
                    break;
                }
                Some(paths) = rx.recv() => {
                    ingest_files(&agent_id, &store, &resolved_paths, paths).await;
                }
            }
        }
    })
}

/// Ingest changed files into the agent's memory store.
///
/// Takes a pre-opened `MemoryStore` to avoid reopening per batch (#1).
async fn ingest_files(
    agent_id: &str,
    store: &Arc<crate::memory::MemoryStore>,
    resolved_roots: &[PathBuf],
    paths: Vec<PathBuf>,
) {
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

        // Key: relative path from any resolved watch root (#7).
        let key = relative_key(resolved_roots, &path);
        let tags = vec!["file-watch".to_string(), "auto-ingest".to_string()];

        let store2 = Arc::clone(store);
        let key2 = key.clone();
        let content2 = content.clone();
        // Use save_and_invalidate_embedding for atomicity (#2).
        if let Err(e) = tokio::task::spawn_blocking(move || {
            store2.save_and_invalidate_embedding(&key2, &content2, &tags)
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

/// Compute a `file:` prefixed key relative to the resolved watch roots (#7).
fn relative_key(resolved_roots: &[PathBuf], path: &Path) -> String {
    for root in resolved_roots {
        if let Ok(rel) = path.strip_prefix(root) {
            return format!("file:{}", rel.display());
        }
    }
    format!(
        "file:{}",
        path.file_name().unwrap_or_default().to_string_lossy()
    )
}

/// Known binary extensions — deny-list approach so new text formats are
/// accepted by default (#6).
const BINARY_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "bmp", "ico", "webp", "svg", "tif", "tiff", "mp3", "mp4", "avi",
    "mkv", "mov", "flac", "wav", "ogg", "zip", "tar", "gz", "bz2", "xz", "zst", "7z", "rar", "iso",
    "exe", "dll", "so", "dylib", "bin", "o", "a", "lib", "class", "jar", "wasm", "pyc", "pyo",
    "ttf", "otf", "woff", "woff2", "eot", "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
    "sqlite", "db", "sqlite3",
];

/// Check whether a file is likely a text file using a deny-list of known
/// binary extensions.  Falls back to a small heuristic (check first 8 KB
/// for null bytes) when the extension is unknown (#6).
fn is_text_file(path: &Path) -> bool {
    match path.extension() {
        Some(ext) => {
            let ext = ext.to_string_lossy().to_lowercase();
            !BINARY_EXTS.contains(&ext.as_str())
        }
        None => {
            // Extensionless files: check for null bytes in first 8 KB.
            match std::fs::File::open(path) {
                Ok(mut f) => {
                    use std::io::Read;
                    let mut buf = [0u8; 8192];
                    let n = f.read(&mut buf).unwrap_or(0);
                    !buf[..n].contains(&0)
                }
                Err(_) => false,
            }
        }
    }
}
