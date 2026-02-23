//! Skill registry — discovers and resolves composable skill bundles.
//!
//! Skills are declarative tool bundles described by `SKILL.md` manifests
//! (YAML front-matter between `---` fences, markdown body = instructions).
//! Each agent has a single skills folder: `agents/<id>/skills/*/SKILL.md`.
//! Built-in default skills are embedded in the binary and seeded into
//! the agent's skills folder on first run (see [`defaults`]).
//!
//! Follows the [Agent Skills](https://agentskills.io/specification) open format.
//! Progressive disclosure: only name + description are injected at boot;
//! full instructions are loaded on demand via `activate_skill`.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

pub mod defaults;

// ── Types ───────────────────────────────────────────────────

/// Metadata parsed from a `SKILL.md` front-matter.
///
/// Follows the [Agent Skills](https://agentskills.io/specification) open
/// format exactly: `name`, `description` (required), plus optional
/// `license`, `compatibility`, and `metadata`.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SkillMeta {
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub compatibility: Option<String>,
    #[serde(default)]
    pub metadata: Option<HashMap<String, String>>,
    /// When `true` the skill is operator-managed and requires explicit
    /// inclusion via `SkillsConfig::operator_allowed`.
    #[serde(default)]
    pub operator_managed: Option<bool>,
}

/// A loaded skill ready for resolution.
#[derive(Debug, Clone)]
pub struct Skill {
    pub meta: SkillMeta,
    /// Filesystem path to the skill directory.
    pub path: PathBuf,
    /// Raw YAML front-matter (for re-serialisation).
    pub manifest: String,
    /// Markdown body from `SKILL.md` — injected into agent prompts on activation.
    pub instructions: String,
}

// ── Registry ────────────────────────────────────────────────

/// Discovers, stores and resolves skills from `agents/<id>/skills/`.
#[derive(Debug)]
pub struct SkillRegistry {
    pub agent_id: Option<String>,
    pub skills: HashMap<String, Skill>,
}

impl SkillRegistry {
    pub fn new(agent_id: Option<String>) -> Self {
        Self {
            agent_id,
            skills: HashMap::new(),
        }
    }

    pub fn reload(&mut self, cfg: Option<&crate::config::Config>) -> anyhow::Result<()> {
        self.skills.clear();
        self.load_skills_with_config(cfg)?;
        info!(count = self.skills.len(), "skill registry reloaded");
        Ok(())
    }

    // ── Loading ─────────────────────────────────────────────

    pub fn load_skills(&mut self) -> anyhow::Result<()> {
        self.load_skills_with_config(None)
    }

    pub fn load_skills_with_config(
        &mut self,
        cfg: Option<&crate::config::Config>,
    ) -> anyhow::Result<()> {
        let id = match &self.agent_id {
            Some(id) => id.clone(),
            None => {
                debug!("no agent_id set — skipping skills");
                return Ok(());
            }
        };
        let base = crate::utils::agent_root(&id).join("skills");
        if !base.is_dir() {
            debug!("no skills directory at {}", base.display());
            return Ok(());
        }
        self.load_skills_from(&base)?;

        let override_path = crate::utils::agent_root(&id).join("skills.yaml");
        let effective_cfg: Option<crate::config::SkillsConfig> = if override_path.is_file() {
            let raw = std::fs::read_to_string(&override_path)
                .with_context(|| format!("reading {}", override_path.display()))?;
            let sc: crate::config::SkillsConfig = serde_yaml::from_str(&raw)
                .with_context(|| format!("parsing {}", override_path.display()))?;
            info!(agent = %id, "loaded per-agent skills override");
            Some(sc)
        } else {
            cfg.and_then(|c| c.skills.clone())
        };

        if let Some(ref skills_cfg) = effective_cfg {
            Self::apply_skills_filter(&mut self.skills, skills_cfg);
        }
        Ok(())
    }

