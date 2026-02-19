//! Session management tools — inter-agent communication and session
//! introspection.
//!
//! Tools exposed:
//! - `session_list  { agent_id? }` — list sessions across agents
//! - `session_status { agent_id? }` — current session status for an agent
//! - `session_send  { agent_id, message }` — send a message to another agent
//! - `session_spawn { agent_id, message?, session_id? }` — spawn/start a new session for an agent

use std::path::Path;

use serde_json::{json, Value};

use crate::session::SessionStore;
use crate::tools::{register_tool, ToolMeta};
use crate::utils;

// ── session_list ─────────────────────────────────────────────

/// List sessions, optionally filtered by `agent_id`.
///
/// Returns session files with basic metadata (id, file size, last modified).
pub async fn session_list(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let filter_agent = args.get("agent_id").and_then(Value::as_str);
    let limit = args
        .get("limit")
        .and_then(Value::as_u64)
        .unwrap_or(50) as usize;

    let agents_dir = utils::agents_dir();
    let mut all_sessions: Vec<Value> = Vec::new();

    let mut rd = tokio::fs::read_dir(&agents_dir)
        .await
        .map_err(|e| anyhow::anyhow!("cannot read agents dir: {e}"))?;

    while let Ok(Some(entry)) = rd.next_entry().await {
        let is_dir = entry
            .file_type()
            .await
            .map(|ft| ft.is_dir())
            .unwrap_or(false);
        if !is_dir {
            continue;
        }
        let agent_id = entry.file_name().to_string_lossy().to_string();

        if let Some(filter) = filter_agent {
            if agent_id != filter {
                continue;
            }
        }

        let ws = entry.path().join("workspace");
        let sessions_dir = ws.join("sessions");

        // Read the current session id.
        let current = SessionStore::load_current_async(&ws).await;

        let mut sess_rd = match tokio::fs::read_dir(&sessions_dir).await {
            Ok(rd) => rd,
            Err(_) => continue,
        };

        while let Ok(Some(sentry)) = sess_rd.next_entry().await {
            let fname = sentry.file_name().to_string_lossy().to_string();
            if !fname.ends_with(".jsonl") || fname.ends_with(".receipts.jsonl") {
                continue;
            }
            let session_id = fname.trim_end_matches(".jsonl").to_string();

            let meta = sentry.metadata().await.ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| {
                    t.duration_since(std::time::UNIX_EPOCH)
                        .ok()
                        .map(|d| d.as_secs())
                });

            let is_current = current.as_deref() == Some(session_id.as_str());

            all_sessions.push(json!({
                "agent_id": agent_id,
                "session_id": session_id,
                "is_current": is_current,
                "size_bytes": size,
                "last_modified": modified,
            }));
        }
    }

    // Sort by last_modified descending.
    all_sessions.sort_by(|a, b| {
        let a_mod = a["last_modified"].as_u64().unwrap_or(0);
        let b_mod = b["last_modified"].as_u64().unwrap_or(0);
        b_mod.cmp(&a_mod)
    });

    all_sessions.truncate(limit);

    Ok(json!({
        "sessions": all_sessions,
        "total": all_sessions.len(),
    }))
}

// ── session_status ───────────────────────────────────────────

/// Get the status of the current session for an agent.
///
/// Returns: session id, message count, last message preview, workspace info.
pub async fn session_status(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    // If agent_id is given, use that agent's workspace.  Otherwise use
    // the calling agent's workspace.
    let (ws, agent_id) = if let Some(aid) = args.get("agent_id").and_then(Value::as_str) {
        let root = utils::agent_root(aid);
        if !root.exists() {
            anyhow::bail!("session_status: agent not found: {aid}");
        }
        (root.join("workspace"), aid.to_string())
    } else {
        // Derive agent_id from workspace path.
        let aid = workspace
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".into());
        (workspace.to_path_buf(), aid)
    };

    let current = SessionStore::load_current_async(&ws).await;

    let session_id = match &current {
        Some(id) => id.clone(),
        None => {
            return Ok(json!({
                "agent_id": agent_id,
                "session_id": null,
                "status": "no_active_session",
            }));
        }
    };

    // Load history to get stats.
    let history = SessionStore::load_history(&ws, &session_id, 1000)
        .await
        .unwrap_or_default();

    let message_count = history.len();
    let last_message = history.last().map(|ex| {
        json!({
            "role": ex.role,
            "content_preview": crate::utils::truncate_str(&ex.content, 200),
            "timestamp": ex.timestamp,
        })
    });

    // Count by role.
    let user_msgs = history.iter().filter(|e| e.role == "user").count();
    let assistant_msgs = history.iter().filter(|e| e.role == "assistant").count();
    let system_msgs = history.iter().filter(|e| e.role == "system").count();

    Ok(json!({
        "agent_id": agent_id,
        "session_id": session_id,
        "status": "active",
        "message_count": message_count,
        "user_messages": user_msgs,
        "assistant_messages": assistant_msgs,
        "system_messages": system_msgs,
        "last_message": last_message,
    }))
}

// ── session_send ─────────────────────────────────────────────

