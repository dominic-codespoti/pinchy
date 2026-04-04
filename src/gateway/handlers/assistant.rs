//! Pinchy Assistant API — built-in virtual assistant for agent/group management.
//!
//! Provides conversational assistance for managing Pinchy agents with
//! structured action proposals that can be applied via the apply endpoint.
//!
//! ## Structured Action Format
//!
//! The assistant uses a strict JSON-based structured output format for action
//! proposals. This eliminates brittle keyword matching and provides reliable
//! parsing with full validation.
//!
//! When the model suggests actions, it outputs:
//! ```json
//! {
//!   "pinchy_actions": [
//!     {
//!       "action_type": "update_agent_config",
//!       "params": { "agent_id": "test-agent", "model": "gpt-4o" }
//!     }
//!   ]
//! }
//! ```
//!
//! The response text and actions are parsed from the model output and returned
//! to the client for review before application via the /api/assistant/apply endpoint.

use axum::{extract::Json, http::StatusCode, response::IntoResponse};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::gateway::types::ErrorResponse;

// ---------------------------------------------------------------------------
// Request/Response Types
// ---------------------------------------------------------------------------

/// Scope context for assistant conversations.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "snake_case")]
pub(crate) struct AssistantScope {
    /// Either "agent" or "group"
    pub scope_type: String,
    /// For agent scope: the agent ID
    pub agent_id: Option<String>,
    /// For group scope: client-supplied group metadata
    pub group_id: Option<String>,
    pub group_name: Option<String>,
    pub group_agent_ids: Option<Vec<String>>,
}

/// Chat request from the client.
#[derive(Debug, Deserialize)]
pub(crate) struct AssistantChatRequest {
    /// User message to the assistant
    pub message: String,
    /// Scope context (agent or group)
    pub scope: AssistantScope,
    /// Optional conversation history for context
    #[serde(default)]
    pub history: Vec<AssistantMessage>,
}

/// A single message in the conversation.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct AssistantMessage {
    pub role: String, // "user" or "assistant"
    pub content: String,
}

/// Proposed action that the assistant suggests.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct ProposedAction {
    /// Action type identifier
    pub action_type: String,
    /// Human-readable description
    pub description: String,
    /// Action-specific parameters
    pub params: serde_json::Value,
}

/// Chat response to the client.
#[derive(Debug, Serialize)]
pub(crate) struct AssistantChatResponse {
    /// Conversational reply
    pub reply: String,
    /// Optional structured actions proposed by the assistant
    #[serde(skip_serializing_if = "Option::is_none")]
    pub proposed_actions: Option<Vec<ProposedAction>>,
    /// Whether the reply used a real AI model or fallback
    pub used_model: bool,
}

/// Apply request to execute structured actions.
#[derive(Debug, Deserialize)]
pub(crate) struct AssistantApplyRequest {
    /// Actions to execute (usually from proposed_actions)
    pub actions: Vec<ActionRequest>,
    /// Scope context (must match the chat scope)
    pub scope: AssistantScope,
}

/// Individual action to execute.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct ActionRequest {
    pub action_type: String,
    pub params: serde_json::Value,
}

/// Result of a single action execution.
#[derive(Debug, Serialize)]
pub(crate) struct ActionResult {
    pub action_type: String,
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<serde_json::Value>,
}

/// Apply response with results for each action.
#[derive(Debug, Serialize)]
pub(crate) struct AssistantApplyResponse {
    pub results: Vec<ActionResult>,
    pub all_succeeded: bool,
}

/// Structured action output format expected from the model.
#[derive(Debug, Clone, Deserialize)]
struct StructuredActionOutput {
    /// The conversational reply text
    #[serde(default)]
    reply: String,
    /// Optional structured actions to propose
    #[serde(default, rename = "pinchy_actions")]
    actions: Vec<RawAction>,
}

/// Raw action from model output before full validation.
#[derive(Debug, Clone, Deserialize)]
struct RawAction {
    action_type: String,
    #[serde(default)]
    params: serde_json::Value,
    #[serde(default)]
    description: Option<String>,
}

/// Action metadata for validation and documentation.
#[derive(Debug, Clone)]
#[allow(dead_code)]
struct ActionMetadata {
    description: &'static str,
    required_params: &'static [&'static str],
    allowed_params: &'static [&'static str],
    supported_scopes: &'static [&'static str],
    requires_agent_target: bool,
}

// ---------------------------------------------------------------------------
// Action Registry
// ---------------------------------------------------------------------------

/// Registry of all supported actions with their metadata.
fn action_registry() -> HashMap<&'static str, ActionMetadata> {
    let mut registry = HashMap::new();

    registry.insert(
        "update_agent_config",
        ActionMetadata {
            description: "Update agent settings (model, max_turns, history_messages, etc.)",
            required_params: &[],
            allowed_params: &[
                "agent_id",
                "model",
                "max_turns",
                "history_messages",
                "enabled_skills",
                "reasoning_effort",
                "max_tool_iterations",
                "heartbeat_secs",
            ],
            supported_scopes: &["agent", "group"],
            requires_agent_target: true,
        },
    );

    registry.insert(
        "update_agent_file",
        ActionMetadata {
            description: "Edit agent files (SOUL.md, TOOLS.md, HEARTBEAT.md)",
            required_params: &["filename", "content"],
            allowed_params: &["agent_id", "filename", "content"],
            supported_scopes: &["agent", "group"],
            requires_agent_target: true,
        },
    );

    registry.insert(
        "save_agent_memory",
        ActionMetadata {
            description: "Save information to agent memory",
            required_params: &["key", "value"],
            allowed_params: &["agent_id", "key", "value", "tags"],
            supported_scopes: &["agent", "group"],
            requires_agent_target: true,
        },
    );

    registry.insert(
        "forget_agent_memory",
        ActionMetadata {
            description: "Remove a memory entry by key",
            required_params: &["key"],
            allowed_params: &["agent_id", "key"],
            supported_scopes: &["agent", "group"],
            requires_agent_target: true,
        },
    );

    registry.insert(
        "search_agent_memory",
        ActionMetadata {
            description: "Search agent memory entries",
            required_params: &["query"],
            allowed_params: &["agent_id", "query", "tag", "limit"],
            supported_scopes: &["agent", "group"],
            requires_agent_target: true,
        },
    );

    registry.insert(
        "create_agent",
        ActionMetadata {
            description: "Create a new agent with initial configuration",
            required_params: &["id"],
            allowed_params: &["id", "soul", "tools", "heartbeat", "model"],
            supported_scopes: &["group", "agent"],
            requires_agent_target: false,
        },
    );

    registry.insert(
        "list_agents",
        ActionMetadata {
            description: "List all configured agents with their basic info",
            required_params: &[],
            allowed_params: &[],
            supported_scopes: &["agent", "group"],
            requires_agent_target: false,
        },
    );

    registry
}

