use axum::{extract::Path, response::IntoResponse, Json};

pub(crate) async fn api_debug_model_requests_list() -> impl IntoResponse {
    Json(serde_json::json!({
        "requests": crate::agent::list_debug_payloads(),
    }))
}

pub(crate) async fn api_debug_model_request_get(
    Path(request_id): Path<String>,
) -> impl IntoResponse {
    match crate::agent::get_debug_payload(&request_id) {
        Some(payload) => Json(payload).into_response(),
        None => (
            axum::http::StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "debug payload not found"})),
        )
            .into_response(),
    }
}
