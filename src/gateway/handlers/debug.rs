use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use super::super::auth::validate_path_segment;
use super::super::types::*;

pub(crate) async fn api_debug_model_requests_list() -> impl IntoResponse {
    Json(DebugPayloadListResponse {
        requests: crate::agent::list_debug_payloads(),
    })
}

pub(crate) async fn api_debug_model_request_get(
    Path(request_id): Path<String>,
) -> impl IntoResponse {
    match crate::agent::get_debug_payload(&request_id) {
        Some(payload) => Json(payload).into_response(),
        None => (
            axum::http::StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "debug payload not found".to_string(),
                id: Some(request_id),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

/// Query parameters for `GET /api/agents/:id/logs`.
#[derive(Debug, Deserialize)]
pub(crate) struct LogsQuery {
    /// Maximum number of log entries to return (default: 100).
    #[serde(default = "default_limit")]
    pub limit: usize,
}

fn default_limit() -> usize {
    100
}

/// `GET /api/agents/:id/logs` — return logs from the agent's session receipts.
///
/// For now, reads from the receipts database and returns structured log entries.
pub(crate) async fn api_agent_logs(
    Path(agent_id): Path<String>,
    Query(params): Query<LogsQuery>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    let db = match crate::store::global_db() {
        Some(db) => db,
        None => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "database not available".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Get all sessions for this agent
    let sessions = match db.list_sessions_for_agent(&agent_id) {
        Ok(sessions) => sessions,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("failed to list sessions: {e}"),
                    id: None,
                    agent_id: Some(agent_id.clone()),
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    let limit = params.limit;
    let mut logs: Vec<LogEntry> = Vec::new();

    // Collect logs from receipts for each session
    for session in sessions {
        let receipts = match db.list_receipts_for_session(&session.session_id) {
            Ok(receipts) => receipts,
            Err(_) => continue, // Skip sessions with errors
        };

        for receipt in receipts {
            // Convert receipt to log entry
            let log_entry = LogEntry {
                timestamp: receipt.started_at,
                level: "info".to_string(),
                agent: receipt.agent.clone(),
                source: session.session_id.clone(),
                message: format!("Turn completed: {}", receipt.reply_summary),
                duration_ms: Some(receipt.duration_ms),
                model: receipt.model_id.clone(),
                tool_calls: receipt.tool_calls.len(),
                tokens: LogTokens {
                    prompt: receipt.tokens.prompt_tokens,
                    completion: receipt.tokens.completion_tokens,
                    total: receipt.tokens.total_tokens,
                },
            };
            logs.push(log_entry);
        }

        // Respect the limit
        if logs.len() >= limit {
            logs.truncate(limit);
            break;
        }
    }

    // Sort by timestamp (newest first)
    logs.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));

    // Re-truncate after sorting if we somehow exceeded limit
    if logs.len() > limit {
        logs.truncate(limit);
    }

    (StatusCode::OK, Json(LogsListResponse { logs })).into_response()
}
