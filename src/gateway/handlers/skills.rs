use std::path::PathBuf;

use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};
use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub(crate) struct CreateSkillBody {
    name: String,
    description: String,
    instructions: String,
}

#[derive(Debug, Deserialize)]
pub(crate) struct UpdateSkillBody {
    description: Option<String>,
    instructions: Option<String>,
}

/// `GET /api/skills` — list all loaded skills.
pub(crate) async fn api_skills_list() -> impl IntoResponse {
    let skills = crate::tools::list_skill_entries();
    Json(serde_json::json!({ "skills": skills }))
}

/// `GET /api/skills/:name` — return full skill details.
pub(crate) async fn api_skills_get(Path(name): Path<String>) -> impl IntoResponse {
    let name = match validate_skill_name(&name) {
        Ok(name) => name,
        Err(resp) => return resp,
    };

    let skill_md_path = match resolve_skill_md_path(&name) {
        Ok(path) => path,
        Err(resp) => return resp,
    };

    let content = match tokio::fs::read_to_string(&skill_md_path).await {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return not_found(&format!("skill '{}' not found", name));
        }
        Err(e) => return internal_error(&format!("failed to read skill: {e}")),
    };

    let (manifest, instructions) = match crate::skills::parse_skill_md(&content) {
        Ok(parts) => parts,
        Err(e) => return internal_error(&format!("failed to parse skill: {e}")),
    };

    let meta: crate::skills::SkillMeta = match serde_yaml_ng::from_str(&manifest) {
        Ok(meta) => meta,
        Err(e) => return internal_error(&format!("failed to parse skill metadata: {e}")),
    };

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "id": meta.name,
            "description": meta.description,
            "operator_managed": meta.operator_managed,
            "license": meta.license,
            "compatibility": meta.compatibility,
            "metadata": meta.metadata,
            "manifest": manifest,
            "instructions": instructions,
            "raw": content,
        })),
    )
        .into_response()
}

/// `POST /api/skills` — create a new custom skill.
pub(crate) async fn api_skills_create(Json(body): Json<CreateSkillBody>) -> impl IntoResponse {
    let name = match validate_skill_name(&body.name) {
        Ok(name) => name,
        Err(resp) => return resp,
    };

    if body.description.trim().is_empty() {
        return bad_request("description is required");
    }
    if body.instructions.trim().is_empty() {
        return bad_request("instructions are required");
    }
    if crate::tools::has_capability(&name) {
        return conflict(&format!("a skill or tool named '{}' already exists", name));
    }

    let skill_md_path = match resolve_skill_md_path(&name) {
        Ok(path) => path,
        Err(resp) => return resp,
    };
    if skill_md_path.exists() {
        return conflict(&format!("skill '{}' already exists", name));
    }

    let skill_dir = match skill_md_path.parent() {
        Some(dir) => dir,
        None => return internal_error("invalid skill path"),
    };

    if let Err(e) = tokio::fs::create_dir_all(skill_dir).await {
        return internal_error(&format!("failed to create skill directory: {e}"));
    }

    let meta = crate::skills::SkillMeta {
        name: name.clone(),
        description: body.description.trim().to_string(),
        license: None,
        compatibility: None,
        metadata: None,
        operator_managed: None,
    };
    let manifest = match serialize_skill_manifest(&meta) {
        Ok(manifest) => manifest,
        Err(e) => return internal_error(&format!("failed to serialize skill manifest: {e}")),
    };
    let skill_md = format!("---\n{}\n---\n\n{}\n", manifest, body.instructions.trim());

    if let Err(e) = tokio::fs::write(&skill_md_path, skill_md).await {
        return internal_error(&format!("failed to write skill: {e}"));
    }

    crate::tools::reload_skills(None);

    (
        StatusCode::CREATED,
        Json(serde_json::json!({
            "id": name,
            "created": true,
        })),
    )
        .into_response()
}

