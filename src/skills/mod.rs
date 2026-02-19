//! Skill registry — discovers and resolves composable skill bundles.
//!
//! Skills are declarative tool bundles described by `SKILL.md` manifests
//! (YAML front-matter between `---` fences, markdown body = instructions).
//! Two scopes exist: **global** (`skills/global/*/SKILL.md`) and
//! **per-agent** (`agents/<id>/workspace/skills/*/SKILL.md`).  Per-agent
//! skills override global skills with the same id.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

// ── Types ───────────────────────────────────────────────────

/// Metadata parsed from a `SKILL.md` front-matter.
///
/// Follows the [Agent Skills](https://agentskills.io/specification) open
/// format.  The canonical field is `name`; the legacy `id` field is
/// accepted as a fallback alias.
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SkillMeta {
    /// Canonical skill identifier.  Accepts either `name` (spec) or
    /// legacy `id`.
    #[serde(alias = "id")]
    pub name: String,
    #[serde(default = "default_version")]
    pub version: String,
    #[serde(default)]
    pub description: Option<String>,
    /// `"global"` or `"agent"` — internal pinchy scope.
    #[serde(default = "default_scope")]
    pub scope: String,
    /// Optional license field per Agent Skills spec.
    #[serde(default)]
    pub license: Option<String>,
    /// Optional compatibility note per Agent Skills spec.
    #[serde(default)]
    pub compatibility: Option<String>,
    /// Arbitrary key-value metadata per Agent Skills spec.
    #[serde(default)]
    pub metadata: Option<HashMap<String, String>>,
    /// When `true` the skill is operator-managed and requires explicit
    /// inclusion via `SkillsConfig::operator_allowed`.
    #[serde(default)]
    pub operator_managed: Option<bool>,
}

impl SkillMeta {
    /// Convenience accessor — returns the skill name/id.
    pub fn id(&self) -> &str {
        &self.name
    }
}

fn default_version() -> String {
    "0.1".into()
}
fn default_scope() -> String {
    "agent".into()
}

/// A loaded skill ready for resolution.
#[derive(Debug, Clone)]
pub struct Skill {
    pub meta: SkillMeta,
    /// Filesystem path to the skill directory.
    pub path: PathBuf,
    /// Raw YAML front-matter (for re-serialisation).
    pub manifest: String,
    /// Markdown body from `SKILL.md` — injected into agent prompts.
    pub instructions: String,
}

// ── Registry ────────────────────────────────────────────────

/// Discovers, stores and resolves skills with agent-first precedence.
#[derive(Debug)]
pub struct SkillRegistry {
    pub agent_id: Option<String>,
    pub global_skills: HashMap<String, Skill>,
    pub agent_skills: HashMap<String, Skill>,
}

impl SkillRegistry {
    /// Create an empty registry, optionally scoped to an agent.
    pub fn new(agent_id: Option<String>) -> Self {
        Self {
            agent_id,
            global_skills: HashMap::new(),
            agent_skills: HashMap::new(),
        }
    }

    /// Clear all loaded skills and re-scan from disk.
    pub fn reload(&mut self, cfg: Option<&crate::config::Config>) -> anyhow::Result<()> {
        self.global_skills.clear();
        self.agent_skills.clear();
        self.load_global_skills_with_config(cfg)?;
        self.load_agent_skills_with_config(cfg)?;
        info!("skill registry reloaded ({} global, {} agent)",
              self.global_skills.len(), self.agent_skills.len());
        Ok(())
    }

    // ── Loading ─────────────────────────────────────────────

    /// Load global skills with no config gating (convenience wrapper).
    pub fn load_global_skills(&mut self) -> anyhow::Result<()> {
        self.load_global_skills_with_config(None)
    }

