use axum::{
    response::IntoResponse,
    Json,
};

/// `GET /api/skills` — list all loaded skills.
pub(crate) async fn api_skills_list() -> impl IntoResponse {
    let skills = crate::tools::list_skill_entries();
    Json(serde_json::json!({ "skills": skills }))
}
