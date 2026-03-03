//! Delegate a task to another agent and return the result.
//!
//! While the sub-agent executes, progress events (`tool_start`, `tool_end`,
//! `token_usage`) are forwarded to the gateway as `delegation_progress`
//! events so the UI and calling agent can observe intermediate state.

use serde_json::Value;

use crate::tools::{register_tool, ToolMeta};

pub async fn delegate(_workspace: &std::path::Path, args: Value) -> anyhow::Result<Value> {
    let target_agent_id = args["agent"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("delegate requires an 'agent' string"))?
        .to_string();
    let task = args["task"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("delegate requires a 'task' string"))?
        .to_string();
    let timeout_secs = args["timeout_secs"].as_u64().unwrap_or(120);

    // Load the current config to find the target agent.
    let config_path = crate::pinchy_home().join("config.yaml");
    let cfg = crate::config::Config::load(&config_path).await?;

    let agent_cfg = cfg
        .agents
        .iter()
        .find(|a| a.id == target_agent_id)
        .ok_or_else(|| anyhow::anyhow!("agent '{}' not found in config", target_agent_id))?;

    let mut agent = crate::agent::types::Agent::new_from_config(agent_cfg, &cfg);

    // Create a new session for the delegated task.
    let session_id = agent.start_session().await;

    // Prepend a delegation context hint to the task so the sub-agent
    // knows it's executing a delegated sub-task and should return
    // results directly rather than using send_message / Discord.
    let delegated_task = format!(
        "[DELEGATION CONTEXT: You are executing a delegated sub-task from another agent. \
         Return your results as your final reply text. Do NOT use the send_message tool — \
         your output will be returned to the calling agent automatically.]\n\n{}",
        task
    );

    // Build an IncomingMessage for the delegated task.
    let msg = crate::comm::IncomingMessage {
        channel: format!("delegate:{}", target_agent_id),
        author: "delegate".to_string(),
        content: delegated_task,
        agent_id: Some(target_agent_id.clone()),
        timestamp: chrono::Utc::now().timestamp(),
        session_id: Some(session_id.clone()),
        images: Vec::new(),
    };

    // ── Progress streaming ─────────────────────────────────────────
    //
    // Subscribe to gateway events BEFORE starting the turn so we can
    // forward tool_start / tool_end / token_usage from the sub-agent
    // as `delegation_progress` events visible to the UI.
    let progress_target = target_agent_id.clone();
    let progress_session = session_id.clone();
    let progress_handle = tokio::spawn(async move {
        let Some(tx) = crate::gateway::global_events_tx() else {
            return;
        };
        let mut rx = tx.subscribe();
        let forward_types = [
            "tool_start",
            "tool_end",
            "token_usage",
            "typing_start",
            "typing_stop",
        ];
        loop {
            match rx.recv().await {
                Ok(event_str) => {
                    let Ok(ev) = serde_json::from_str::<Value>(&event_str) else {
                        continue;
                    };
                    let ev_type = ev.get("type").and_then(Value::as_str).unwrap_or("");
                    let ev_agent = ev.get("agent").and_then(Value::as_str).unwrap_or("");

                    // Only forward events from the target sub-agent session.
                    if ev_agent != progress_target {
                        continue;
                    }
                    if !forward_types.contains(&ev_type) {
                        // Stop when we see the turn receipt — the turn is done.
                        if ev_type == "turn_receipt" || ev_type == "agent_reply" {
                            break;
                        }
                        continue;
                    }

                    // Re-emit as a delegation_progress event.
                    crate::gateway::publish_event_json(&serde_json::json!({
                        "type": "delegation_progress",
                        "delegate_agent": progress_target,
                        "delegate_session": progress_session,
                        "event_type": ev_type,
                        "detail": ev,
                    }));
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::debug!(skipped = n, "delegate progress listener lagged");
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    // Run the agent turn with a timeout.
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        agent.run_turn(msg),
    )
    .await;

    // Stop the progress listener.
    progress_handle.abort();

    match result {
        Ok(Ok(reply)) => Ok(serde_json::json!({
            "status": "completed",
            "agent": target_agent_id,
            "session": session_id,
            "reply": reply,
        })),
        Ok(Err(e)) => Ok(serde_json::json!({
            "status": "error",
            "agent": target_agent_id,
            "error": e.to_string(),
        })),
        Err(_) => Ok(serde_json::json!({
            "status": "timeout",
            "agent": target_agent_id,
            "timeout_secs": timeout_secs,
        })),
    }
}

pub fn register() {
    register_tool(ToolMeta {
        name: "delegate".into(),
        description: "Delegate a task to another agent and wait for the result synchronously. \
            Use this whenever the user asks you to have another agent do something, or when a \
            specialized agent should handle a subtask. The target agent runs a full turn and \
            its reply is returned to you. Prefer this over session_send when you need the result back.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "agent": {
                    "type": "string",
                    "description": "The id of the target agent to delegate to"
                },
                "task": {
                    "type": "string",
                    "description": "The task description / prompt for the target agent"
                },
                "timeout_secs": {
                    "type": "integer",
                    "description": "Maximum seconds to wait for the delegated agent (default: 120)"
                }
            },
            "required": ["agent", "task"]
        }),
    });
}
