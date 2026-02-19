//! Skill self-authoring tool — lets the agent create new skills at runtime.
//!
//! Tools exposed:
//! - `create_skill { name, description, instructions, scope? }` — write SKILL.md + skill.yaml
//! - `list_skills {}` — return the agent's current skill catalogue

use std::path::Path;

use serde_json::Value;

use super::register_tool;
use super::ToolMeta;

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
}