    /// Load global skills and then gate them according to `cfg.skills`.
    ///
    /// Searches `pinchy_home()/skills/global` first, then falls back to
    /// (or merges with) the repo-local `skills/global` directory.
    /// pinchy_home entries take precedence on duplicate ids.
    pub fn load_global_skills_with_config(
        &mut self,
        cfg: Option<&crate::config::Config>,
    ) -> anyhow::Result<()> {
        let home_base = crate::pinchy_home().join("skills").join("global");
        let repo_base = std::path::Path::new("skills").join("global");

        let home_exists = home_base.is_dir();
        let repo_exists = repo_base.is_dir();

        if !home_exists && !repo_exists {
            debug!(
                "no global skills directory at {} or {}",
                home_base.display(),
                repo_base.display()
            );
            return Ok(());
        }

        // Collect into a temp map to avoid borrow issues with &mut self.
        let mut dest = self.global_skills.clone();

        // Load repo-local first so pinchy_home entries can override.
        if repo_exists {
            debug!(
                "loading repo-local global skills from {}",
                repo_base.display()
            );
            self.load_skills_from(&repo_base, "global", &mut dest)?;
        }
        if home_exists {
            debug!(
                "loading pinchy_home global skills from {}",
                home_base.display()
            );
            self.load_skills_from(&home_base, "global", &mut dest)?;
        }

        self.global_skills = dest;

        // Apply gating from the top-level config.
        if let Some(skills_cfg) = cfg.and_then(|c| c.skills.as_ref()) {
            Self::apply_skills_filter(&mut self.global_skills, skills_cfg);
        }
        Ok(())
    }

    /// Load agent skills with no config override (convenience wrapper).
    pub fn load_agent_skills(&mut self) -> anyhow::Result<()> {
        self.load_agent_skills_with_config(None)
    }

