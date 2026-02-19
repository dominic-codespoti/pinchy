use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use super::super::auth::validate_path_segment;

/// `GET /api/agents/:id/receipts` — list all receipt files for an agent.
pub(crate) async fn api_receipts_list(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let sessions_dir = crate::pinchy_home()
        .join("agents")
        .join(&agent_id)
        .join("workspace")
        .join("sessions");

    let mut receipt_files: Vec<String> = Vec::new();
    if let Ok(mut rd) = tokio::fs::read_dir(&sessions_dir).await {
        while let Ok(Some(entry)) = rd.next_entry().await {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.ends_with(".receipts.jsonl") {
                receipt_files.push(name);
            }
        }
    }
    receipt_files.sort();
    (StatusCode::OK, Json(serde_json::json!({ "receipts": receipt_files }))).into_response()
}

/// `GET /api/agents/:id/receipts/:session_id` — return parsed receipts
/// for a session (or `receipts` for the catch-all file).
pub(crate) async fn api_receipts_by_session(
    Path((agent_id, session_id)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_id) {
        return e.into_response();
    }
    let filename = if session_id.ends_with(".receipts.jsonl") {
        session_id.clone()
    } else {
        format!("{session_id}.receipts.jsonl")
    };

    let path = crate::pinchy_home()
        .join("agents")
        .join(&agent_id)
        .join("workspace")
        .join("sessions")
        .join(&filename);

    match tokio::fs::read_to_string(&path).await {
        Ok(content) => {
            let receipts: Vec<serde_json::Value> = content
                .lines()
                .filter(|l| !l.trim().is_empty())
                .filter_map(|l| serde_json::from_str(l).ok())
                .collect();
            (
                StatusCode::OK,
                Json(serde_json::json!({ "file": filename, "receipts": receipts })),
            )
                .into_response()
        }
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "receipts not found", "file": filename })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e}") })),
        )
            .into_response(),
    }
}