/// Send a message to another agent's current session.
///
/// The message is delivered as an `IncomingMessage` on the global comm bus,
/// so the target agent's dispatcher picks it up and runs a turn.
pub async fn session_send(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let agent_id = args
        .get("agent_id")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("session_send: missing `agent_id`"))?;

    let message = args
        .get("message")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("session_send: missing `message`"))?;

    // Verify agent exists.
    let root = utils::agent_root(agent_id);
    if !root.exists() {
        anyhow::bail!("session_send: agent not found: {agent_id}");
    }

    let channel = args
        .get("channel")
        .and_then(Value::as_str)
        .unwrap_or("inter-agent");

    let sender_id = args
        .get("sender")
        .and_then(Value::as_str)
        .unwrap_or("agent");

    // Publish to the global comm bus.
    let msg = crate::comm::IncomingMessage {
        agent_id: Some(agent_id.to_string()),
        channel: channel.to_string(),
        author: sender_id.to_string(),
        content: message.to_string(),
        timestamp: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
        session_id: None,
    };

    let tx = crate::comm::sender();
    match tx.send(msg) {
        Ok(receivers) => Ok(json!({
            "sent": true,
            "agent_id": agent_id,
            "receivers": receivers,
            "channel": channel,
        })),
        Err(e) => Ok(json!({
            "sent": false,
            "error": format!("no active receivers: {e}"),
            "note": "The target agent may not be running. The message was not delivered.",
        })),
    }
}

// ── session_spawn ────────────────────────────────────────────

/// Spawn a new session for an agent, optionally sending an initial message.
///
/// Creates a new session file and sets it as the agent's CURRENT_SESSION.
/// If `message` is provided, it is dispatched to the agent on the comm bus.
pub async fn session_spawn(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let agent_id = args
        .get("agent_id")
        .and_then(Value::as_str)
        .ok_or_else(|| anyhow::anyhow!("session_spawn: missing `agent_id`"))?;

    let root = utils::agent_root(agent_id);
    if !root.exists() {
        anyhow::bail!("session_spawn: agent not found: {agent_id}");
    }

    let ws = root.join("workspace");
    tokio::fs::create_dir_all(&ws).await?;

    // Generate a new session id (or use the provided one).
    let session_id = args
        .get("session_id")
        .and_then(Value::as_str)
        .map(String::from)
        .unwrap_or_else(crate::session::index::new_session_id);

    // Set as the current session.
    SessionStore::set_current(&ws, &session_id).await?;

    // Write to global index.
    let title = args.get("title").and_then(Value::as_str);
    let _ = crate::session::index::append_global_index(
        &crate::pinchy_home(),
        &session_id,
        agent_id,
        title,
    )
    .await;

    // Optionally send an initial message to kick off the session.
    let message_sent = if let Some(message) = args.get("message").and_then(Value::as_str) {
        let channel = args
            .get("channel")
            .and_then(Value::as_str)
            .unwrap_or("inter-agent");

        let msg = crate::comm::IncomingMessage {
            agent_id: Some(agent_id.to_string()),
            channel: channel.to_string(),
            author: "agent".to_string(),
            content: message.to_string(),
            timestamp: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs() as i64,
            session_id: None,
        };

        crate::comm::sender().send(msg).is_ok()
    } else {
        false
    };

    Ok(json!({
        "spawned": true,
        "agent_id": agent_id,
        "session_id": session_id,
        "message_sent": message_sent,
    }))
}

// ── Registration ─────────────────────────────────────────────

/// Register all session management tools.
pub fn register() {
    register_tool(ToolMeta {
        name: "session_list".into(),
        description: "List sessions across all agents or filtered by agent_id. Shows session id, size, last modified, and whether it's the current session.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Optional: filter sessions to this agent only"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max sessions to return (default: 50)"
                }
            }
        }),
    });

    register_tool(ToolMeta {
        name: "session_status".into(),
        description: "Get the current session status for an agent: session id, message count, role breakdown, and last message preview.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Agent to check. If omitted, uses the calling agent's session."
                }
            }
        }),
    });

    register_tool(ToolMeta {
        name: "session_send".into(),
        description: "Send a message to another agent. The message is dispatched to the target agent's active session via the internal message bus, triggering an agent turn.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Target agent to send the message to"
                },
                "message": {
                    "type": "string",
                    "description": "The message content to send"
                },
                "sender": {
                    "type": "string",
                    "description": "Display name of the sender (default: 'agent')"
                },
                "channel": {
                    "type": "string",
                    "description": "Channel identifier (default: 'inter-agent')"
                }
            },
            "required": ["agent_id", "message"]
        }),
    });

    register_tool(ToolMeta {
        name: "session_spawn".into(),
        description: "Spawn a new session for an agent. Creates a fresh session and optionally sends an initial message to start it. Useful for starting sub-agent tasks.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "agent_id": {
                    "type": "string",
                    "description": "Agent to spawn the session for"
                },
                "message": {
                    "type": "string",
                    "description": "Optional initial message to send after spawning"
                },
                "session_id": {
                    "type": "string",
                    "description": "Custom session id (auto-generated UUID if omitted)"
                },
                "title": {
                    "type": "string",
                    "description": "Optional title for the session (recorded in global index)"
                },
                "channel": {
                    "type": "string",
                    "description": "Channel for the initial message (default: 'inter-agent')"
                }
            },
            "required": ["agent_id"]
        }),
    });
}