/// Validate an action against the registry.
fn validate_action(
    action: &ActionRequest,
    scope: &AssistantScope,
) -> Result<(), ActionValidationError> {
    let registry = action_registry();

    let metadata = registry.get(action.action_type.as_str()).ok_or_else(|| {
        ActionValidationError::UnknownAction {
            action_type: action.action_type.clone(),
        }
    })?;

    // Check scope support
    if !metadata
        .supported_scopes
        .contains(&scope.scope_type.as_str())
    {
        return Err(ActionValidationError::UnsupportedScope {
            action_type: action.action_type.clone(),
            scope_type: scope.scope_type.clone(),
        });
    }

    // Check required params
    for param in metadata.required_params {
        if action.params.get(*param).is_none() {
            return Err(ActionValidationError::MissingRequiredParam {
                action_type: action.action_type.clone(),
                param: param.to_string(),
            });
        }
    }

    // Check agent targeting for group scope
    if scope.scope_type == "group"
        && metadata.requires_agent_target
        && action.params.get("agent_id").is_none()
    {
        return Err(ActionValidationError::MissingAgentTarget {
            action_type: action.action_type.clone(),
        });
    }

    Ok(())
}

#[derive(Debug)]
enum ActionValidationError {
    UnknownAction {
        action_type: String,
    },
    UnsupportedScope {
        action_type: String,
        scope_type: String,
    },
    MissingRequiredParam {
        action_type: String,
        param: String,
    },
    MissingAgentTarget {
        action_type: String,
    },
}

impl std::fmt::Display for ActionValidationError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ActionValidationError::UnknownAction { action_type } => {
                write!(f, "Unknown action type: {}", action_type)
            }
            ActionValidationError::UnsupportedScope {
                action_type,
                scope_type,
            } => {
                write!(
                    f,
                    "Action '{}' is not supported for scope type '{}'",
                    action_type, scope_type
                )
            }
            ActionValidationError::MissingRequiredParam { action_type, param } => {
                write!(
                    f,
                    "Action '{}' requires missing parameter: {}",
                    action_type, param
                )
            }
            ActionValidationError::MissingAgentTarget { action_type } => {
                write!(
                    f,
                    "Action '{}' requires explicit 'agent_id' parameter when used in group scope",
                    action_type
                )
            }
        }
    }
}

// ---------------------------------------------------------------------------
// PINCHY_SYSTEM_PROMPT: Knowledgeable assistant persona with structured output
// ---------------------------------------------------------------------------

const PINCHY_SYSTEM_PROMPT: &str = r#"You are Pinchy, a helpful assistant for the Pinchy agent runtime platform. You have deep knowledge of:

- Pinchy's architecture: gateway, scheduler, agents, sessions, memory, skills
- AI/LLM concepts: models, providers, context windows, tokens, tool calling
- Agent configuration: SOUL.md (personality), TOOLS.md (capabilities), HEARTBEAT.md (scheduled tasks)
- Agent settings: model selection, max_turns, history_messages, enabled_skills, reasoning_effort, max_tool_iterations, heartbeat_secs
- Memory system: SQLite + FTS5 with semantic search capabilities
- Skill system: SKILL.md manifests, auto-pluck rules, progressive disclosure

Your role is to help users manage their agents and understand Pinchy internals.

## Response Format

You must respond in the following JSON format:

```json
{
  "reply": "Your conversational response here (can be multi-line, supports markdown)",
  "pinchy_actions": [
    {
      "action_type": "action_name",
      "params": { "param1": "value1", "param2": "value2" },
      "description": "Brief human-readable description of what this action does"
    }
  ]
}
```

- `reply`: Required. Your conversational response to the user.
- `pinchy_actions`: Optional array of actions to propose. Only include when the user explicitly requests changes.

## Available Actions

1. **update_agent_config** - Update agent settings
   - agent_id (string, optional for agent scope): Target agent
   - model (string, optional): Model ID to use
   - max_turns (number, optional): Max conversation turns
   - history_messages (number, optional): Messages to load as context
   - enabled_skills (array of strings, optional): Skill IDs to enable
   - reasoning_effort (string, optional): "low", "medium", or "high"
   - max_tool_iterations (number, optional): Max tool calls per turn
   - heartbeat_secs (number or null, optional): Seconds between heartbeats (null to disable)

2. **update_agent_file** - Edit agent files
   - agent_id (string, optional for agent scope): Target agent
   - filename (string, required): "SOUL.md", "TOOLS.md", or "HEARTBEAT.md"
   - content (string, required): Full new file content

3. **save_agent_memory** - Save information to agent memory
   - agent_id (string, optional for agent scope): Target agent
   - key (string, required): Memory entry key
   - value (string, required): Memory content
   - tags (array of strings, optional): Tags for organization

4. **forget_agent_memory** - Remove a memory entry
   - agent_id (string, optional for agent scope): Target agent
   - key (string, required): Memory entry key to delete

5. **search_agent_memory** - Search agent memory
   - agent_id (string, optional for agent scope): Target agent
   - query (string, required): Search query
   - tag (string, optional): Filter by tag
   - limit (number, optional): Max results (default 10)

6. **create_agent** - Create a new agent
   - id (string, required): New agent identifier
   - soul (string, optional): Initial SOUL.md content
   - tools (string, optional): Initial TOOLS.md content
   - heartbeat (string, optional): Initial HEARTBEAT.md content
   - model (string, optional): Model ID for the new agent

7. **list_agents** - List all configured agents (no parameters)

## Important Rules

- ALWAYS use valid JSON in your response
- Only propose actions when explicitly requested by the user
- For group scope, ALWAYS include agent_id in action params when targeting a specific agent
- For agent scope, agent_id in params is optional (defaults to the scoped agent)
- Be helpful, accurate, and concise in your replies

