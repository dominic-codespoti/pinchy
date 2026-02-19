//! Built-in `exec_shell` tool — runs a sandboxed shell command in the agent workspace.
//!
//! Supports an optional `background: true` flag that spawns the command
//! detached and returns immediately with a `process_id`.  Use `exec_shell`
//! with `action: "status"` / `"kill"` / `"output"` to manage background
//! processes.

use once_cell::sync::Lazy;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use tokio::process::Child;

use crate::tools::{register_tool, truncate_utf8_owned, ToolMeta};

// ── Background process registry ──────────────────────────────

/// A tracked background process.
struct BgProcess {
    /// Display label (the original command string).
    command: String,
    /// The spawned child handle (None once collected).
    child: Option<Child>,
    /// Exit code once finished.
    exit_code: Option<i32>,
    /// Captured stdout (populated after collection).
    stdout: String,
    /// Captured stderr (populated after collection).
    stderr: String,
    /// True once the process has been collected.
    done: bool,
}

static BG_PROCS: Lazy<Mutex<HashMap<u64, BgProcess>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Monotonically increasing process counter.
static BG_COUNTER: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);

/// Legacy stub — kept so callers don't break. Now a no-op since we use a
/// blocklist instead of a per-agent allowlist.
pub fn load_extra_allowlists(_agents: &[crate::config::AgentConfig]) {}

/// Check if a command is blocked by the blacklist.
fn is_command_blocked(cmd_name: &str, _workspace: &Path) -> bool {
    EXEC_BLOCKLIST.contains(&cmd_name)
}

/// Blocklist of commands that are never allowed for `exec_shell`.
///
/// Only blocks privilege-escalation vectors, kernel/disk destructors,
/// and namespace escapes.  Interpreters (python, node, etc.) are
/// intentionally allowed — `exec_shell` already runs via `sh -c`, so
/// blocking interpreters provides no real security benefit while
/// preventing the agent from running scripts it creates.  This is a
/// personal daemon, not a hostile multi-tenant sandbox.
const EXEC_BLOCKLIST: &[&str] = &[
    // Privilege escalation
    "sudo", "su", "doas", "pkexec",
    // Dangerous disk / partition tools
    "dd", "mkfs", "fdisk", "parted", "losetup",
    // Kernel / module manipulation
    "insmod", "rmmod", "modprobe",
    // Namespace / chroot escapes
    "nsenter", "unshare", "chroot",
];

/// Patterns that are always rejected regardless of the command, to
/// prevent sandbox escapes via subshells or process substitution.
///
/// NOTE: Since `exec_shell` already runs via `sh -c`, blocking most
/// shell syntax provides no real security benefit — the agent is already
/// in a shell.  We only block `eval` which can reassemble blocked
/// command names from strings to bypass the blocklist.
const SHELL_ESCAPE_PATTERNS: &[&str] = &[
    "eval ",
    "eval\t",
];

/// Extract individual command names from a shell command string.
///
/// Splits on `|`, `&&`, `||`, and `;` operators, then takes the first
/// whitespace-delimited token of each resulting segment.  Path prefixes
/// (e.g. `/usr/bin/cat`) are stripped to their basename.
pub fn extract_command_names(cmd: &str) -> Vec<String> {
    let normalized = cmd.replace("&&", "\x00").replace("||", "\x00");
    let mut result = Vec::new();
    for segment in normalized.split(['|', ';', '\x00']) {
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }
        if let Some(first) = segment.split_whitespace().next() {
            let name = first.rsplit('/').next().unwrap_or(first);
            result.push(name.to_string());
        }
    }
    result
}

/// Validate the full command for sandbox escapes beyond the simple
/// blocklist check.  Returns an error message if the command is unsafe.
fn validate_command_safety(command: &str) -> Result<(), String> {
    // Reject shell escape patterns.
    let lower = command.to_lowercase();
    for pat in SHELL_ESCAPE_PATTERNS {
        if lower.contains(pat) {
            return Err(format!("shell escape pattern '{pat}' is not allowed"));
        }
    }

    // Block `sed` with the '/e' flag which executes pattern space as shell.
    // This is the only per-command check worth keeping — it's a genuine
    // sandbox escape that the blocklist can't catch.
    let normalized = command.replace("&&", "\x00").replace("||", "\x00");
    for segment in normalized.split(['|', ';', '\x00']) {
        let segment = segment.trim();
        if segment.is_empty() {
            continue;
        }
        let tokens: Vec<&str> = segment.split_whitespace().collect();
        if tokens.is_empty() {
            continue;
        }
        let cmd_name = tokens[0].rsplit('/').next().unwrap_or(tokens[0]);
        if cmd_name == "sed" {
            for token in &tokens[1..] {
                if token.ends_with("/e") || token.contains("/e;") || token.contains("/e}") {
                    return Err("sed with '/e' flag is not allowed (executes shell commands)".into());
                }
            }
        }
    }

    Ok(())
}

