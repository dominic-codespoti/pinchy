use std::path::{Path, PathBuf};

use anyhow::Context;
use serde::{Deserialize, Serialize};

/// A reference to a secret value.
///
/// Supports three YAML forms:
///   - Plain string:  `token: $DISCORD_TOKEN`
///   - At-prefixed:   `token: "@DISCORD_TOKEN"`
///   - Pointer object: `token: { key: "DISCORD_TOKEN", source: "secrets" }`
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(untagged)]
pub enum SecretRef {
    /// Plain string or env-var / at-prefixed reference.
    Plain(String),
    /// Structured pointer: key + source ("secrets", "env", "keyring").
    Pointer { key: String, source: String },
}

/// Global secrets-store configuration.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct SecretsConfig {
    /// Path to the file-backed secrets directory.
    #[serde(default)]
    pub path: Option<String>,
    /// OS keyring service name (future use).
    #[serde(default)]
    pub keyring_service: Option<String>,
}

/// Skills gating configuration.
///
/// Controls which skills are available at the global or per-agent level.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct SkillsConfig {
    /// Master switch — when `false` all skills are removed.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Allowlist of skill ids. When non-empty only these skills are kept.
    #[serde(default)]
    pub allow: Vec<String>,
    /// Denylist of skill ids. Matching skills are removed after allow filtering.
    #[serde(default)]
    pub deny: Vec<String>,
    /// Skills with `operator_managed: true` are only kept if listed here.
    #[serde(default)]
    pub operator_allowed: Vec<String>,
}

fn default_true() -> bool {
    true
}

/// Top-level configuration loaded from `config.yaml`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Model provider definitions.
    pub models: Vec<ModelConfig>,
    /// Channel (e.g. Discord) settings.
    pub channels: ChannelsConfig,
    /// Agent definitions.
    pub agents: Vec<AgentConfig>,
    /// Global secrets configuration.
    #[serde(default)]
    pub secrets: Option<SecretsConfig>,
    /// Channel routing rules.
    #[serde(default)]
    pub routing: Option<RoutingConfig>,
    /// Skills gating configuration.
    #[serde(default)]
    pub skills: Option<SkillsConfig>,
    /// Session expiry in days. Sessions older than this are cleaned up
    /// on startup and by the periodic janitor. `None` or `0` disables expiry.
    /// Default: 30 days.
    #[serde(default = "default_session_expiry_days")]
    pub session_expiry_days: Option<u64>,
    /// Cron-session expiry in days. Cron sessions are short-lived one-turn
    /// files that accumulate quickly. Default: 7 days.
    #[serde(default = "default_cron_session_expiry_days")]
    pub cron_session_expiry_days: Option<u64>,
    /// Maximum number of heartbeat event files to keep in each agent's
    /// `cron_events/` directory. Oldest files are pruned first.
    /// Default: 50.
    #[serde(default = "default_cron_events_max_keep")]
    pub cron_events_max_keep: Option<usize>,
}

fn default_session_expiry_days() -> Option<u64> {
    Some(30)
}

fn default_cron_session_expiry_days() -> Option<u64> {
    Some(7)
}

fn default_cron_events_max_keep() -> Option<usize> {
    Some(50)
}

/// Channel routing rules.
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
pub struct RoutingConfig {
    /// Map of `channel:id` to `agent_id`.
    #[serde(flatten)]
    pub channels: std::collections::HashMap<String, String>,
    /// Fallback agent_id if no specific mapping exists.
    #[serde(default)]
    pub default_agent: Option<String>,
}