Current context will be provided in the user message.
"#;

// ---------------------------------------------------------------------------
// Chat Handler
// ---------------------------------------------------------------------------

/// POST /api/assistant/chat
///
/// Accepts a user message with scope context and returns a conversational
/// response plus optional structured proposed actions.
pub(crate) async fn api_assistant_chat(
    Json(body): Json<AssistantChatRequest>,
) -> impl IntoResponse {
    // Validate the request
    if body.message.trim().is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "message is required".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Validate scope
    match validate_scope(&body.scope) {
        Ok(()) => {}
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: e,
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    }

    // Build context about the current scope
    let context = match build_scope_context(&body.scope).await {
        Ok(ctx) => ctx,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("context build: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Try to get an AI response, fallback to rule-based if no provider
    let (reply, proposed_actions, used_model) =
        match generate_assistant_response(&body, &context).await {
            Ok(result) => result,
            Err(e) => {
                tracing::warn!(error = %e, "assistant inference failed, using fallback");
                generate_fallback_response(&body, &context)
            }
        };

    let response = AssistantChatResponse {
        reply,
        proposed_actions,
        used_model,
    };

    (StatusCode::OK, Json(response)).into_response()
}

/// Validate the scope context.
fn validate_scope(scope: &AssistantScope) -> Result<(), String> {
    match scope.scope_type.as_str() {
        "agent" => {
            if scope.agent_id.is_none() {
                return Err("agent_id is required for agent scope".to_string());
            }
        }
        "group" => {
            if scope.group_id.is_none() {
                return Err("group_id is required for group scope".to_string());
            }
            if scope.group_name.is_none() {
                return Err("group_name is required for group scope".to_string());
            }
        }
        _ => {
            return Err(format!(
                "invalid scope_type: {}, must be 'agent' or 'group'",
                scope.scope_type
            ));
        }
    }
    Ok(())
}

/// Build context information about the current scope.
async fn build_scope_context(scope: &AssistantScope) -> anyhow::Result<String> {
    let mut parts = Vec::new();

    match scope.scope_type.as_str() {
        "agent" => {
            let agent_id = scope.agent_id.as_deref().unwrap_or("unknown");
            parts.push(format!("Current agent: {}", agent_id));

            // Load agent details
            let base = crate::utils::agent_root(agent_id);
            if base.exists() {
                // Check for agent files
                let has_soul = base.join("SOUL.md").exists();
                let has_tools = base.join("TOOLS.md").exists();
                let has_heartbeat = base.join("HEARTBEAT.md").exists();
                parts.push(format!(
                    "Agent files: SOUL.md={}, TOOLS.md={}, HEARTBEAT.md={}",
                    has_soul, has_tools, has_heartbeat
                ));

                // Load config
                let config_path = crate::pinchy_home().join("config.yaml");
                if let Ok(cfg) = crate::config::Config::load(&config_path).await {
                    if let Some(ac) = cfg.agents.iter().find(|a| a.id == agent_id) {
                        parts.push(format!("Model: {:?}", ac.model));
                        parts.push(format!("Max turns: {:?}", ac.max_turns));
                        parts.push(format!("History messages: {:?}", ac.history_messages));
                        parts.push(format!("Enabled skills: {:?}", ac.enabled_skills));
                        parts.push(format!("Reasoning effort: {:?}", ac.reasoning_effort));
                    }
                }

                // Memory count
                let workspace = crate::utils::agent_workspace(agent_id);
                if let Ok(store) = crate::memory::MemoryStore::open(&workspace) {
                    if let Ok(count) = store.count() {
                        parts.push(format!("Memory entries: {}", count));
                    }
                }
            } else {
                parts.push("Agent workspace not found".to_string());
            }
        }
        "group" => {
            let group_id = scope.group_id.as_deref().unwrap_or("unknown");
            let group_name = scope.group_name.as_deref().unwrap_or("unnamed");
            parts.push(format!("Current group: {} ({})", group_name, group_id));

            if let Some(agent_ids) = &scope.group_agent_ids {
                parts.push(format!(
                    "Group agents ({}): {}",
                    agent_ids.len(),
                    agent_ids.join(", ")
                ));

                // Load brief info about each agent
                for agent_id in agent_ids {
                    let base = crate::utils::agent_root(agent_id);
                    let exists = base.exists();
                    parts.push(format!(
                        "- {}: {}",
                        agent_id,
                        if exists { "exists" } else { "not found" }
                    ));
                }
            }

            parts.push("\nIMPORTANT: When proposing actions that target a specific agent in this group, you MUST include the 'agent_id' parameter.".to_string());
        }
        _ => {}
    }

    Ok(parts.join("\n"))
}

/// Generate assistant response using AI model if available.
async fn generate_assistant_response(
    request: &AssistantChatRequest,
    context: &str,
) -> anyhow::Result<(String, Option<Vec<ProposedAction>>, bool)> {
    use crate::models::{send_chat_messages, ChatMessage};

    // Build the user message with context
    let user_content = format!("Context:\n{}\n\nUser message: {}", context, request.message);

    // Build messages for the model
    let mut messages = vec![ChatMessage::system(PINCHY_SYSTEM_PROMPT)];

    // Add conversation history
    for msg in &request.history {
        match msg.role.as_str() {
            "user" => messages.push(ChatMessage::user(&msg.content)),
            "assistant" => messages.push(ChatMessage::assistant(&msg.content)),
            _ => {}
        }
    }

    // Add current user message with context
    messages.push(ChatMessage::user(&user_content));

    // Try to get AI response
    let reply = send_chat_messages(&messages).await?;

    // Parse structured output from the response
    let (clean_reply, proposed_actions) = parse_structured_output(&reply);

    Ok((clean_reply, proposed_actions, true))
}

/// Parse structured JSON output from the model response.
///
/// The model should output JSON in the format:
/// ```json
/// {
///   "reply": "conversational text",
///   "pinchy_actions": [...]
/// }
/// ```
///
/// This function extracts the reply and actions, handling cases where:
/// - The output is wrapped in markdown code blocks
/// - The JSON is embedded in conversational text
/// - The output is pure text (no JSON)
fn parse_structured_output(reply: &str) -> (String, Option<Vec<ProposedAction>>) {
    // Try to find JSON in markdown code blocks
    let json_str = if let Some(start) = reply.find("```json") {
        reply[start + 7..].split("```").next().map(|s| s.trim())
    } else if let Some(start) = reply.find("```") {
        reply[start + 3..].split("```").next().map(|s| s.trim())
    } else if reply.trim().starts_with('{') {
        // Try parsing the entire response as JSON
        Some(reply.trim())
    } else {
        None
    };

    if let Some(json) = json_str {
        match serde_json::from_str::<StructuredActionOutput>(json) {
            Ok(output) => {
                let actions = if output.actions.is_empty() {
                    None
                } else {
                    Some(
                        output
                            .actions
                            .into_iter()
                            .map(|raw| ProposedAction {
                                action_type: raw.action_type,
                                description: raw
                                    .description
                                    .unwrap_or_else(|| "Proposed action".to_string()),
                                params: raw.params,
                            })
                            .collect(),
                    )
                };
                return (output.reply, actions);
            }
            Err(e) => {
                tracing::debug!(error = %e, "Failed to parse structured output, using raw text");
            }
        }
    }

    // Fallback: return raw text with no actions
    (reply.trim().to_string(), None)
}

/// Generate a fallback response when no AI provider is available.
fn generate_fallback_response(
    request: &AssistantChatRequest,
    context: &str,
) -> (String, Option<Vec<ProposedAction>>, bool) {
    let message = request.message.to_lowercase();
    let _scope = &request.scope;

    let reply = if message.contains("hello") || message.contains("hi") {
        format!(
            "Hello! I'm Pinchy, your assistant for managing agents.\n\n{}\n\nI can help you with:\n- Updating agent configuration\n- Editing SOUL.md, TOOLS.md, or HEARTBEAT.md\n- Managing agent memory\n- Searching memory entries\n- Listing all agents\n- Creating new agents\n- Understanding Pinchy concepts\n\nNote: I'm running in fallback mode without an AI model. Connect an AI provider for smarter responses.",
            context
        )
    } else if message.contains("help") {
        "I can help you:\n\n1. **Agent Configuration**: Update model, max_turns, history_messages, enabled_skills, reasoning_effort\n2. **File Management**: Edit SOUL.md (personality), TOOLS.md (capabilities), HEARTBEAT.md (scheduled tasks)\n3. **Memory**: Save, search, or forget agent memory entries\n4. **Agent Management**: List agents, create new agents with initial configuration\n\nWhat would you like to do?".to_string()
    } else if message.contains("model") {
        "Models in Pinchy are configured in config.yaml under the `models` section. Each model needs:\n- `id`: reference identifier\n- `provider`: openai, anthropic, copilot, etc.\n- `model`: the actual model name (e.g., gpt-4o)\n\nAgents reference models by their id in the `model` field.\n\nWould you like me to help update an agent's model configuration?".to_string()
    } else if message.contains("memory") {
        "Pinchy uses SQLite with FTS5 for agent memory. Each agent has its own memory.db in its workspace.\n\nMemory supports:\n- Keyword search (BM25 ranking)\n- Semantic search (vector similarity)\n- Hybrid search (combining both)\n- Tags for organization\n\nI can help you save, search, or delete memory entries.".to_string()
    } else if message.contains("skill") {
        "Skills in Pinchy are modular capabilities defined by SKILL.md manifests. They support:\n\n- Progressive disclosure (load on demand)\n- Auto-pluck rules (keyword-based activation)\n- Tool integration\n\nBuilt-in skills include: browser automation, MCP tool usage, file operations.\n\nAgents enable skills via the `enabled_skills` config field.".to_string()
    } else if message.contains("list") && message.contains("agent") {
        // Try to list agents from config
        if let Ok(agents) = list_agents_from_config_blocking() {
            format!("Here are the configured agents:\n\n{}", agents)
        } else {
            "I couldn't retrieve the agent list right now. Please check your config.yaml file."
                .to_string()
        }
    } else {
        format!(
            "I received your message about '{}'.\n\n{}\n\nI'm currently running in fallback mode without an AI model. For better assistance, please configure an AI provider (OpenAI, Anthropic, Copilot, etc.) in your config.yaml or environment variables.\n\nType 'help' to see what I can assist with.",
            request.message,
            context
        )
    };

    (reply, None, false)
}

/// Blocking helper to list agents for fallback mode.
fn list_agents_from_config_blocking() -> anyhow::Result<String> {
    let config_path = crate::pinchy_home().join("config.yaml");
    let content = std::fs::read_to_string(&config_path)?;

    // Simple YAML parsing to extract agent list
    let mut agents = Vec::new();
    let mut in_agents_section = false;

    for line in content.lines() {
        let trimmed = line.trim();

        if trimmed == "agents:" {
            in_agents_section = true;
            continue;
        }

        if in_agents_section {
            if trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }

            // Check for new top-level section (less indented than agents)
            if !line.starts_with("  ") && !line.starts_with('\t') && !trimmed.is_empty() {
                break;
            }

            // Parse agent entry
            if let Some(id) = trimmed.strip_prefix("id:") {
                let id = id.trim().to_string();
                agents.push(id);
            }
        }
    }

    if agents.is_empty() {
        Ok("No agents configured yet.".to_string())
    } else {
        Ok(agents
            .iter()
            .map(|id| format!("- {}", id))
            .collect::<Vec<_>>()
            .join("\n"))
    }
}

// ---------------------------------------------------------------------------
// Apply Handler
// ---------------------------------------------------------------------------

/// POST /api/assistant/apply
///
/// Executes structured actions against existing Pinchy APIs.
pub(crate) async fn api_assistant_apply(
    Json(body): Json<AssistantApplyRequest>,
) -> impl IntoResponse {
    // Validate the scope
    if let Err(e) = validate_scope(&body.scope) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: e,
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let mut results = Vec::new();
    let mut all_succeeded = true;

    for action in &body.actions {
        // Validate the action before execution
        if let Err(validation_err) = validate_action(action, &body.scope) {
            results.push(ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some(validation_err.to_string()),
                data: None,
            });
            all_succeeded = false;
            continue;
        }

        let result = execute_action(action, &body.scope).await;
        if !result.success {
            all_succeeded = false;
        }
        results.push(result);
    }

    let response = AssistantApplyResponse {
        results,
        all_succeeded,
    };

    (StatusCode::OK, Json(response)).into_response()
}

