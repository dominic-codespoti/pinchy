use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use super::super::types::*;
use super::super::utils::{conflict_response, not_found_response, validate_or_return};

use serde::Deserialize;

/// Deserialize a JSON field that can be missing, `null`, or a value.
/// - missing key → outer `None` (don't update)
/// - explicit `null` → `Some(None)` (clear the field)
/// - a value → `Some(Some(value))`
fn deserialize_optional_nullable<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Ok(Some(Option::<T>::deserialize(deserializer)?))
}

/// `GET /api/agents` — list all agent directories.
pub(crate) async fn api_agents_list() -> impl IntoResponse {
    let mut agents = Vec::new();

    // Load config to merge agent-level settings.
    let config_path = crate::pinchy_home().join("config.yaml");
    let cfg = crate::config::Config::load(&config_path).await.ok();

    // Use shared helper to iterate agent directories
    let agent_entries = crate::gateway::utils::iter_agents_dir().await;
    for entry in agent_entries {
        let base = entry.path;
        let has_soul = base.join("SOUL.md").exists();
        let has_tools = base.join("TOOLS.md").exists();
        let has_heartbeat = base.join("HEARTBEAT.md").exists();

        let mut item = AgentListItem {
            id: entry.agent_id.clone(),
            has_soul,
            has_tools,
            has_heartbeat,
            last_heartbeat_at: None,
            model: None,
            heartbeat_secs: None,
            max_tool_iterations: None,
            enabled_skills: None,
            cron_jobs_count: None,
            history_messages: None,
            max_turns: None,
            compact_keep_recent_turns: None,
            timezone: None,
            reasoning_effort: None,
        };

        // Merge config fields if available.
        if let Some(ref cfg) = cfg {
            if let Some(ac) = cfg.agents.iter().find(|a| a.id == item.id) {
                item.model = ac.model.clone();
                item.heartbeat_secs = ac.heartbeat_secs;
                item.max_tool_iterations = ac.max_tool_iterations;
                item.enabled_skills = ac.enabled_skills.clone();
                item.cron_jobs_count = crate::store::global_db()
                    .and_then(|db| db.list_cron_jobs(&item.id).ok())
                    .map(|j| j.len());
                item.history_messages = ac.history_messages;
                item.max_turns = ac.max_turns;
                item.compact_keep_recent_turns = ac.compact_keep_recent_turns;
                item.timezone = Some(cfg.resolve_timezone(&item.id).to_string());
                item.reasoning_effort = ac.reasoning_effort.clone();
            }
        }

        // Load real heartbeat timestamp from scheduler status
        if item.has_heartbeat {
            if let Some(status) = crate::scheduler::load_heartbeat_status(&item.id).await {
                item.last_heartbeat_at = status.last_tick;
            }
        }

        agents.push(item);
    }

    agents.sort_by(|a, b| a.id.cmp(&b.id));
    Json(AgentsListResponse { agents })
}

#[derive(serde::Deserialize)]
pub(crate) struct CloneAgentRequest {
    pub new_id: String,
}

