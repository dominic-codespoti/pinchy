//! Integration tests for the built-in tools / skills.

use mini_claw::tools;
use serde_json::json;
use tempfile::TempDir;

/// Helper: create a fresh temp workspace.
fn workspace() -> TempDir {
    tempfile::tempdir().expect("failed to create temp dir")
}

// ── read_file ────────────────────────────────────────────────

#[tokio::test]
async fn read_file_basic() {
    let ws = workspace();
    let file = ws.path().join("hello.txt");
    std::fs::write(&file, "hello world").unwrap();

    let result = tools::read_file(ws.path(), json!({ "path": "hello.txt" }))
        .await
        .expect("read_file should succeed");

    assert_eq!(result["content"], "hello world");
}

#[tokio::test]
async fn read_file_subdirectory() {
    let ws = workspace();
    let sub = ws.path().join("a/b");
    std::fs::create_dir_all(&sub).unwrap();
    std::fs::write(sub.join("deep.txt"), "nested").unwrap();

    let result = tools::read_file(ws.path(), json!({ "path": "a/b/deep.txt" }))
        .await
        .expect("read_file should succeed for nested paths");

    assert_eq!(result["content"], "nested");
}

#[tokio::test]
async fn read_file_missing_returns_error() {
    let ws = workspace();
    let result = tools::read_file(ws.path(), json!({ "path": "nope.txt" })).await;
    assert!(result.is_err(), "reading a missing file should fail");
}

#[tokio::test]
async fn read_file_escape_blocked() {
    let ws = workspace();
    // Attempt to read /etc/passwd via traversal.
    let result = tools::read_file(ws.path(), json!({ "path": "../../etc/passwd" })).await;
    assert!(result.is_err(), "path traversal should be blocked");
}

#[tokio::test]
async fn read_file_absolute_escape_blocked() {
    let ws = workspace();
    let result = tools::read_file(ws.path(), json!({ "path": "/etc/hostname" })).await;
    assert!(
        result.is_err(),
        "absolute path outside workspace should be blocked"
    );
}

// ── write_file ───────────────────────────────────────────────

#[tokio::test]
async fn write_file_basic() {
    let ws = workspace();

    let result = tools::write_file(ws.path(), json!({ "path": "out.txt", "content": "data" }))
        .await
        .expect("write_file should succeed");

    assert_eq!(result["written"], true);
    assert_eq!(result["bytes"], 4);

    // Verify on disk.
    let on_disk = std::fs::read_to_string(ws.path().join("out.txt")).unwrap();
    assert_eq!(on_disk, "data");
}

#[tokio::test]
async fn write_file_creates_intermediate_dirs() {
    let ws = workspace();

    tools::write_file(ws.path(), json!({ "path": "x/y/z.txt", "content": "deep" }))
        .await
        .expect("write_file should create parent dirs");

    let on_disk = std::fs::read_to_string(ws.path().join("x/y/z.txt")).unwrap();
    assert_eq!(on_disk, "deep");
}

#[tokio::test]
async fn write_file_escape_blocked() {
    let ws = workspace();
    let result = tools::write_file(
        ws.path(),
        json!({ "path": "../escape.txt", "content": "nope" }),
    )
    .await;
    assert!(result.is_err(), "path traversal should be blocked on write");
}

// ── call_skill dispatcher ────────────────────────────────────

#[tokio::test]
async fn call_skill_dispatches_read() {
    let ws = workspace();
    std::fs::write(ws.path().join("f.txt"), "via dispatcher").unwrap();

    let result = tools::call_skill("read_file", json!({ "path": "f.txt" }), ws.path())
        .await
        .unwrap();

    assert_eq!(result["content"], "via dispatcher");
}

#[tokio::test]
async fn call_skill_unknown_returns_error() {
    let ws = workspace();
    let result = tools::call_skill("nope", json!({}), ws.path()).await;
    assert!(result.is_err());
}

// ── exec_shell ───────────────────────────────────────────────

#[tokio::test]
async fn exec_shell_echo() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "echo hi" }))
        .await
        .unwrap();

    assert_eq!(result["exit_code"], 0);
    assert_eq!(result["stdout"], "hi");
}