    /// Load agent skills and gate them.
    ///
    /// If a per-agent override file exists at
    /// `agents/<id>/skills.yaml` it is loaded as
    /// [`SkillsConfig`](crate::config::SkillsConfig) and takes precedence
    /// over the top-level config.
    pub fn load_agent_skills_with_config(
        &mut self,
        cfg: Option<&crate::config::Config>,
    ) -> anyhow::Result<()> {
        let id = match &self.agent_id {
            Some(id) => id.clone(),
            None => {
                debug!("no agent_id set — skipping agent skills");
                return Ok(());
            }
        };
        let base = crate::utils::agent_root(&id).join("skills");
        if !base.is_dir() {
            debug!("no agent skills directory at {}", base.display());
            return Ok(());
        }
        let mut dest = self.agent_skills.clone();
        self.load_skills_from(&base, "agent", &mut dest)?;
        self.agent_skills = dest;

        // Per-agent override takes precedence over top-level config.
        let override_path = crate::utils::agent_root(&id)
            .join("skills.yaml");
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
            Self::apply_skills_filter(&mut self.agent_skills, skills_cfg);
        }
        Ok(())
    }

    /// Common helper: iterate `<base>/*/SKILL.md` (falls back to `skill.yaml`).
    fn load_skills_from(
        &mut self,
        base: &Path,
        scope: &str,
        dest: &mut HashMap<String, Skill>,
    ) -> anyhow::Result<()> {
        for entry in std::fs::read_dir(base)
            .with_context(|| format!("reading skills dir {}", base.display()))?
        {
            let entry = entry?;
            let skill_dir = entry.path();
            if !skill_dir.is_dir() {
                continue;
            }

            // Prefer SKILL.md; fall back to legacy skill.yaml.
            let skill_md = skill_dir.join("SKILL.md");
            let legacy_yaml = skill_dir.join("skill.yaml");
            let (raw, instructions) = if skill_md.is_file() {
                let content = std::fs::read_to_string(&skill_md)
                    .with_context(|| format!("reading {}", skill_md.display()))?;
                parse_skill_md(&content)
                    .with_context(|| format!("parsing {}", skill_md.display()))?
            } else if legacy_yaml.is_file() {
                let yaml = std::fs::read_to_string(&legacy_yaml)
                    .with_context(|| format!("reading {}", legacy_yaml.display()))?;
                (yaml, String::new())
            } else {
                debug!("skipping {} — no SKILL.md or skill.yaml", skill_dir.display());
                continue;
            };

            let meta: SkillMeta = serde_yaml::from_str(&raw)
                .with_context(|| format!("parsing front-matter in {}", skill_dir.display()))?;
            info!(
                skill_id = %meta.id(),
                scope,
                path = %skill_dir.display(),
                "loaded skill"
            );
            if dest.contains_key(meta.id()) {
                warn!(
                    skill_id = %meta.id(),
                    "duplicate skill id in {scope} scope — keeping first"
                );
                continue;
            }
            dest.insert(
                meta.id().to_string(),
                Skill {
                    meta,
                    path: skill_dir,
                    manifest: raw,
                    instructions,
                },
            );
        }
        // Write back into self (workaround for borrow-split).
        match scope {
            "global" => self.global_skills = dest.clone(),
            "agent" => self.agent_skills = dest.clone(),
            _ => {}
        }
        Ok(())
    }

    // ── Filtering ────────────────────────────────────────────

    /// Apply [`SkillsConfig`](crate::config::SkillsConfig) gating to a
    /// skill map, removing entries that don't pass the filter.
    fn apply_skills_filter(skills: &mut HashMap<String, Skill>, cfg: &crate::config::SkillsConfig) {
        // Master kill-switch.
        if !cfg.enabled {
            info!("skills disabled by config — removing all");
            skills.clear();
            return;
        }

        // Allowlist: when non-empty, only keep listed ids.
        if !cfg.allow.is_empty() {
            skills.retain(|id, _| {
                let keep = cfg.allow.iter().any(|a| a == id);
                if !keep {
                    debug!(skill_id = %id, "skill not in allow-list — removed");
                }
                keep
            });
        }

        // Denylist: remove explicitly denied.
        if !cfg.deny.is_empty() {
            skills.retain(|id, _| {
                let denied = cfg.deny.iter().any(|d| d == id);
                if denied {
                    debug!(skill_id = %id, "skill in deny-list — removed");
                }
                !denied
            });
        }

        // Operator-managed skills need explicit inclusion.
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
    // ── Resolution ──────────────────────────────────────────────────────

    /// Resolve a skill by name with **agent-first** precedence.
    pub fn resolve(&self, name: &str) -> Option<&Skill> {
        self.agent_skills
            .get(name)
            .or_else(|| self.global_skills.get(name))
    }

    /// Return a skill's description if it exists.
    ///
    /// Skills are instructional — they provide context to the LLM,
    /// not executable code.  Actual tool execution lives in
    /// [`crate::tools::call_skill`].
    pub fn skill_description(&self, name: &str) -> Option<String> {
        self.resolve(name)
            .and_then(|s| s.meta.description.clone())
    }
    // ── Prompt injection ────────────────────────────────────

    /// Build a prompt fragment containing the instructions for all
    /// skills that `enabled_ids` opts into (or all resolved skills
    /// when `None`).
    ///
    /// Each skill with non-empty instructions is rendered as:
    /// ```text
    /// # Skill: <id>
    ///
    /// <instructions markdown>
    /// ```
    pub fn prompt_instructions(&self, enabled_ids: Option<&[String]>) -> String {
        let mut parts: Vec<String> = Vec::new();
        // Merge global + agent (agent-first for overrides).
        let mut seen = std::collections::HashSet::new();
        let iter = self
            .agent_skills
            .values()
            .chain(self.global_skills.values());
        for skill in iter {
            if !seen.insert(skill.meta.id()) {
                continue; // already emitted (agent override wins)
            }
            if let Some(ids) = enabled_ids {
                if !ids.iter().any(|id| id == skill.meta.id()) {
                    continue;
                }
            }
            if skill.instructions.trim().is_empty() {
                continue;
            }
            parts.push(format!(
                "<skill>\n<name>{}</name>\n<instructions>\n{}\n</instructions>\n</skill>",
                skill.meta.id(),
                skill.instructions.trim()
            ));
        }
        if parts.is_empty() {
            return String::new();
        }
        format!("<available_skills>\n{}\n</available_skills>", parts.join("\n"))
    }
}

// ── SKILL.md parser ──────────────────────────────────────────

