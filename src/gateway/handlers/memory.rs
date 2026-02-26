use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use super::super::auth::validate_path_segment;

#[derive(Deserialize)]
pub(crate) struct MemoryQuery {
    pub q: Option<String>,
    pub tag: Option<String>,
    pub limit: Option<usize>,
}

/// `GET /api/agents/:agent_id/memory`
pub(crate) async fn api_memory_list(
    Path(agent_id): Path<String>,
    Query(params): Query<MemoryQuery>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    let workspace = crate::utils::agent_workspace(&agent_id);
    let store = match crate::memory::MemoryStore::open(&workspace) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("memory open: {e}") })),
            )
                .into_response();
        }
    };

    let query = params.q.unwrap_or_default();
    let limit = params.limit.unwrap_or(100);
    let tag = params.tag;

    match tokio::task::spawn_blocking(move || store.search(&query, tag.as_deref(), limit)).await {
        Ok(Ok(entries)) => Json(serde_json::json!({ "entries": entries })).into_response(),
        Ok(Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("memory search: {e}") })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("task join: {e}") })),
        )
            .into_response(),
    }
}

/// `DELETE /api/agents/:agent_id/memory/:key`
pub(crate) async fn api_memory_delete(
    Path((agent_id, key)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    let workspace = crate::utils::agent_workspace(&agent_id);
    let store = match crate::memory::MemoryStore::open(&workspace) {
        Ok(s) => Arc::new(s),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("memory open: {e}") })),
            )
                .into_response();
        }
    };

    match tokio::task::spawn_blocking(move || store.forget(&key)).await {
        Ok(Ok(true)) => Json(serde_json::json!({ "deleted": true })).into_response(),
        Ok(Ok(false)) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": "key not found" })),
        )
            .into_response(),
        Ok(Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("memory forget: {e}") })),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("task join: {e}") })),
        )
            .into_response(),
    }
}