    /// Scan `<base>/*/SKILL.md`.
    fn load_skills_from(&mut self, base: &Path) -> anyhow::Result<()> {
        for entry in std::fs::read_dir(base)
            .with_context(|| format!("reading skills dir {}", base.display()))?
        {
            let entry = entry?;
            let skill_dir = entry.path();
            if !skill_dir.is_dir() {
                continue;
            }

            let skill_md = skill_dir.join("SKILL.md");
            if !skill_md.is_file() {
                debug!("skipping {} — no SKILL.md", skill_dir.display());
                continue;
            }

            let content = std::fs::read_to_string(&skill_md)
                .with_context(|| format!("reading {}", skill_md.display()))?;
            let (raw, instructions) = parse_skill_md(&content)
                .with_context(|| format!("parsing {}", skill_md.display()))?;

            let meta: SkillMeta = serde_yaml::from_str(&raw)
                .with_context(|| format!("parsing front-matter in {}", skill_dir.display()))?;

            // Spec: name must match parent directory name.
            let dir_name = skill_dir
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("");
            if meta.name != dir_name {
                warn!(
                    name = %meta.name,
                    dir = %dir_name,
                    "skill name does not match directory — spec requires name == dir"
                );
            }

            info!(
                name = %meta.name,
                path = %skill_dir.display(),
                "loaded skill"
            );
            if self.skills.contains_key(&meta.name) {
                warn!(name = %meta.name, "duplicate skill — keeping first");
                continue;
            }
            self.skills.insert(
                meta.name.clone(),
                Skill {
                    meta,
                    path: skill_dir,
                    manifest: raw,
                    instructions,
                },
            );
        }
        Ok(())
    }

    // ── Filtering ────────────────────────────────────────────

    fn apply_skills_filter(skills: &mut HashMap<String, Skill>, cfg: &crate::config::SkillsConfig) {
        if !cfg.enabled {
            info!("skills disabled by config — removing all");
            skills.clear();
            return;
        }

        if !cfg.allow.is_empty() {
            skills.retain(|id, _| {
                let keep = cfg.allow.iter().any(|a| a == id);
                if !keep {
                    debug!(skill_id = %id, "skill not in allow-list — removed");
                }
                keep
            });
        }

        if !cfg.deny.is_empty() {
            skills.retain(|id, _| {
                let denied = cfg.deny.iter().any(|d| d == id);
                if denied {
                    debug!(skill_id = %id, "skill in deny-list — removed");
                }
                !denied
            });
        }

        skills.retain(|id, skill| {
            if skill.meta.operator_managed.unwrap_or(false) {
                let allowed = cfg.operator_allowed.iter().any(|o| o == id);
                if !allowed {
                    debug!(
                        skill_id = %id,
                        "operator-managed skill not in operator_allowed — removed"
                    );
                }
                allowed
            } else {
                true
            }
        });
    }

    // ── Resolution ──────────────────────────────────────────

    pub fn resolve(&self, name: &str) -> Option<&Skill> {
        self.skills.get(name)
    }

    pub fn skill_description(&self, name: &str) -> Option<String> {
        self.resolve(name).map(|s| s.meta.description.clone())
    }

    // ── Prompt injection (progressive disclosure) ───────────

    /// Build a metadata-only prompt fragment listing available skills
    /// (name + description). Full instructions are loaded on demand
    /// via `activate_skill`.
    pub fn prompt_metadata(&self, enabled_ids: Option<&[String]>) -> String {
        let mut parts: Vec<String> = Vec::new();
        for skill in self.skills.values() {
            if let Some(ids) = enabled_ids {
                if !ids.iter().any(|id| id == &skill.meta.name) {
                    continue;
                }
            }
            parts.push(format!(
                "  <skill>\n    <name>{}</name>\n    <description>{}</description>\n  </skill>",
                skill.meta.name,
                skill.meta.description,
            ));
        }
        if parts.is_empty() {
            return String::new();
        }
        format!(
            "<available_skills>\n{}\n</available_skills>\n\n\
             To use a skill, call `activate_skill` with its name. \
             This loads the full instructions into context.",
            parts.join("\n")
        )
    }

    /// Return the full instructions for a specific skill (activation).
    pub fn get_skill_instructions(&self, name: &str) -> Option<String> {
        self.resolve(name).map(
            |s| format!(
                "<skill_activated>\n<name>{}</name>\n<instructions>\n{}\n</instructions>\n</skill_activated>",
                s.meta.name,
                s.instructions.replace("<!-- pinchy-builtin -->", "").trim(),
            ),
        )
    }
}

