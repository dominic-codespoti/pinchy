use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::OnceLock;
use std::time::SystemTime;

use anyhow::Context;
use chrono_tz::{Tz, UTC};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

static CONFIG_LOCK: Mutex<()> = Mutex::const_new(());

/// Acquire an exclusive lock for config read-modify-write operations.
/// Use this to prevent concurrent config mutations from overwriting each
/// other's changes.
pub async fn config_lock() -> tokio::sync::MutexGuard<'static, ()> {
    CONFIG_LOCK.lock().await
}

// ---------------------------------------------------------------------------
// Config cache — avoids re-reading + re-parsing config.yaml every turn.
// Invalidated automatically when the file's mtime changes.
// ---------------------------------------------------------------------------
struct CachedConfig {
    config: Config,
    mtime: SystemTime,
    path: PathBuf,
}

static CONFIG_CACHE: OnceLock<tokio::sync::Mutex<Option<CachedConfig>>> = OnceLock::new();

fn cache_slot() -> &'static tokio::sync::Mutex<Option<CachedConfig>> {
    CONFIG_CACHE.get_or_init(|| tokio::sync::Mutex::new(None))
}

/// Invalidate the config cache.  Call after any config write.
pub fn invalidate_config_cache() {
    if let Some(slot) = CONFIG_CACHE.get() {
        if let Ok(mut guard) = slot.try_lock() {
            *guard = None;
        }
    }
}

/// A reference to a secret value.
///
/// Supports three YAML forms:
///   - Plain string:  `token: $DISCORD_TOKEN`
///   - At-prefixed:   `token: "@DISCORD_TOKEN"`
///   - Pointer object: `token: { key: "DISCORD_TOKEN", source: "secrets" }`
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(untagged)]
pub enum SecretRef {
    /// Plain string or env-var / at-prefixed reference.
    Plain(String),
    /// Structured pointer: key + source ("secrets", "env", "keyring").
    Pointer { key: String, source: String },
}

/// Global secrets-store configuration.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct SecretsConfig {
    /// Path to the file-backed secrets directory.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    /// OS keyring service name (future use).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub keyring_service: Option<String>,
}

/// Skills gating configuration.
///
/// Controls which skills are available at the global or per-agent level.
#[derive(Debug, Clone, Deserialize, Serialize, Default, JsonSchema)]
pub struct SkillsConfig {
    /// Master switch — when `false` all skills are removed.
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Allowlist of skill ids. When non-empty only these skills are kept.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub allow: Vec<String>,
    /// Denylist of skill ids. Matching skills are removed after allow filtering.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub deny: Vec<String>,
    /// Skills with `operator_managed: true` are only kept if listed here.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub operator_allowed: Vec<String>,
}

fn default_true() -> bool {
    true
}

/// Top-level configuration loaded from `config.yaml`.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct Config {
    /// Model provider definitions.
    pub models: Vec<ModelConfig>,
    /// Channel (e.g. Discord) settings.
    pub channels: ChannelsConfig,
    /// Agent definitions.
    pub agents: Vec<AgentConfig>,
    /// Global secrets configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secrets: Option<SecretsConfig>,
    /// Channel routing rules.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub routing: Option<RoutingConfig>,
    /// Skills gating configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skills: Option<SkillsConfig>,
    /// IANA timezone for the instance (e.g. "America/New_York").
    /// Used for cron scheduling, prompt context, and display.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    /// Session expiry in days. Sessions older than this are cleaned up
    /// on startup and by the periodic janitor. `None` or `0` disables expiry.
    /// Default: 30 days.
    #[serde(
        default = "default_session_expiry_days",
        skip_serializing_if = "Option::is_none"
    )]
    pub session_expiry_days: Option<u64>,
    /// Cron-session expiry in days. Cron sessions are short-lived one-turn
    /// files that accumulate quickly. Default: 7 days.
    #[serde(
        default = "default_cron_session_expiry_days",
        skip_serializing_if = "Option::is_none"
    )]
    pub cron_session_expiry_days: Option<u64>,
    /// Maximum number of heartbeat event files to keep in each agent's
    /// `cron_events/` directory. Oldest files are pruned first.
    /// Default: 50.
    #[serde(
        default = "default_cron_events_max_keep",
        skip_serializing_if = "Option::is_none"
    )]
    pub cron_events_max_keep: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chromium_path: Option<String>,
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
#[derive(Debug, Clone, Deserialize, Serialize, Default, JsonSchema)]
pub struct RoutingConfig {
    /// Map of `channel:id` to `agent_id`.
    #[serde(flatten)]
    pub channels: std::collections::HashMap<String, String>,
    /// Fallback agent_id if no specific mapping exists.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_agent: Option<String>,
}

