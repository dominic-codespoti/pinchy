//! Predefined Pinchy agent — a real agent using the normal runtime.
//!
//! The Pinchy agent is a built-in agent that helps users understand
//! Pinchy internals, create and edit other agents, and manage groups.
//!
//! Unlike the stub assistant API, this agent:
//! - Uses the normal agent runtime with full tool access
//! - Participates in the dispatch/message bus flow
//! - Can access conversation context (agent/group scope)
//! - Uses the default model resolution path

use std::path::PathBuf;

/// The Pinchy agent ID.
pub const PINCHY_AGENT_ID: &str = "pinchy";

/// Ensure the Pinchy agent workspace exists with default configuration.
/// Called at startup. Also registers the agent in config.yaml if not present.
pub async fn ensure_pinchy_agent() -> anyhow::Result<()> {
    let agent_root = crate::utils::agent_root(PINCHY_AGENT_ID);

    // Create workspace if needed
    if !agent_root.exists() {
        tracing::info!("creating pinchy agent workspace");
        tokio::fs::create_dir_all(agent_root.join("workspace")).await?;

        // Write SOUL.md - tailored for Pinchy internals and agent editing
        tokio::fs::write(agent_root.join("SOUL.md"), SOUL_MD).await?;

        // Write TOOLS.md - tools the Pinchy agent can use
        tokio::fs::write(agent_root.join("TOOLS.md"), TOOLS_MD).await?;

        // Write HEARTBEAT.md - empty by default
        tokio::fs::write(agent_root.join("HEARTBEAT.md"), HEARTBEAT_MD).await?;
    } else {
        // Ensure files exist even if directory was created manually
        let soul_path = agent_root.join("SOUL.md");
        if !soul_path.exists() {
            tokio::fs::write(&soul_path, SOUL_MD).await?;
        }
        let tools_path = agent_root.join("TOOLS.md");
        if !tools_path.exists() {
            tokio::fs::write(&tools_path, TOOLS_MD).await?;
        }
        let heartbeat_path = agent_root.join("HEARTBEAT.md");
        if !heartbeat_path.exists() {
            tokio::fs::write(&heartbeat_path, HEARTBEAT_MD).await?;
        }
    }

    // Ensure pinchy agent is registered in config.yaml
    register_pinchy_in_config().await?;

    Ok(())
}

/// Register the pinchy agent in config.yaml if not already present.
/// This is the critical fix: the agent must be in config to be dispatched.
async fn register_pinchy_in_config() -> anyhow::Result<()> {
    let config_path = crate::pinchy_home().join("config.yaml");

    // Try to load existing config
    let cfg = match crate::config::Config::load_unvalidated(&config_path).await {
        Ok(c) => c,
        Err(e) => {
            tracing::debug!(error = %e, "no existing config to update, pinchy agent not registered");
            return Ok(());
        }
    };

    // Check if pinchy agent already exists in config
    if cfg.agents.iter().any(|a| a.id == PINCHY_AGENT_ID) {
        tracing::debug!("pinchy agent already registered in config");
        return Ok(());
    }

    // Acquire lock for thread-safe config modification
    let _guard = crate::config::config_lock().await;

    // Reload config after acquiring lock to avoid overwriting concurrent changes
    let mut cfg = crate::config::Config::load_unvalidated(&config_path).await?;

    // Double-check after lock
    if cfg.agents.iter().any(|a| a.id == PINCHY_AGENT_ID) {
        return Ok(());
    }

    // Add pinchy agent to config
    let agent_root = crate::utils::agent_root(PINCHY_AGENT_ID);
    let root_str = agent_root.to_string_lossy().to_string();

    cfg.agents.push(crate::config::AgentConfig {
        id: PINCHY_AGENT_ID.to_string(),
        root: root_str,
        model: None,          // Use default model resolution
        heartbeat_secs: None, // No heartbeat by default
        cron_jobs: Vec::new(),
        max_tool_iterations: Some(25),
        enabled_skills: None,
        fallback_models: Vec::new(),
        webhook_secret: None,
        extra_exec_commands: Vec::new(),
        history_messages: None,
        max_turns: None,
        compact_keep_recent_turns: None,
        timezone: None,
        watch_paths: Vec::new(),
        reasoning_effort: None,
    });

    // Save updated config
    match cfg.save(&config_path).await {
        Ok(()) => {
            tracing::info!("registered pinchy agent in config.yaml");
            // Invalidate cache so subsequent loads see the new config
            crate::config::invalidate_config_cache();
            Ok(())
        }
        Err(e) => {
            tracing::warn!(error = %e, "failed to save config after adding pinchy agent");
            Ok(()) // Non-fatal: agent can still work without being in config
        }
    }
}