/// Execute a shell command inside the workspace directory.
///
/// **Foreground mode** (default):
///   Args: `{ "command": "ls -la" }`
///   Returns: `{ "exit_code": 0, "stdout": "…", "stderr": "…" }`
///
/// **Background mode** (`"background": true`):
///   Spawns the command and returns immediately with a `process_id`.
///   Use `"action": "status"`, `"output"`, `"kill"`, or `"list"` to manage.
///
/// **Management actions** (no `command` needed):
///   - `{ "action": "status", "process_id": 1 }`
///   - `{ "action": "output", "process_id": 1 }` — collect output (blocks until done, 30 s timeout)
///   - `{ "action": "kill", "process_id": 1 }`
///   - `{ "action": "list" }` — list all tracked background processes
///
/// **Sandboxing:**
/// - Commands in [`EXEC_BLOCKLIST`] (shells, sudo, curl, etc.) are rejected.
/// - Foreground commands killed after 60 seconds; background after 120 s.
/// - `stdout` and `stderr` are truncated to 256 KB each.
pub async fn exec_shell(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    const MAX_OUTPUT: usize = 256 * 1024; // 256 KB

    // ── Management actions (no command needed) ────────────────────
    if let Some(action) = args.get("action").and_then(Value::as_str) {
        return handle_bg_action(action, &args).await;
    }

    let command = args
        .get("command")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("exec_shell: missing `command` argument"))?;

    // ── Command blocklist enforcement ─────────────────────────────
    let cmd_names = extract_command_names(command);
    for name in &cmd_names {
        if is_command_blocked(name, workspace) {
            anyhow::bail!(
                "exec_shell: command '{name}' is blocked. \
                 Blocked commands: {EXEC_BLOCKLIST:?}"
            );
        }
    }

    // ── Deep argument/pattern safety check ────────────────────────
    if let Err(reason) = validate_command_safety(command) {
        anyhow::bail!("exec_shell: blocked — {reason}");
    }

    let background = args
        .get("background")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // ── Background mode: spawn and return immediately ─────────────
    if background {
        let child = tokio::process::Command::new("sh")
            .arg("-c")
            .arg(command)
            .current_dir(workspace)
            .env_clear()
            .env("PATH", "/usr/local/bin:/usr/bin:/bin")
            .env("HOME", workspace.to_string_lossy().to_string())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|e| anyhow::anyhow!("exec_shell: spawn failed: {e}"))?;

        let pid = BG_COUNTER.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let cmd_str = command.to_string();
        {
            let mut registry = BG_PROCS.lock().expect("bg proc registry poisoned");
            registry.insert(pid, BgProcess {
                command: cmd_str.clone(),
                child: Some(child),
                exit_code: None,
                stdout: String::new(),
                stderr: String::new(),
                done: false,
            });
        }

        // Spawn a collector that auto-kills after 120 s and stores output.
        let timeout_dur = std::time::Duration::from_secs(120);
        tokio::spawn(async move {
            // Take the child out of the registry (move ownership).
            let child = {
                let mut reg = BG_PROCS.lock().expect("bg proc registry poisoned");
                reg.get_mut(&pid).and_then(|p| p.child.take())
            };
            let Some(child) = child else { return };

            let output = match tokio::time::timeout(timeout_dur, child.wait_with_output()).await {
                Ok(Ok(out)) => out,
                Ok(Err(_)) | Err(_) => {
                    let mut reg = BG_PROCS.lock().expect("bg proc registry poisoned");
                    if let Some(proc) = reg.get_mut(&pid) {
                        proc.done = true;
                        proc.exit_code = Some(-1);
                        proc.stderr = "background process timed out (killed after 120s)".into();
                    }
                    return;
                }
            };

            let code = output.status.code().unwrap_or(-1);
            let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

            let mut reg = BG_PROCS.lock().expect("bg proc registry poisoned");
            if let Some(proc) = reg.get_mut(&pid) {
                proc.done = true;
                proc.exit_code = Some(code);
                proc.stdout = truncate_utf8_owned(stdout, MAX_OUTPUT);
                proc.stderr = truncate_utf8_owned(stderr, MAX_OUTPUT);
            }
        });

        return Ok(json!({
            "background": true,
            "process_id": pid,
            "command": cmd_str,
            "note": "Process spawned in background. Use action='status' or action='output' with this process_id to check on it.",
        }));
    }

    // ── Foreground mode (original behaviour) ──────────────────────
    let timeout_dur = std::time::Duration::from_secs(60);

    let child = tokio::process::Command::new("sh")
        .arg("-c")
        .arg(command)
        .current_dir(workspace)
        .env_clear()
        .env("PATH", "/usr/local/bin:/usr/bin:/bin")
        .env("HOME", workspace.to_string_lossy().to_string())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| anyhow::anyhow!("exec_shell: spawn failed: {e}"))?;

    let output = match tokio::time::timeout(timeout_dur, child.wait_with_output()).await {
        Ok(result) => result.map_err(|e| anyhow::anyhow!("exec_shell: {e}"))?,
        Err(_elapsed) => {
            return Ok(json!({
                "exit_code": -1,
                "stdout": "",
                "stderr": "timed out after 60s (child killed). Use background=true for long-running commands.",
            }));
        }
    };

    let code = output.status.code().unwrap_or(-1);
    let full_stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let full_stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    let truncated_stdout = full_stdout.len() > MAX_OUTPUT;
    let truncated_stderr = full_stderr.len() > MAX_OUTPUT;

    let stdout = truncate_utf8_owned(full_stdout, MAX_OUTPUT);
    let stderr = truncate_utf8_owned(full_stderr, MAX_OUTPUT);

    let mut result = json!({
        "exit_code": code,
        "stdout": stdout,
        "stderr": stderr,
    });

    if truncated_stdout {
        result["truncated_stdout"] = json!(true);
    }
    if truncated_stderr {
        result["truncated_stderr"] = json!(true);
    }

    Ok(result)
}

