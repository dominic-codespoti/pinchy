//! Session abstraction: `Session`, `Exchange`, and `SessionStore`.
//!
//! Provides persistent, JSONL-backed session management for agent
//! conversations.  Each session is a single `sessions/<id>.jsonl`
//! file; the *active* session id is tracked via an adjacent
//! `CURRENT_SESSION` file in the agent workspace.

pub mod index;

use std::path::{Path, PathBuf};

use anyhow::Context as _;
use serde::{Deserialize, Serialize};
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tracing::debug;

// ── Exchange ─────────────────────────────────────────────────

/// A single conversational exchange (one message), serialised as a
/// line in JSONL session files.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Exchange {
    /// Unix-epoch timestamp in milliseconds.
    pub timestamp: u64,
    /// Message role: `"user"`, `"assistant"`, `"system"`.
    pub role: String,
    /// Message content / text.
    pub content: String,
    /// Optional extra metadata (author, channel, tool results …).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<serde_json::Value>,
}

// ── Session ──────────────────────────────────────────────────

/// Handle representing a concrete session within an agent workspace.
#[derive(Debug, Clone)]
pub struct Session {
    /// Unique session identifier (nonce / user-supplied id).
    pub id: String,
    /// Root of the owning agent's workspace.
    pub workspace: PathBuf,
    /// Full path to the backing JSONL file (`sessions/<id>.jsonl`).
    pub file: PathBuf,
}

impl Session {
    /// Create a `Session` handle (does NOT touch the filesystem).
    pub fn new(id: impl Into<String>, workspace: impl Into<PathBuf>) -> Self {
        let id = id.into();
        let workspace = workspace.into();
        let file = workspace.join("sessions").join(format!("{id}.jsonl"));
        Self {
            id,
            workspace,
            file,
        }
    }
}

// ── SessionStore ─────────────────────────────────────────────

/// Stateless helper that operates on session data inside an agent
/// workspace.  All methods are async and take `workspace: &Path` so
/// the store itself carries no mutable state.
pub struct SessionStore;

impl SessionStore {
    // -- current session bookkeeping ------------------------------------

    /// Read the `CURRENT_SESSION` file from `workspace` and return the
    /// trimmed session id, or `None` if the file is missing / empty.
    pub fn load_current(workspace: &Path) -> Option<String> {
        std::fs::read_to_string(workspace.join("CURRENT_SESSION"))
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }

    /// Async variant of [`load_current`](SessionStore::load_current).
    pub async fn load_current_async(workspace: &Path) -> Option<String> {
        fs::read_to_string(workspace.join("CURRENT_SESSION"))
            .await
            .ok()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
    }

    /// Write `id` into the `CURRENT_SESSION` file, making it the active
    /// session.
    pub async fn set_current(workspace: &Path, id: &str) -> anyhow::Result<()> {
        let path = workspace.join("CURRENT_SESSION");
        fs::write(&path, id)
            .await
            .with_context(|| format!("write CURRENT_SESSION in {}", workspace.display()))?;
        debug!(session_id = %id, "CURRENT_SESSION set");
        Ok(())
    }

    /// Remove the `CURRENT_SESSION` file (if it exists), clearing the
    /// active session.
    pub async fn clear_current(workspace: &Path) -> anyhow::Result<()> {
        let path = workspace.join("CURRENT_SESSION");
        match fs::remove_file(&path).await {
            Ok(_) => {
                debug!("CURRENT_SESSION cleared");
                Ok(())
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e).context("remove CURRENT_SESSION"),
        }
    }

    // -- exchange persistence -------------------------------------------

    /// Append a single [`Exchange`] to `sessions/<id>.jsonl`, creating
    /// the file and parent directory if necessary.
    ///
    /// Uses `OpenOptions::append` for atomic, line-separated writes.
    pub async fn append(workspace: &Path, id: &str, exchange: &Exchange) -> anyhow::Result<()> {
        let sessions_dir = workspace.join("sessions");
        fs::create_dir_all(&sessions_dir)
            .await
            .context("create sessions dir")?;

        let path = sessions_dir.join(format!("{id}.jsonl"));
        let line = serde_json::to_string(exchange).context("serialize Exchange")?;

        let mut file = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .await
            .with_context(|| format!("open session file {}", path.display()))?;

        file.write_all(line.as_bytes()).await?;
        file.write_all(b"\n").await?;

        debug!(path = %path.display(), role = %exchange.role, "exchange appended");
        Ok(())
    }

    // -- history loading ------------------------------------------------

    /// Load up to `limit` most-recent [`Exchange`]s from the session
    /// file `sessions/<id>.jsonl`.
    ///
    /// Returns an empty vec when the file does not exist.
    pub async fn load_history(
        workspace: &Path,
        id: &str,
        limit: usize,
    ) -> anyhow::Result<Vec<Exchange>> {
        let path = workspace.join("sessions").join(format!("{id}.jsonl"));
        let content = match fs::read_to_string(&path).await {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e).with_context(|| format!("read {}", path.display())),
        };

