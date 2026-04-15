use axum::{response::IntoResponse, Json};
use std::sync::OnceLock;

use super::super::types::HealthResponse;

pub(crate) static STARTUP_TIME: OnceLock<std::time::Instant> = OnceLock::new();

/// `GET /api/status`
pub(crate) async fn status_handler() -> impl IntoResponse {
    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_secs: 0,
        agents: 0,
    })
}

/// `GET /api/health`
pub(crate) async fn api_health() -> impl IntoResponse {
    let uptime_secs = STARTUP_TIME
        .get()
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);

    let agent_count = crate::utils::agents_dir()
        .read_dir()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .count()
        })
        .unwrap_or(0);

    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_secs,
        agents: agent_count,
    })
}
