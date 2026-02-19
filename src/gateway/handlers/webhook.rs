use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::warn;

use super::super::auth::validate_path_segment;
use super::super::{publish_event_json, AppState};

/// Query params for webhook endpoint.
#[derive(serde::Deserialize, Default)]
pub(crate) struct WebhookQuery {
    secret: Option<String>,
}

/// `POST /api/webhook/:agent_id` — receive an external event and dispatch
/// it as a system message to the specified agent.
pub(crate) async fn api_webhook_ingest(
    Path(agent_id): Path<String>,
    query: Query<WebhookQuery>,
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // Load config to check webhook_secret for this agent.
    let cfg = match crate::config::Config::load(&state.config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("config load: {e}") })),
            )
                .into_response()
        }
    };

    let agent_cfg = cfg.agents.iter().find(|a| a.id == agent_id);

    // Validate secret if the agent has one configured.
    if let Some(ac) = agent_cfg {
        if let Some(ref expected_secret) = ac.webhook_secret {
            let provided = query.secret.as_deref().unwrap_or("");
            if provided != expected_secret {
                return (
                    StatusCode::UNAUTHORIZED,
                    Json(serde_json::json!({ "error": "invalid or missing webhook secret" })),
                )
                    .into_response();
            }
        }
    } else {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "agent not found", "agent_id": agent_id })),
        )
            .into_response();
    }

    // Dispatch as a system message via the commands channel.
    let content = serde_json::to_string(&body).unwrap_or_default();
    let msg = serde_json::json!({
        "type": "message",
        "agent_id": agent_id,
        "channel": format!("webhook:{agent_id}"),
        "content": format!("[webhook] {content}"),
    });

    if let Err(e) = state.commands_tx.send(serde_json::to_string(&msg).unwrap_or_default()).await {
        warn!(error = %e, "failed to dispatch webhook to commands channel");
    }

    // Also publish as a gateway event so WebSocket clients see it.
    publish_event_json(&serde_json::json!({
        "type": "webhook_received",
        "agent_id": agent_id,
        "body": body,
    }));

    (StatusCode::ACCEPTED, Json(serde_json::json!({ "status": "accepted" }))).into_response()
}
