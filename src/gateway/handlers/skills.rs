use axum::{
    extract::{Json, Path},
    http::StatusCode,
    response::IntoResponse,
};

/// `GET /api/skills` — list all loaded skills.
pub(crate) async fn api_skills_list() -> impl IntoResponse {
    let skills = crate::tools::list_skill_entries();
    Json(serde_json::json!({ "skills": skills }))
}

/// Request body for `POST /api/skills` — create a new skill.
#[derive(serde::Deserialize)]
pub(crate) struct CreateSkillRequest {
    pub name: String,
    pub description: String,
    pub instructions: String,
}

/// `GET /api/skills/:name` — get a single skill with full details.
pub(crate) async fn api_skills_get(Path(name): Path<String>) -> impl IntoResponse {
    // Validate name
    if let Err(e) = crate::skills::validate_skill_name(&name) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
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
    let skill_md_path = skill_dir.join("SKILL.md");

    if !skill_md_path.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": format!("skill '{}' not found", name) })),
        )
            .into_response();
    }

    let content = match tokio::fs::read_to_string(&skill_md_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to read skill: {}", e) })),
            )
                .into_response();
        }
    };

    let (yaml_frontmatter, instructions) = match crate::skills::parse_skill_md(&content) {
        Ok((y, b)) => (y, b),
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to parse skill: {}", e) })),
            )
                .into_response();
        }
    };

    let meta: crate::skills::SkillMeta = match serde_yaml_ng::from_str(&yaml_frontmatter) {
        Ok(m) => m,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to parse frontmatter: {}", e) })),
            )
                .into_response();
        }
    };

    // Gather reference files if any
    let mut reference_files: Vec<String> = Vec::new();
    if let Ok(mut entries) = tokio::fs::read_dir(&skill_dir).await {
        while let Ok(Some(entry)) = entries.next_entry().await {
            let file_name = entry.file_name();
            let file_name_str = file_name.to_string_lossy();
            if file_name_str != "SKILL.md" {
                reference_files.push(file_name_str.to_string());
            }
        }
    }

    let response = serde_json::json!({
        "id": name,
        "description": meta.description,
        "instructions": instructions,
        "operator_managed": meta.operator_managed.unwrap_or(false),
        "allowed_tools": meta.allowed_tools,
        "reference_files": reference_files,
    });

    (StatusCode::OK, Json(response)).into_response()
}

/// `POST /api/skills` — create a new skill.
pub(crate) async fn api_skills_create(Json(body): Json<CreateSkillRequest>) -> impl IntoResponse {
    // Validate name
    if let Err(e) = crate::skills::validate_skill_name(&body.name) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
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
        .join(&body.name);
    let skill_md_path = skill_dir.join("SKILL.md");

    // Check skill doesn't already exist
    if skill_md_path.exists() {
        return (
            StatusCode::CONFLICT,
            Json(serde_json::json!({
                "error": format!("skill '{}' already exists", body.name)
            })),
        )
            .into_response();
    }

    // Create directory
    if let Err(e) = tokio::fs::create_dir_all(&skill_dir).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("failed to create directory: {}", e) })),
        )
            .into_response();
    }

    // Write SKILL.md
    let skill_md = format!(
        "---\nname: {}\ndescription: \"{}\"\n---\n\n{}\n",
        body.name, body.description, body.instructions
    );

    if let Err(e) = tokio::fs::write(&skill_md_path, skill_md).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("failed to write skill: {}", e) })),
        )
            .into_response();
    }

    crate::tools::reload_skills(None);

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "status": "created",
            "name": body.name
        })),
    )
        .into_response()
}

/// Request body for `PUT /api/skills/:name` — update an existing skill.
#[derive(serde::Deserialize)]
pub(crate) struct UpdateSkillRequest {
    pub description: Option<String>,
    pub instructions: Option<String>,
}

/// `PUT /api/skills/:name` — update an existing skill.
pub(crate) async fn api_skills_update(
    Path(name): Path<String>,
    Json(body): Json<UpdateSkillRequest>,
) -> impl IntoResponse {
    // Validate name
    if let Err(e) = crate::skills::validate_skill_name(&name) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        )
            .into_response();
    }

    // At least one field must be provided
    if body.description.is_none() && body.instructions.is_none() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "at least one of 'description' or 'instructions' is required" })),
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
    let skill_md_path = skill_dir.join("SKILL.md");

    if !skill_md_path.exists() {
        return (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({ "error": format!("skill '{}' not found", name) })),
        )
            .into_response();
    }

    // Read existing SKILL.md
    let existing = match tokio::fs::read_to_string(&skill_md_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "error": format!("failed to read skill: {}", e) })),
            )
                .into_response();
        }
    };

    // Parse existing frontmatter and body
    let (old_yaml, old_body) = crate::skills::parse_skill_md(&existing)
        .unwrap_or_else(|_| (String::new(), existing.clone()));

    // Parse existing frontmatter as YAML
    let mut meta: serde_yaml_ng::Value = serde_yaml_ng::from_str(&old_yaml)
        .unwrap_or_else(|_| serde_yaml_ng::Value::Mapping(Default::default()));

    // Update description if provided
    if let Some(desc) = body.description {
        meta["description"] = serde_yaml_ng::Value::String(desc);
    }

    // Use new instructions or keep old body
    let new_body = body.instructions.unwrap_or(old_body);

    // Re-serialize
    let new_yaml = serde_yaml_ng::to_string(&meta).unwrap_or(old_yaml);
    let new_yaml = new_yaml.trim_end();

    let skill_md = format!("---\n{}\n---\n\n{}\n", new_yaml, new_body);

    // Write back to disk
    if let Err(e) = tokio::fs::write(&skill_md_path, skill_md).await {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": format!("failed to write skill: {}", e) })),
        )
            .into_response();
    }

    crate::tools::reload_skills(None);

    Json(serde_json::json!({
        "status": "updated",
        "name": name
    }))
    .into_response()
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
