use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use super::super::auth::validate_path_segment;
use super::super::types::*;

/// `GET /api/agents/:id/sessions` — list session files for an agent.
pub(crate) async fn api_sessions_list(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // Prefer PinchyDb when available.
    if let Some(db) = crate::store::global_db() {
        let entries = match db.list_sessions_for_agent(&agent_id) {
            Ok(e) => e,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        };
        let sessions: Vec<SessionItem> = entries
            .into_iter()
            .map(|e| {
                // `created_at` is stored as epoch milliseconds; the frontend
                // sidebar expects `modified` as epoch seconds.
                let modified_secs = (e.created_at / 1000) as i64;
                // Get the exchange count for this session (best effort)
                let message_count = db.exchange_count(&e.session_id).unwrap_or(0);
                SessionItem {
                    file: format!("{}.jsonl", e.session_id),
                    session_id: e.session_id,
                    agent_id: e.agent_id,
                    created_at: e.created_at as i64,
                    modified: modified_secs,
                    title: e.title,
                    message_count,
                }
            })
            .collect();
        return Json(SessionsListResponse { sessions }).into_response();
    }

    tracing::warn!("no database available — skipping api_sessions_list");
    Json(SessionsListResponse { sessions: vec![] }).into_response()
}

/// `GET /api/agents/:id/sessions/:file` — read session content.
pub(crate) async fn api_session_get(
    Path((agent_id, session_file)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    let session_id = session_file.trim_end_matches(".jsonl").to_string();
    let filename = if session_file.ends_with(".jsonl") {
        session_file.clone()
    } else {
        format!("{session_file}.jsonl")
    };

    // Prefer PinchyDb.
    if let Some(db) = crate::store::global_db() {
        let exchanges = match db.load_full_history(&session_id) {
            Ok(ex) => ex,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        };
        if exchanges.is_empty() {
            // Check if session exists at all.
            let sessions = db.list_sessions_for_agent(&agent_id).unwrap_or_default();
            if !sessions.iter().any(|s| s.session_id == session_id) {
                return (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: "session not found".to_string(),
                        id: None,
                        agent_id: None,
                        filename: Some(filename),
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
        let messages: Vec<serde_json::Value> = exchanges
            .into_iter()
            .filter_map(|ex| serde_json::to_value(&ex).ok())
            .collect();
        return (
            StatusCode::OK,
            Json(SessionGetResponse {
                file: filename,
                messages,
            }),
        )
            .into_response();
    }

    tracing::warn!("no database available — skipping api_session_get");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(ErrorResponse {
            error: "no database available".to_string(),
            id: None,
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

/// Request body for PUT session
#[derive(serde::Deserialize)]
pub(crate) struct UpdateSessionRequest {
    messages: Vec<serde_json::Value>,
}

/// `PUT /api/agents/:id/sessions/:file` — overwrite session content.
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
    let session_id = session_file.trim_end_matches(".jsonl").to_string();

    // Try to parse messages into Exchange structs for PinchyDb.
    if let Some(db) = crate::store::global_db() {
        let exchanges: Vec<crate::session::Exchange> = body
            .messages
            .iter()
            .filter_map(|m| serde_json::from_value(m.clone()).ok())
            .collect();
        match db.replace_exchanges(&session_id, &exchanges) {
            Ok(()) => {
                return (
                    StatusCode::OK,
                    Json(SessionUpdateResponse {
                        session_id,
                        saved: true,
                        count: exchanges.len(),
                    }),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
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

    tracing::warn!("no database available — skipping api_session_update");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(ErrorResponse {
            error: "no database available".to_string(),
            id: None,
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

/// `GET /api/agents/:id/session/current` — return the current active session id.
///
/// Prefers the explicit `CURRENT_SESSION` file; falls back to the most
/// recently modified session so the UI always lands on the right one.
pub(crate) async fn api_session_current(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // Prefer PinchyDb.
    let sid = if let Some(db) = crate::store::global_db() {
        db.current_session(&agent_id).ok().flatten()
    } else {
        tracing::warn!("no database available — skipping api_session_current");
        None
    };

    Json(SessionCurrentResponse { session_id: sid }).into_response()
}

/// `DELETE /api/agents/:id/sessions/:file` — delete a session.
pub(crate) async fn api_session_delete(
    Path((agent_id, session_file)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    let session_id = session_file.trim_end_matches(".jsonl").to_string();

    // Delete from PinchyDb.
    if let Some(db) = crate::store::global_db() {
        // Clear current-session pointer if it matches.
        if let Ok(Some(ref cur)) = db.current_session(&agent_id) {
            if *cur == session_id {
                let _ = db.clear_current_session(&agent_id);
            }
        }
        match db.delete_session(&session_id) {
            Ok(true) => {
                return (
                    StatusCode::OK,
                    Json(SessionDeleteResponse {
                        session_id,
                        deleted: true,
                    }),
                )
                    .into_response();
            }
            Ok(false) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: "session not found".to_string(),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
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

    tracing::warn!("no database available — skipping api_session_delete");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(ErrorResponse {
            error: "no database available".to_string(),
            id: None,
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}