/// Parse a `SKILL.md` file into `(yaml_front_matter, markdown_body)`.
///
/// Expected format:
/// ```text
/// ---
/// id: browser
/// version: 0.1.0
/// ...
/// ---
/// # Instructions
/// markdown body…
/// ```
pub fn parse_skill_md(content: &str) -> anyhow::Result<(String, String)> {
    let trimmed = content.trim_start();
    if !trimmed.starts_with("---") {
        bail!("SKILL.md must begin with YAML front-matter (---)")
    }
    // Skip the opening "---" line.
    let after_open = &trimmed[3..];
    let after_open = after_open.strip_prefix('\n').unwrap_or(after_open);

    let close_pos = after_open
        .find("\n---")
        .ok_or_else(|| anyhow::anyhow!("missing closing --- in SKILL.md front-matter"))?;

    let yaml = after_open[..close_pos].to_string();
    let rest = &after_open[close_pos + 4..]; // skip "\n---"
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
    fn agent_skill_overrides_global() {
        let mut reg = SkillRegistry::new(Some("test".into()));
        let meta = SkillMeta {
            name: "foo".into(),
            version: "0.1".into(),
            description: Some("global foo".into()),
            scope: "global".into(),
            license: None,
            compatibility: None,
            metadata: None,
            operator_managed: None,
        };
        reg.global_skills.insert(
            "foo".into(),
            Skill {
                meta: meta.clone(),
                path: PathBuf::from("/tmp/g/foo"),
                manifest: String::new(),
                instructions: String::new(),
            },
        );
        let agent_meta = SkillMeta {
            name: "foo".into(),
            version: "0.2".into(),
            description: Some("agent foo".into()),
            scope: "agent".into(),
            license: None,
            compatibility: None,
            metadata: None,
            operator_managed: None,
        };
        reg.agent_skills.insert(
            "foo".into(),
            Skill {
                meta: agent_meta,
                path: PathBuf::from("/tmp/a/foo"),
                manifest: String::new(),
                instructions: "agent-level instructions".into(),
            },
        );
        let resolved = reg.resolve("foo").expect("should resolve");
        assert_eq!(resolved.meta.version, "0.2", "agent version should win");
    }

    #[test]
    fn skill_description_returns_none_for_missing() {
        let reg = SkillRegistry::new(None);
        assert!(reg.skill_description("nope").is_none());
    }

    #[test]
    fn parse_skill_md_valid() {
        let content = "---\nid: test\nversion: 0.1\n---\n# Instructions\n\nDo stuff.\n";
        let (yaml, body) = parse_skill_md(content).unwrap();
        assert!(yaml.contains("id: test"));
        assert!(body.contains("Do stuff."));
    }

    #[test]
    fn parse_skill_md_no_frontmatter() {
        let content = "# Just markdown\n";
        assert!(parse_skill_md(content).is_err());
    }

    #[test]
    fn prompt_instructions_filters_by_enabled() {
        let mut reg = SkillRegistry::new(None);
        let mk = |id: &str, instr: &str| Skill {
            meta: SkillMeta {
                name: id.into(),
                version: "0.1".into(),
                description: None,
                scope: "global".into(),
                license: None,
                compatibility: None,
                metadata: None,
                operator_managed: None,
            },
            path: PathBuf::from("/tmp"),
            manifest: String::new(),
            instructions: instr.into(),
        };
        reg.global_skills.insert("a".into(), mk("a", "do A"));
        reg.global_skills.insert("b".into(), mk("b", "do B"));

        let all = reg.prompt_instructions(None);
        assert!(all.contains("<name>a</name>"));
        assert!(all.contains("<name>b</name>"));

        let filtered = reg.prompt_instructions(Some(&["a".into()]));
        assert!(filtered.contains("<name>a</name>"));
        assert!(!filtered.contains("<name>b</name>"));
    }

    #[test]
    fn reload_clears_and_reloads() {
        let mut reg = SkillRegistry::new(None);
        let mk = |id: &str| Skill {
            meta: SkillMeta {
                name: id.into(),
                version: "0.1".into(),
                description: None,
                scope: "global".into(),
                license: None,
                compatibility: None,
                metadata: None,
                operator_managed: None,
            },
            path: PathBuf::from("/tmp"),
            manifest: String::new(),
            instructions: "do stuff".into(),
        };
        reg.global_skills.insert("old_skill_that_should_vanish".into(), mk("old_skill_that_should_vanish"));
        assert!(reg.global_skills.contains_key("old_skill_that_should_vanish"));

        // reload() should clear the maps and re-scan from disk.
        // The injected "old_skill_that_should_vanish" doesn't exist on
        // disk, so it must be gone after reload.
        let _ = reg.reload(None);
        assert!(
            !reg.global_skills.contains_key("old_skill_that_should_vanish"),
            "manually inserted skill should be gone after reload"
        );
    }
}
