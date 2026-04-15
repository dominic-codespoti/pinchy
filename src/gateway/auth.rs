use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    Json,
};
use subtle::ConstantTimeEq;

use super::types::ErrorResponse;
use super::AppState;

pub(crate) struct GatewayError {
    status: StatusCode,
    body: Box<ErrorResponse>,
}

impl GatewayError {
    fn new(status: StatusCode, body: ErrorResponse) -> Self {
        Self {
            status,
            body: Box::new(body),
        }
    }
}

impl IntoResponse for GatewayError {
    fn into_response(self) -> Response {
        (self.status, Json(*self.body)).into_response()
    }
}

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

    let query_token = req.uri().query().and_then(|q| {
        q.split('&')
            .find_map(|pair| pair.strip_prefix("token="))
            .map(|s| s.to_string())
    });

    let provided = header_token.or(query_token);

    match provided {
        Some(ref token) if constant_time_eq(token.as_bytes(), expected.as_bytes()) => {
            next.run(req).await
        }
        Some(_) => (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "invalid token".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
        None => (
            StatusCode::UNAUTHORIZED,
            Json(ErrorResponse {
                error: "missing or invalid Authorization header".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

/// Constant-time comparison of two byte slices.
///
/// Prevents timing side-channel attacks on API token verification.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    a.ct_eq(b).into()
}

/// Validate that a user-supplied path segment is safe to use in filesystem paths.
/// Rejects empty strings, path separators, parent-directory traversals, and null bytes.
pub(crate) fn validate_path_segment(s: &str) -> Result<(), GatewayError> {
    let bad = s.is_empty()
        || s.contains('/')
        || s.contains('\\')
        || s.contains('\0')
        || s == "."
        || s == ".."
        || s.contains("..");
    if bad {
        Err(GatewayError::new(
            StatusCode::BAD_REQUEST,
            ErrorResponse {
                error: "invalid path segment".to_string(),
                id: Some(s.to_string()),
                agent_id: None,
                filename: None,
                allowed: None,
            },
        ))
    } else {
        Ok(())
    }
}
