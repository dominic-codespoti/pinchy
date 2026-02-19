//! Tests for tool sandboxing: path rejection and exec blocklist enforcement.

use mini_claw::tools;
use serde_json::json;
use tempfile::TempDir;

fn workspace() -> TempDir {
    tempfile::tempdir().expect("failed to create temp dir")
}

// ── Path rejection: absolute paths ──────────────────────────

#[tokio::test]
async fn read_file_rejects_absolute_path() {
    let ws = workspace();
    let result = tools::read_file(ws.path(), json!({ "path": "/etc/passwd" })).await;
    assert!(result.is_err(), "absolute path should be rejected");
    let msg = format!("{}", result.unwrap_err());
    assert!(
        msg.contains("absolute paths are not allowed"),
        "error should mention absolute paths, got: {msg}"
    );
}

#[tokio::test]
async fn write_file_rejects_absolute_path() {
    let ws = workspace();
    let result = tools::write_file(
        ws.path(),
        json!({ "path": "/tmp/evil.txt", "content": "bad" }),
    )
    .await;
    assert!(result.is_err(), "absolute path should be rejected");
    let msg = format!("{}", result.unwrap_err());
    assert!(msg.contains("absolute paths are not allowed"));
}

// ── Path rejection: directory traversal (..) ────────────────

#[tokio::test]
async fn read_file_rejects_dotdot_traversal() {
    let ws = workspace();
    let result = tools::read_file(ws.path(), json!({ "path": "../../../etc/shadow" })).await;
    assert!(result.is_err(), "path with '..' should be rejected");
    let msg = format!("{}", result.unwrap_err());
    assert!(
        msg.contains("path traversal"),
        "error should mention path traversal, got: {msg}"
    );
}

#[tokio::test]
async fn write_file_rejects_dotdot_traversal() {
    let ws = workspace();
    let result = tools::write_file(
        ws.path(),
        json!({ "path": "../escape.txt", "content": "nope" }),
    )
    .await;
    assert!(result.is_err(), "path with '..' should be rejected");
    let msg = format!("{}", result.unwrap_err());
    assert!(msg.contains("path traversal"));
}

#[tokio::test]
async fn read_file_rejects_embedded_dotdot() {
    let ws = workspace();
    let result = tools::read_file(ws.path(), json!({ "path": "subdir/../../etc/passwd" })).await;
    assert!(result.is_err(), "embedded '..' should be rejected");
}

// ── Exec blocklist enforcement ──────────────────────────────

#[tokio::test]
async fn exec_shell_allows_basic_command() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "echo hello" })).await;
    assert!(result.is_ok(), "echo should be allowed");
    let val = result.unwrap();
    assert_eq!(val["exit_code"], 0);
    assert_eq!(val["stdout"], "hello");
}

#[tokio::test]
async fn exec_shell_allows_piped_commands() {
    let ws = workspace();
    let result =
        tools::exec_shell(ws.path(), json!({ "command": "echo hello | grep hello" })).await;
    assert!(result.is_ok(), "piped commands should work");
}

#[tokio::test]
async fn exec_shell_allows_chmod() {
    let ws = workspace();
    // Write a test file first
    std::fs::write(ws.path().join("test.sh"), "#!/bin/sh\necho hi").unwrap();
    let result = tools::exec_shell(ws.path(), json!({ "command": "chmod +x test.sh" })).await;
    assert!(result.is_ok(), "chmod should be allowed under blocklist");
}

#[tokio::test]
async fn exec_shell_rejects_blocked_command() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "sudo whoami" })).await;
    assert!(result.is_err(), "sudo should be blocked");
    let msg = format!("{}", result.unwrap_err());
    assert!(
        msg.contains("blocked"),
        "error should mention blocked, got: {msg}"
    );
}

#[tokio::test]
async fn exec_shell_allows_python() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "python3 -c 'print(1)'" })).await;
    // python3 is allowed — interpreters are no longer blocked
    assert!(result.is_ok(), "python3 should be allowed: {:?}", result.err());
}

#[tokio::test]
async fn exec_shell_allows_bash() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "bash -c 'echo hi'" })).await;
    // bash is allowed — shells are no longer blocked
    assert!(result.is_ok(), "bash should be allowed: {:?}", result.err());
}

#[tokio::test]
async fn exec_shell_rejects_dd() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "dd if=/dev/zero of=x" })).await;
    assert!(result.is_err(), "dd should be blocked");
}

#[tokio::test]
async fn exec_shell_rejects_nsenter() {
    let ws = workspace();
    let result = tools::exec_shell(ws.path(), json!({ "command": "nsenter --target 1" })).await;
    assert!(result.is_err(), "nsenter should be blocked");
}

#[tokio::test]
async fn exec_shell_allows_python_in_pipe() {
    let ws = workspace();
    let result = tools::exec_shell(
        ws.path(),
        json!({ "command": "echo hello | python3 -c 'import sys; print(sys.stdin.read())'" }),
    )
    .await;
    assert!(
        result.is_ok(),
        "piped python command should be allowed: {:?}", result.err()
    );
}

#[tokio::test]
async fn exec_shell_rejects_disallowed_after_semicolon() {
    let ws = workspace();
    let result = tools::exec_shell(
        ws.path(),
        json!({ "command": "echo hi; sudo rm -rf /" }),
    )
    .await;
    assert!(
        result.is_err(),
        "blocked command after semicolon should be rejected"
    );
}

#[tokio::test]
async fn exec_shell_rejects_disallowed_after_and() {
    let ws = workspace();
    let result = tools::exec_shell(
        ws.path(),
        json!({ "command": "echo ok && sudo rm -rf /" }),
    )
    .await;
    assert!(
        result.is_err(),
        "blocked command after && should be rejected"
    );
}

// ── extract_command_names unit tests ────────────────────────

#[test]
fn extract_simple_command() {
    let names = tools::extract_command_names("ls -la");
    assert_eq!(names, vec!["ls"]);
}

#[test]
fn extract_piped_commands() {
    let names = tools::extract_command_names("cat file.txt | grep pattern | head -5");
    assert_eq!(names, vec!["cat", "grep", "head"]);
}

#[test]
fn extract_and_separated() {
    let names = tools::extract_command_names("echo hi && ls");
    assert_eq!(names, vec!["echo", "ls"]);
}

#[test]
fn extract_semicolon_separated() {
    let names = tools::extract_command_names("date; pwd; echo done");
    assert_eq!(names, vec!["date", "pwd", "echo"]);
}

#[test]
fn extract_with_path_prefix() {
    let names = tools::extract_command_names("/usr/bin/cat file.txt");
    assert_eq!(names, vec!["cat"]);
}
