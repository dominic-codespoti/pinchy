use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};

use super::super::AppState;

/// `GET /api/config` — return the current config as JSON.
pub(crate) async fn api_config_get(State(state): State<AppState>) -> impl IntoResponse {
    match crate::config::Config::load(&state.config_path).await {
        Ok(cfg) => match serde_json::to_value(&cfg) {
            Ok(v) => (StatusCode::OK, Json(v)).into_response(),
            Err(e) => (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("serialize: {e}") })),
            )
                .into_response(),
        },
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e:#}") })),
        )
            .into_response(),
    }
}

/// `PUT /api/config` — validate and save config from JSON body.
pub(crate) async fn api_config_put(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> impl IntoResponse {
    // No legacy normalization — require canonical config shape

    // Try to deserialize into Config to validate.
    let cfg: crate::config::Config = match serde_json::from_value(body) {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({ "error": format!("validation: {e}") })),
            )
                .into_response();
        }
    };

    // Backup existing config before overwriting.
    if state.config_path.exists() {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let mut bak_name = state.config_path.as_os_str().to_os_string();
        bak_name.push(format!(".bak.{ts}"));
        let bak_path = std::path::PathBuf::from(bak_name);
        let _ = tokio::fs::copy(&state.config_path, &bak_path).await;
    }

    match cfg.save(&state.config_path).await {
        Ok(()) => (StatusCode::OK, Json(serde_json::json!({ "saved": true }))).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("{e:#}") })),
        )
            .into_response(),
    }
}
