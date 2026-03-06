use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use super::super::auth::validate_path_segment;

/// `GET /api/agents/:id/receipts` — list all receipt files for an agent.
pub(crate) async fn api_receipts_list(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // When PinchyDb is available, return session ids that have receipts.
    if let Some(db) = crate::store::global_db() {
        let sessions = db.list_sessions_for_agent(&agent_id).unwrap_or_default();
        let receipt_files: Vec<String> = sessions
            .into_iter()
            .map(|s| format!("{}.receipts.jsonl", s.session_id))
            .collect();
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "receipts": receipt_files })),
        )
            .into_response();
    }

    tracing::warn!("no database available — skipping api_receipts_list");
    (StatusCode::OK, Json(serde_json::json!({ "receipts": [] }))).into_response()
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
    let sid = session_id
        .trim_end_matches(".receipts.jsonl")
        .trim_end_matches(".jsonl")
        .to_string();
    let filename = if session_id.ends_with(".receipts.jsonl") {
        session_id.clone()
    } else {
        format!("{session_id}.receipts.jsonl")
    };

    // Prefer PinchyDb.
    if let Some(db) = crate::store::global_db() {
        let receipts = db.list_receipts_for_session(&sid).unwrap_or_default();
        let receipts_json: Vec<serde_json::Value> = receipts
            .iter()
            .filter_map(|r| serde_json::to_value(r).ok())
            .collect();
        return (
            StatusCode::OK,
            Json(serde_json::json!({ "file": filename, "receipts": receipts_json })),
        )
            .into_response();
    }

    tracing::warn!("no database available — skipping api_receipts_by_session");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(serde_json::json!({ "error": "no database available" })),
    )
        .into_response()
}
