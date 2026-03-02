//! Agent runtime: manages agent identity, workspace bootstrap, session
//! history, and turn execution.
//!
//! The implementation is split across submodules:
//!
//! - [`types`]     – Agent struct, receipt types, shared constants/helpers
//! - [`debug`]     – Debug payload ring buffer and model-request logging
//! - [`dispatch`]  – Message bus subscription, routing, in-flight tracking
//! - [`tool_exec`] – Single tool invocation, corrective helpers
//! - [`tool_loop`] – Iterative tool-call loop (fenced, single-FC, multi-FC)
//! - [`turn`]      – Turn execution, bootstrap, history, enforcement retry
//! - [`persist`]   – Session exchange and receipt persistence

mod debug;
mod dispatch;
mod persist;
mod tool_exec;
mod tool_loop;
mod turn;
pub mod types;

// Re-export the public API so call-sites keep using `crate::agent::*`.
pub use debug::{get_debug_payload, list_debug_payloads};
pub use dispatch::{drain_in_flight, in_flight_count, init};
pub use types::{Agent, TokenUsageSummary, ToolCallRecord, TurnReceipt};

// File helpers used by cli and other modules.
pub use file_helpers::{backup_file, write_with_backup};

// Re-export parsing helpers for backward compatibility.
pub use crate::tools::parsing::{
    extract_fenced_json, extract_tool_call_block, is_tool_call_only, ToolRequest,
};

// ---------------------------------------------------------------------------
// File backup + write helpers
// ---------------------------------------------------------------------------
mod file_helpers {
    use anyhow::Context as _;
    use tokio::fs;
    use tracing::debug;

    use super::types::epoch_secs;

    pub async fn backup_file(path: &std::path::Path) -> anyhow::Result<()> {
        match fs::metadata(path).await {
            Ok(_) => {}
            Err(_) => return Ok(()),
        }
        let ts = epoch_secs();
        let mut bak_name = path.file_name().unwrap_or_default().to_os_string();
        bak_name.push(format!(".bak.{ts}"));
        let bak_path = path.with_file_name(bak_name);
        fs::copy(path, &bak_path)
            .await
            .with_context(|| format!("backup {} -> {}", path.display(), bak_path.display()))?;
        debug!(src = %path.display(), dst = %bak_path.display(), "created backup");
        Ok(())
    }

    pub async fn write_with_backup(path: &std::path::Path, contents: &str) -> anyhow::Result<()> {
        backup_file(path).await?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await.ok();
        }
        fs::write(path, contents)
            .await
            .with_context(|| format!("write {}", path.display()))?;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::types::Agent;
    use tempfile::TempDir;
    use tokio::fs;

    fn temp_agent() -> (TempDir, Agent) {
        let dir = TempDir::new().unwrap();
        let agent = Agent::new("test-agent", dir.path().to_path_buf());
        (dir, agent)
    }

    #[tokio::test]
    async fn bootstrap_reads_existing_files() {
        let (dir, agent) = temp_agent();
        fs::write(dir.path().join("SOUL.md"), "I am a helpful bot.")
            .await
            .unwrap();
        let boot = agent.load_bootstrap().await.unwrap();
        assert!(boot.contains("I am a helpful bot."));
        assert!(boot.contains("# SOUL.md"));
    }

    #[tokio::test]
    async fn bootstrap_empty_when_no_files() {
        let (_dir, agent) = temp_agent();
        let boot = agent.load_bootstrap().await.unwrap();
        assert!(boot.is_empty());
    }

    #[tokio::test]
    async fn run_turn_persists_session() {
        let (dir, mut agent) = temp_agent();

        let msg = crate::comm::IncomingMessage {
            agent_id: Some("test-agent".into()),
            author: "tester".into(),
            content: "hello world".into(),
            channel: "test".into(),
            timestamp: 0,
            session_id: None,
            images: Vec::new(),
        };

        let reply = agent.run_turn(msg).await.unwrap();
        assert!(!reply.is_empty());

        let sessions = dir.path().join("workspace").join("sessions");
        let mut entries: Vec<_> = std::fs::read_dir(&sessions)
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                name.ends_with(".jsonl") && !name.ends_with(".receipts.jsonl")
            })
            .collect();
        assert_eq!(entries.len(), 1);

        let path = entries.remove(0).path();
        assert!(path.extension().unwrap() == "jsonl");

        let data = std::fs::read_to_string(&path).unwrap();
        let lines: Vec<&str> = data.trim().lines().collect();
        assert_eq!(lines.len(), 2);

        let first: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
        assert_eq!(first["role"], "user");
        assert_eq!(first["content"], "hello world");

        let second: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
        assert_eq!(second["role"], "assistant");
    }
}
