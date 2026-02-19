//! Skill self-authoring tool — lets the agent create new skills at runtime.
//!
//! Tools exposed:
//! - `create_skill { name, description, instructions, scope? }` — write SKILL.md + skill.yaml
//! - `list_skills {}` — return the agent's current skill catalogue

use std::path::Path;

use serde_json::Value;

use crate::tools::register_tool;
use crate::tools::ToolMeta;

/// `create_skill` tool — create a new skill manifest on disk.
pub async fn create_skill(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_skill requires a 'name' string"))?;

    // Validate name: alphanumeric + hyphens/underscores only.
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        anyhow::bail!("skill name must be non-empty and contain only alphanumeric, hyphens, or underscores");
    }

    let description = args["description"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_skill requires a 'description' string"))?;
    let instructions = args["instructions"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("create_skill requires an 'instructions' string"))?;
    let scope = args["scope"].as_str().unwrap_or("agent");

    // Determine skill directory based on scope.
    let skill_dir = if scope == "global" {
        crate::pinchy_home()
            .join("skills")
            .join("global")
            .join(name)
    } else {
        // Agent-scoped: workspace/../skills/<name>
        // workspace is `agents/<id>/workspace`, skills go to `agents/<id>/skills/<name>`
        workspace
            .parent()
            .unwrap_or(workspace)
            .join("skills")
            .join(name)
    };

    if skill_dir.join("SKILL.md").exists() {
        anyhow::bail!(
            "skill '{}' already exists at {}",
            name,
            skill_dir.display()
        );
    }

    tokio::fs::create_dir_all(&skill_dir).await?;

    // Write SKILL.md with front-matter + instructions.
    let skill_md = format!(
        "---\nname: {name}\nversion: \"0.1\"\ndescription: \"{description}\"\nscope: {scope}\n---\n\n{instructions}\n"
    );
    tokio::fs::write(skill_dir.join("SKILL.md"), &skill_md).await?;

    // Also write skill.yaml for backwards compat.
    let skill_yaml = format!(
        "name: {name}\nversion: \"0.1\"\ndescription: \"{description}\"\nscope: {scope}\n"
    );
    tokio::fs::write(skill_dir.join("skill.yaml"), &skill_yaml).await?;

    // Reload skills into the unified tool registry.
    crate::tools::reload_skills(None);

    Ok(serde_json::json!({
        "status": "created",
        "name": name,
        "path": skill_dir.display().to_string(),
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

    // Validate name.
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        anyhow::bail!("skill name must be non-empty and contain only alphanumeric, hyphens, or underscores");
    }

    let scope = args["scope"].as_str().unwrap_or("agent");

    let skill_dir = if scope == "global" {
        crate::pinchy_home()
            .join("skills")
            .join("global")
            .join(name)
    } else {
        workspace
            .parent()
            .unwrap_or(workspace)
            .join("skills")
            .join(name)
    };

    if !skill_dir.exists() {
        anyhow::bail!("skill '{}' not found at {}", name, skill_dir.display());
    }

    tokio::fs::remove_dir_all(&skill_dir).await?;
    crate::tools::reload_skills(None);

    Ok(serde_json::json!({
        "status": "deleted",
        "name": name,
        "path": skill_dir.display().to_string(),
    }))
}

/// `edit_skill` tool — update the instructions and/or description of an existing skill.
pub async fn edit_skill(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let name = args["name"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("edit_skill requires a 'name' string"))?;

    let scope = args["scope"].as_str().unwrap_or("agent");

    let skill_dir = if scope == "global" {
        crate::pinchy_home()
            .join("skills")
            .join("global")
            .join(name)
    } else {
        workspace
            .parent()
            .unwrap_or(workspace)
            .join("skills")
            .join(name)
    };

    let skill_md_path = skill_dir.join("SKILL.md");
    if !skill_md_path.exists() {
        anyhow::bail!("skill '{}' not found at {}", name, skill_dir.display());
    }

    let description = args["description"].as_str();
    let instructions = args["instructions"].as_str();

    if description.is_none() && instructions.is_none() {
        anyhow::bail!("edit_skill: provide at least one of 'description' or 'instructions'");
    }

    // Read existing SKILL.md to preserve fields not being changed.
    let existing = tokio::fs::read_to_string(&skill_md_path).await?;
    let (old_desc, old_instructions) = parse_skill_md(&existing);

    let new_desc = description.unwrap_or(&old_desc);
    let new_instructions = instructions.unwrap_or(&old_instructions);

    // Rewrite SKILL.md.
    let skill_md = format!(
        "---\nname: {name}\nversion: \"0.1\"\ndescription: \"{new_desc}\"\nscope: {scope}\n---\n\n{new_instructions}\n"
    );
    tokio::fs::write(&skill_md_path, &skill_md).await?;

    // Update skill.yaml too.
    let skill_yaml = format!(
        "name: {name}\nversion: \"0.1\"\ndescription: \"{new_desc}\"\nscope: {scope}\n"
    );
    tokio::fs::write(skill_dir.join("skill.yaml"), &skill_yaml).await?;

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

/// Parse a SKILL.md into (description, instructions) from its frontmatter.
fn parse_skill_md(content: &str) -> (String, String) {
    let trimmed = content.trim();
    if !trimmed.starts_with("---") {
        return (String::new(), content.to_string());
    }

    // Find closing '---'.
    if let Some(end) = trimmed[3..].find("---") {
        let frontmatter = &trimmed[3..3 + end];
        let body = trimmed[3 + end + 3..].trim();

        let mut description = String::new();
        for line in frontmatter.lines() {
            let line = line.trim();
            if line.starts_with("description:") {
                description = line["description:".len()..].trim().trim_matches('"').to_string();
            }
        }

        (description, body.to_string())
    } else {
        (String::new(), content.to_string())
    }
}

/// Register skill-authoring tools in the global tool registry.
pub fn register() {
    register_tool(ToolMeta {
        name: "create_skill".into(),
        description: "Create a new skill (instructional context) that persists across sessions."
            .into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Unique skill identifier (alphanumeric, hyphens, underscores)"
                },
                "description": {
                    "type": "string",
                    "description": "Short description of what this skill provides"
                },
                "instructions": {
                    "type": "string",
                    "description": "Markdown instructions that will be injected into the agent's prompt when this skill is active"
                },
                "scope": {
                    "type": "string",
                    "enum": ["agent", "global"],
                    "description": "Scope: 'agent' (default) for this agent only, 'global' for all agents"
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
                },
                "scope": {
                    "type": "string",
                    "enum": ["agent", "global"],
                    "description": "Scope: 'agent' (default) or 'global'"
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
                },
                "scope": {
                    "type": "string",
                    "enum": ["agent", "global"],
                    "description": "Scope: 'agent' (default) or 'global'"
                }
            },
            "required": ["name"]
        }),
    });
}