/// `POST /api/agents/:id/clone` — clone an agent's definition and configuration.
pub(crate) async fn api_agent_clone(
    Path(agent_id): Path<String>,
    Json(body): Json<CloneAgentRequest>,
) -> impl IntoResponse {
    validate_or_return!(&agent_id);
    validate_or_return!(&body.new_id);

    let src_base = crate::utils::agent_root(&agent_id);
    let dst_base = crate::utils::agent_root(&body.new_id);

    if !src_base.exists() {
        return not_found_response(agent_id);
    }
    if dst_base.exists() {
        return conflict_response("target agent already exists", body.new_id);
    }

    let mut files_cloned = 0i64;
    let mut errors = Vec::new();

    // 1. Create directory structure (fresh workspace, no sessions)
    if let Err(e) = tokio::fs::create_dir_all(dst_base.join("workspace").join("sessions")).await {
        errors.push(format!("create dirs: {e}"));
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AgentCloneResponse {
                id: body.new_id.clone(),
                created: false,
                files_cloned,
                errors,
            }),
        )
            .into_response();
    }

    // 2. Copy SOUL.md, TOOLS.md, HEARTBEAT.md
    for name in ["SOUL.md", "TOOLS.md", "HEARTBEAT.md"] {
        let src = src_base.join(name);
        if src.exists() {
            if let Err(e) = tokio::fs::copy(&src, dst_base.join(name)).await {
                errors.push(format!("copy {name}: {e}"));
            } else {
                files_cloned += 1i64;
            }
        }
    }

    // Return 500 if critical file copies failed (at least one required file failed)
    let critical_files = ["SOUL.md", "TOOLS.md"];
    let has_critical_error = critical_files.iter().any(|name| {
        let src = src_base.join(name);
        src.exists() && errors.iter().any(|e| e.contains(&format!("copy {name}:")))
    });

    if has_critical_error && !errors.is_empty() {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(AgentCloneResponse {
                id: body.new_id.clone(),
                created: false,
                files_cloned,
                errors,
            }),
        )
            .into_response();
    }

    // 3. Clone config entry
    let config_path = crate::pinchy_home().join("config.yaml");
    {
        let _guard = crate::config::config_lock().await;
        match crate::config::Config::load_unvalidated(&config_path).await {
            Ok(mut cfg) => {
                if let Some(ac) = cfg.agents.iter().find(|a| a.id == agent_id).cloned() {
                    let mut new_ac = ac;
                    new_ac.id = body.new_id.clone();
                    new_ac.root = dst_base.to_string_lossy().to_string();
                    // Fresh start: no cron jobs or other session-specific state in config
                    new_ac.cron_jobs = vec![];

                    cfg.agents.push(new_ac);
                    if let Err(e) = cfg.save(&config_path).await {
                        errors.push(format!("save config: {e}"));
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(AgentCloneResponse {
                                id: body.new_id.clone(),
                                created: false,
                                files_cloned,
                                errors,
                            }),
                        )
                            .into_response();
                    }
                }
            }
            Err(e) => {
                let err_msg = format!("failed to load config for agent creation: {e}");
                tracing::warn!(error = %e, "failed to load config for agent creation");
                errors.push(err_msg);
                // Don't fail for config load errors, just warn
            }
        }
    }

    (
        StatusCode::CREATED,
        Json(AgentCloneResponse {
            id: body.new_id,
            created: true,
            files_cloned,
            errors,
        }),
    )
        .into_response()
}

/// `GET /api/agents/:id` — return agent metadata and file contents.
pub(crate) async fn api_agent_get(Path(agent_id): Path<String>) -> impl IntoResponse {
    validate_or_return!(&agent_id);

    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return not_found_response(agent_id);
    }

    let soul = tokio::fs::read_to_string(base.join("SOUL.md")).await.ok();
    let tools = tokio::fs::read_to_string(base.join("TOOLS.md")).await.ok();
    let heartbeat = tokio::fs::read_to_string(base.join("HEARTBEAT.md"))
        .await
        .ok();

    // Count sessions from DB instead of filesystem.
    let session_count = crate::store::global_db()
        .and_then(|db| db.session_count_for_agent(&agent_id).ok())
        .unwrap_or(0);

    let mut detail = AgentDetail {
        id: agent_id.clone(),
        soul,
        tools,
        heartbeat,
        session_count,
        model: None,
        provider: None,
        heartbeat_secs: None,
        max_tool_iterations: None,
        enabled_skills: None,
        history_messages: None,
        max_turns: None,
        compact_keep_recent_turns: None,
        timezone: None,
        reasoning_effort: None,
        watch_paths: Vec::new(),
    };

    // Merge config fields if available.
    let config_path = crate::pinchy_home().join("config.yaml");
    if let Ok(cfg) = crate::config::Config::load(&config_path).await {
        if let Some(ac) = cfg.agents.iter().find(|a| a.id == agent_id) {
            detail.model = ac.model.clone();
            detail.provider = ac.provider.clone();
            detail.heartbeat_secs = ac.heartbeat_secs;
            detail.max_tool_iterations = ac.max_tool_iterations;
            detail.enabled_skills = ac.enabled_skills.clone();
            detail.history_messages = ac.history_messages;
            detail.max_turns = ac.max_turns;
            detail.compact_keep_recent_turns = ac.compact_keep_recent_turns;
            detail.timezone = Some(cfg.resolve_timezone(&agent_id).to_string());
            detail.reasoning_effort = ac.reasoning_effort.clone();
            detail.watch_paths = ac.watch_paths.clone();
        }
    }

    (StatusCode::OK, Json(detail)).into_response()
}

/// Request body for POST /api/agents
#[derive(serde::Deserialize)]
pub(crate) struct CreateAgentRequest {
    id: String,
    #[serde(default)]
    soul: Option<String>,
    #[serde(default)]
    tools: Option<String>,
    #[serde(default)]
    heartbeat: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    heartbeat_secs: Option<u64>,
}

