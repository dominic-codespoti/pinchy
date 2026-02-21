use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use super::super::auth::validate_path_segment;

/// `GET /api/agents` — list all agent directories.
pub(crate) async fn api_agents_list() -> impl IntoResponse {
    let agents_dir = crate::utils::agents_dir();
    let mut agents = Vec::new();

    // Load config to merge agent-level settings.
    let config_path = crate::pinchy_home().join("config.yaml");
    let cfg = crate::config::Config::load(&config_path).await.ok();

    if let Ok(mut rd) = tokio::fs::read_dir(agents_dir).await {
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
            let has_soul = base.join("SOUL.md").exists();
            let has_tools = base.join("TOOLS.md").exists();
            let has_heartbeat = base.join("HEARTBEAT.md").exists();

            let mut entry_json = serde_json::json!({
                "id": id,
                "has_soul": has_soul,
                "has_tools": has_tools,
                "has_heartbeat": has_heartbeat,
            });

            // Merge config fields if available.
            if let Some(ref cfg) = cfg {
                if let Some(ac) = cfg.agents.iter().find(|a| a.id == id) {
                    let m = entry_json.as_object_mut().unwrap();
                    m.insert("model".into(), serde_json::json!(ac.model));
                    m.insert(
                        "heartbeat_secs".into(),
                        serde_json::json!(ac.heartbeat_secs),
                    );
                    m.insert(
                        "max_tool_iterations".into(),
                        serde_json::json!(ac.max_tool_iterations),
                    );
                    m.insert(
                        "enabled_skills".into(),
                        serde_json::json!(ac.enabled_skills),
                    );
                    m.insert(
                        "cron_jobs_count".into(),
                        serde_json::json!(ac.cron_jobs.len()),
                    );
                }
            }

            agents.push(entry_json);
        }
    }

    agents.sort_by(|a, b| {
        a.get("id")
            .and_then(|v| v.as_str())
            .cmp(&b.get("id").and_then(|v| v.as_str()))
    });
    Json(serde_json::json!({ "agents": agents }))
}

/// `GET /api/agents/:id` — return agent metadata and file contents.
pub(crate) async fn api_agent_get(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "id": agent_id })),
        )
            .into_response();
    }

    let soul = tokio::fs::read_to_string(base.join("SOUL.md")).await.ok();
    let tools = tokio::fs::read_to_string(base.join("TOOLS.md")).await.ok();
    let heartbeat = tokio::fs::read_to_string(base.join("HEARTBEAT.md"))
        .await
        .ok();

    // Count sessions
    let sessions_dir = base.join("workspace").join("sessions");
    let session_count = count_files_with_ext(&sessions_dir, "jsonl").await;

    let mut result = serde_json::json!({
        "id": agent_id,
        "soul": soul,
        "tools": tools,
        "heartbeat": heartbeat,
        "session_count": session_count,
    });

    // Merge config fields if available.
    let config_path = crate::pinchy_home().join("config.yaml");
    if let Ok(cfg) = crate::config::Config::load(&config_path).await {
        if let Some(ac) = cfg.agents.iter().find(|a| a.id == agent_id) {
            let m = result.as_object_mut().unwrap();
            m.insert("model".into(), serde_json::json!(ac.model));
            m.insert(
                "heartbeat_secs".into(),
                serde_json::json!(ac.heartbeat_secs),
            );
            m.insert(
                "max_tool_iterations".into(),
                serde_json::json!(ac.max_tool_iterations),
            );
            m.insert(
                "enabled_skills".into(),
                serde_json::json!(ac.enabled_skills),
            );
        }
    }

    (StatusCode::OK, Json(result)).into_response()
}

