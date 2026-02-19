//! Integration test: `/new` slash command creates a UUID session,
//! writes the per-agent session file, sets CURRENT_SESSION, and
//! appends to the global index.

use std::path::PathBuf;

use mini_claw::session::SessionStore;
use mini_claw::slash::{self, SlashResponse};

/// Helper: build a [`slash::Context`] pointing at a temp workspace.
fn test_ctx(
    workspace: &std::path::Path,
    agent_id: &str,
    pinchy_home: &std::path::Path,
) -> slash::Context {
    slash::Context {
        agent_id: agent_id.to_string(),
        agent_root: workspace.parent().unwrap_or(workspace).to_path_buf(),
        workspace: workspace.to_path_buf(),
        channel: "test".to_string(),
        config_path: PathBuf::from("config.yaml"),
        pinchy_home: pinchy_home.to_path_buf(),
    }
}

#[tokio::test]
async fn slash_new_creates_session_and_updates_index() {
    // Use a temp dir so we don't pollute the real workspace.
    let tmp = tempfile::tempdir().unwrap();
    let workspace = tmp.path().join("workspace");
    tokio::fs::create_dir_all(&workspace).await.unwrap();

    let registry = slash::Registry::new();
    slash::register_builtin_commands(&registry);

    let ctx = test_ctx(&workspace, "test-agent", tmp.path());

    // Dispatch /new
    let result = registry.dispatch("test", "/new", &ctx).await;
    let resp = result.expect("/new should succeed");

    // Extract returned session id from "new session started: <uuid>"
    let text = match resp {
        SlashResponse::Text(t) => t,
    };
    assert!(
        text.starts_with("new session started: "),
        "unexpected response: {text}"
    );
    let session_id = text.strip_prefix("new session started: ").unwrap().trim();

    // Verify it's a valid UUID.
    assert_eq!(session_id.len(), 36, "session id should be a UUID");
    assert!(
        uuid::Uuid::parse_str(session_id).is_ok(),
        "session id should be a valid UUID: {session_id}"
    );

    // 1. Session file exists and is empty.
    let session_file = workspace
        .join("sessions")
        .join(format!("{session_id}.jsonl"));
    assert!(session_file.exists(), "session .jsonl file should exist");
    let contents = tokio::fs::read_to_string(&session_file).await.unwrap();
    assert!(
        contents.is_empty(),
        "session file should be empty initially"
    );

    // 2. CURRENT_SESSION is set to the new session id.
    let current = SessionStore::load_current_async(&workspace).await;
    assert_eq!(
        current.as_deref(),
        Some(session_id),
        "CURRENT_SESSION should point to the new session"
    );

    // 3. Global index contains an entry for this session.
    let index_path = tmp.path().join("sessions").join("index.jsonl");
    assert!(index_path.exists(), "global index file should exist");
    let index_contents = tokio::fs::read_to_string(&index_path).await.unwrap();
    let entry: serde_json::Value = serde_json::from_str(index_contents.trim()).unwrap();
    assert_eq!(entry["session_id"].as_str(), Some(session_id));
    assert_eq!(entry["agent_id"].as_str(), Some("test-agent"));
}

#[tokio::test]
async fn slash_new_multiple_sessions_append_to_index() {
    let tmp = tempfile::tempdir().unwrap();
    let workspace = tmp.path().join("workspace");
    tokio::fs::create_dir_all(&workspace).await.unwrap();

    let registry = slash::Registry::new();
    slash::register_builtin_commands(&registry);

    let ctx = test_ctx(&workspace, "multi-agent", tmp.path());

    // Create two sessions.
    let r1 = registry.dispatch("test", "/new", &ctx).await.unwrap();
    let r2 = registry.dispatch("test", "/new", &ctx).await.unwrap();

    let id1 = match r1 {
        SlashResponse::Text(t) => t
            .strip_prefix("new session started: ")
            .unwrap()
            .trim()
            .to_string(),
    };
    let id2 = match r2 {
        SlashResponse::Text(t) => t
            .strip_prefix("new session started: ")
            .unwrap()
            .trim()
            .to_string(),
    };

    // They should be different UUIDs.
    assert_ne!(id1, id2);

    // CURRENT_SESSION should be the second one.
    let current = SessionStore::load_current_async(&workspace).await.unwrap();
    assert_eq!(current, id2);

    // Both session files should exist.
    assert!(workspace
        .join("sessions")
        .join(format!("{id1}.jsonl"))
        .exists());
    assert!(workspace
        .join("sessions")
        .join(format!("{id2}.jsonl"))
        .exists());

    // Global index should have 2 entries.
    let index_contents = tokio::fs::read_to_string(tmp.path().join("sessions/index.jsonl"))
        .await
        .unwrap();
    let lines: Vec<&str> = index_contents.trim().lines().collect();
    assert_eq!(lines.len(), 2, "global index should have 2 entries");
}
