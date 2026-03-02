//! Delegate a task to another agent and return the result.

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

    // Build an IncomingMessage for the delegated task.
    let msg = crate::comm::IncomingMessage {
        channel: format!("delegate:{}", target_agent_id),
        author: "delegate".to_string(),
        content: task.clone(),
        agent_id: Some(target_agent_id.clone()),
        timestamp: chrono::Utc::now().timestamp(),
        session_id: Some(session_id.clone()),
        images: Vec::new(),
    };

    // Run the agent turn with a timeout.
    let result = tokio::time::timeout(
        std::time::Duration::from_secs(timeout_secs),
        agent.run_turn(msg),
    )
    .await;

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
        description: "Delegate a task to another agent and wait for the result. Use this for multi-agent workflows where a specialized agent should handle a subtask.".into(),
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