/// A configured LLM provider.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
pub struct ModelConfig {
    /// Unique identifier for this provider entry (e.g. "openai-default").
    pub id: String,
    /// Provider kind: "openai", "azure-openai", "copilot", etc.
    pub provider: String,
    /// Model name to request (e.g. "gpt-4o").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// API key (plain text or env-var reference like `$OPENAI_API_KEY`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// Azure OpenAI endpoint URL (e.g. "https://myresource.openai.azure.com").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub endpoint: Option<String>,
    /// Azure API version (e.g. "2024-10-21").
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_version: Option<String>,
    /// Azure embedding deployment name.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub embedding_deployment: Option<String>,
    /// Embedding model override (e.g. "text-embedding-3-small").
    /// If unset, the provider's default embedding model is used.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub embedding_model: Option<String>,
    /// Extra HTTP headers to send with every request to this provider.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub headers: Option<std::collections::HashMap<String, String>>,
}

/// Channel connector settings.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct ChannelsConfig {
    /// Discord bot configuration. Optional so the daemon can start without it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub discord: Option<DiscordConfig>,
    /// Default channel for outbound messages when the agent omits `channel_id`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub default_channel: Option<DefaultChannel>,
}

/// The kind of default channel target.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize, Default, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum ChannelKind {
    /// A Discord text channel (or any numeric channel id).
    #[default]
    Channel,
    /// A Discord user — messages are delivered via DM.
    User,
    /// A Discord group / thread.
    Group,
}

/// Rich default-channel specification.
///
/// Can be deserialized from a plain string (backward compat — treated as
/// `kind: channel`) or a rich object:
///
/// ```yaml
/// # plain string (backward compat)
/// default_channel: "123456789012345678"
///
/// # rich object
/// default_channel:
///   kind: user
///   id: "237445681323704321"
/// ```
#[derive(Debug, Clone, Serialize, JsonSchema)]
pub struct DefaultChannel {
    pub kind: ChannelKind,
    pub id: String,
}

impl DefaultChannel {
    /// Resolve to a channel string that the connector layer understands.
    /// - `kind: channel` → `"<id>"` (plain numeric)
    /// - `kind: user` → `"dm:<id>"`
    /// - `kind: group` → `"<id>"` (same as channel for now)
    pub fn to_channel_string(&self) -> String {
        match self.kind {
            ChannelKind::User => format!("dm:{}", self.id),
            ChannelKind::Channel | ChannelKind::Group => self.id.clone(),
        }
    }
}

impl<'de> Deserialize<'de> for DefaultChannel {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de;

        #[derive(Deserialize)]
        struct RichForm {
            kind: ChannelKind,
            id: String,
        }

        struct DefaultChannelVisitor;

        impl<'de> de::Visitor<'de> for DefaultChannelVisitor {
            type Value = DefaultChannel;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("a channel id string or { kind, id } object")
            }

            fn visit_str<E: de::Error>(self, v: &str) -> Result<Self::Value, E> {
                Ok(DefaultChannel {
                    kind: ChannelKind::Channel,
                    id: v.to_string(),
                })
            }

            fn visit_map<A: de::MapAccess<'de>>(self, map: A) -> Result<Self::Value, A::Error> {
                let rich: RichForm =
                    Deserialize::deserialize(de::value::MapAccessDeserializer::new(map))?;
                Ok(DefaultChannel {
                    kind: rich.kind,
                    id: rich.id,
                })
            }
        }

        deserializer.deserialize_any(DefaultChannelVisitor)
    }
}

/// Discord-specific channel config.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct DiscordConfig {
    /// Bot token – plain string, env-var ref, or secret pointer.
    pub token: SecretRef,
}

/// Per-agent configuration.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AgentConfig {
    /// Unique agent identifier.
    pub id: String,
    /// Filesystem path to the agent's **root** directory.
    pub root: String,
    /// Model id to use for inference.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Seconds between heartbeat pings (0 = disabled).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub heartbeat_secs: Option<u64>,
    /// Cron jobs scheduled by this agent.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub cron_jobs: Vec<CronJobConfig>,
    /// Maximum tool call iterations per agent turn.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_tool_iterations: Option<usize>,
    /// Skills explicitly enabled for this agent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub enabled_skills: Option<Vec<String>>,
    /// Fallback model ids tried when the primary model fails.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub fallback_models: Vec<String>,
    /// Shared secret for verifying inbound webhook payloads.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub webhook_secret: Option<String>,
    /// Additional shell commands the agent is allowed to execute.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub extra_exec_commands: Vec<String>,
    /// Number of recent messages to load as conversational context.
    /// Defaults to 40 if unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub history_messages: Option<usize>,
    /// Maximum conversation turns before compaction kicks in.
    /// Defaults to 20 if unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<usize>,
    /// Number of recent turns to keep intact during compaction.
    /// Defaults to 8 if unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub compact_keep_recent_turns: Option<usize>,
    /// Per-agent IANA timezone override (e.g. "Europe/London").
    /// Falls back to the global `timezone` if unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    /// Directories to watch for automatic memory ingest.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub watch_paths: Vec<String>,
    /// Reasoning effort level: "low", "medium", or "high".
    /// Controls extended thinking budget for Claude and reasoning effort for OpenAI.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