/// Execute a single action.
async fn execute_action(action: &ActionRequest, scope: &AssistantScope) -> ActionResult {
    match action.action_type.as_str() {
        "update_agent_config" => execute_update_agent_config(action, scope).await,
        "update_agent_file" => execute_update_agent_file(action, scope).await,
        "create_agent" => execute_create_agent(action, scope).await,
        "save_agent_memory" => execute_save_agent_memory(action, scope).await,
        "forget_agent_memory" => execute_forget_agent_memory(action, scope).await,
        "search_agent_memory" => execute_search_agent_memory(action, scope).await,
        "list_agents" => execute_list_agents(action).await,
        "_" => ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some("Unknown action type".to_string()),
            data: None,
        },
        _ => ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Unknown action type: {}", action.action_type)),
            data: None,
        },
    }
}

/// Execute update_agent_config action.
async fn execute_update_agent_config(
    action: &ActionRequest,
    scope: &AssistantScope,
) -> ActionResult {
    // Determine which agent to update
    let agent_id = match get_target_agent_id(action, scope) {
        Some(id) => id,
        None => return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(
                "No agent_id specified. For group scope, you must provide an explicit agent_id."
                    .to_string(),
            ),
            data: None,
        },
    };

    // Validate agent exists
    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Agent '{}' not found", agent_id)),
            data: None,
        };
    }

    // Load and update config
    let config_path = crate::pinchy_home().join("config.yaml");
    let _guard = crate::config::config_lock().await;

    match crate::config::Config::load_unvalidated(&config_path).await {
        Ok(mut cfg) => {
            if let Some(ac) = cfg.agents.iter_mut().find(|a| a.id == agent_id) {
                let mut updated_fields = Vec::new();

                // Update model
                if let Some(model) = action.params.get("model").and_then(|v| v.as_str()) {
                    ac.model = Some(model.to_string());
                    updated_fields.push("model");
                }

                // Update max_turns
                if let Some(max_turns) = action.params.get("max_turns").and_then(|v| v.as_u64()) {
                    ac.max_turns = Some(max_turns as usize);
                    updated_fields.push("max_turns");
                }

                // Update history_messages
                if let Some(history) = action
                    .params
                    .get("history_messages")
                    .and_then(|v| v.as_u64())
                {
                    ac.history_messages = Some(history as usize);
                    updated_fields.push("history_messages");
                }

                // Update enabled_skills
                if let Some(skills) = action
                    .params
                    .get("enabled_skills")
                    .and_then(|v| v.as_array())
                {
                    let skills_vec: Vec<String> = skills
                        .iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect();
                    ac.enabled_skills = if skills_vec.is_empty() {
                        None
                    } else {
                        Some(skills_vec)
                    };
                    updated_fields.push("enabled_skills");
                }

                // Update reasoning_effort
                if let Some(effort) = action
                    .params
                    .get("reasoning_effort")
                    .and_then(|v| v.as_str())
                {
                    ac.reasoning_effort = Some(effort.to_string());
                    updated_fields.push("reasoning_effort");
                }

                // Update heartbeat_secs
                if let Some(hb) = action.params.get("heartbeat_secs") {
                    if hb.is_null() {
                        ac.heartbeat_secs = None;
                        updated_fields.push("heartbeat_secs (disabled)");
                    } else if let Some(secs) = hb.as_u64() {
                        ac.heartbeat_secs = Some(secs);
                        updated_fields.push("heartbeat_secs");
                    }
                }

                // Update max_tool_iterations
                if let Some(mti) = action
                    .params
                    .get("max_tool_iterations")
                    .and_then(|v| v.as_u64())
                {
                    ac.max_tool_iterations = Some(mti as usize);
                    updated_fields.push("max_tool_iterations");
                }

                // Save config
                match cfg.save(&config_path).await {
                    Ok(()) => ActionResult {
                        action_type: action.action_type.clone(),
                        success: true,
                        error: None,
                        data: Some(serde_json::json!({
                            "agent_id": agent_id,
                            "updated_fields": updated_fields
                        })),
                    },
                    Err(e) => ActionResult {
                        action_type: action.action_type.clone(),
                        success: false,
                        error: Some(format!("Failed to save config: {}", e)),
                        data: None,
                    },
                }
            } else {
                // Agent not in config - add it
                let new_ac = crate::config::AgentConfig {
                    id: agent_id.clone(),
                    root: format!("agents/{}", agent_id),
                    model: action
                        .params
                        .get("model")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    max_turns: action
                        .params
                        .get("max_turns")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize),
                    history_messages: action
                        .params
                        .get("history_messages")
                        .and_then(|v| v.as_u64())
                        .map(|v| v as usize),
                    enabled_skills: action
                        .params
                        .get("enabled_skills")
                        .and_then(|v| v.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(String::from))
                                .collect()
                        }),
                    reasoning_effort: action
                        .params
                        .get("reasoning_effort")
                        .and_then(|v| v.as_str())
                        .map(String::from),
                    heartbeat_secs: action.params.get("heartbeat_secs").and_then(|v| {
                        if v.is_null() {
                            None
                        } else {
                            v.as_u64()
                        }
                    }),
                    ..Default::default()
                };
                cfg.agents.push(new_ac);

                match cfg.save(&config_path).await {
                    Ok(()) => ActionResult {
                        action_type: action.action_type.clone(),
                        success: true,
                        error: None,
                        data: Some(serde_json::json!({
                            "agent_id": agent_id,
                            "updated_fields": ["created agent config entry"]
                        })),
                    },
                    Err(e) => ActionResult {
                        action_type: action.action_type.clone(),
                        success: false,
                        error: Some(format!("Failed to save config: {}", e)),
                        data: None,
                    },
                }
            }
        }
        Err(e) => ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Failed to load config: {}", e)),
            data: None,
        },
    }
}

