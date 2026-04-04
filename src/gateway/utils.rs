//! Shared helper functions for gateway handlers to eliminate code duplication.

use axum::{
    async_trait,
    extract::{FromRequestParts, Path},
    http::{request::Parts, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use std::path::PathBuf;

use super::auth::validate_path_segment;
use super::types::ErrorResponse;

// =============================================================================
// Error Response Helpers
// =============================================================================

/// Create a standardized "not found" error response for an agent.
pub(crate) fn not_found_response(agent_id: impl Into<String>) -> Response {
    let id = agent_id.into();
    (
        StatusCode::NOT_FOUND,
        Json(ErrorResponse {
            error: "agent not found".to_string(),
            id: Some(id),
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

/// Create a standardized "bad request" error response.
#[allow(dead_code)]
pub(crate) fn bad_request_response(message: impl Into<String>, id: Option<String>) -> Response {
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: message.into(),
            id,
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

/// Create a standardized "conflict" error response (e.g., agent already exists).
pub(crate) fn conflict_response(message: impl Into<String>, id: impl Into<String>) -> Response {
    (
        StatusCode::CONFLICT,
        Json(ErrorResponse {
            error: message.into(),
            id: Some(id.into()),
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

/// Create a standardized error response for an invalid path segment.
#[allow(dead_code)]
pub(crate) fn invalid_path_response(segment: impl Into<String>) -> Response {
    let segment = segment.into();
    (
        StatusCode::BAD_REQUEST,
        Json(ErrorResponse {
            error: "invalid path segment".to_string(),
            id: Some(segment),
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

// =============================================================================
// Directory Traversal Helpers
// =============================================================================

/// An entry representing an agent directory found during iteration.
pub(crate) struct AgentDirEntry {
    pub agent_id: String,
    pub path: PathBuf,
}

/// Async iterator over agent directories.
///
/// Returns a stream of `AgentDirEntry` for each valid agent directory.
/// Silently skips entries that cannot be read or are not directories.
pub(crate) async fn iter_agents_dir() -> Vec<AgentDirEntry> {
    let agents_dir = crate::utils::agents_dir();
    let mut agents = Vec::new();

    let Ok(mut rd) = tokio::fs::read_dir(agents_dir).await else {
        return agents;
    };

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
        let path = entry.path();

        agents.push(AgentDirEntry { agent_id, path });
    }

    agents
}

/// Collect all agent IDs from the agents directory.
pub(crate) async fn list_agent_ids() -> Vec<String> {
    iter_agents_dir()
        .await
        .into_iter()
        .map(|entry| entry.agent_id)
        .collect()
}

// =============================================================================
// Axum Extractor for Validated Agent IDs
// =============================================================================

/// Axum extractor that validates the `agent_id` path parameter.
///
/// If validation fails, returns a BAD_REQUEST error response.
/// Use this instead of manually calling `validate_path_segment`.
#[allow(dead_code)]
pub(crate) struct ValidatedAgentId(pub String);

#[async_trait]
impl<S> FromRequestParts<S> for ValidatedAgentId
where
    S: Send + Sync,
{
    type Rejection = Response;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Extract the agent_id from the path
        let params: Path<std::collections::HashMap<String, String>> =
            Path::from_request_parts(parts, _state).await.map_err(|_| {
                (
                    StatusCode::BAD_REQUEST,
                    Json(ErrorResponse {
                        error: "missing path parameters".to_string(),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response()
            })?;

        let Some(agent_id) = params.get("agent_id") else {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(ErrorResponse {
                    error: "missing agent_id path parameter".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response());
        };

        // Validate the agent_id
        if let Err(e) = validate_path_segment(agent_id) {
            return Err(e.into_response());
        }

        Ok(ValidatedAgentId(agent_id.clone()))
    }
}

/// Extension trait for easier error handling with path validation.
#[allow(dead_code)]
pub(crate) trait PathValidationExt {
    /// Validates this string as a path segment, returning an error response if invalid.
    #[allow(clippy::result_large_err)]
    fn validate(&self) -> Result<(), Response>;
}

impl PathValidationExt for str {
    fn validate(&self) -> Result<(), Response> {
        if let Err(e) = validate_path_segment(self) {
            Err(e.into_response())
        } else {
            Ok(())
        }
    }
}

/// Convenience function to validate a path segment and return early if invalid.
///
/// # Usage
/// ```rust
/// validate_or_return!(agent_id);
/// // If invalid, returns early with error response
/// // Otherwise, continues
/// ```
#[macro_export]
macro_rules! validate_or_return {
    ($segment:expr) => {
        if let Err(e) = $crate::gateway::auth::validate_path_segment($segment) {
            return e.into_response();
        }
    };
}

/// Convenience function to validate an agent exists and return early if not found.
///
/// # Usage
/// ```rust
/// let base = agent_exists_or_return!(agent_id);
/// // Returns early with 404 if agent doesn't exist
/// // Otherwise returns the PathBuf to agent root
/// ```
#[macro_export]
macro_rules! agent_exists_or_return {
    ($agent_id:expr) => {{
        let base = $crate::utils::agent_root($agent_id);
        if !base.exists() {
            return $crate::gateway::utils::not_found_response($agent_id);
        }
        base
    }};
}

// Re-export macros for convenience within gateway module
#[allow(unused_imports)]
pub(crate) use crate::{agent_exists_or_return, validate_or_return};