/// Count files with a specific extension in a directory.
async fn count_files_with_ext(dir: &std::path::Path, ext: &str) -> u32 {
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
            Json(serde_json::json!({ "error": "invalid agent id: must be alphanumeric/hyphen/underscore" })),
        )
            .into_response();
    }

    let base = crate::utils::agent_root(&body.id);
    if base.exists() {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({ "error": "agent already exists", "id": body.id })),
        )
            .into_response();
    }

    // Create directory structure
    if let Err(e) = tokio::fs::create_dir_all(base.join("workspace").join("sessions")).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("create dirs: {e}") })),
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
                Json(serde_json::json!({ "error": format!("write {name}: {e}") })),
            )
                .into_response();
        }
    }

    // Add the agent to config.yaml.
    let config_path = crate::pinchy_home().join("config.yaml");
    {
        let _guard = crate::config::config_lock().await;
        match crate::config::Config::load(&config_path).await {
            Ok(mut cfg) => {
                if !cfg.agents.iter().any(|a| a.id == body.id) {
                    cfg.agents.push(crate::config::AgentConfig {
                        id: body.id.clone(),
                        root: format!("agents/{}", body.id),
                        model: body.model,
                        heartbeat_secs: body.heartbeat_secs,
                        cron_jobs: Vec::new(),
                        max_tool_iterations: None,
                        enabled_skills: None,
                        fallback_models: Vec::new(),
                        webhook_secret: None,
                        extra_exec_commands: Vec::new(),
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

    (
        StatusCode::CREATED,
        Json(serde_json::json!({ "id": body.id, "created": true })),
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
    heartbeat_secs: Option<u64>,
    #[serde(default)]
    max_tool_iterations: Option<usize>,
    #[serde(default)]
    enabled_skills: Option<Vec<String>>,
}

/// `PUT /api/agents/:id` — update agent workspace files.
pub(crate) async fn api_agent_update(
    Path(agent_id): Path<String>,
    Json(body): Json<UpdateAgentRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "id": agent_id })),
        )
            .into_response();
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
                    Json(serde_json::json!({
                        "error": format!("unknown skill IDs: {}", unknown.join(", ")),
                    })),
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
                Json(serde_json::json!({ "error": format!("write SOUL.md: {e}") })),
            )
                .into_response();
        }
        updated.push("SOUL.md");
    }

    if let Some(tools) = &body.tools {
        if let Err(e) = tokio::fs::write(base.join("TOOLS.md"), tools).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("write TOOLS.md: {e}") })),
            )
                .into_response();
        }
        updated.push("TOOLS.md");
    }

    if let Some(heartbeat) = &body.heartbeat {
        if let Err(e) = tokio::fs::write(base.join("HEARTBEAT.md"), heartbeat).await {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("write HEARTBEAT.md: {e}") })),
            )
                .into_response();
        }
        updated.push("HEARTBEAT.md");
    }

    // Update config fields if any were provided.
    if body.model.is_some()
        || body.heartbeat_secs.is_some()
        || body.max_tool_iterations.is_some()
        || body.enabled_skills.is_some()
    {
        let config_path = crate::pinchy_home().join("config.yaml");
        let _guard = crate::config::config_lock().await;
        match crate::config::Config::load(&config_path).await {
            Ok(mut cfg) => {
                if let Some(ac) = cfg.agents.iter_mut().find(|a| a.id == agent_id) {
                    if let Some(model) = body.model {
                        ac.model = Some(model);
                        updated.push("model");
                    }
                    if let Some(hs) = body.heartbeat_secs {
                        ac.heartbeat_secs = Some(hs);
                        updated.push("heartbeat_secs");
                    }
                    if let Some(mti) = body.max_tool_iterations {
                        ac.max_tool_iterations = Some(mti);
                        updated.push("max_tool_iterations");
                    }
                    if let Some(skills) = body.enabled_skills {
                        ac.enabled_skills = if skills.is_empty() {
                            None
                        } else {
                            Some(skills)
                        };
                        updated.push("enabled_skills");
                    }
                    if let Err(e) = cfg.save(&config_path).await {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(serde_json::json!({ "error": format!("save config: {e}") })),
                        )
                            .into_response();
                    }
                }
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(serde_json::json!({ "error": format!("load config: {e}") })),
                )
                    .into_response();
            }
        }
    }

    (
        StatusCode::OK,
        Json(serde_json::json!({ "id": agent_id, "updated": updated })),
    )
        .into_response()
}

/// `DELETE /api/agents/:id` — delete an agent workspace.
pub(crate) async fn api_agent_delete(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "id": agent_id })),
        )
            .into_response();
    }

    match tokio::fs::remove_dir_all(&base).await {
        Ok(()) => {
            let config_path = crate::pinchy_home().join("config.yaml");
            let _guard = crate::config::config_lock().await;
            if let Ok(mut cfg) = crate::config::Config::load(&config_path).await {
                cfg.agents.retain(|a| a.id != agent_id);
                if let Err(e) = cfg.save(&config_path).await {
                    tracing::warn!(error = %e, "failed to save config after agent deletion");
                }
            }

            (
                StatusCode::OK,
                Json(serde_json::json!({ "id": agent_id, "deleted": true })),
            )
                .into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("delete: {e}") })),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// Agent file API handlers
// ---------------------------------------------------------------------------

/// Allowlisted filenames that can be read/written via the files endpoint.
const ALLOWED_AGENT_FILES: &[&str] = &["SOUL.md", "TOOLS.md", "HEARTBEAT.md", "BOOTSTRAP.md"];

/// `GET /api/agents/:id/files/:filename` — read an agent workspace file.
pub(crate) async fn api_agent_file_get(
    Path((agent_id, filename)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if !ALLOWED_AGENT_FILES.contains(&filename.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({ "error": "file not allowed", "allowed": ALLOWED_AGENT_FILES }),
            ),
        )
            .into_response();
    }

    let path = crate::utils::agent_root(&agent_id)
        .join(&filename);
    match tokio::fs::read_to_string(&path).await {
        Ok(content) => (
            StatusCode::OK,
            Json(serde_json::json!({ "filename": filename, "content": content })),
        )
            .into_response(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "file not found", "filename": filename })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e}") })),
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
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if !ALLOWED_AGENT_FILES.contains(&filename.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            Json(
                serde_json::json!({ "error": "file not allowed", "allowed": ALLOWED_AGENT_FILES }),
            ),
        )
            .into_response();
    }

    let base = crate::utils::agent_root(&agent_id);
    if !base.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "id": agent_id })),
        )
            .into_response();
    }

    let path = base.join(&filename);
    match tokio::fs::write(&path, &body.content).await {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({ "filename": filename, "saved": true })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e}") })),
        )
            .into_response(),
    }
}

/// Collect agent IDs from the `agents/` directory (directories only).
pub(crate) async fn collect_agent_ids() -> std::io::Result<Vec<String>> {
    let agents_dir = crate::utils::agents_dir();
    let mut ids = Vec::new();
    let mut rd = tokio::fs::read_dir(agents_dir).await?;
    while let Ok(Some(entry)) = rd.next_entry().await {
        let is_dir = entry
            .file_type()
            .await
            .map(|ft| ft.is_dir())
            .unwrap_or(false);
        if is_dir {
            ids.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    ids.sort();
    Ok(ids)
}