/// Handle background process management actions.
async fn handle_bg_action(action: &str, args: &Value) -> anyhow::Result<Value> {
    match action {
        "list" => {
            let reg = BG_PROCS.lock().expect("bg proc registry poisoned");
            let procs: Vec<Value> = reg
                .iter()
                .map(|(pid, p)| {
                    json!({
                        "process_id": pid,
                        "command": p.command,
                        "done": p.done,
                        "exit_code": p.exit_code,
                    })
                })
                .collect();
            Ok(json!({ "processes": procs }))
        }
        "status" => {
            let pid = args
                .get("process_id")
                .and_then(Value::as_u64)
                .ok_or_else(|| anyhow::anyhow!("exec_shell: action='status' requires `process_id`"))?;
            let reg = BG_PROCS.lock().expect("bg proc registry poisoned");
            match reg.get(&pid) {
                Some(p) => Ok(json!({
                    "process_id": pid,
                    "command": p.command,
                    "done": p.done,
                    "exit_code": p.exit_code,
                })),
                None => anyhow::bail!("exec_shell: no background process with id {pid}"),
            }
        }
        "output" => {
            let pid = args
                .get("process_id")
                .and_then(Value::as_u64)
                .ok_or_else(|| anyhow::anyhow!("exec_shell: action='output' requires `process_id`"))?;

            // Poll until done (up to 30 s).
            let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(30);
            loop {
                {
                    let reg = BG_PROCS.lock().expect("bg proc registry poisoned");
                    if let Some(p) = reg.get(&pid) {
                        if p.done {
                            return Ok(json!({
                                "process_id": pid,
                                "exit_code": p.exit_code,
                                "stdout": p.stdout,
                                "stderr": p.stderr,
                                "done": true,
                            }));
                        }
                    } else {
                        anyhow::bail!("exec_shell: no background process with id {pid}");
                    }
                }
                if tokio::time::Instant::now() >= deadline {
                    let reg = BG_PROCS.lock().expect("bg proc registry poisoned");
                    if let Some(p) = reg.get(&pid) {
                        return Ok(json!({
                            "process_id": pid,
                            "done": false,
                            "note": "process still running after 30s poll timeout",
                            "command": p.command,
                        }));
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }
        }
        "kill" => {
            let pid = args
                .get("process_id")
                .and_then(Value::as_u64)
                .ok_or_else(|| anyhow::anyhow!("exec_shell: action='kill' requires `process_id`"))?;
            // Take the child out of the registry before awaiting kill.
            let child = {
                let mut reg = BG_PROCS.lock().expect("bg proc registry poisoned");
                match reg.get_mut(&pid) {
                    Some(p) => {
                        p.done = true;
                        p.exit_code = Some(-9);
                        p.stderr = "killed by user".into();
                        p.child.take()
                    }
                    None => anyhow::bail!("exec_shell: no background process with id {pid}"),
                }
            };
            if let Some(mut child) = child {
                let _ = child.kill().await;
            }
            Ok(json!({
                "process_id": pid,
                "killed": true,
            }))
        }
        other => anyhow::bail!("exec_shell: unknown action '{other}'. Valid: list, status, output, kill"),
    }
}

/// Register the `exec_shell` tool metadata in the global registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "exec_shell".into(),
        description: "Execute a shell command in the agent workspace. Most commands allowed; sudo, privilege escalation, and destructive disk/kernel tools are blocked. Interpreters (python, node, etc.) and scripts are allowed. Supports background mode (background=true) returning a process_id, then use action='status'/'output'/'kill'/'list' to manage background processes.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to execute (via `sh -c`). Not needed for management actions."
                },
                "background": {
                    "type": "boolean",
                    "description": "If true, spawn in background and return a process_id immediately. Default: false."
                },
                "action": {
                    "type": "string",
                    "enum": ["status", "output", "kill", "list"],
                    "description": "Manage background processes: 'status' checks if done, 'output' waits and returns stdout/stderr, 'kill' terminates, 'list' shows all tracked processes."
                },
                "process_id": {
                    "type": "integer",
                    "description": "Background process ID (returned from background=true). Required for status/output/kill actions."
                }
            },
            "additionalProperties": false
        }),
    });
}