        let mut exchanges: Vec<Exchange> = Vec::new();
        for line in content.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            match serde_json::from_str::<Exchange>(line) {
                Ok(ex) => exchanges.push(ex),
                Err(e) => {
                    debug!(error = %e, "skipping malformed JSONL line");
                }
            }
        }

        if exchanges.len() > limit {
            exchanges = exchanges.split_off(exchanges.len() - limit);
        }

        Ok(exchanges)
    }

    /// Return a [`Session`] handle for an existing or new session.
    pub fn session(workspace: &Path, id: &str) -> Session {
        Session::new(id, workspace)
    }

    /// Delete session files older than `max_age`.
    ///
    /// Scans `workspace/sessions/*.jsonl` and removes files whose last
    /// modification time is older than `max_age`.  The current active
    /// session (from `CURRENT_SESSION`) is always preserved.
    ///
    /// Returns the number of session files deleted.
    pub async fn cleanup_expired(
        workspace: &Path,
        max_age: std::time::Duration,
    ) -> anyhow::Result<usize> {
        let sessions_dir = workspace.join("sessions");
        let current_session = Self::load_current_async(workspace).await;

        let mut rd = match fs::read_dir(&sessions_dir).await {
            Ok(rd) => rd,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(0),
            Err(e) => return Err(e).context("read sessions dir"),
        };

        let now = std::time::SystemTime::now();
        let mut deleted = 0usize;

        while let Some(entry) = rd.next_entry().await? {
            let path = entry.path();

            // Only process .jsonl files (skip receipts, etc.)
            let name = path
                .file_name()
                .and_then(|f| f.to_str())
                .unwrap_or_default()
                .to_string();
            if !name.ends_with(".jsonl") || name.ends_with(".receipts.jsonl") {
                continue;
            }

            // Don't delete the active session.
            let session_id = name.trim_end_matches(".jsonl");
            if let Some(ref active) = current_session {
                if session_id == active {
                    continue;
                }
            }

            // Check file age.
            let metadata = match fs::metadata(&path).await {
                Ok(m) => m,
                Err(_) => continue,
            };
            let modified = match metadata.modified() {
                Ok(t) => t,
                Err(_) => continue,
            };
            if let Ok(age) = now.duration_since(modified) {
                if age > max_age {
                    if fs::remove_file(&path).await.is_ok() {
                        debug!(path = %path.display(), "expired session file removed");
                        deleted += 1;

                        // Also remove the corresponding receipts file.
                        let receipts = sessions_dir.join(format!("{session_id}.receipts.jsonl"));
                        let _ = fs::remove_file(&receipts).await;
                    }
                }
            }
        }

        Ok(deleted)
    }
}

// ── Tests ────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn tmp() -> TempDir {
        TempDir::new().unwrap()
    }

    #[tokio::test]
    async fn set_and_load_current() {
        let dir = tmp();
        assert!(SessionStore::load_current_async(dir.path()).await.is_none());

        SessionStore::set_current(dir.path(), "abc123")
            .await
            .unwrap();
        assert_eq!(
            SessionStore::load_current_async(dir.path()).await,
            Some("abc123".to_string())
        );
    }

    #[tokio::test]
    async fn clear_current_ok() {
        let dir = tmp();
        SessionStore::set_current(dir.path(), "x").await.unwrap();
        SessionStore::clear_current(dir.path()).await.unwrap();
        assert!(SessionStore::load_current_async(dir.path()).await.is_none());
    }

    #[tokio::test]
    async fn clear_current_when_missing() {
        let dir = tmp();
        // Should not error even when file doesn't exist.
        SessionStore::clear_current(dir.path()).await.unwrap();
    }

    #[tokio::test]
    async fn append_and_load_history() {
        let dir = tmp();
        let id = "sess-1";

        SessionStore::append(
            dir.path(),
            id,
            &Exchange {
                timestamp: 100,
                role: "user".into(),
                content: "hello".into(),
                metadata: None,
            },
        )
        .await
        .unwrap();

        SessionStore::append(
            dir.path(),
            id,
            &Exchange {
                timestamp: 101,
                role: "assistant".into(),
                content: "hi there".into(),
                metadata: None,
            },
        )
        .await
        .unwrap();

        let history = SessionStore::load_history(dir.path(), id, 100)
            .await
            .unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].role, "user");
        assert_eq!(history[0].content, "hello");
        assert_eq!(history[1].role, "assistant");
        assert_eq!(history[1].content, "hi there");
    }

    #[tokio::test]
    async fn load_history_limit() {
        let dir = tmp();
        let id = "sess-limit";

        for i in 0..10 {
            SessionStore::append(
                dir.path(),
                id,
                &Exchange {
                    timestamp: i,
                    role: "user".into(),
                    content: format!("msg-{i}"),
                    metadata: None,
                },
            )
            .await
            .unwrap();
        }

        let history = SessionStore::load_history(dir.path(), id, 3).await.unwrap();
        assert_eq!(history.len(), 3);
        assert_eq!(history[0].content, "msg-7");
        assert_eq!(history[2].content, "msg-9");
    }

    #[tokio::test]
    async fn load_history_missing_file() {
        let dir = tmp();
        let history = SessionStore::load_history(dir.path(), "nonexistent", 10)
            .await
            .unwrap();
        assert!(history.is_empty());
    }

    #[tokio::test]
    async fn session_handle() {
        let dir = tmp();
        let s = SessionStore::session(dir.path(), "my-sess");
        assert_eq!(s.id, "my-sess");
        assert!(s.file.ends_with("sessions/my-sess.jsonl"));
    }
}