/// A cron job definition attached to an agent.
#[derive(Debug, Clone, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct CronJobConfig {
    /// Human-readable name for the job.
    pub name: String,
    /// Cron expression (6-field: sec min hour dom month dow).
    pub schedule: String,
    /// Optional message to dispatch when the job fires.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

impl Config {
    /// Resolve the effective timezone for an agent.
    ///
    /// Priority: agent-level → global config → system local → UTC.
    pub fn resolve_timezone(&self, agent_id: &str) -> Tz {
        let agent_tz = self
            .agents
            .iter()
            .find(|a| a.id == agent_id)
            .and_then(|a| a.timezone.as_deref());

        let raw = agent_tz.or(self.timezone.as_deref()).unwrap_or("UTC");
        raw.parse::<Tz>().unwrap_or(UTC)
    }

    /// Resolve the global timezone (ignoring per-agent overrides).
    pub fn resolve_global_timezone(&self) -> Tz {
        self.timezone
            .as_deref()
            .and_then(|s| s.parse::<Tz>().ok())
            .unwrap_or(UTC)
    }

    /// Read and parse a YAML configuration file.
    ///
    /// Results are cached by file path and mtime — repeated calls within
    /// the same second return the cached copy without touching disk.
    pub async fn load(path: &Path) -> anyhow::Result<Config> {
        // Try cache first: if path + mtime match, return clone.
        let canonical = path.to_path_buf();
        if let Ok(meta) = tokio::fs::metadata(&canonical).await {
            if let Ok(mtime) = meta.modified() {
                let slot = cache_slot().lock().await;
                if let Some(ref cached) = *slot {
                    if cached.path == canonical && cached.mtime == mtime {
                        return Ok(cached.config.clone());
                    }
                }
                // Release lock before doing the heavy load below.
                drop(slot);

                let config = Self::load_inner(path).await?;

                // Store in cache.
                let mut slot = cache_slot().lock().await;
                *slot = Some(CachedConfig {
                    config: config.clone(),
                    mtime,
                    path: canonical,
                });
                return Ok(config);
            }
        }

        // Fallback: no metadata available (file missing?), load without caching.
        Self::load_inner(path).await
    }

    /// Inner load — reads from disk, parses, validates.
    async fn load_inner(path: &Path) -> anyhow::Result<Config> {
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
            serde_yaml_ng::from_str(&contents).context("failed to parse config YAML")?;
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

        const KNOWN_PROVIDERS: &[&str] = &[
            "openai",
            "azure-openai",
            "azure_openai",
            "azure",
            "copilot",
            "openai-compat",
            "openai_compat",
            "compat",
            "openrouter",
            "ollama",
            "groq",
            "together",
            "fireworks",
            "mistral",
            "lmstudio",
            "vllm",
            "deepseek",
            "xai",
        ];

        let model_ids: HashSet<&str> = self.models.iter().map(|m| m.id.as_str()).collect();

        // Check for duplicate model IDs
        if model_ids.len() != self.models.len() {
            anyhow::bail!("config: duplicate model IDs detected");
        }

        // Validate provider names
        for model in &self.models {
            if !KNOWN_PROVIDERS.contains(&model.provider.as_str()) {
                tracing::warn!(
                    provider = %model.provider,
                    model_id = %model.id,
                    "config: unknown provider '{}' for model '{}' — \
                     known providers: {}",
                    model.provider,
                    model.id,
                    KNOWN_PROVIDERS.join(", "),
                );
            }
        }

        // Validate global timezone
        if let Some(ref tz) = self.timezone {
            if tz.parse::<chrono_tz::Tz>().is_err() {
                anyhow::bail!("config: invalid timezone '{tz}'");
            }
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

            // Validate agent timezone
            if let Some(ref tz) = agent.timezone {
                if tz.parse::<chrono_tz::Tz>().is_err() {
                    anyhow::bail!("config: agent '{}' has invalid timezone '{tz}'", agent.id);
                }
            }

            // Validate cron schedules (syntax, not just non-empty)
            for job in &agent.cron_jobs {
                let sched = job.schedule.trim();
                if sched.is_empty() {
                    anyhow::bail!(
                        "config: agent '{}' cron job '{}' has empty schedule",
                        agent.id,
                        job.name
                    );
                }
                if cron::Schedule::from_str(sched).is_err() {
                    anyhow::bail!(
                        "config: agent '{}' cron job '{}' has invalid schedule '{}' \
                         — expected a 6 or 7 field cron expression",
                        agent.id,
                        job.name,
                        sched,
                    );
                }
            }
        }

        Ok(())
    }

    /// Serialize and write the configuration back to a YAML file.
    pub async fn save(&self, path: &Path) -> anyhow::Result<()> {
        let contents = serde_yaml_ng::to_string(self).context("serialize config YAML")?;
        tokio::fs::write(path, &contents)
            .await
            .with_context(|| format!("failed to write config file: {}", path.display()))?;
        invalidate_config_cache();
        tracing::debug!(path = %path.display(), "configuration saved (cache invalidated)");
        Ok(())
    }

    pub fn json_schema() -> schemars::Schema {
        schemars::schema_for!(Config)
    }
}