/// Execute update_agent_file action.
async fn execute_update_agent_file(action: &ActionRequest, scope: &AssistantScope) -> ActionResult {
    let agent_id = match get_target_agent_id(action, scope) {
        Some(id) => id,
        None => return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(
                "No agent_id specified. For group scope, you must provide an explicit agent_id."
                    .to_string(),
            ),
            data: None,
        },
    };

    let filename = match action.params.get("filename").and_then(|v| v.as_str()) {
        Some(f) => f,
        None => {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some("filename parameter is required".to_string()),
                data: None,
            }
        }
    };

    // Validate filename
    const ALLOWED_FILES: &[&str] = &["SOUL.md", "TOOLS.md", "HEARTBEAT.md"];
    if !ALLOWED_FILES.contains(&filename) {
        return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!(
                "Invalid filename: {}. Allowed: {:?}",
                filename, ALLOWED_FILES
            )),
            data: None,
        };
    }

    let content = match action.params.get("content").and_then(|v| v.as_str()) {
        Some(c) => c,
        None => {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some("content parameter is required".to_string()),
                data: None,
            }
        }
    };

    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Agent '{}' not found", agent_id)),
            data: None,
        };
    }

    match tokio::fs::write(base.join(filename), content).await {
        Ok(()) => ActionResult {
            action_type: action.action_type.clone(),
            success: true,
            error: None,
            data: Some(serde_json::json!({
                "agent_id": agent_id,
                "filename": filename,
                "bytes_written": content.len()
            })),
        },
        Err(e) => ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Failed to write file: {}", e)),
            data: None,
        },
    }
}

