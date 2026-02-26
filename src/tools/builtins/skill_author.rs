//! Skill self-authoring tools — lets the agent create, edit, delete, and
//! activate skills at runtime.
//!
//! Tools exposed:
//! - `activate_skill { name }` — load full skill instructions on demand (progressive disclosure)
//! - `create_skill { name, description, instructions }` — write SKILL.md
//! - `list_skills {}` — return the agent's current skill catalogue
//! - `edit_skill { name, description?, instructions? }` — update a skill
//! - `delete_skill { name }` — remove a skill

use std::path::Path;

use serde_json::Value;

use crate::tools::register_tool;
use crate::tools::ToolMeta;

/// `activate_skill` tool — load full instructions for a skill (progressive disclosure).
pub async fn activate_skill(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("activate_skill requires a 'name' string"))?;

    match crate::tools::get_skill_instructions(name) {
        Some(instructions) => Ok(serde_json::json!({
            "status": "instructions_loaded",
            "name": name,
            "instructions": instructions,
            "IMPORTANT": "These are INSTRUCTIONS, not results. You have NOT performed any action yet. \
                          NOW use the appropriate tools (exec_shell, write_file, browser, etc.) to \
                          carry out the steps described in the instructions above. Do NOT call \
                          activate_skill again for this skill.",
        })),
        None => anyhow::bail!("skill '{}' not found", name),
    }
}

/// `create_skill` tool — create a new skill manifest on disk.
pub async fn create_skill(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_skill requires a 'name' string"))?;

    // Validate name: lowercase alphanumeric + hyphens only (Agent Skills spec).
    if name.is_empty()
        || name.len() > 64
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        || name.starts_with('-')
        || name.ends_with('-')
        || name.contains("--")
    {
        anyhow::bail!(
            "skill name must be 1-64 chars, lowercase alphanumeric and hyphens only, \
             must not start/end with a hyphen or contain consecutive hyphens"
        );
    }

    let description = args["description"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_skill requires a 'description' string"))?;
    let instructions = args["instructions"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_skill requires an 'instructions' string"))?;

    let skill_dir = workspace
        .parent()
        .unwrap_or(workspace)
        .join("skills")
        .join(name);

    if skill_dir.join("SKILL.md").exists() {
        anyhow::bail!("skill '{}' already exists at {}", name, skill_dir.display());
    }

    tokio::fs::create_dir_all(&skill_dir).await?;

    let skill_md =
        format!("---\nname: {name}\ndescription: \"{description}\"\n---\n\n{instructions}\n");
    tokio::fs::write(skill_dir.join("SKILL.md"), &skill_md).await?;

    crate::tools::reload_skills(None);

    Ok(serde_json::json!({
        "status": "created",
        "name": name,
    }))
}

/// `list_skills` tool — enumerate available skills.
pub async fn list_skills(_workspace: &Path, _args: Value) -> anyhow::Result<Value> {
    let entries = crate::tools::list_skill_entries();
    Ok(serde_json::json!({ "skills": entries }))
}

/// `delete_skill` tool — remove a skill from disk and reload the registry.
pub async fn delete_skill(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("delete_skill requires a 'name' string"))?;

    // Validate name (Agent Skills spec: lowercase alphanumeric + hyphens).
    if name.is_empty()
        || name.len() > 64
        || !name
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        || name.starts_with('-')
        || name.ends_with('-')
        || name.contains("--")
    {
        anyhow::bail!("skill name must be 1-64 chars, lowercase alphanumeric and hyphens only");
    }

    let skill_dir = workspace
        .parent()
        .unwrap_or(workspace)
        .join("skills")
        .join(name);

    if !skill_dir.exists() {
        anyhow::bail!("skill '{}' not found at {}", name, skill_dir.display());
    }

    tokio::fs::remove_dir_all(&skill_dir).await?;
    crate::tools::reload_skills(None);

    Ok(serde_json::json!({
        "status": "deleted",
        "name": name,
    }))
}

/// `edit_skill` tool — update the instructions and/or description of an existing skill.
pub async fn edit_skill(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("edit_skill requires a 'name' string"))?;

    let skill_dir = workspace
        .parent()
        .unwrap_or(workspace)
        .join("skills")
        .join(name);

    let skill_md_path = skill_dir.join("SKILL.md");
    if !skill_md_path.exists() {
        anyhow::bail!("skill '{}' not found at {}", name, skill_dir.display());
    }

    let description = args["description"].as_str();
    let instructions = args["instructions"].as_str();

    if description.is_none() && instructions.is_none() {
        anyhow::bail!("edit_skill: provide at least one of 'description' or 'instructions'");
    }

    // Use the canonical parser to preserve all frontmatter fields.
    let existing = tokio::fs::read_to_string(&skill_md_path).await?;
    let (old_yaml, old_body) = crate::skills::parse_skill_md(&existing)
        .unwrap_or_else(|_| (String::new(), existing.clone()));

    // Parse existing frontmatter, patch the requested fields, re-serialize.
    let mut meta: serde_yaml_ng::Value = serde_yaml_ng::from_str(&old_yaml)
        .unwrap_or_else(|_| serde_yaml_ng::Value::Mapping(Default::default()));

    if let Some(desc) = description {
        meta["description"] = serde_yaml_ng::Value::String(desc.to_string());
    }

    let new_body = instructions.unwrap_or(&old_body);

    let new_yaml = serde_yaml_ng::to_string(&meta).unwrap_or(old_yaml);
    // serde_yaml emits a trailing newline; trim for clean output.
    let new_yaml = new_yaml.trim_end();

    let skill_md = format!("---\n{new_yaml}\n---\n\n{new_body}\n");
    tokio::fs::write(&skill_md_path, &skill_md).await?;

    crate::tools::reload_skills(None);

    let mut changed = Vec::new();
    if description.is_some() {
        changed.push("description");
    }
    if instructions.is_some() {
        changed.push("instructions");
    }

    Ok(serde_json::json!({
        "status": "updated",
        "name": name,
        "changed_fields": changed,
    }))
}

/// Register skill-authoring tools in the global tool registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "activate_skill".into(),
        description: "Load a skill's full instructions into context. Call this when a task matches an available skill.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The skill name to activate (from available_skills list)"
                }
            },
            "required": ["name"]
        }),
    });

    register_tool(ToolMeta {
        name: "create_skill".into(),
        description: "Create a new skill (instructional context) that persists across sessions."
            .into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Unique skill identifier (lowercase letters, digits, and hyphens only; 1-64 chars; must not start/end with a hyphen)"
                },
                "description": {
                    "type": "string",
                    "description": "Short description of what this skill provides"
                },
                "instructions": {
                    "type": "string",
                    "description": "Markdown instructions that will be injected into the agent's prompt when this skill is active"
                }
            },
            "required": ["name", "description", "instructions"]
        }),
    });

    register_tool(ToolMeta {
        name: "list_skills".into(),
        description: "List all available skills (instructional context bundles).".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {}
        }),
    });

    register_tool(ToolMeta {
        name: "delete_skill".into(),
        description: "Delete a skill by name, removing its files from disk.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The skill identifier to delete"
                }
            },
            "required": ["name"]
        }),
    });

    register_tool(ToolMeta {
        name: "edit_skill".into(),
        description: "Update an existing skill's description and/or instructions.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The skill identifier to edit"
                },
                "description": {
                    "type": "string",
                    "description": "New description (optional, keeps existing if omitted)"
                },
                "instructions": {
                    "type": "string",
                    "description": "New instructions markdown (optional, keeps existing if omitted)"
                }
            },
            "required": ["name"]
        }),
    });
}
