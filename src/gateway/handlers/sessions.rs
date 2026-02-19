use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use super::super::auth::validate_path_segment;

/// `GET /api/agents/:id/sessions` — list session files for an agent.
pub(crate) async fn api_sessions_list(Path(agent_id): Path<String>) -> impl IntoResponse {
    let sessions_dir = crate::utils::agent_workspace(&agent_id)
        .join("sessions");

    if !sessions_dir.exists() {
        return Json(serde_json::json!({ "sessions": [] })).into_response();
    }

    let mut sessions = Vec::new();
    if let Ok(mut rd) = tokio::fs::read_dir(&sessions_dir).await {
        while let Ok(Some(entry)) = rd.next_entry().await {
            let path = entry.path();
            if path.extension().map(|e| e == "jsonl").unwrap_or(false) {
                let filename = entry.file_name().to_string_lossy().to_string();
                let session_id = path
                    .file_stem()
                    .map(|s| s.to_string_lossy().to_string())
                    .unwrap_or_default();
                let size = tokio::fs::metadata(&path)
                    .await
                    .map(|m| m.len())
                    .unwrap_or(0);
                let modified = tokio::fs::metadata(&path)
                    .await
                    .ok()
                    .and_then(|m| m.modified().ok())
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                sessions.push(serde_json::json!({
                    "file": filename,
                    "session_id": session_id,
                    "size": size,
                    "modified": modified,
                }));
            }
        }
    }

    sessions.sort_by(|a, b| {
        b.get("modified")
            .and_then(|v| v.as_u64())
            .cmp(&a.get("modified").and_then(|v| v.as_u64()))
    });

    Json(serde_json::json!({ "sessions": sessions })).into_response()
}

/// `GET /api/agents/:id/sessions/:file` — read session JSONL content.
pub(crate) async fn api_session_get(
    Path((agent_id, session_file)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    // Ensure .jsonl extension
    let filename = if session_file.ends_with(".jsonl") {
        session_file.clone()
    } else {
        format!("{session_file}.jsonl")
    };

    let path = crate::utils::agent_workspace(&agent_id)
        .join("sessions")
        .join(&filename);

    match tokio::fs::read_to_string(&path).await {
        Ok(content) => {
            let messages: Vec<serde_json::Value> = content
                .lines()
                .filter(|l| !l.trim().is_empty())
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            (
                StatusCode::OK,
                Json(serde_json::json!({ "file": filename, "messages": messages })),
            )
                .into_response()
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "session not found", "file": filename })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e}") })),
        )
            .into_response(),
    }
}

/// Request body for PUT session
#[derive(serde::Deserialize)]
pub(crate) struct UpdateSessionRequest {
    messages: Vec<serde_json::Value>,
}

/// `PUT /api/agents/:id/sessions/:file` — overwrite session JSONL content.
pub(crate) async fn api_session_update(
    Path((agent_id, session_file)): Path<(String, String)>,
    Json(body): Json<UpdateSessionRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    let filename = if session_file.ends_with(".jsonl") {
        session_file.clone()
    } else {
        format!("{session_file}.jsonl")
    };

    let sessions_dir = crate::utils::agent_workspace(&agent_id)
        .join("sessions");

    if let Err(e) = tokio::fs::create_dir_all(&sessions_dir).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("create dirs: {e}") })),
        )
            .into_response();
    }

    let path = sessions_dir.join(&filename);

    // Serialize messages as JSONL
    let mut content = String::new();
    for msg in &body.messages {
        match serde_json::to_string(msg) {
            Ok(line) => {
                content.push_str(&line);
                content.push('\n');
            }
            Err(e) => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(serde_json::json!({ "error": format!("serialize message: {e}") })),
                )
                    .into_response();
            }
        }
    }

    match tokio::fs::write(&path, &content).await {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({ "file": filename, "saved": true, "count": body.messages.len() })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e}") })),
        )
            .into_response(),
    }
}

/// `GET /api/agents/:id/session/current` — return the current active session id.
pub(crate) async fn api_session_current(
    Path(agent_id): Path<String>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let path = crate::pinchy_home()
        .join("agents")
        .join(&agent_id)
        .join("workspace")
        .join("CURRENT_SESSION");
    match tokio::fs::read_to_string(&path).await {
        Ok(content) => {
            let sid = content.trim().to_string();
            let sid_val = if sid.is_empty() {
                serde_json::Value::Null
            } else {
                serde_json::Value::String(sid)
            };
            Json(serde_json::json!({ "session_id": sid_val })).into_response()
        }
        Err(_) => Json(serde_json::json!({ "session_id": null })).into_response(),
    }
}

/// `DELETE /api/agents/:id/sessions/:file` — delete a session file.
pub(crate) async fn api_session_delete(
    Path((agent_id, session_file)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    let filename = if session_file.ends_with(".jsonl") {
        session_file.clone()
    } else {
        format!("{session_file}.jsonl")
    };

    let path = crate::utils::agent_workspace(&agent_id)
        .join("sessions")
        .join(&filename);

    match tokio::fs::remove_file(&path).await {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({ "file": filename, "deleted": true })),
        )
            .into_response(),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "session not found", "file": filename })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e}") })),
        )
            .into_response(),
    }
}
