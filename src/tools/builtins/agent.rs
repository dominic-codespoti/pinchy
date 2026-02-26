//! Agent management tools — let the agent list, inspect, create, and
//! update peer agents at runtime.
//!
//! Tools exposed:
//! - `list_agents {}` — enumerate all agent directories with metadata
//! - `get_agent { id }` — return detailed info for one agent
//! - `create_agent { id, soul?, model? }` — scaffold a new agent workspace

use std::path::Path;

use serde_json::{json, Value};

use crate::tools::{register_tool, ToolMeta};

/// `list_agents` — enumerate agents under `<pinchy_home>/agents/`.
pub async fn list_agents(_workspace: &Path, _args: Value) -> anyhow::Result<Value> {
    let agents_dir = crate::utils::agents_dir();
    let mut agents: Vec<Value> = Vec::new();

    let config_path = crate::pinchy_home().join("config.yaml");
    let cfg = crate::config::Config::load(&config_path).await.ok();

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

        let id = entry.file_name().to_string_lossy().to_string();
        let base = entry.path();

        let mut obj = json!({
            "id": id,
            "has_soul": base.join("SOUL.md").exists(),
            "has_tools": base.join("TOOLS.md").exists(),
            "has_heartbeat": base.join("HEARTBEAT.md").exists(),
        });

        if let Some(ref cfg) = cfg {
            if let Some(ac) = cfg.agents.iter().find(|a| a.id == id) {
                let m = obj.as_object_mut().unwrap();
                m.insert("model".into(), json!(ac.model));
                m.insert("heartbeat_secs".into(), json!(ac.heartbeat_secs));
                m.insert("cron_jobs_count".into(), json!(ac.cron_jobs.len()));
            }
        }

        agents.push(obj);
    }

    agents.sort_by(|a, b| {
        a["id"]
            .as_str()
            .unwrap_or("")
            .cmp(b["id"].as_str().unwrap_or(""))
    });

    Ok(json!({ "agents": agents }))
}

/// `get_agent` — return detailed info for a single agent.
pub async fn get_agent(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let id = args["id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("get_agent requires an 'id' string"))?;

    let base = crate::utils::agent_root(id);
    if !base.exists() {
        anyhow::bail!("agent not found: {id}");
    }

    let include_content = args
        .get("include_content")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    // Count session files.
    let sessions_dir = base.join("workspace").join("sessions");
    let session_count = count_files(&sessions_dir, "jsonl").await;

    let mut result = json!({
        "id": id,
        "has_soul": base.join("SOUL.md").exists(),
        "has_tools": base.join("TOOLS.md").exists(),
        "has_heartbeat": base.join("HEARTBEAT.md").exists(),
        "session_count": session_count,
    });

    if include_content {
        let soul = tokio::fs::read_to_string(base.join("SOUL.md")).await.ok();
        let tools = tokio::fs::read_to_string(base.join("TOOLS.md")).await.ok();
        let heartbeat = tokio::fs::read_to_string(base.join("HEARTBEAT.md"))
            .await
            .ok();
        let m = result.as_object_mut().unwrap();
        m.insert("soul".into(), json!(soul));
        m.insert("tools".into(), json!(tools));
        m.insert("heartbeat".into(), json!(heartbeat));
    }

    let config_path = crate::pinchy_home().join("config.yaml");
    if let Ok(cfg) = crate::config::Config::load(&config_path).await {
        if let Some(ac) = cfg.agents.iter().find(|a| a.id == id) {
            let m = result.as_object_mut().unwrap();
            m.insert("model".into(), json!(ac.model));
            m.insert("heartbeat_secs".into(), json!(ac.heartbeat_secs));
            m.insert("max_tool_iterations".into(), json!(ac.max_tool_iterations));
            m.insert("enabled_skills".into(), json!(ac.enabled_skills));
        }
    }

    Ok(result)
}

/// `create_agent` — scaffold a new agent workspace + update config.
///
/// Fields not explicitly provided are inherited from the `default` agent
/// (its on-disk files and config entry), so new agents start with a
/// sensible baseline rather than bare-bones placeholders.
pub async fn create_agent(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let id = args["id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_agent requires an 'id' string"))?;

    // Validate id: alphanumeric, hyphens, underscores.
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        anyhow::bail!(
            "agent id must be non-empty and contain only alphanumeric characters, hyphens, or underscores"
        );
    }

    let base = crate::utils::agent_root(id);
    if base.exists() {
        anyhow::bail!("agent '{id}' already exists");
    }

    // ── Inherit defaults from the "default" agent ──────────────────────
    let default_root = crate::utils::agent_root("default");

    let config_path = crate::pinchy_home().join("config.yaml");
    let cfg_result = crate::config::Config::load(&config_path).await;
    let default_cfg = cfg_result
        .as_ref()
        .ok()
        .and_then(|cfg| cfg.agents.iter().find(|a| a.id == "default").cloned());

    // Helper: read a file from the default agent, returning None on failure.
    async fn read_default(root: &Path, file: &str) -> Option<String> {
        tokio::fs::read_to_string(root.join(file)).await.ok()
    }

    // Create directory structure.
    tokio::fs::create_dir_all(base.join("workspace").join("sessions")).await?;

    // ── Resolve file contents: explicit arg > default agent file > placeholder ──
    let soul = match args["soul"].as_str() {
        Some(s) => s.to_string(),
        None => match read_default(&default_root, "SOUL.md").await {
            Some(s) => s,
            None => {
                format!("# {id}\n\nDescribe this agent's personality, role, and boundaries here.\n")
            }
        },
    };

    let tools_content = match args["tools"].as_str() {
        Some(s) => s.to_string(),
        None => read_default(&default_root, "TOOLS.md")
            .await
            .unwrap_or_else(|| {
                "# Tools\n\nList the tools this agent is allowed to use.\n\n- read\n- write\n- exec\n"
                    .to_string()
            }),
    };

    let heartbeat_content = match args["heartbeat"].as_str() {
        Some(s) => s.to_string(),
        None => read_default(&default_root, "HEARTBEAT.md")
            .await
            .unwrap_or_else(|| {
                "# Heartbeat\n\nInstructions the agent executes on each heartbeat tick.\n"
                    .to_string()
            }),
    };

    tokio::fs::write(base.join("SOUL.md"), &soul).await?;
    tokio::fs::write(base.join("TOOLS.md"), &tools_content).await?;
    tokio::fs::write(base.join("HEARTBEAT.md"), &heartbeat_content).await?;

    // ── Resolve config fields: explicit arg > default agent config > None ──
    let model = args["model"]
        .as_str()
        .map(String::from)
        .or_else(|| default_cfg.as_ref().and_then(|c| c.model.clone()));

    let heartbeat_secs = args["heartbeat_secs"]
        .as_u64()
        .or_else(|| default_cfg.as_ref().and_then(|c| c.heartbeat_secs));

    let max_tool_iterations = args["max_tool_iterations"]
        .as_u64()
        .map(|v| v as usize)
        .or_else(|| default_cfg.as_ref().and_then(|c| c.max_tool_iterations));

    let enabled_skills = args["enabled_skills"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect::<Vec<_>>()
        })
        .or_else(|| default_cfg.as_ref().and_then(|c| c.enabled_skills.clone()));

    let fallback_models = default_cfg
        .as_ref()
        .map(|c| c.fallback_models.clone())
        .unwrap_or_default();

    // Add to config.yaml.
    if let Ok(mut cfg) = cfg_result {
        if !cfg.agents.iter().any(|a| a.id == id) {
            cfg.agents.push(crate::config::AgentConfig {
                id: id.to_string(),
                root: format!("agents/{id}"),
                model: model.clone(),
                heartbeat_secs,
                cron_jobs: Vec::new(),
                max_tool_iterations,
                enabled_skills: enabled_skills.clone(),
                fallback_models,
                webhook_secret: None,
                extra_exec_commands: Vec::new(),
                history_messages: None,
                max_turns: None,
                timezone: None,
            });
            if let Err(e) = cfg.save(&config_path).await {
                tracing::warn!(error = %e, "failed to save config after agent creation");
            }
        }
    }

    Ok(json!({
        "status": "created",
        "id": id,
        "model": model,
        "inherited_from": "default",
    }))
}