/// `PUT /api/skills/:name` — update an existing custom skill.
pub(crate) async fn api_skills_update(
    Path(name): Path<String>,
    Json(body): Json<UpdateSkillBody>,
) -> impl IntoResponse {
    let name = match validate_skill_name(&name) {
        Ok(name) => name,
        Err(resp) => return resp,
    };

    if body.description.is_none() && body.instructions.is_none() {
        return bad_request("provide at least one of description or instructions");
    }

    let skill_md_path = match resolve_skill_md_path(&name) {
        Ok(path) => path,
        Err(resp) => return resp,
    };

    let content = match tokio::fs::read_to_string(&skill_md_path).await {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return not_found(&format!("skill '{}' not found", name));
        }
        Err(e) => return internal_error(&format!("failed to read skill: {e}")),
    };

    let (manifest, old_instructions) = match crate::skills::parse_skill_md(&content) {
        Ok(parts) => parts,
        Err(e) => return internal_error(&format!("failed to parse skill: {e}")),
    };

    let mut meta: crate::skills::SkillMeta = match serde_yaml_ng::from_str(&manifest) {
        Ok(meta) => meta,
        Err(e) => return internal_error(&format!("failed to parse skill metadata: {e}")),
    };

    if meta.operator_managed.unwrap_or(false) {
        return forbidden("operator-managed skills are read-only");
    }

    if let Some(ref description) = body.description {
        if description.trim().is_empty() {
            return bad_request("description must not be empty");
        }
        meta.description = description.trim().to_string();
    }

    let instructions = match body.instructions {
        Some(ref instructions) => {
            if instructions.trim().is_empty() {
                return bad_request("instructions must not be empty");
            }
            instructions.trim().to_string()
        }
        None => old_instructions,
    };

    let manifest = match serialize_skill_manifest(&meta) {
        Ok(manifest) => manifest,
        Err(e) => return internal_error(&format!("failed to serialize skill manifest: {e}")),
    };
    let skill_md = format!("---\n{}\n---\n\n{}\n", manifest, instructions);

    if let Err(e) = tokio::fs::write(&skill_md_path, skill_md).await {
        return internal_error(&format!("failed to write skill: {e}"));
    }

    crate::tools::reload_skills(None);

    (
        StatusCode::OK,
        Json(serde_json::json!({
            "id": name,
            "updated": true,
        })),
    )
        .into_response()
}

/// `DELETE /api/skills/:name` — delete a skill by name.
pub(crate) async fn api_skills_delete(Path(name): Path<String>) -> impl IntoResponse {
    let name = match validate_skill_name(&name) {
        Ok(name) => name,
        Err(resp) => return resp,
    };

    let skill_md_path = match resolve_skill_md_path(&name) {
        Ok(path) => path,
        Err(resp) => return resp,
    };
    let skill_dir = match skill_md_path.parent() {
        Some(dir) => dir.to_path_buf(),
        None => return internal_error("invalid skill path"),
    };

    let content = match tokio::fs::read_to_string(&skill_md_path).await {
        Ok(content) => content,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            return not_found(&format!("skill '{}' not found", name));
        }
        Err(e) => return internal_error(&format!("failed to read skill: {e}")),
    };

    let (manifest, _) = match crate::skills::parse_skill_md(&content) {
        Ok(parts) => parts,
        Err(e) => return internal_error(&format!("failed to parse skill: {e}")),
    };
    let meta: crate::skills::SkillMeta = match serde_yaml_ng::from_str(&manifest) {
        Ok(meta) => meta,
        Err(e) => return internal_error(&format!("failed to parse skill metadata: {e}")),
    };

    if meta.operator_managed.unwrap_or(false) {
        return forbidden("operator-managed skills cannot be deleted");
    }

    if let Err(e) = tokio::fs::remove_dir_all(&skill_dir).await {
        return internal_error(&format!("failed to delete skill: {e}"));
    }

    crate::tools::reload_skills(None);

    Json(serde_json::json!({ "status": "deleted", "name": name })).into_response()
}

#[allow(clippy::result_large_err)]
fn validate_skill_name(name: &str) -> Result<String, axum::response::Response> {
    if name.is_empty()
        || name.len() > 64
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        || name.starts_with('-')
        || name.ends_with('-')
        || name.contains("--")
    {
        return Err(bad_request("invalid skill name"));
    }
    Ok(name.to_string())
}

#[allow(clippy::result_large_err)]
fn resolve_skill_md_path(name: &str) -> Result<PathBuf, axum::response::Response> {
    let agent_id =
        crate::tools::get_skill_agent_id().ok_or_else(|| internal_error("no agent configured"))?;
    Ok(crate::utils::agent_root(&agent_id)
        .join("skills")
        .join(name)
        .join("SKILL.md"))
}

fn serialize_skill_manifest(meta: &crate::skills::SkillMeta) -> anyhow::Result<String> {
    Ok(serde_yaml_ng::to_string(meta)?.trim_end().to_string())
}

fn bad_request(message: &str) -> axum::response::Response {
    (
        StatusCode::BAD_REQUEST,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

fn conflict(message: &str) -> axum::response::Response {
    (
        StatusCode::CONFLICT,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

fn forbidden(message: &str) -> axum::response::Response {
    (
        StatusCode::FORBIDDEN,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

fn not_found(message: &str) -> axum::response::Response {
    (
        StatusCode::NOT_FOUND,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}

fn internal_error(message: &str) -> axum::response::Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": message })),
    )
        .into_response()
}
