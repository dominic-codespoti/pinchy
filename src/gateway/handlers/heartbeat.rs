use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use super::super::types::{HeartbeatStatusItem, HeartbeatStatusResponse};
use super::super::utils::{not_found_response, validate_or_return};

/// `GET /api/heartbeat/status` — list heartbeat status for all agents.
pub(crate) async fn api_heartbeat_status_all() -> impl IntoResponse {
    let mut statuses = Vec::new();

    // Use shared helper to iterate agent directories
    let agent_entries = crate::gateway::utils::iter_agents_dir().await;
    for entry in agent_entries {
        if let Some(status) = crate::scheduler::load_heartbeat_status(&entry.agent_id).await {
            statuses.push(heartbeat_status_to_item(&status));
        }
    }

    Json(HeartbeatStatusResponse { agents: statuses })
}

/// `GET /api/heartbeat/status/:agent_id` — heartbeat for one agent.
pub(crate) async fn api_heartbeat_status_one(Path(agent_id): Path<String>) -> impl IntoResponse {
    validate_or_return!(&agent_id);

    match crate::scheduler::load_heartbeat_status(&agent_id).await {
        Some(status) => {
            let item = heartbeat_status_to_item(&status);
            (StatusCode::OK, Json(item)).into_response()
        }
        None => not_found_response(agent_id),
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
