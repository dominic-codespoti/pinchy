//! Built-in default skills embedded at compile time.
//!
//! Default skill content is inlined in the binary so the executable is
//! fully self-contained.  On first run (or when the user has not
//! customised a skill) the embedded content is seeded into
//! `pinchy_home()/skills/global/`.

use tracing::{debug, info};

pub struct EmbeddedSkill {
    pub name: &'static str,
    pub skill_md: &'static str,
}

pub static BUILTIN_SKILLS: &[EmbeddedSkill] = &[
    EmbeddedSkill {
        name: "browser",
        skill_md: include_str!("default_skills/browser.md"),
    },
];

/// Seed any missing default skills into `pinchy_home()/skills/global/`.
///
/// Existing skill directories are never overwritten — only missing ones
/// are created.  This keeps user customisations intact while ensuring
/// new built-in skills appear automatically after an upgrade.
pub fn seed_defaults() -> anyhow::Result<()> {
    let global_dir = crate::pinchy_home().join("skills").join("global");

    for skill in BUILTIN_SKILLS {
        let skill_dir = global_dir.join(skill.name);
        let skill_md_path = skill_dir.join("SKILL.md");

        if skill_md_path.exists() {
            debug!(skill = skill.name, "built-in skill already present — skipping");
            continue;
        }

        std::fs::create_dir_all(&skill_dir)?;
        std::fs::write(&skill_md_path, skill.skill_md)?;
        info!(skill = skill.name, path = %skill_md_path.display(), "seeded built-in skill");
    }

    Ok(())
}
