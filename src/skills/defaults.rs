//! Built-in default skills embedded at compile time.
//!
//! Default skill content is inlined in the binary so the executable is
//! fully self-contained.  On first run (or when the user has not
//! customised a skill) the embedded content is seeded into the agent's
//! skills folder: `agents/<id>/skills/`.

use tracing::{debug, info};

pub struct EmbeddedSkill {
    pub name: &'static str,
    pub skill_md: &'static str,
}

/// Marker appended to seeded SKILL.md files so we can detect whether
/// the user has customised them.  If the on-disk file ends with this
/// marker we know it's still a pristine built-in and safe to overwrite.
const BUILTIN_MARKER: &str = "\n<!-- pinchy-builtin -->\n";

pub static BUILTIN_SKILLS: &[EmbeddedSkill] = &[EmbeddedSkill {
    name: "browser",
    skill_md: include_str!("default_skills/browser.md"),
}];

/// Seed any missing default skills into `agents/<id>/skills/`.
///
/// - Missing skills are created.
/// - Existing skills are updated **only** if they still carry the
///   built-in marker (i.e. the user hasn't customised them).
/// - User-customised skills are never touched.
pub fn seed_defaults(agent_id: &str) -> anyhow::Result<()> {
    let skills_dir = crate::utils::agent_root(agent_id).join("skills");

    for skill in BUILTIN_SKILLS {
        let skill_dir = skills_dir.join(skill.name);
        let skill_md_path = skill_dir.join("SKILL.md");
        let stamped_content = format!("{}{}", skill.skill_md.trim_end(), BUILTIN_MARKER);

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
                } else {
                    debug!(
                        skill = skill.name,
                        agent = agent_id,
                        "built-in skill customised by user — skipping update"
                    );
                }
                continue;
            }

            if on_disk.trim() == stamped_content.trim() {
                debug!(
                    skill = skill.name,
                    agent = agent_id,
                    "built-in skill already up-to-date"
                );
                continue;
            }

            std::fs::write(&skill_md_path, &stamped_content)?;
            info!(
                skill = skill.name,
                agent = agent_id,
                path = %skill_md_path.display(),
                "updated built-in skill to latest version"
            );
            continue;
        }

        std::fs::create_dir_all(&skill_dir)?;
        std::fs::write(&skill_md_path, &stamped_content)?;
        info!(skill = skill.name, agent = agent_id, path = %skill_md_path.display(), "seeded built-in skill");
    }

    Ok(())
}
