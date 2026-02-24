use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

/// `GET /api/skills` — list all loaded skills.
pub(crate) async fn api_skills_list() -> impl IntoResponse {
    let skills = crate::tools::list_skill_entries();
    Json(serde_json::json!({ "skills": skills }))
}

/// `DELETE /api/skills/:name` — delete a skill by name.
pub(crate) async fn api_skills_delete(Path(name): Path<String>) -> impl IntoResponse {
    // Validate name: lowercase alphanumeric + hyphens only.
    if name.is_empty()
        || name.len() > 64
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        || name.starts_with('-')
        || name.ends_with('-')
        || name.contains("--")
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "invalid skill name" })),
        )
            .into_response();
    }

    let agent_id = crate::tools::get_skill_agent_id();
    let agent_id = match agent_id {
        Some(id) => id,
        None => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": "no agent configured" })),
            )
                .into_response();
        }
    };

    let skill_dir = crate::utils::agent_root(&agent_id)
        .join("skills")
        .join(&name);
    if !skill_dir.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": format!("skill '{}' not found", name) })),
        )
            .into_response();
    }

    if let Err(e) = tokio::fs::remove_dir_all(&skill_dir).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("failed to delete skill: {}", e) })),
        )
            .into_response();
    }

    crate::tools::reload_skills(None);

    Json(serde_json::json!({ "status": "deleted", "name": name })).into_response()
}