#[tokio::test]
async fn exec_shell_stderr() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "echo oops >&2 && exit 1" }))
        .await
        .unwrap();

    assert_eq!(result["exit_code"], 1);
    assert_eq!(result["stderr"], "oops");
}

// ── roundtrip: write then read ───────────────────────────────

#[tokio::test]
async fn write_then_read_roundtrip() {
    let ws = workspace();

    tools::call_skill(
        "write_file",
        json!({ "path": "round.txt", "content": "trip" }),
        ws.path(),
    )
    .await
    .unwrap();

    let result = tools::call_skill("read_file", json!({ "path": "round.txt" }), ws.path())
        .await
        .unwrap();

    assert_eq!(result["content"], "trip");
}

// ── save_memory / recall_memory / forget_memory ──────────────

#[tokio::test]
async fn save_and_recall_memory() {
    let ws = workspace();
    let result = tools::call_skill(
        "save_memory",
        json!({ "key": "color", "value": "blue", "tags": ["pref"] }),
        ws.path(),
    )
    .await
    .unwrap();
    assert_eq!(result["status"], "saved");
    assert_eq!(result["key"], "color");

    let result = tools::call_skill("recall_memory", json!({ "query": "blue" }), ws.path())
        .await
        .unwrap();
    let memories = result["memories"].as_array().unwrap();
    assert_eq!(memories.len(), 1);
    assert_eq!(memories[0]["key"], "color");
    assert_eq!(memories[0]["value"], "blue");
}

#[tokio::test]
async fn recall_empty_memory() {
    let ws = workspace();
    let result = tools::call_skill("recall_memory", json!({}), ws.path())
        .await
        .unwrap();
    let memories = result["memories"].as_array().unwrap();
    assert!(memories.is_empty());
}

#[tokio::test]
async fn forget_memory_existing() {
    let ws = workspace();
    tools::call_skill(
        "save_memory",
        json!({ "key": "temp", "value": "data" }),
        ws.path(),
    )
    .await
    .unwrap();

    let result = tools::call_skill("forget_memory", json!({ "key": "temp" }), ws.path())
        .await
        .unwrap();
    assert_eq!(result["status"], "deleted");

    // Verify gone.
    let result = tools::call_skill("recall_memory", json!({}), ws.path())
        .await
        .unwrap();
    let memories = result["memories"].as_array().unwrap();
    assert!(memories.is_empty());
}

#[tokio::test]
async fn forget_memory_nonexistent() {
    let ws = workspace();
    let result = tools::call_skill("forget_memory", json!({ "key": "no_such_key" }), ws.path())
        .await
        .unwrap();
    assert_eq!(result["status"], "not_found");
}

#[tokio::test]
async fn save_memory_missing_key_returns_error() {
    let ws = workspace();
    let result =
        tools::call_skill("save_memory", json!({ "value": "lonely value" }), ws.path()).await;
    assert!(result.is_err());
}

#[tokio::test]
async fn recall_memory_with_tag_filter() {
    let ws = workspace();
    tools::call_skill(
        "save_memory",
        json!({ "key": "a", "value": "alpha", "tags": ["greek"] }),
        ws.path(),
    )
    .await
    .unwrap();
    tools::call_skill(
        "save_memory",
        json!({ "key": "b", "value": "bravo", "tags": ["nato"] }),
        ws.path(),
    )
    .await
    .unwrap();

    let result = tools::call_skill("recall_memory", json!({ "tag": "greek" }), ws.path())
        .await
        .unwrap();
    let memories = result["memories"].as_array().unwrap();
    assert_eq!(memories.len(), 1);
    assert_eq!(memories[0]["key"], "a");
}

#[tokio::test]
async fn save_and_recall_curated_memory() {
    let ws = workspace();
    let result = tools::call_skill(
        "save_memory",
        json!({
            "storage_mode": "curated",
            "target": "memory",
            "key": "timezone",
            "value": "User is in UTC"
        }),
        ws.path(),
    )
    .await
    .unwrap();

    assert_eq!(result["status"], "saved");
    assert_eq!(result["storage_mode"], "curated");

    let result = tools::call_skill(
        "recall_memory",
        json!({ "storage_mode": "curated", "target": "memory" }),
        ws.path(),
    )
    .await
    .unwrap();

    let memories = result["memories"].as_array().unwrap();
    assert_eq!(memories.len(), 1);
    assert_eq!(memories[0]["key"], "timezone");
    assert_eq!(memories[0]["value"], "User is in UTC");
    assert!(result["content"]
        .as_str()
        .unwrap()
        .contains("User is in UTC"));
}

