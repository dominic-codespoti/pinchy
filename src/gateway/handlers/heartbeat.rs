use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use super::super::auth::validate_path_segment;
use super::super::types::{ErrorResponse, HeartbeatStatusItem, HeartbeatStatusResponse};

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
            let agent_id = entry.file_name().to_string_lossy().to_string();
            if let Some(status) = crate::scheduler::load_heartbeat_status(&agent_id).await {
                statuses.push(heartbeat_status_to_item(&status));
            }
        }
    }

    Json(HeartbeatStatusResponse { agents: statuses })
}

/// `GET /api/heartbeat/status/:agent_id` — heartbeat for one agent.
pub(crate) async fn api_heartbeat_status_one(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    match crate::scheduler::load_heartbeat_status(&agent_id).await {
        Some(status) => {
            let item = heartbeat_status_to_item(&status);
            (StatusCode::OK, Json(item)).into_response()
        }
        None => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "heartbeat status not found".to_string(),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

pub(crate) fn heartbeat_status_to_item(
    s: &crate::scheduler::HeartbeatStatus,
) -> HeartbeatStatusItem {
    let health = match &s.health {
        crate::scheduler::HeartbeatHealth::OK => "OK".to_string(),
        crate::scheduler::HeartbeatHealth::MISSED => "MISSED".to_string(),
        crate::scheduler::HeartbeatHealth::ERROR(e) => format!("ERROR: {e}"),
    };
    HeartbeatStatusItem {
        agent_id: s.agent_id.clone(),
        enabled: s.enabled,
        health,
        last_tick: s.last_tick,
        next_tick: s.next_tick,
        interval_secs: s.interval_secs,
        message_preview: s.message_preview.clone(),
        latest_session: s.latest_session.clone(),
    }
}
