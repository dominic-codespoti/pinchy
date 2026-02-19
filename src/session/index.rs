//! Global session index: UUID generation and a shared JSONL index
//! that tracks every session across all agents.

use std::path::Path;

use anyhow::Context as _;
use serde::{Deserialize, Serialize};
use tokio::fs;
use tokio::io::AsyncWriteExt;

/// Entry stored in the global `sessions/index.jsonl` file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexEntry {
    pub session_id: String,
    pub agent_id: String,
    pub created_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

/// Generate a new UUIDv4 session id.
pub fn new_session_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Append an entry to the global sessions index at
/// `<pinchy_home>/sessions/index.jsonl`.
///
/// The write is atomic-ish: we open in append mode and write a
/// single newline-terminated JSON object in one `write_all` call.
pub async fn append_global_index(
    pinchy_home: &Path,
    session_id: &str,
    agent_id: &str,
    title: Option<&str>,
) -> anyhow::Result<()> {
    let dir = pinchy_home.join("sessions");
    fs::create_dir_all(&dir)
        .await
        .with_context(|| format!("create sessions dir: {}", dir.display()))?;

    let entry = IndexEntry {
        session_id: session_id.to_string(),
        agent_id: agent_id.to_string(),
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
        title: title.map(String::from),
    };

    let mut line = serde_json::to_string(&entry).context("serialize index entry")?;
    line.push('\n');

    let path = dir.join("index.jsonl");
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .await
        .with_context(|| format!("open {}", path.display()))?;

    file.write_all(line.as_bytes())
        .await
        .with_context(|| format!("write to {}", path.display()))?;

    tracing::debug!(session_id, agent_id, "appended to global session index");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn new_session_id_is_uuid() {
        let id = new_session_id();
        // UUIDv4 is 36 chars: 8-4-4-4-12
        assert_eq!(id.len(), 36);
        assert!(uuid::Uuid::parse_str(&id).is_ok());
    }

    #[tokio::test]
    async fn append_creates_dir_and_file() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path();

        append_global_index(home, "sess-1", "agent-a", Some("hello"))
            .await
            .unwrap();

        let index_path = home.join("sessions").join("index.jsonl");
        assert!(index_path.exists());

        let contents = tokio::fs::read_to_string(&index_path).await.unwrap();
        let entry: IndexEntry = serde_json::from_str(contents.trim()).unwrap();
        assert_eq!(entry.session_id, "sess-1");
        assert_eq!(entry.agent_id, "agent-a");
        assert_eq!(entry.title.as_deref(), Some("hello"));
        assert!(entry.created_at > 0);
    }

    #[tokio::test]
    async fn append_multiple_entries() {
        let tmp = tempfile::tempdir().unwrap();
        let home = tmp.path();

        append_global_index(home, "s1", "a1", None).await.unwrap();
        append_global_index(home, "s2", "a2", Some("second")).await.unwrap();

        let contents = tokio::fs::read_to_string(home.join("sessions/index.jsonl"))
            .await
            .unwrap();
        let lines: Vec<&str> = contents.trim().lines().collect();
        assert_eq!(lines.len(), 2);

        let e1: IndexEntry = serde_json::from_str(lines[0]).unwrap();
        let e2: IndexEntry = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(e1.session_id, "s1");
        assert!(e1.title.is_none());
        assert_eq!(e2.session_id, "s2");
        assert_eq!(e2.title.as_deref(), Some("second"));
    }
}
