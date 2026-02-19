//! Integration tests for the `SessionStore` abstraction.

use mini_claw::session::{Exchange, SessionStore};
use tempfile::TempDir;

fn tmp() -> TempDir {
    TempDir::new().unwrap()
}

// ── load_current / set_current / clear_current ───────────────

#[tokio::test]
async fn load_current_returns_none_when_missing() {
    let dir = tmp();
    assert!(SessionStore::load_current_async(dir.path()).await.is_none());
}

#[tokio::test]
async fn set_then_load_current() {
    let dir = tmp();
    SessionStore::set_current(dir.path(), "sess-abc")
        .await
        .unwrap();
    assert_eq!(
        SessionStore::load_current_async(dir.path()).await,
        Some("sess-abc".to_string())
    );
}

#[tokio::test]
async fn clear_current_removes_session() {
    let dir = tmp();
    SessionStore::set_current(dir.path(), "sess-rm")
        .await
        .unwrap();
    SessionStore::clear_current(dir.path()).await.unwrap();
    assert!(SessionStore::load_current_async(dir.path()).await.is_none());
}

#[tokio::test]
async fn clear_current_idempotent() {
    let dir = tmp();
    // Should succeed even when no CURRENT_SESSION exists.
    SessionStore::clear_current(dir.path()).await.unwrap();
    SessionStore::clear_current(dir.path()).await.unwrap();
}

// ── append / load_history ────────────────────────────────────

#[tokio::test]
async fn append_creates_file_and_loads_back() {
    let dir = tmp();
    let id = "sess-1";

    SessionStore::append(
        dir.path(),
        id,
        &Exchange {
            timestamp: 1000,
            role: "user".into(),
            content: "ping".into(),
            metadata: None,
        },
    )
    .await
    .unwrap();

    SessionStore::append(
        dir.path(),
        id,
        &Exchange {
            timestamp: 1001,
            role: "assistant".into(),
            content: "pong".into(),
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
    assert_eq!(history[0].content, "ping");
    assert_eq!(history[0].timestamp, 1000);
    assert_eq!(history[1].role, "assistant");
    assert_eq!(history[1].content, "pong");
}

#[tokio::test]
async fn load_history_respects_limit() {
    let dir = tmp();
    let id = "sess-lim";

    for i in 0..20u64 {
        SessionStore::append(
            dir.path(),
            id,
            &Exchange {
                timestamp: i,
                role: if i % 2 == 0 { "user" } else { "assistant" }.into(),
                content: format!("msg-{i}"),
                metadata: None,
            },
        )
        .await
        .unwrap();
    }

    let history = SessionStore::load_history(dir.path(), id, 5).await.unwrap();
    assert_eq!(history.len(), 5);
    // Should be the last 5 (indices 15..20).
    assert_eq!(history[0].content, "msg-15");
    assert_eq!(history[4].content, "msg-19");
}

#[tokio::test]
async fn load_history_returns_empty_for_missing_file() {
    let dir = tmp();
    let history = SessionStore::load_history(dir.path(), "ghost", 10)
        .await
        .unwrap();
    assert!(history.is_empty());
}

// ── metadata serialisation ───────────────────────────────────

#[tokio::test]
async fn metadata_round_trips() {
    let dir = tmp();
    let id = "sess-meta";

    SessionStore::append(
        dir.path(),
        id,
        &Exchange {
            timestamp: 42,
            role: "user".into(),
            content: "hi".into(),
            metadata: Some(serde_json::json!({"author": "tester", "channel": "tui"})),
        },
    )
    .await
    .unwrap();

    let history = SessionStore::load_history(dir.path(), id, 10)
        .await
        .unwrap();
    assert_eq!(history.len(), 1);
    let meta = history[0].metadata.as_ref().unwrap();
    assert_eq!(meta["author"], "tester");
    assert_eq!(meta["channel"], "tui");
}

// ── async variant ────────────────────────────────────────────

#[tokio::test]
async fn load_current_async_works() {
    let dir = tmp();
    assert!(SessionStore::load_current_async(dir.path()).await.is_none());
    SessionStore::set_current(dir.path(), "async-id")
        .await
        .unwrap();
    assert_eq!(
        SessionStore::load_current_async(dir.path()).await,
        Some("async-id".to_string())
    );
}

// ── Session handle ───────────────────────────────────────────

#[test]
fn session_handle_paths() {
    let dir = tmp();
    let s = SessionStore::session(dir.path(), "test-sess");
    assert_eq!(s.id, "test-sess");
    assert_eq!(s.workspace, dir.path());
    assert!(s.file.ends_with("sessions/test-sess.jsonl"));
}
