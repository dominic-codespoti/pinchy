use axum::{
    extract::Path,
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use super::super::auth::validate_path_segment;

/// `GET /api/heartbeat/status` — list heartbeat status for all agents.
pub(crate) async fn api_heartbeat_status_all() -> impl IntoResponse {
    let agents_dir = crate::utils::agents_dir();
    let mut statuses = Vec::new();

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
            let ws = entry.path();
            if let Some(status) = crate::scheduler::load_heartbeat_status(&ws).await {
                statuses.push(heartbeat_status_to_json(&status));
            }
        }
    }

    Json(serde_json::json!({ "agents": statuses }))
}

/// `GET /api/heartbeat/status/:agent_id` — heartbeat for one agent.
pub(crate) async fn api_heartbeat_status_one(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    let ws = crate::utils::agent_root(&agent_id);
    match crate::scheduler::load_heartbeat_status(&ws).await {
        Some(status) => (StatusCode::OK, Json(heartbeat_status_to_json(&status))).into_response(),
        None => (
            StatusCode::NOT_FOUND,
            Json(
                serde_json::json!({ "error": "heartbeat status not found", "agent_id": agent_id }),
            ),
        )
            .into_response(),
    }
}

pub(crate) fn heartbeat_status_to_json(s: &crate::scheduler::HeartbeatStatus) -> serde_json::Value {
    let health = match &s.health {
        crate::scheduler::HeartbeatHealth::OK => "OK".to_string(),
        crate::scheduler::HeartbeatHealth::MISSED => "MISSED".to_string(),
        crate::scheduler::HeartbeatHealth::ERROR(e) => format!("ERROR: {e}"),
    };
    serde_json::json!({
        "agent_id": s.agent_id,
        "enabled": s.enabled,
        "health": health,
        "last_tick": s.last_tick,
        "next_tick": s.next_tick,
        "interval_secs": s.interval_secs,
        "message_preview": s.message_preview,
    })
}