// ── SKILL.md parser ──────────────────────────────────────────

/// Parse a `SKILL.md` file into `(yaml_front_matter, markdown_body)`.
pub fn parse_skill_md(content: &str) -> anyhow::Result<(String, String)> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        bail!("SKILL.md must begin with YAML front-matter (---)")
    }
    let after_open = &trimmed[3..];
    let after_open = after_open.strip_prefix('\n').unwrap_or(after_open);

    let close_pos = after_open
        .find("\n---")
        .ok_or_else(|| anyhow::anyhow!("missing closing --- in SKILL.md front-matter"))?;

    let yaml = after_open[..close_pos].to_string();
    let rest = &after_open[close_pos + 4..];
    let body = rest.strip_prefix('\n').unwrap_or(rest).to_string();

    Ok((yaml, body))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_registry_resolve_returns_none() {
        let reg = SkillRegistry::new(None);
        assert!(reg.resolve("nonexistent").is_none());
    }

    #[test]
    fn skill_description_returns_none_for_missing() {
        let reg = SkillRegistry::new(None);
        assert!(reg.skill_description("nope").is_none());
    }

    #[test]
    fn parse_skill_md_valid() {
        let content = "---\nname: test\ndescription: A test skill\n---\n# Instructions\n\nDo stuff.\n";
        let (yaml, body) = parse_skill_md(content).unwrap();
        assert!(yaml.contains("name: test"));
        assert!(body.contains("Do stuff."));
    }

    #[test]
    fn parse_skill_md_no_frontmatter() {
        let content = "# Just markdown\n";
        assert!(parse_skill_md(content).is_err());
    }

    #[test]
    fn prompt_metadata_filters_by_enabled() {
        let mut reg = SkillRegistry::new(None);
        let mk = |id: &str, desc: &str| Skill {
            meta: SkillMeta {
                name: id.into(),
                description: desc.into(),
                license: None,
                compatibility: None,
                metadata: None,
                operator_managed: None,
            },
            path: PathBuf::from("/tmp"),
            manifest: String::new(),
            instructions: "do stuff".into(),
        };
        reg.skills.insert("a".into(), mk("a", "skill A"));
        reg.skills.insert("b".into(), mk("b", "skill B"));

        let all = reg.prompt_metadata(None);
        assert!(all.contains("<name>a</name>"));
        assert!(all.contains("<name>b</name>"));
        assert!(all.contains("activate_skill"));

        let filtered = reg.prompt_metadata(Some(&["a".into()]));
        assert!(filtered.contains("<name>a</name>"));
        assert!(!filtered.contains("<name>b</name>"));
    }

    #[test]
    fn get_skill_instructions_returns_full() {
        let mut reg = SkillRegistry::new(None);
        reg.skills.insert("browser".into(), Skill {
            meta: SkillMeta {
                name: "browser".into(),
                description: "Browse the web".into(),
                license: None,
                compatibility: None,
                metadata: None,
                operator_managed: None,
            },
            path: PathBuf::from("/tmp"),
            manifest: String::new(),
            instructions: "Navigate to URLs and click things.".into(),
        });

        let instr = reg.get_skill_instructions("browser").unwrap();
        assert!(instr.contains("<skill_activated>"));
        assert!(instr.contains("Navigate to URLs"));
        assert!(reg.get_skill_instructions("nonexistent").is_none());
    }

    #[test]
    fn reload_clears_and_reloads() {
        let mut reg = SkillRegistry::new(None);
        reg.skills.insert("old".into(), Skill {
            meta: SkillMeta {
                name: "old".into(),
                description: "old skill".into(),
                license: None,
                compatibility: None,
                metadata: None,
                operator_managed: None,
            },
            path: PathBuf::from("/tmp"),
            manifest: String::new(),
            instructions: "do stuff".into(),
        });
        assert!(reg.skills.contains_key("old"));
        let _ = reg.reload(None);
        assert!(!reg.skills.contains_key("old"));
    }
}
