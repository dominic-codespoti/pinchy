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

use crate::tools::{register_tool, ToolMeta};
use crate::utils;

// ── session_list ─────────────────────────────────────────────

/// List sessions, optionally filtered by `agent_id`.
///
/// Returns session files with basic metadata (id, file size, last modified).
pub async fn session_list(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let filter_agent = args.get("agent_id").and_then(Value::as_str);
    let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(50) as usize;

    // Prefer PinchyDb when available.
    if let Some(db) = crate::store::global_db() {
        let entries = if let Some(aid) = filter_agent {
            db.list_sessions_for_agent(aid)?
        } else {
            db.list_sessions()?
        };
        let sessions: Vec<Value> = entries
            .into_iter()
            .take(limit)
            .map(|e| {
                json!({
                    "agent_id": e.agent_id,
                    "session_id": e.session_id,
                    "is_current": false, // caller can check separately
                    "created_at": e.created_at,
                    "title": e.title,
                })
            })
            .collect();
        return Ok(json!({ "sessions": sessions }));
    }

    tracing::warn!("no database available — skipping session_list");
    Ok(json!({ "sessions": [] }))
}

// ── session_status ───────────────────────────────────────────

/// Get the status of the current session for an agent.
///
/// Returns: session id, message count, last message preview, workspace info.
pub async fn session_status(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    // If agent_id is given, use that agent's workspace.  Otherwise use
    // the calling agent's workspace.
    let agent_id = if let Some(aid) = args.get("agent_id").and_then(Value::as_str) {
        let root = utils::agent_root(aid);
        if !root.exists() {
            anyhow::bail!("session_status: agent not found: {aid}");
        }
        aid.to_string()
    } else {
        // Derive agent_id from workspace path.
        workspace
            .parent()
            .and_then(|p| p.file_name())
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".into())
    };

    // Resolve current session: prefer PinchyDb.
    let current = if let Some(db) = crate::store::global_db() {
        db.current_session(&agent_id).ok().flatten()
    } else {
        tracing::warn!("no database available — skipping session_status current lookup");
        None
    };

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

    // Load history to get stats: prefer PinchyDb.
    let history = if let Some(db) = crate::store::global_db() {
        db.load_full_history(&session_id).unwrap_or_default()
    } else {
        tracing::warn!("no database available — skipping session_status history load");
        Vec::new()
    };

    let message_count = history.len();
    let last_message = history.last().map(|ex| {
        json!({
            "role": ex.role,
            "content_preview": crate::utils::truncate_str(&ex.content, 200),
            "timestamp": ex.timestamp,
        })
    });

    Ok(json!({
        "agent_id": agent_id,
        "session_id": session_id,
        "message_count": message_count,
        "last_message": last_message,
    }))
}

// ── session_send ─────────────────────────────────────────────

/// Send a message to another agent's current session.
///
/// The message is delivered as an `IncomingMessage` on the global comm bus,
/// so the target agent's dispatcher picks it up and runs a turn.
///
/// When `wait: true` (default: false), the tool subscribes to gateway events
/// and blocks until the target agent emits an `agent_reply` for the matching
/// channel, returning the full reply text.
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

    let wait = args.get("wait").and_then(Value::as_bool).unwrap_or(false);

    let timeout_secs = args
        .get("timeout_secs")
        .and_then(Value::as_u64)
        .unwrap_or(120);

    let channel = args
        .get("channel")
        .and_then(Value::as_str)
        .unwrap_or("inter-agent");

    let sender_id = args
        .get("sender")
        .and_then(Value::as_str)
        .unwrap_or("agent");

    // If waiting for a response, subscribe to gateway events BEFORE
    // sending so we don't miss the reply.
    let mut events_rx = if wait {
        crate::gateway::global_events_tx().map(|tx| tx.subscribe())
    } else {
        None
    };

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
        images: Vec::new(),
    };

    let tx = crate::comm::sender();
    if let Err(e) = tx.send(msg) {
        return Ok(json!({
            "sent": false,
            "error": format!("no active receivers: {e}"),
        }));
    }

    // Fire-and-forget path.
    if !wait || events_rx.is_none() {
        return Ok(json!({
            "sent": true,
            "agent_id": agent_id,
            "waited": false,
        }));
    }

    // Wait for the target agent's reply by watching gateway events.
    let rx = events_rx.as_mut().unwrap();
    let target = agent_id.to_string();
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(timeout_secs);

    loop {
        tokio::select! {
            _ = tokio::time::sleep_until(deadline) => {
                return Ok(json!({
                    "sent": true,
                    "agent_id": target,
                    "waited": true,
                    "status": "timeout",
                    "timeout_secs": timeout_secs,
                }));
            }
            result = rx.recv() => {
                match result {
                    Ok(event_str) => {
                        if let Ok(ev) = serde_json::from_str::<Value>(&event_str) {
                            let ev_type = ev.get("type").and_then(Value::as_str).unwrap_or("");
                            let ev_agent = ev.get("agent").and_then(Value::as_str).unwrap_or("");

                            // Match on agent_reply or turn_receipt from the target agent.
                            if ev_agent == target {
                                if ev_type == "agent_reply" {
                                    let reply = ev.get("text")
                                        .and_then(Value::as_str)
                                        .unwrap_or("")
                                        .to_string();
                                    return Ok(json!({
                                        "sent": true,
                                        "agent_id": target,
                                        "waited": true,
                                        "status": "completed",
                                        "reply": reply,
                                        "session": ev.get("session"),
                                    }));
                                }
                                if ev_type == "turn_receipt" {
                                    let reply = ev.get("reply_summary")
                                        .and_then(Value::as_str)
                                        .unwrap_or("")
                                        .to_string();
                                    return Ok(json!({
                                        "sent": true,
                                        "agent_id": target,
                                        "waited": true,
                                        "status": "completed",
                                        "reply": reply,
                                        "session": ev.get("session"),
                                        "receipt": ev,
                                    }));
                                }
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                        tracing::warn!(skipped = n, "session_send: lagged on gateway events");
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        return Ok(json!({
                            "sent": true,
                            "agent_id": target,
                            "waited": true,
                            "status": "error",
                            "error": "gateway event bus closed",
                        }));
                    }
                }
            }
        }
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

    let title = args.get("title").and_then(Value::as_str);

    // Persist to PinchyDb if available.
    if let Some(db) = crate::store::global_db() {
        let entry = crate::session::index::IndexEntry {
            session_id: session_id.clone(),
            agent_id: agent_id.to_string(),
            created_at: crate::agent::types::epoch_millis(),
            title: title.map(String::from),
        };
        let _ = db.insert_session(&entry);
        let _ = db.set_current_session(agent_id, &session_id);
    } else {
        tracing::warn!("no database available — skipping session_spawn persistence");
    }

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
            images: Vec::new(),
        };

        crate::comm::sender().send(msg).is_ok()
    } else {
        false
    };

    Ok(json!({
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
        description: "Send a message to another agent and optionally wait for the response. \
            The message is dispatched to the target agent's active session via the internal \
            message bus, triggering an agent turn. Set wait=true to block until the agent \
            replies (synchronous round-trip). Default is fire-and-forget."
            .into(),
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
                "wait": {
                    "type": "boolean",
                    "description": "If true, wait for the agent's reply before returning (default: false)"
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Max seconds to wait when wait=true (default: 120)"
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