/// Count files with a given extension in a directory.
async fn count_files(dir: &Path, ext: &str) -> u32 {
    let mut count = 0;
    if let Ok(mut rd) = tokio::fs::read_dir(dir).await {
        while let Ok(Some(entry)) = rd.next_entry().await {
            if entry.path().extension().map(|e| e == ext).unwrap_or(false) {
                count += 1;
            }
        }
    }
    count
}

/// Register agent management tools.
pub fn register() {
    register_tool(ToolMeta {
        name: "list_agents".into(),
        description: "List all agents with their metadata (SOUL, TOOLS, heartbeat status, model)."
            .into(),
        args_schema: json!({
            "type": "object",
            "properties": {}
        }),
    });

    register_tool(ToolMeta {
        name: "get_agent".into(),
        description: "Get metadata and configuration for a specific agent. Use include_content=true to also retrieve SOUL/TOOLS/HEARTBEAT file contents.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "The agent ID to look up"
                },
                "include_content": {
                    "type": "boolean",
                    "description": "If true, include full SOUL.md, TOOLS.md, and HEARTBEAT.md content (default: false)"
                }
            },
            "required": ["id"]
        }),
    });

    register_tool(ToolMeta {
        name: "create_agent".into(),
        description: "Create a new agent with workspace skeleton, SOUL.md, TOOLS.md, and register it in config.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "id": {
                    "type": "string",
                    "description": "Unique agent identifier (alphanumeric, hyphens, underscores)"
                },
                "soul": {
                    "type": "string",
                    "description": "Contents for SOUL.md (personality/role). A default template is used if omitted."
                },
                "tools": {
                    "type": "string",
                    "description": "Contents for TOOLS.md. A default template is used if omitted."
                },
                "heartbeat": {
                    "type": "string",
                    "description": "Contents for HEARTBEAT.md. A default template is used if omitted."
                },
                "model": {
                    "type": "string",
                    "description": "Model config ID this agent should use (must exist in config.yaml models)"
                }
            },
            "required": ["id"]
        }),
    });
}