/// Execute create_agent action.
async fn execute_create_agent(action: &ActionRequest, _scope: &AssistantScope) -> ActionResult {
    let id = match action.params.get("id").and_then(|v| v.as_str()) {
        Some(i) => i,
        None => {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some("id parameter is required".to_string()),
                data: None,
            }
        }
    };

    // Validate ID
    if id.is_empty()
        || !id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some("Invalid agent id: must be alphanumeric/hyphen/underscore".to_string()),
            data: None,
        };
    }

    let base = crate::utils::agent_root(id);
    if base.exists() {
        return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Agent '{}' already exists", id)),
            data: None,
        };
    }

    // Create directory structure
    if let Err(e) = tokio::fs::create_dir_all(base.join("workspace").join("sessions")).await {
        return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Failed to create directories: {}", e)),
            data: None,
        };
    }

    // Write default files
    let soul = action
        .params
        .get("soul")
        .and_then(|v| v.as_str())
        .unwrap_or("# New Agent\n\nDescribe this agent's personality here.\n");

    let tools = action
        .params
        .get("tools")
        .and_then(|v| v.as_str())
        .unwrap_or("# Tools\n\n- read\n- write\n- exec\n");

    let heartbeat = action
        .params
        .get("heartbeat")
        .and_then(|v| v.as_str())
        .unwrap_or("# Heartbeat\n\nScheduled task instructions.\n");

    for (name, content) in [
        ("SOUL.md", soul),
        ("TOOLS.md", tools),
        ("HEARTBEAT.md", heartbeat),
    ] {
        if let Err(e) = tokio::fs::write(base.join(name), content).await {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some(format!("Failed to write {}: {}", name, e)),
                data: None,
            };
        }
    }

    // Add to config
    let config_path = crate::pinchy_home().join("config.yaml");
    let _guard = crate::config::config_lock().await;

    if let Ok(mut cfg) = crate::config::Config::load_unvalidated(&config_path).await {
        if !cfg.agents.iter().any(|a| a.id == id) {
            let model = action
                .params
                .get("model")
                .and_then(|v| v.as_str())
                .map(String::from);
            cfg.agents.push(crate::config::AgentConfig {
                id: id.to_string(),
                root: format!("agents/{}", id),
                model,
                ..Default::default()
            });
            let _ = cfg.save(&config_path).await;
        }
    }

    // Seed default skills
    let _ = crate::skills::defaults::seed_defaults(id);

    ActionResult {
        action_type: action.action_type.clone(),
        success: true,
        error: None,
        data: Some(serde_json::json!({
            "id": id,
            "created": true
        })),
    }
}

/// Execute save_agent_memory action.
async fn execute_save_agent_memory(action: &ActionRequest, scope: &AssistantScope) -> ActionResult {
    let agent_id = match get_target_agent_id(action, scope) {
        Some(id) => id,
        None => return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(
                "No agent_id specified. For group scope, you must provide an explicit agent_id."
                    .to_string(),
            ),
            data: None,
        },
    };

    let key = match action.params.get("key").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some("key parameter is required".to_string()),
                data: None,
            }
        }
    };

    let value = match action.params.get("value").and_then(|v| v.as_str()) {
        Some(v) => v,
        None => {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some("value parameter is required".to_string()),
                data: None,
            }
        }
    };

    let tags: Vec<String> = action
        .params
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let workspace = crate::utils::agent_workspace(&agent_id);

    match crate::memory::MemoryStore::open(&workspace) {
        Ok(store) => match store.save(key, value, &tags) {
            Ok(()) => ActionResult {
                action_type: action.action_type.clone(),
                success: true,
                error: None,
                data: Some(serde_json::json!({
                    "agent_id": agent_id,
                    "key": key,
                    "tags": tags
                })),
            },
            Err(e) => ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some(format!("Failed to save memory: {}", e)),
                data: None,
            },
        },
        Err(e) => ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Failed to open memory store: {}", e)),
            data: None,
        },
    }
}

/// Execute forget_agent_memory action.
async fn execute_forget_agent_memory(
    action: &ActionRequest,
    scope: &AssistantScope,
) -> ActionResult {
    let agent_id = match get_target_agent_id(action, scope) {
        Some(id) => id,
        None => return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(
                "No agent_id specified. For group scope, you must provide an explicit agent_id."
                    .to_string(),
            ),
            data: None,
        },
    };

    let key = match action.params.get("key").and_then(|v| v.as_str()) {
        Some(k) => k,
        None => {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some("key parameter is required".to_string()),
                data: None,
            }
        }
    };

    let workspace = crate::utils::agent_workspace(&agent_id);

    match crate::memory::MemoryStore::open(&workspace) {
        Ok(store) => match store.forget(key) {
            Ok(true) => ActionResult {
                action_type: action.action_type.clone(),
                success: true,
                error: None,
                data: Some(serde_json::json!({
                    "agent_id": agent_id,
                    "key": key,
                    "deleted": true
                })),
            },
            Ok(false) => ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some(format!("Key '{}' not found", key)),
                data: None,
            },
            Err(e) => ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some(format!("Failed to forget memory: {}", e)),
                data: None,
            },
        },
        Err(e) => ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Failed to open memory store: {}", e)),
            data: None,
        },
    }
}

