use axum::{
    extract::{Path, Query},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;

use super::super::auth::validate_path_segment;
use super::super::types::{ErrorResponse, MemoryDeleteResponse, MemoryItem, MemoryListResponse};

#[derive(Deserialize)]
pub(crate) struct MemoryQuery {
    pub q: Option<String>,
    pub tag: Option<String>,
    pub limit: Option<usize>,
    /// Search mode: "keyword" (FTS), "semantic" (vector), "hybrid" (RRF fusion).
    pub mode: Option<String>,
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
                Json(ErrorResponse {
                    error: format!("memory open: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    let query = params.q.unwrap_or_default();
    let limit = params.limit.unwrap_or(100);
    let tag = params.tag;
    let mode = params.mode.unwrap_or_default();

    match tokio::task::spawn_blocking(move || match mode.as_str() {
        "semantic" | "hybrid" => store.search_hybrid(&query, tag.as_deref(), limit),
        _ => store.search(&query, tag.as_deref(), limit),
    })
    .await
    {
        Ok(Ok(entries)) => {
            let memory_items: Vec<MemoryItem> = entries
                .into_iter()
                .map(|e| MemoryItem {
                    key: e.key,
                    value: e.value,
                    tags: e.tags,
                    timestamp: e.timestamp,
                    score: e.score,
                })
                .collect();
            Json(MemoryListResponse {
                entries: memory_items,
            })
            .into_response()
        }
        Ok(Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("memory search: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("task join: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
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
                Json(ErrorResponse {
                    error: format!("memory open: {e}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    let key_for_forget = key.clone();
    match tokio::task::spawn_blocking(move || store.forget(&key_for_forget)).await {
        Ok(Ok(true)) => Json(MemoryDeleteResponse {
            deleted: true,
            key: Some(key),
        })
        .into_response(),
        Ok(Ok(false)) => (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "key not found".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
        Ok(Err(e)) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("memory forget: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("task join: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}
