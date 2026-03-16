//! Session yield tool — allows the agent to end the current turn early
//! and optionally schedule a follow-up message to itself.
//!
//! This is useful when the agent has produced a meaningful intermediate
//! result and wants to present it to the user before continuing with
//! a long-running plan.  The follow-up message (if provided) will be
//! dispatched as a new user-like message in the same session.

use serde_json::Value;

use crate::agent::types::YIELD_SENTINEL;
use crate::tools::{register_tool, ToolMeta};

/// Execute the session_yield tool.
///
/// Returns a JSON blob containing the `YIELD_SENTINEL` so the tool loop
/// can detect it and break early.  If a `follow_up` message is provided,
/// it is dispatched as a new message to the same agent/session after
/// a short delay.
pub async fn session_yield(workspace: &std::path::Path, args: Value) -> anyhow::Result<Value> {
    let reason = args["reason"]
        .as_str()
        .unwrap_or("agent requested early termination");
    let follow_up = args["follow_up"].as_str().map(|s| s.to_string());

    // If a follow-up message was provided, dispatch it via the comm bus
    // after a short delay so the current turn finishes first.
    if let Some(follow_up_msg) = follow_up.clone() {
        let ws = workspace.to_path_buf();
        tokio::spawn(async move {
            // Wait for the current turn to flush its reply.
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            // Derive agent_id from workspace path (parent dir name).
            let agent_id = ws
                .parent()
                .and_then(|p| p.file_name())
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let msg = crate::comm::IncomingMessage {
                channel: format!("yield:{agent_id}"),
                author: "self".to_string(),
                content: follow_up_msg,
                agent_id: Some(agent_id),
                timestamp: chrono::Utc::now().timestamp(),
                session_id: None,
                images: Vec::new(),
            };

            let tx = crate::comm::sender();
            if let Err(e) = tx.send(msg) {
                tracing::warn!(error = %e, "failed to dispatch yield follow-up");
            }
        });
    }

    Ok(serde_json::json!({
        "status": YIELD_SENTINEL,
        "reason": reason,
        "follow_up_scheduled": follow_up.is_some(),
    }))
}

pub fn register() {
    register_tool(ToolMeta {
        name: "session_yield".into(),
        description: "End the current turn early and optionally schedule a follow-up message. \
                      Use this when you have a meaningful intermediate result to present \
                      before continuing a multi-step plan."
            .into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "reason": {
                    "type": "string",
                    "description": "Brief explanation of why the turn is ending early."
                },
                "follow_up": {
                    "type": "string",
                    "description": "Optional message to send as a follow-up to continue the plan. \
                                   This message will be dispatched as a new turn after the current one completes."
                }
            },
            "required": ["reason"]
        }),
    });
}