/// Execute search_agent_memory action.
async fn execute_search_agent_memory(
    action: &ActionRequest,
    scope: &AssistantScope,
) -> ActionResult {
    let agent_id = match get_target_agent_id(action, scope) {
        Some(id) => id,
        None => return ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(
                "No agent_id specified. For group scope, you must provide an explicit agent_id."
                    .to_string(),
            ),
            data: None,
        },
    };

    let query = match action.params.get("query").and_then(|v| v.as_str()) {
        Some(q) => q,
        None => {
            return ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some("query parameter is required".to_string()),
                data: None,
            }
        }
    };

    let tag = action.params.get("tag").and_then(|v| v.as_str());

    let limit = action
        .params
        .get("limit")
        .and_then(|v| v.as_u64())
        .map(|v| v as usize)
        .unwrap_or(10);

    let workspace = crate::utils::agent_workspace(&agent_id);

    match crate::memory::MemoryStore::open(&workspace) {
        Ok(store) => match store.search(query, tag, limit) {
            Ok(entries) => ActionResult {
                action_type: action.action_type.clone(),
                success: true,
                error: None,
                data: Some(serde_json::json!({
                    "agent_id": agent_id,
                    "query": query,
                    "results": entries,
                    "count": entries.len()
                })),
            },
            Err(e) => ActionResult {
                action_type: action.action_type.clone(),
                success: false,
                error: Some(format!("Failed to search memory: {}", e)),
                data: None,
            },
        },
        Err(e) => ActionResult {
            action_type: action.action_type.clone(),
            success: false,
            error: Some(format!("Failed to open memory store: {}", e)),
            data: None,
        },
    }
}

/// Execute list_agents action.
async fn execute_list_agents(_action: &ActionRequest) -> ActionResult {
    let config_path = crate::pinchy_home().join("config.yaml");

    match crate::config::Config::load(&config_path).await {
        Ok(cfg) => {
            let agents: Vec<serde_json::Value> = cfg
                .agents
                .iter()
                .map(|a| {
                    serde_json::json!({
                        "id": a.id,
                        "root": a.root,
                        "model": a.model,
                        "max_turns": a.max_turns,
                        "enabled_skills": a.enabled_skills,
                    })
                })
                .collect();

            ActionResult {
                action_type: "list_agents".to_string(),
                success: true,
                error: None,
                data: Some(serde_json::json!({
                    "agents": agents,
                    "count": agents.len()
                })),
            }
        }
        Err(e) => ActionResult {
            action_type: "list_agents".to_string(),
            success: false,
            error: Some(format!("Failed to load config: {}", e)),
            data: None,
        },
    }
}

