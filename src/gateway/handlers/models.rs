//! Model discovery handler.
//!
//! `GET /api/models/:config_model_id` — return the list of available models
//! for a configured provider entry.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use super::super::AppState;

/// `GET /api/models/:config_model_id`
///
/// Looks up the model config entry by `id`, builds a provider, and calls
/// `list_models()` to discover available models from that provider's API.
pub(crate) async fn api_models_list(
    State(state): State<AppState>,
    Path(config_model_id): Path<String>,
) -> impl IntoResponse {
    // Load the current config.
    let cfg = match crate::config::Config::load(&state.config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("config load: {e:#}") })),
            )
                .into_response();
        }
    };

    // Find the matching model config entry.
    let model_cfg = match cfg.models.iter().find(|m| m.id == config_model_id) {
        Some(m) => m,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(serde_json::json!({ "error": format!("model config '{config_model_id}' not found") })),
            )
                .into_response();
        }
    };

    // Build a provider from the config entry.
    let model_id = model_cfg.model.as_deref().unwrap_or(&model_cfg.provider);
    let provider = crate::models::build_provider_with_config_fields(
        &model_cfg.provider,
        model_id,
        model_cfg.endpoint.as_deref(),
        model_cfg.api_version.as_deref(),
        model_cfg.embedding_deployment.as_deref(),
        model_cfg.api_key.as_deref(),
        model_cfg.headers.as_ref(),
        None,
    );

    // Call list_models.
    match provider.list_models().await {
        Ok(Some(models)) => (StatusCode::OK, Json(serde_json::json!({ "models": models }))).into_response(),
        Ok(None) => (
            StatusCode::OK,
            Json(serde_json::json!({ "models": null, "message": "provider does not support model discovery" })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(serde_json::json!({ "error": format!("model discovery failed: {e:#}") })),
        )
            .into_response(),
    }
}