/// Check if the Pinchy agent exists.
pub fn pinchy_agent_exists() -> bool {
    crate::utils::agent_root(PINCHY_AGENT_ID).exists()
}

/// Get the path to the Pinchy agent root.
pub fn pinchy_agent_root() -> PathBuf {
    crate::utils::agent_root(PINCHY_AGENT_ID)
}

// ---------------------------------------------------------------------------
// Pinchy Agent SOUL.md
// ---------------------------------------------------------------------------

const SOUL_MD: &str = r#"# Pinchy

You are Pinchy, the built-in assistant for the Pinchy agent runtime platform.

## Your Purpose

Help users manage their agents and understand Pinchy internals. You have deep knowledge of:

- Pinchy's architecture: gateway, scheduler, agents, sessions, memory, skills
- AI/LLM concepts: models, providers, context windows, tokens, tool calling
- Agent configuration: SOUL.md (personality), TOOLS.md (capabilities), HEARTBEAT.md (scheduled tasks)
- Agent settings: model selection, max_turns, history_messages, enabled_skills, reasoning_effort, max_tool_iterations
- Memory system: SQLite + FTS5 with semantic search capabilities
- Skill system: SKILL.md manifests, auto-pluck rules, progressive disclosure

## Conversation Context

When chatting with users, you may have access to conversation context:
- **Agent scope**: The user is focused on a specific agent
- **Group scope**: The user is managing a group of agents

Use `get_conversation_context` to check the current scope and tailor your responses.

## Your Capabilities

You can:
- List, inspect, and create new agents
- Edit agent files (SOUL.md, TOOLS.md, HEARTBEAT.md)
- Manage agent memory
- Create and manage skills
- List and manage cron jobs
- Execute shell commands
- Read and write files
- Delegate work to other agents

## Response Style

- Be helpful, accurate, and concise
- When suggesting changes, use available tools to implement them
- For agent creation/editing, guide users through the process
- Always validate agent IDs (alphanumeric, hyphens, underscores only)
"#;

// ---------------------------------------------------------------------------
// Pinchy Agent TOOLS.md
// ---------------------------------------------------------------------------

const TOOLS_MD: &str = r#"# Pinchy Agent Tools

## Agent Management
- `list_agents` - List all agents with their metadata
- `get_agent` - Get detailed info for a specific agent (use include_content=true for file contents)
- `create_agent` - Create a new agent with initial configuration
- `update_agent` - Update an existing agent's configuration and/or files (SOUL.md, TOOLS.md, HEARTBEAT.md)

## File Operations
- `read_file` - Read any file in an agent's workspace
- `write_file` - Write/create files
- `edit_file` - Make targeted edits to files
- `list_files` - List files in directories

## Context
- `get_conversation_context` - Get the current conversation scope (agent or group)

## Memory
- `save_memory` - Store information in your memory
- `recall_memory` - Search your memory
- `forget_memory` - Delete memory entries

## Skills
- `list_skills` - List available skills
- `activate_skill` - Load a skill's full instructions
- `create_skill` - Create a new skill

## Cron / Scheduling
- `list_cron_jobs` - List scheduled jobs
- `create_cron_job` - Schedule a new recurring task
- `update_cron_job` - Modify existing jobs
- `delete_cron_job` - Remove jobs

## System
- `exec_shell` - Run shell commands
- `delegate` - Send work to another agent
- `send_message` - Send messages through connected channels
"#;

// ---------------------------------------------------------------------------
// Pinchy Agent HEARTBEAT.md
// ---------------------------------------------------------------------------

const HEARTBEAT_MD: &str = r#"# Pinchy Agent Heartbeat

The Pinchy agent does not have scheduled heartbeat tasks by default.
Users can add tasks here if needed.
"#;