/// `POST /api/agents` — create a new agent workspace skeleton.
pub(crate) async fn api_agent_create(Json(body): Json<CreateAgentRequest>) -> impl IntoResponse {
    // Validate id: alphanumeric, hyphens, underscores only
    if body.id.is_empty()
        || !body
            .id
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "invalid agent id: must be alphanumeric/hyphen/underscore".to_string(),
                id: Some(body.id),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let base = crate::utils::agent_root(&body.id);
    if base.exists() {
        return (
            StatusCode::CONFLICT,
            Json(ErrorResponse {
                error: "agent already exists".to_string(),
                id: Some(body.id.clone()),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Create directory structure
    if let Err(e) = tokio::fs::create_dir_all(base.join("workspace").join("sessions")).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("create dirs: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Write default files
    let soul = body.soul.unwrap_or_else(|| {
        format!(
            "# {}\n\nDescribe this agent's personality, role, and boundaries here.\n",
            body.id
        )
    });
    let tools = body.tools.unwrap_or_else(|| {
        "# Tools\n\nList the tools this agent is allowed to use.\n\n- read\n- write\n- exec\n"
            .to_string()
    });
    let heartbeat = body.heartbeat.unwrap_or_else(|| {
        "# Heartbeat\n\nInstructions the agent executes on each heartbeat tick.\n".to_string()
    });

    for (name, content) in [
        ("SOUL.md", &soul),
        ("TOOLS.md", &tools),
        ("HEARTBEAT.md", &heartbeat),
    ] {
        if let Err(e) = tokio::fs::write(base.join(name), content).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("write {name}: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    }

    // Add the agent to config.yaml.
    let config_path = crate::pinchy_home().join("config.yaml");
    {
        let _guard = crate::config::config_lock().await;
        match crate::config::Config::load_unvalidated(&config_path).await {
            Ok(mut cfg) => {
                if !cfg.agents.iter().any(|a| a.id == body.id) {
                    cfg.agents.push(crate::config::AgentConfig {
                        id: body.id.clone(),
                        root: format!("agents/{}", body.id),
                        model: body.model,
                        provider: None,
                        heartbeat_secs: body.heartbeat_secs,
                        cron_jobs: Vec::new(),
                        max_tool_iterations: None,
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
                    if let Err(e) = cfg.save(&config_path).await {
                        tracing::warn!(error = %e, "failed to save config after agent creation");
                    }
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "failed to load config for agent creation");
            }
        }
    }

    // Seed built-in skills into the new agent's skills folder.
    if let Err(e) = crate::skills::defaults::seed_defaults(&body.id) {
        tracing::warn!(agent = %body.id, error = %e, "failed to seed default skills for new agent");
    }

    (
        StatusCode::CREATED,
        Json(AgentCreateResponse {
            id: body.id,
            created: true,
        }),
    )
        .into_response()
}

/// Request body for PUT /api/agents/:id
#[derive(serde::Deserialize)]
pub(crate) struct UpdateAgentRequest {
    #[serde(default)]
    soul: Option<String>,
    #[serde(default)]
    tools: Option<String>,
    #[serde(default)]
    heartbeat: Option<String>,
    #[serde(default)]
    model: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    /// `null` → disable heartbeat (set to None), missing → don't update, number → update interval.
    #[serde(default, deserialize_with = "deserialize_optional_nullable")]
    heartbeat_secs: Option<Option<u64>>,
    #[serde(default)]
    max_tool_iterations: Option<usize>,
    #[serde(default)]
    enabled_skills: Option<Vec<String>>,
    #[serde(default)]
    max_turns: Option<usize>,
    #[serde(default)]
    compact_keep_recent_turns: Option<usize>,
    #[serde(default)]
    history_messages: Option<usize>,
    #[serde(default)]
    reasoning_effort: Option<String>,
}

/// `PUT /api/agents/:id` — update agent workspace files.
pub(crate) async fn api_agent_update(
    Path(agent_id): Path<String>,
    Json(body): Json<UpdateAgentRequest>,
) -> impl IntoResponse {
    validate_or_return!(&agent_id);

    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return not_found_response(agent_id);
    }

    // Validate enabled_skills against the unified tool registry.
    if let Some(ref skills) = body.enabled_skills {
        if !skills.is_empty() {
            let unknown: Vec<&str> = skills
                .iter()
                .filter(|s| !crate::tools::has_capability(s))
                .map(|s| s.as_str())
                .collect();
            if !unknown.is_empty() {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: format!("unknown skill IDs: {}", unknown.join(", ")),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
    }

    let mut updated = Vec::new();

    if let Some(soul) = &body.soul {
        if let Err(e) = tokio::fs::write(base.join("SOUL.md"), soul).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("write SOUL.md: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
        updated.push("SOUL.md".to_string());
    }

    if let Some(tools) = &body.tools {
        if let Err(e) = tokio::fs::write(base.join("TOOLS.md"), tools).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("write TOOLS.md: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
        updated.push("TOOLS.md".to_string());
    }

    if let Some(heartbeat) = &body.heartbeat {
        if let Err(e) = tokio::fs::write(base.join("HEARTBEAT.md"), heartbeat).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("write HEARTBEAT.md: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
        updated.push("HEARTBEAT.md".to_string());
    }

    // Update config fields if any were provided.
    if body.model.is_some()
        || body.provider.is_some()
        || body.heartbeat_secs.is_some()
        || body.max_tool_iterations.is_some()
        || body.enabled_skills.is_some()
        || body.max_turns.is_some()
        || body.compact_keep_recent_turns.is_some()
        || body.history_messages.is_some()
        || body.reasoning_effort.is_some()
    {
        let config_path = crate::pinchy_home().join("config.yaml");
        let _guard = crate::config::config_lock().await;
        match crate::config::Config::load_unvalidated(&config_path).await {
            Ok(mut cfg) => {
                if let Some(ac) = cfg.agents.iter_mut().find(|a| a.id == agent_id) {
                    if let Some(model) = body.model {
                        ac.model = Some(model);
                        updated.push("model".to_string());
                    }
                    if let Some(provider) = body.provider {
                        ac.provider = Some(provider);
                        updated.push("provider".to_string());
                    }
                    if let Some(hs_opt) = body.heartbeat_secs {
                        // Some(Some(n)) → set interval, Some(None) → disable heartbeat
                        ac.heartbeat_secs = hs_opt;
                        updated.push("heartbeat_secs".to_string());
                    }
                    if let Some(mti) = body.max_tool_iterations {
                        ac.max_tool_iterations = Some(mti);
                        updated.push("max_tool_iterations".to_string());
                    }
                    if let Some(skills) = body.enabled_skills {
                        ac.enabled_skills = if skills.is_empty() {
                            None
                        } else {
                            Some(skills)
                        };
                        updated.push("enabled_skills".to_string());
                    }
                    if let Some(mt) = body.max_turns {
                        ac.max_turns = Some(mt);
                        updated.push("max_turns".to_string());
                    }
                    if let Some(ckrt) = body.compact_keep_recent_turns {
                        ac.compact_keep_recent_turns = Some(ckrt);
                        updated.push("compact_keep_recent_turns".to_string());
                    }
                    if let Some(hm) = body.history_messages {
                        ac.history_messages = Some(hm);
                        updated.push("history_messages".to_string());
                    }
                    if let Some(re) = body.reasoning_effort {
                        ac.reasoning_effort = if re.is_empty() { None } else { Some(re) };
                        updated.push("reasoning_effort".to_string());
                    }
                    if let Err(e) = cfg.save(&config_path).await {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(ErrorResponse {
                                error: format!("save config: {e}"),
                                id: None,
                                agent_id: None,
                                filename: None,
                                allowed: None,
                            }),
                        )
                            .into_response();
                    }
                }
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("load config: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
    }

    (
        StatusCode::OK,
        Json(AgentUpdateResponse {
            id: agent_id,
            updated,
        }),
    )
        .into_response()
}

/// `DELETE /api/agents/:id` — delete an agent workspace.
pub(crate) async fn api_agent_delete(Path(agent_id): Path<String>) -> impl IntoResponse {
    validate_or_return!(&agent_id);

    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return not_found_response(agent_id.clone());
    }

    match tokio::fs::remove_dir_all(&base).await {
        Ok(()) => {
            let config_path = crate::pinchy_home().join("config.yaml");
            let _guard = crate::config::config_lock().await;
            if let Ok(mut cfg) = crate::config::Config::load_unvalidated(&config_path).await {
                cfg.agents.retain(|a| a.id != agent_id);
                if let Err(e) = cfg.save(&config_path).await {
                    tracing::warn!(error = %e, "failed to save config after agent deletion");
                }
            }

            (
                StatusCode::OK,
                Json(AgentDeleteResponse {
                    id: agent_id,
                    deleted: true,
                }),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("delete: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// Agent file API handlers
// ---------------------------------------------------------------------------

/// Allowlisted filenames that can be read/written via the files endpoint.
const ALLOWED_AGENT_FILES: &[&str] = &["SOUL.md", "TOOLS.md", "HEARTBEAT.md"];

/// `GET /api/agents/:id/files/:filename` — read an agent workspace file.
pub(crate) async fn api_agent_file_get(
    Path((agent_id, filename)): Path<(String, String)>,
) -> impl IntoResponse {
    validate_or_return!(&agent_id);
    if !ALLOWED_AGENT_FILES.contains(&filename.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "file not allowed".to_string(),
                id: None,
                agent_id: None,
                filename: Some(filename),
                allowed: Some(ALLOWED_AGENT_FILES.iter().map(|s| s.to_string()).collect()),
            }),
        )
            .into_response();
    }

    let path = crate::utils::agent_root(&agent_id).join(&filename);
    match tokio::fs::read_to_string(&path).await {
        Ok(content) => (
            StatusCode::OK,
            Json(AgentFileGetResponse {
                filename: filename.clone(),
                content,
            }),
        )
            .into_response(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "file not found".to_string(),
                id: None,
                agent_id: None,
                filename: Some(filename),
                allowed: None,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("{e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

/// Request body for PUT agent file
#[derive(serde::Deserialize)]
pub(crate) struct SaveAgentFileRequest {
    content: String,
}

/// `PUT /api/agents/:id/files/:filename` — write an agent workspace file.
pub(crate) async fn api_agent_file_put(
    Path((agent_id, filename)): Path<(String, String)>,
    Json(body): Json<SaveAgentFileRequest>,
) -> impl IntoResponse {
    validate_or_return!(&agent_id);

    if !ALLOWED_AGENT_FILES.contains(&filename.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "file not allowed".to_string(),
                id: None,
                agent_id: None,
                filename: Some(filename),
                allowed: Some(ALLOWED_AGENT_FILES.iter().map(|s| s.to_string()).collect()),
            }),
        )
            .into_response();
    }

    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return not_found_response(agent_id);
    }

    let path = base.join(&filename);
    match tokio::fs::write(&path, &body.content).await {
        Ok(()) => (
            StatusCode::OK,
            Json(AgentFilePutResponse {
                filename: filename.clone(),
                saved: true,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("{e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

/// `POST /api/agents/:id/test` — send a test message to an agent.
pub(crate) async fn api_agent_test(
    Path(agent_id): Path<String>,
    Json(body): Json<TestAgentRequest>,
) -> impl IntoResponse {
    use crate::config::Config;
    use crate::models::send_chat_messages;
    use crate::models::ChatMessage;

    // Validate agent_id
    validate_or_return!(&agent_id);

    // Check if agent exists
    let agent_root = crate::utils::agent_root(&agent_id);
    if !agent_root.exists() {
        return not_found_response(agent_id);
    }

    // Load agent configuration (for potential future use)
    let config_path = crate::pinchy_home().join("config.yaml");
    let _agent_config = Config::load(&config_path)
        .await
        .ok()
        .and_then(|cfg| cfg.agents.into_iter().find(|a| a.id == agent_id));

    // Build system prompt from SOUL.md
    let soul_path = agent_root.join("SOUL.md");
    let soul_content = tokio::fs::read_to_string(&soul_path).await.ok();

    let system_prompt = soul_content
        .unwrap_or_else(|| format!("You are a helpful AI assistant named {}.", agent_id));

    // Build messages for the model
    let mut messages = vec![ChatMessage::system(&system_prompt)];
    messages.push(ChatMessage::user(&body.message));

    // Try to send to model
    match send_chat_messages(&messages).await {
        Ok(reply) => {
            // Estimate token counts (approximate)
            let input_tokens = body.message.len() as u64 / 4;
            let output_tokens = reply.len() as u64 / 4;

            let response = TestAgentResponse {
                response: reply.clone(),
                content: Some(reply),
                usage: Some(TestAgentUsage {
                    input_tokens,
                    output_tokens,
                }),
            };

            (StatusCode::OK, Json(response)).into_response()
        }
        Err(e) => {
            tracing::warn!(error = %e, agent_id = %agent_id, "agent test failed");

            // Return a graceful fallback response
            let response = TestAgentResponse {
                response: format!(
                    "I'm {} (running in fallback mode).\n\nYou said: {}\n\nNote: No AI model is currently configured. Please set up an AI provider (OpenAI, Anthropic, Copilot, etc.) in your config.yaml to enable full responses.",
                    agent_id,
                    body.message
                ),
                content: Some(format!(
                    "Fallback response: Agent {} received your test message.",
                    agent_id
                )),
                usage: Some(TestAgentUsage {
                    input_tokens: body.message.len() as u64 / 4,
                    output_tokens: 0,
                }),
            };

            (StatusCode::OK, Json(response)).into_response()
        }
    }
}

/// Collect agent IDs from the `agents/` directory (directories only).
pub(crate) async fn collect_agent_ids() -> std::io::Result<Vec<String>> {
    let mut ids: Vec<String> = crate::gateway::utils::list_agent_ids().await;
    ids.sort();
    Ok(ids)
}
