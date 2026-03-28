//! Built-in default skills embedded at compile time.
//!
//! Default skill content is inlined in the binary so the executable is
//! fully self-contained.  On first run (or when the user has not
//! customised a skill) the embedded content is seeded into the agent's
//! skills folder: `agents/<id>/skills/`.
//!
//! Each skill can include additional files (references, scripts, assets)
//! following the [Agent Skills](https://agentskills.io/specification) spec.

use tracing::{debug, info};

/// A single file to embed alongside SKILL.md.
pub struct EmbeddedFile {
    /// Path relative to the skill directory (e.g. `references/protocol.md`).
    pub rel_path: &'static str,
    pub content: &'static str,
}

pub struct EmbeddedSkill {
    pub name: &'static str,
    pub skill_md: &'static str,
    /// Additional files seeded into the skill directory (references, scripts, etc.).
    pub extra_files: &'static [EmbeddedFile],
}

/// Marker appended to seeded SKILL.md files so we can detect whether
/// the user has customised them.  If the on-disk file ends with this
/// marker we know it's still a pristine built-in and safe to overwrite.
const BUILTIN_MARKER: &str = "\n<!-- pinchy-builtin -->\n";

pub static BUILTIN_SKILLS: &[EmbeddedSkill] = &[
    EmbeddedSkill {
        name: "browser",
        skill_md: include_str!("default_skills/browser/SKILL.md"),
        extra_files: &[
            EmbeddedFile {
                rel_path: "references/commands.md",
                content: include_str!("default_skills/browser/references/commands.md"),
            },
            EmbeddedFile {
                rel_path: "references/research-strategy.md",
                content: include_str!("default_skills/browser/references/research-strategy.md"),
            },
        ],
    },
    EmbeddedSkill {
        name: "mcp",
        skill_md: include_str!("default_skills/mcp/SKILL.md"),
        extra_files: &[
            EmbeddedFile {
                rel_path: "references/protocol.md",
                content: include_str!("default_skills/mcp/references/protocol.md"),
            },
            EmbeddedFile {
                rel_path: "references/servers.md",
                content: include_str!("default_skills/mcp/references/servers.md"),
            },
            EmbeddedFile {
                rel_path: "scripts/mcp-call.sh",
                content: include_str!("default_skills/mcp/scripts/mcp-call.sh"),
            },
        ],
    },
];

/// Seed any missing default skills into `agents/<id>/skills/`.
///
/// - Missing skills are created.
/// - Existing skills are updated **only** if they still carry the
///   built-in marker (i.e. the user hasn't customised them).
/// - User-customised skills are never touched.
/// - Extra files (references, scripts, assets) are always seeded if missing
///   or if the skill is still pristine (builtin marker present).
pub fn seed_defaults(agent_id: &str) -> anyhow::Result<()> {
    let skills_dir = crate::utils::agent_root(agent_id).join("skills");

    for skill in BUILTIN_SKILLS {
        let skill_dir = skills_dir.join(skill.name);
        let skill_md_path = skill_dir.join("SKILL.md");
        let stamped_content = format!("{}{}", skill.skill_md.trim_end(), BUILTIN_MARKER);

        let is_pristine;

        if skill_md_path.exists() {
            let on_disk = std::fs::read_to_string(&skill_md_path).unwrap_or_default();

            if !on_disk.contains("<!-- pinchy-builtin -->") {
                // One-time migration: if the file looks like an unmodified
                // built-in (same YAML name field, no user additions beyond
                // the standard sections), stamp and update it.  Otherwise
                // assume the user customised it and leave it alone.
                let looks_builtin = on_disk.contains(&format!("name: {}", skill.name))
                    && !on_disk.contains("<!-- pinchy-custom -->");

                if looks_builtin {
                    info!(
                        skill = skill.name,
                        agent = agent_id,
                        "migrating built-in skill to tracked version"
                    );
                    std::fs::write(&skill_md_path, &stamped_content)?;
                    is_pristine = true;
                } else {
                    debug!(
                        skill = skill.name,
                        agent = agent_id,
                        "built-in skill customised by user — skipping update"
                    );
                    is_pristine = false;
                }
            } else if on_disk.trim() == stamped_content.trim() {
                debug!(
                    skill = skill.name,
                    agent = agent_id,
                    "built-in skill already up-to-date"
                );
                is_pristine = true;
            } else {
                std::fs::write(&skill_md_path, &stamped_content)?;
                info!(
                    skill = skill.name,
                    agent = agent_id,
                    path = %skill_md_path.display(),
                    "updated built-in skill to latest version"
                );
                is_pristine = true;
            }
        } else {
            std::fs::create_dir_all(&skill_dir)?;
            std::fs::write(&skill_md_path, &stamped_content)?;
            info!(skill = skill.name, agent = agent_id, path = %skill_md_path.display(), "seeded built-in skill");
            is_pristine = true;
        }

        // Seed extra files (references, scripts, assets).
        // Always seed if missing; overwrite only if the skill is still pristine.
        for ef in skill.extra_files {
            let dest = skill_dir.join(ef.rel_path);
            if !dest.exists() || is_pristine {
                if let Some(parent) = dest.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(&dest, ef.content)?;
                debug!(
                    skill = skill.name,
                    file = ef.rel_path,
                    "seeded extra skill file"
                );
            }
        }
    }

    Ok(())
}