/// A configured LLM provider.
#[derive(Debug, Deserialize, Serialize)]
pub struct ModelConfig {
    /// Unique identifier for this provider entry (e.g. "openai-default").
    pub id: String,
    /// Provider kind: "openai", "azure-openai", "copilot", etc.
    pub provider: String,
    /// Model name to request (e.g. "gpt-4o").
    #[serde(default)]
    pub model: Option<String>,
    /// API key (plain text or env-var reference like `$OPENAI_API_KEY`).
    #[serde(default)]
    pub api_key: Option<String>,
    /// Azure OpenAI endpoint URL (e.g. "https://myresource.openai.azure.com").
    #[serde(default)]
    pub endpoint: Option<String>,
    /// Azure API version (e.g. "2024-10-21").
    #[serde(default)]
    pub api_version: Option<String>,
    /// Azure embedding deployment name.
    #[serde(default)]
    pub embedding_deployment: Option<String>,
}

/// Channel connector settings.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct ChannelsConfig {
    /// Discord bot configuration. Optional so the daemon can start without it.
    #[serde(default)]
    pub discord: Option<DiscordConfig>,
}

/// Discord-specific channel config.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct DiscordConfig {
    /// Bot token – plain string, env-var ref, or secret pointer.
    pub token: SecretRef,
}

/// Per-agent configuration.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct AgentConfig {
    /// Unique agent identifier.
    pub id: String,
    /// Filesystem path to the agent's **root** directory.
    ///
    /// This is the top-level agent directory (e.g. `agents/<id>`)
    /// containing SOUL.md, TOOLS.md, HEARTBEAT.md, and the `workspace/`
    /// subdirectory where tools and sessions are sandboxed.
    ///
    /// Accepts either `root` or `workspace` in YAML for backward compat.
    #[serde(alias = "workspace")]
    pub root: String,
    /// Which model config id this agent should use.
    #[serde(default)]
    pub model: Option<String>,
    /// Heartbeat interval in seconds. `None` disables heartbeat.
    #[serde(default)]
    pub heartbeat_secs: Option<u64>,
    /// Optional cron jobs to schedule for this agent.
    #[serde(default)]
    pub cron_jobs: Vec<CronJobConfig>,
    /// Maximum tool-call iterations per turn.  `None` uses the default (3).
    #[serde(default)]
    pub max_tool_iterations: Option<usize>,
    /// Skill IDs enabled for this agent.  `None` / absent means no skills.
    #[serde(default)]
    pub enabled_skills: Option<Vec<String>>,
    /// Ordered list of fallback model config ids.
    #[serde(default)]
    pub fallback_models: Vec<String>,
    /// Optional webhook secret for authenticating inbound webhook requests.
    #[serde(default)]
    pub webhook_secret: Option<String>,
    /// Extra commands allowed in `exec_shell` beyond the built-in allowlist.
    /// Example: `["python", "git", "cargo", "node", "npm"]`
    #[serde(default)]
    pub extra_exec_commands: Vec<String>,
}

/// A cron job definition attached to an agent.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct CronJobConfig {
    /// Human-readable name for the job.
    pub name: String,
    /// Cron expression (6-field: sec min hour dom month dow).
    pub schedule: String,
    /// Optional message to dispatch when the job fires.
    #[serde(default)]
    pub message: Option<String>,
}