#[tokio::test]
async fn forget_curated_memory_by_text_match() {
    let ws = workspace();
    tools::call_skill(
        "save_memory",
        json!({
            "storage_mode": "curated",
            "target": "user",
            "value": "Prefers concise replies"
        }),
        ws.path(),
    )
    .await
    .unwrap();

    let result = tools::call_skill(
        "forget_memory",
        json!({
            "storage_mode": "curated",
            "target": "user",
            "key": "Prefers concise replies"
        }),
        ws.path(),
    )
    .await
    .unwrap();

    assert_eq!(result["status"], "deleted");

    let result = tools::call_skill(
        "recall_memory",
        json!({ "storage_mode": "curated", "target": "user" }),
        ws.path(),
    )
    .await
    .unwrap();

    let memories = result["memories"].as_array().unwrap();
    assert!(memories.is_empty());
}

#[tokio::test]
async fn forget_curated_memory_does_not_delete_by_substring() {
    let ws = workspace();
    tools::call_skill(
        "save_memory",
        json!({
            "storage_mode": "curated",
            "target": "user",
            "value": "Prefers concise replies"
        }),
        ws.path(),
    )
    .await
    .unwrap();

    let result = tools::call_skill(
        "forget_memory",
        json!({
            "storage_mode": "curated",
            "target": "user",
            "key": "concise replies"
        }),
        ws.path(),
    )
    .await
    .unwrap();

    assert_eq!(result["status"], "not_found");
}

#[tokio::test]
async fn forget_curated_memory_value_match_deletes_only_one_duplicate() {
    let ws = workspace();
    for _ in 0..2 {
        tools::call_skill(
            "save_memory",
            json!({
                "storage_mode": "curated",
                "target": "user",
                "value": "Prefers concise replies"
            }),
            ws.path(),
        )
        .await
        .unwrap();
    }

    let result = tools::call_skill(
        "forget_memory",
        json!({
            "storage_mode": "curated",
            "target": "user",
            "key": "Prefers concise replies"
        }),
        ws.path(),
    )
    .await
    .unwrap();

    assert_eq!(result["status"], "deleted");

    let result = tools::call_skill(
        "recall_memory",
        json!({ "storage_mode": "curated", "target": "user" }),
        ws.path(),
    )
    .await
    .unwrap();

    let memories = result["memories"].as_array().unwrap();
    assert_eq!(memories.len(), 1);
    assert_eq!(memories[0]["value"], "Prefers concise replies");
}

#[tokio::test]
async fn curated_memory_alias_maps_to_unified_curated_behavior() {
    let ws = workspace();
    let save = tools::call_skill(
        "curated_memory",
        json!({
            "operation": "save",
            "target": "memory",
            "key": "timezone",
            "value": "User is in UTC"
        }),
        ws.path(),
    )
    .await
    .unwrap();
    assert_eq!(save["status"], "saved");

    let recall = tools::call_skill(
        "curated_memory",
        json!({ "operation": "recall", "target": "memory" }),
        ws.path(),
    )
    .await
    .unwrap();
    assert_eq!(recall["storage_mode"], "curated");
    assert_eq!(recall["memories"][0]["key"], "timezone");
}

#[tokio::test]
async fn save_memory_rejects_whitespace_key_and_value() {
    let ws = workspace();

    let whitespace_key = tools::call_skill(
        "save_memory",
        json!({ "key": "   ", "value": "real value" }),
        ws.path(),
    )
    .await;
    assert!(whitespace_key.is_err());

    let whitespace_value = tools::call_skill(
        "save_memory",
        json!({ "key": "real_key", "value": "   " }),
        ws.path(),
    )
    .await;
    assert!(whitespace_value.is_err());
}
