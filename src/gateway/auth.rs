use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware,
    response::IntoResponse,
    Json,
};

use super::AppState;

pub(crate) async fn auth_middleware(
    State(state): State<AppState>,
    req: Request<Body>,
    next: middleware::Next,
) -> impl IntoResponse {
    let Some(ref expected) = state.api_token else {
        return next.run(req).await;
    };

    // Accept token from Authorization header OR ?token= query param.
    let header_token = req
        .headers()
        .get(axum::http::header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .map(|s| s.to_string());

    let query_token = req
        .uri()
        .query()
        .and_then(|q| {
            q.split('&')
                .find_map(|pair| pair.strip_prefix("token="))
                .map(|s| s.to_string())
        });

    let provided = header_token.or(query_token);

    match provided {
        Some(ref token) if token == expected => next.run(req).await,
        Some(_) => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "invalid token"})),
        )
            .into_response(),
        None => (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({"error": "missing or invalid Authorization header"})),
        )
            .into_response(),
    }
}

/// Validate that a user-supplied path segment is safe to use in filesystem paths.
/// Rejects empty strings, path separators, parent-directory traversals, and null bytes.
pub(crate) fn validate_path_segment(s: &str) -> Result<(), (StatusCode, Json<serde_json::Value>)> {
    let bad = s.is_empty()
        || s.contains('/')
        || s.contains('\\')
        || s.contains('\0')
        || s == "."
        || s == ".."
        || s.contains("..");
    if bad {
        Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({"error": "invalid path segment", "value": s})),
        ))
    } else {
        Ok(())
    }
}
