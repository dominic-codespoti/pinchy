use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tracing::{info, warn};

use super::super::auth::validate_path_segment;
use super::super::types::{
    ErrorResponse, TestWebhookRequest, UpdateWebhookConfigRequest, WebhookConfig,
    WebhookConfigResponse, WebhookConfigUpdateResponse, WebhookDeliveriesResponse,
    WebhookDeliveryItem, WebhookIngestResponse, WebhookTestResponse,
};
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
                Json(ErrorResponse {
                    error: format!("config load: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
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
                    Json(ErrorResponse {
                        error: "invalid or missing webhook secret".to_string(),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
    } else {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
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

    if let Err(e) = state
        .commands_tx
        .send(serde_json::to_string(&msg).unwrap_or_default())
        .await
    {
        warn!(error = %e, "failed to dispatch webhook to commands channel");
    }

    // Also publish as a gateway event so WebSocket clients see it.
    publish_event_json(&serde_json::json!({
        "type": "webhook_received",
        "agent_id": agent_id,
        "body": body,
    }));

    (
        StatusCode::ACCEPTED,
        Json(WebhookIngestResponse {
            success: true,
            message: "accepted".to_string(),
        }),
    )
        .into_response()
}

/// `GET /api/agents/:agent_id/webhook/config` — get webhook configuration for an agent.
pub(crate) async fn api_webhook_config_get(
    Path(agent_id): Path<String>,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // Load config to get webhook_secret for this agent.
    let config_path = crate::pinchy_home().join("config.yaml");
    let cfg = match crate::config::Config::load(&config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("config load: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response()
        }
    };

    let agent_cfg = cfg.agents.iter().find(|a| a.id == agent_id);

    if agent_cfg.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let has_secret = agent_cfg.and_then(|a| a.webhook_secret.as_ref()).is_some();

    let config = WebhookConfig {
        enabled: has_secret,
        secret: agent_cfg.and_then(|a| a.webhook_secret.clone()),
        event_types: vec!["*".to_string()], // Default to all events
        url: format!("/api/webhook/{}", agent_id),
    };

    (
        StatusCode::OK,
        Json(WebhookConfigResponse { agent_id, config }),
    )
        .into_response()
}

/// `PUT /api/agents/:agent_id/webhook/config` — update webhook configuration for an agent.
pub(crate) async fn api_webhook_config_update(
    Path(agent_id): Path<String>,
    State(_state): State<AppState>,
    Json(body): Json<UpdateWebhookConfigRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    let config_path = crate::pinchy_home().join("config.yaml");

    // Acquire config lock for safe concurrent modification
    let _guard = crate::config::config_lock().await;

    let mut cfg = match crate::config::Config::load_unvalidated(&config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("config load: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response()
        }
    };

    let agent_idx = cfg.agents.iter().position(|a| a.id == agent_id);
    let Some(idx) = agent_idx else {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };

    // Update the webhook secret based on enabled flag
    if body.enabled {
        // If enabling and no secret provided, generate one
        let secret = body.secret.unwrap_or_else(generate_webhook_secret);
        cfg.agents[idx].webhook_secret = Some(secret);
    } else {
        // If disabling, clear the secret
        cfg.agents[idx].webhook_secret = None;
    }

    // Save the updated config
    if let Err(e) = cfg.save(&config_path).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("config save: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    info!(agent_id = %agent_id, enabled = body.enabled, "updated webhook config");

    (
        StatusCode::OK,
        Json(WebhookConfigUpdateResponse {
            agent_id,
            updated: true,
        }),
    )
        .into_response()
}

/// `GET /api/agents/:agent_id/webhook/deliveries` — list recent webhook deliveries for an agent.
pub(crate) async fn api_webhook_deliveries_get(
    Path(agent_id): Path<String>,
    State(_state): State<AppState>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // TODO: Implement actual webhook delivery logging to database
    // For now, return empty list
    let deliveries: Vec<WebhookDeliveryItem> = vec![];

    (
        StatusCode::OK,
        Json(WebhookDeliveriesResponse {
            agent_id,
            deliveries,
        }),
    )
        .into_response()
}

/// `POST /api/agents/:agent_id/webhook/test` — send a test webhook to an agent.
pub(crate) async fn api_webhook_test(
    Path(agent_id): Path<String>,
    State(state): State<AppState>,
    Json(body): Json<TestWebhookRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // Load config to check if webhook is configured for this agent.
    let config_path = crate::pinchy_home().join("config.yaml");
    let cfg = match crate::config::Config::load(&config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("config load: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response()
        }
    };

    let agent_cfg = cfg.agents.iter().find(|a| a.id == agent_id);

    if agent_cfg.is_none() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "agent not found".to_string(),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Check if webhook is enabled (has a secret configured)
    let secret = agent_cfg.and_then(|a| a.webhook_secret.as_deref());
    if secret.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "webhook not enabled for this agent".to_string(),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Build test payload
    let test_payload = body.payload.unwrap_or_else(|| {
        serde_json::json!({
            "event": body.event_type,
            "test": true,
            "timestamp": std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
            "message": "This is a test webhook from Pinchy"
        })
    });

    // Dispatch as a system message via the commands channel.
    let content = serde_json::to_string(&test_payload).unwrap_or_default();
    let msg = serde_json::json!({
        "type": "message",
        "agent_id": agent_id,
        "channel": format!("webhook:{agent_id}"),
        "content": format!("[webhook test] {content}"),
    });

    if let Err(e) = state
        .commands_tx
        .send(serde_json::to_string(&msg).unwrap_or_default())
        .await
    {
        warn!(error = %e, "failed to dispatch test webhook to commands channel");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("failed to dispatch test: {e}"),
                id: None,
                agent_id: Some(agent_id),
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Publish event
    publish_event_json(&serde_json::json!({
        "type": "webhook_test_sent",
        "agent_id": agent_id,
        "event_type": body.event_type,
        "payload": test_payload,
    }));

    let delivery_id = format!("test-{}", uuid::Uuid::new_v4());

    info!(agent_id = %agent_id, delivery_id = %delivery_id, "sent test webhook");

    (
        StatusCode::OK,
        Json(WebhookTestResponse {
            success: true,
            message: "Test webhook dispatched successfully".to_string(),
            delivery_id: Some(delivery_id),
        }),
    )
        .into_response()
}

/// Generate a random webhook secret
fn generate_webhook_secret() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const LEN: usize = 32;
    let mut rng = rand::thread_rng();
    let secret: String = (0..LEN)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect();
    format!("whsec_{}", secret)
}