/// Helper to get target agent ID from action params or scope.
///
/// Returns None only when group scope is used without an explicit agent_id
/// and the action requires a single agent target. This forces proper
/// error messages rather than silently targeting the first agent.
fn get_target_agent_id(action: &ActionRequest, scope: &AssistantScope) -> Option<String> {
    // First check params (explicit agent_id always takes precedence)
    if let Some(id) = action.params.get("agent_id").and_then(|v| v.as_str()) {
        return Some(id.to_string());
    }

    // Then check scope
    match scope.scope_type.as_str() {
        "agent" => scope.agent_id.clone(),
        "group" => {
            // For group scope, we do NOT default to the first agent anymore.
            // The action must include explicit agent_id in params.
            // This returns None, which triggers a proper error message.
            None
        }
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_scope_accepts_valid_agent() {
        let scope = AssistantScope {
            scope_type: "agent".to_string(),
            agent_id: Some("test-agent".to_string()),
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        assert!(validate_scope(&scope).is_ok());
    }

    #[test]
    fn validate_scope_rejects_missing_agent_id() {
        let scope = AssistantScope {
            scope_type: "agent".to_string(),
            agent_id: None,
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        assert!(validate_scope(&scope).is_err());
    }

    #[test]
    fn validate_scope_accepts_valid_group() {
        let scope = AssistantScope {
            scope_type: "group".to_string(),
            agent_id: None,
            group_id: Some("group-123".to_string()),
            group_name: Some("Test Group".to_string()),
            group_agent_ids: Some(vec!["agent-1".to_string(), "agent-2".to_string()]),
        };
        assert!(validate_scope(&scope).is_ok());
    }

    #[test]
    fn validate_scope_rejects_invalid_scope_type() {
        let scope = AssistantScope {
            scope_type: "invalid".to_string(),
            agent_id: None,
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        assert!(validate_scope(&scope).is_err());
    }

    #[test]
    fn get_target_agent_id_from_params() {
        let action = ActionRequest {
            action_type: "test".to_string(),
            params: serde_json::json!({ "agent_id": "param-agent" }),
        };
        let scope = AssistantScope {
            scope_type: "agent".to_string(),
            agent_id: Some("scope-agent".to_string()),
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        // Action params should take precedence
        assert_eq!(
            get_target_agent_id(&action, &scope),
            Some("param-agent".to_string())
        );
    }

    #[test]
    fn get_target_agent_id_from_scope() {
        let action = ActionRequest {
            action_type: "test".to_string(),
            params: serde_json::json!({}),
        };
        let scope = AssistantScope {
            scope_type: "agent".to_string(),
            agent_id: Some("scope-agent".to_string()),
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        assert_eq!(
            get_target_agent_id(&action, &scope),
            Some("scope-agent".to_string())
        );
    }

    #[test]
    fn get_target_agent_id_group_requires_explicit() {
        let action = ActionRequest {
            action_type: "test".to_string(),
            params: serde_json::json!({}),
        };
        let scope = AssistantScope {
            scope_type: "group".to_string(),
            agent_id: None,
            group_id: Some("group-1".to_string()),
            group_name: Some("Test Group".to_string()),
            group_agent_ids: Some(vec!["agent-1".to_string(), "agent-2".to_string()]),
        };
        // Should return None for group scope without explicit agent_id
        // (no longer defaulting to first agent)
        assert_eq!(get_target_agent_id(&action, &scope), None);
    }

    #[test]
    fn get_target_agent_id_group_with_explicit() {
        let action = ActionRequest {
            action_type: "test".to_string(),
            params: serde_json::json!({ "agent_id": "agent-2" }),
        };
        let scope = AssistantScope {
            scope_type: "group".to_string(),
            agent_id: None,
            group_id: Some("group-1".to_string()),
            group_name: Some("Test Group".to_string()),
            group_agent_ids: Some(vec!["agent-1".to_string(), "agent-2".to_string()]),
        };
        // Should use the explicit agent_id from params
        assert_eq!(
            get_target_agent_id(&action, &scope),
            Some("agent-2".to_string())
        );
    }

    #[test]
    fn generate_fallback_response_hello() {
        let request = AssistantChatRequest {
            message: "hello".to_string(),
            scope: AssistantScope {
                scope_type: "agent".to_string(),
                agent_id: Some("test".to_string()),
                group_id: None,
                group_name: None,
                group_agent_ids: None,
            },
            history: vec![],
        };
        let (reply, _actions, used_model) = generate_fallback_response(&request, "");
        assert!(!used_model);
        assert!(reply.contains("Pinchy"));
        assert!(reply.contains("fallback mode"));
    }

    #[test]
    fn generate_fallback_response_help() {
        let request = AssistantChatRequest {
            message: "help".to_string(),
            scope: AssistantScope {
                scope_type: "agent".to_string(),
                agent_id: Some("test".to_string()),
                group_id: None,
                group_name: None,
                group_agent_ids: None,
            },
            history: vec![],
        };
        let (reply, _actions, used_model) = generate_fallback_response(&request, "");
        assert!(!used_model);
        assert!(reply.contains("Agent Configuration"));
        assert!(reply.contains("SOUL.md"));
    }

    #[test]
    fn parse_structured_output_with_json() {
        let raw = r#"{"reply": "Hello! I can help you with that.", "pinchy_actions": [{"action_type": "update_agent_config", "params": {"agent_id": "test", "model": "gpt-4o"}}]}"#;
        let (reply, actions) = parse_structured_output(raw);
        assert_eq!(reply, "Hello! I can help you with that.");
        assert!(actions.is_some());
        let actions = actions.unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "update_agent_config");
    }

    #[test]
    fn parse_structured_output_with_markdown() {
        let raw = r#"```json
{"reply": "Let me update that for you.", "pinchy_actions": [{"action_type": "save_agent_memory", "params": {"agent_id": "test", "key": "note", "value": "test"}}]}
```"#;
        let (reply, actions) = parse_structured_output(raw);
        assert_eq!(reply, "Let me update that for you.");
        assert!(actions.is_some());
        let actions = actions.unwrap();
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].action_type, "save_agent_memory");
    }

    #[test]
    fn parse_structured_output_plain_text() {
        let raw = "This is just a plain text response without JSON.";
        let (reply, actions) = parse_structured_output(raw);
        assert_eq!(reply, "This is just a plain text response without JSON.");
        assert!(actions.is_none());
    }

    #[test]
    fn parse_structured_output_empty_actions() {
        let raw = r#"{"reply": "I understand.", "pinchy_actions": []}"#;
        let (reply, actions) = parse_structured_output(raw);
        assert_eq!(reply, "I understand.");
        assert!(actions.is_none());
    }

    #[test]
    fn action_registry_contains_all_actions() {
        let registry = action_registry();
        assert!(registry.contains_key("update_agent_config"));
        assert!(registry.contains_key("update_agent_file"));
        assert!(registry.contains_key("save_agent_memory"));
        assert!(registry.contains_key("forget_agent_memory"));
        assert!(registry.contains_key("search_agent_memory"));
        assert!(registry.contains_key("create_agent"));
        assert!(registry.contains_key("list_agents"));
    }

    #[test]
    fn validate_action_accepts_valid() {
        let action = ActionRequest {
            action_type: "list_agents".to_string(),
            params: serde_json::json!({}),
        };
        let scope = AssistantScope {
            scope_type: "agent".to_string(),
            agent_id: Some("test".to_string()),
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        assert!(validate_action(&action, &scope).is_ok());
    }

    #[test]
    fn validate_action_rejects_unknown() {
        let action = ActionRequest {
            action_type: "unknown_action".to_string(),
            params: serde_json::json!({}),
        };
        let scope = AssistantScope {
            scope_type: "agent".to_string(),
            agent_id: Some("test".to_string()),
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        let result = validate_action(&action, &scope);
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Unknown action"));
    }

    #[test]
    fn validate_action_requires_agent_for_group_scope() {
        let action = ActionRequest {
            action_type: "update_agent_config".to_string(),
            params: serde_json::json!({}),
        };
        let scope = AssistantScope {
            scope_type: "group".to_string(),
            agent_id: None,
            group_id: Some("group-1".to_string()),
            group_name: Some("Test".to_string()),
            group_agent_ids: Some(vec!["agent-1".to_string()]),
        };
        let result = validate_action(&action, &scope);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("requires explicit 'agent_id'"));
    }

    #[test]
    fn validate_action_accepts_group_with_explicit_agent() {
        let action = ActionRequest {
            action_type: "update_agent_config".to_string(),
            params: serde_json::json!({ "agent_id": "agent-1" }),
        };
        let scope = AssistantScope {
            scope_type: "group".to_string(),
            agent_id: None,
            group_id: Some("group-1".to_string()),
            group_name: Some("Test".to_string()),
            group_agent_ids: Some(vec!["agent-1".to_string()]),
        };
        assert!(validate_action(&action, &scope).is_ok());
    }

    #[test]
    fn validate_action_requires_params() {
        let action = ActionRequest {
            action_type: "update_agent_file".to_string(),
            params: serde_json::json!({ "agent_id": "test" }),
        };
        let scope = AssistantScope {
            scope_type: "agent".to_string(),
            agent_id: Some("test".to_string()),
            group_id: None,
            group_name: None,
            group_agent_ids: None,
        };
        let result = validate_action(&action, &scope);
        assert!(result.is_err());
        let err = result.unwrap_err().to_string();
        assert!(err.contains("requires missing parameter"));
    }
}
