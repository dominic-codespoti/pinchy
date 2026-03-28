//! Integration test: `/new` slash command creates a UUID session,
//! writes the per-agent session file, sets CURRENT_SESSION, and
//! appends to the global index.

use std::path::Path;

use mini_claw::session::SessionStore;
use mini_claw::slash::{self, Context, SlashResponse};
use mini_claw::store::PinchyDb;
use std::path::PathBuf;

fn ensure_test_db() -> &'static PinchyDb {
    use std::sync::Once;
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let tmp = std::env::temp_dir().join("pinchy_slash_test");
        let _ = std::fs::create_dir_all(&tmp);
        let db = PinchyDb::open(&tmp).expect("open test db");
        mini_claw::store::set_global_db(db);
    });
    mini_claw::store::global_db().expect("test DB should be set")
}

/// Helper: build a [`slash::Context`] pointing at a temp workspace.
fn test_ctx(
    workspace: &std::path::Path,
    agent_id: &str,
    pinchy_home: &std::path::Path,
) -> Context {
    Context {
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
    let db = ensure_test_db();

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
    let SlashResponse::Text(text) = resp;

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

    // 1. Session is inserted in DB
    let sessions = db.list_sessions_for_agent("test-agent").unwrap();
    let session = sessions.iter().find(|s| s.session_id == session_id).expect("session should exist in db");
    assert_eq!(session.session_id, session_id);
    assert_eq!(session.agent_id, "test-agent");

    // 2. CURRENT_SESSION is set to the new session id in DB.
    let current = db.current_session("test-agent").unwrap();
    assert_eq!(
        current.as_deref(),
        Some(session_id),
        "CURRENT_SESSION should point to the new session"
    );

    // 3. Global index contains an entry for this session in DB
    let sessions = db.list_sessions_for_agent("test-agent").unwrap();
    assert!(
        sessions.iter().any(|s| s.session_id == session_id),
        "session should be listed for agent"
    );
}

#[tokio::test]
async fn slash_new_multiple_sessions_append_to_index() {
    let db = ensure_test_db();

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

    // Both should be in the DB
    let sessions = db.list_sessions_for_agent("multi-agent").unwrap();

    assert!(sessions.iter().any(|s| s.session_id == id1));
    assert!(sessions.iter().any(|s| s.session_id == id2));

    // CURRENT_SESSION should be the second one.
    let current = db.current_session("multi-agent").unwrap();
    assert_eq!(current.as_deref(), Some(id2.as_str()), "current session should be the last one created");
}