impl Config {
    /// Read and parse a YAML configuration file.
    pub async fn load(path: &Path) -> anyhow::Result<Config> {
        let contents = match tokio::fs::read_to_string(path).await {
            Ok(c) => c,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // Try .bak fallback: config.yaml -> config.yaml.bak
                let mut bak_name = path.as_os_str().to_os_string();
                bak_name.push(".bak");
                let bak_path = PathBuf::from(bak_name);
                match tokio::fs::read_to_string(&bak_path).await {
                    Ok(c) => {
                        tracing::warn!(
                            path = %path.display(),
                            bak = %bak_path.display(),
                            "config file not found, falling back to .bak"
                        );
                        c
                    }
                    Err(_) => {
                        // Try pinchy_home fallback when filename is config.yaml
                        // and the path is relative (not an explicit absolute CLI override).
                        let filename = path.file_name().and_then(|f| f.to_str());
                        let eligible = filename == Some("config.yaml") && path.is_relative();
                        if eligible {
                            let home = crate::pinchy_home();
                            let home_path = home.join("config.yaml");
                            match tokio::fs::read_to_string(&home_path).await {
                                Ok(c) => {
                                    tracing::warn!(
                                        attempted = %path.display(),
                                        found = %home_path.display(),
                                        "config file not found, falling back to pinchy home"
                                    );
                                    c
                                }
                                Err(_) => {
                                    // Try pinchy_home .bak
                                    let home_bak = home.join("config.yaml.bak");
                                    match tokio::fs::read_to_string(&home_bak).await {
                                        Ok(c) => {
                                            tracing::warn!(
                                                attempted = %path.display(),
                                                found = %home_bak.display(),
                                                "config file not found, falling back to pinchy home .bak"
                                            );
                                            c
                                        }
                                        Err(_) => {
                                            return Err(e).with_context(|| {
                                                format!(
                                                    "failed to read config file: {}",
                                                    path.display()
                                                )
                                            });
                                        }
                                    }
                                }
                            }
                        } else {
                            return Err(e).with_context(|| {
                                format!("failed to read config file: {}", path.display())
                            });
                        }
                    }
                }
            }
            Err(e) => {
                return Err(e)
                    .with_context(|| format!("failed to read config file: {}", path.display()));
            }
        };

        let mut config: Config =
            serde_yaml::from_str(&contents).context("failed to parse config YAML")?;
        config.validate()?;

        // Resolve relative agent root paths against pinchy_home.
        let home = crate::pinchy_home();
        for agent in &mut config.agents {
            let ws = std::path::Path::new(&agent.root);
            if ws.is_relative() {
                agent.root = home.join(ws).to_string_lossy().to_string();
            }
        }

        tracing::debug!(
            agents = config.agents.len(),
            models = config.models.len(),
            "configuration loaded"
        );

        Ok(config)
    }

    /// Validate semantic constraints that serde cannot enforce.
    fn validate(&self) -> anyhow::Result<()> {
        use std::collections::HashSet;

        let model_ids: HashSet<&str> = self.models.iter().map(|m| m.id.as_str()).collect();

        // Check for duplicate model IDs
        if model_ids.len() != self.models.len() {
            anyhow::bail!("config: duplicate model IDs detected");
        }

        // Check for duplicate agent IDs
        let mut agent_ids = HashSet::new();
        for agent in &self.agents {
            if !agent_ids.insert(agent.id.as_str()) {
                anyhow::bail!("config: duplicate agent ID: {}", agent.id);
            }

            // Validate model reference
            if let Some(ref model) = agent.model {
                if !model_ids.contains(model.as_str()) {
                    anyhow::bail!(
                        "config: agent '{}' references unknown model '{}'",
                        agent.id,
                        model
                    );
                }
            }

            // Validate fallback model references
            for fb in &agent.fallback_models {
                if !model_ids.contains(fb.as_str()) {
                    anyhow::bail!(
                        "config: agent '{}' fallback references unknown model '{}'",
                        agent.id,
                        fb
                    );
                }
            }

            // Validate heartbeat_secs
            if agent.heartbeat_secs == Some(0) {
                anyhow::bail!(
                    "config: agent '{}' has heartbeat_secs=0 (would create busy loop)",
                    agent.id
                );
            }

            // Validate cron schedules
            for job in &agent.cron_jobs {
                if job.schedule.trim().is_empty() {
                    anyhow::bail!(
                        "config: agent '{}' cron job '{}' has empty schedule",
                        agent.id,
                        job.name
                    );
                }
            }
        }

        Ok(())
    }

    /// Serialize and write the configuration back to a YAML file.
    pub async fn save(&self, path: &Path) -> anyhow::Result<()> {
        let contents = serde_yaml::to_string(self).context("serialize config YAML")?;
        tokio::fs::write(path, &contents)
            .await
            .with_context(|| format!("failed to write config file: {}", path.display()))?;
        tracing::debug!(path = %path.display(), "configuration saved");
        Ok(())
    }
}
