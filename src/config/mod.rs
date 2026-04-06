use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::sync::OnceLock;
use std::time::SystemTime;

use anyhow::Context;
use chrono_tz::{Tz, UTC};
use http::header::{HeaderName, HeaderValue};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

pub mod shared_memory;

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

fn normalize_http_headers(
    headers: &mut Option<std::collections::HashMap<String, String>>,
    owner: &str,
) -> anyhow::Result<()> {
    let Some(map) = headers.take() else {
        return Ok(());
    };

    let mut normalized = std::collections::HashMap::new();
    for (name, value) in map {
        let header_name = HeaderName::from_bytes(name.as_bytes())
            .with_context(|| format!("config: {owner} has invalid header name '{name}'"))?;
        HeaderValue::from_str(&value)
            .with_context(|| format!("config: {owner} has invalid value for header '{name}'"))?;

        let key = header_name.as_str().to_string();
        if normalized.insert(key.clone(), value).is_some() {
            anyhow::bail!("config: {owner} has duplicate header '{key}'");
        }
    }

    if !normalized.is_empty() {
        *headers = Some(normalized);
    }

    Ok(())
}

fn validate_http_headers(
    headers: &Option<std::collections::HashMap<String, String>>,
    owner: &str,
) -> anyhow::Result<()> {
    if let Some(map) = headers {
        let mut seen = std::collections::HashSet::new();
        for (name, value) in map {
            let header_name = HeaderName::from_bytes(name.as_bytes())
                .with_context(|| format!("config: {owner} has invalid header name '{name}'"))?;
            HeaderValue::from_str(value).with_context(|| {
                format!("config: {owner} has invalid value for header '{name}'")
            })?;

            let canonical = header_name.as_str().to_ascii_lowercase();
            if !seen.insert(canonical.clone()) {
                anyhow::bail!("config: {owner} has duplicate header '{canonical}'");
            }
        }
    }

    Ok(())
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
    /// MCP server definitions.
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub mcp_servers: std::collections::HashMap<String, crate::mcp::McpServerConfig>,
    /// Shared memory configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shared_memory: Option<shared_memory::SharedMemoryConfig>,
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

/// Stable fallback Copilot model used when an agent only specifies the provider.
pub const COPILOT_FALLBACK_MODEL_ID: &str = "copilot-default";
pub const COPILOT_FALLBACK_MODEL_NAME: &str = "Copilot default";

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
#[derive(Debug, Clone, Default, Deserialize, Serialize, JsonSchema)]
#[serde(deny_unknown_fields)]
pub struct AgentConfig {
    /// Unique agent identifier.
    pub id: String,
    /// Filesystem path to the agent's **root** directory.
    pub root: String,
    /// Model id to use for inference.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    /// Provider kind: "openai", "anthropic", "copilot", etc.
    /// If unset, the provider is derived from the model configuration.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
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
    /// Per-agent HTTP header overrides merged on top of model headers.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub header_overrides: Option<std::collections::HashMap<String, String>>,
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
    /// Return the first config entry for a provider/model pair.
    pub fn find_model_by_provider_and_name(
        &self,
        provider: &str,
        model: &str,
    ) -> Option<&ModelConfig> {
        self.models
            .iter()
            .find(|m| m.provider == provider && m.model.as_deref().unwrap_or(&m.id) == model)
    }

    /// Return the first config entry for a provider.
    pub fn find_model_by_provider(&self, provider: &str) -> Option<&ModelConfig> {
        self.models.iter().find(|m| m.provider == provider)
    }

    /// Return the config entry matching a legacy model ID reference.
    pub fn find_model_by_id(&self, model_id: &str) -> Option<&ModelConfig> {
        self.models.iter().find(|m| m.id == model_id)
    }

    /// Resolve an agent's effective provider/model pair.
    pub fn resolve_agent_model_pair(&self, agent: &AgentConfig) -> Option<(String, String)> {
        match (agent.provider.as_deref(), agent.model.as_deref()) {
            (Some(provider), Some(model)) if !provider.is_empty() && !model.is_empty() => {
                Some((provider.to_string(), model.to_string()))
            }
            (Some("copilot"), _) => {
                Some(("copilot".to_string(), COPILOT_FALLBACK_MODEL_ID.to_string()))
            }
            (Some(provider), None) if !provider.is_empty() => {
                self.find_model_by_provider(provider).map(|mc| {
                    (
                        mc.provider.clone(),
                        mc.model.clone().unwrap_or_else(|| mc.id.clone()),
                    )
                })
            }
            (None, Some(model_id)) if !model_id.is_empty() => {
                self.find_model_by_id(model_id).map(|mc| {
                    (
                        mc.provider.clone(),
                        mc.model.clone().unwrap_or_else(|| mc.id.clone()),
                    )
                })
            }
            _ => None,
        }
    }

    /// Normalize legacy agent model references in-place.
    fn normalize_agent_models(&mut self) {
        let resolved_pairs: Vec<Option<(String, String)>> = self
            .agents
            .iter()
            .map(|agent| self.resolve_agent_model_pair(agent))
            .collect();

        for (agent, resolved) in self.agents.iter_mut().zip(resolved_pairs) {
            if let Some((provider, model)) = resolved {
                agent.provider = Some(provider);
                agent.model = Some(model);
            }
        }
    }

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
        let mut config = Self::load_raw(path).await?;
        config.normalize_agent_models();
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

    /// Load config from disk **without** validation.
    ///
    /// Use this when you need to patch a potentially-broken config
    /// (e.g. fixing an invalid model reference) before saving it back.
    /// The caller is responsible for ensuring the config is valid
    /// before calling [`save`], which validates before writing.
    pub async fn load_unvalidated(path: &Path) -> anyhow::Result<Config> {
        let mut config = Self::load_raw(path).await?;
        config.normalize_agent_models();

        // Resolve relative agent root paths against pinchy_home.
        let home = crate::pinchy_home();
        for agent in &mut config.agents {
            let ws = std::path::Path::new(&agent.root);
            if ws.is_relative() {
                agent.root = home.join(ws).to_string_lossy().to_string();
            }
        }

        Ok(config)
    }

    /// Read and parse YAML from disk — no validation, no path resolution.
    async fn load_raw(path: &Path) -> anyhow::Result<Config> {
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

        let config: Config =
            serde_yaml_ng::from_str(&contents).context("failed to parse config YAML")?;

        Ok(config)
    }

    /// Validate semantic constraints that serde cannot enforce.
    fn validate(&self) -> anyhow::Result<()> {
        use std::collections::HashSet;

        const KNOWN_PROVIDERS: &[&str] = &[
            "anthropic",
            "bedrock",
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
            validate_http_headers(&model.headers, &format!("model '{}'", model.id))?;
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

            // Validate raw provider/model pairing shape.
            match (
                agent.provider.as_deref().filter(|v| !v.is_empty()),
                agent.model.as_deref().filter(|v| !v.is_empty()),
            ) {
                (Some(_), Some(_)) | (None, None) | (Some("copilot"), None) => {}
                _ => {
                    anyhow::bail!(
                        "config: agent '{}' must set provider and model together",
                        agent.id
                    );
                }
            }

            validate_http_headers(&agent.header_overrides, &format!("agent '{}'", agent.id))?;

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

    /// Validate and return warnings (non-fatal issues) in addition to errors.
    ///
    /// Used by `pinchy config validate` to give richer diagnostic output.
    /// Returns `Ok(warnings)` on success or `Err` if config is fundamentally broken.
    pub fn validate_for_cli(&self) -> anyhow::Result<Vec<String>> {
        // Run the standard validation first (returns Err on hard failures).
        self.validate()?;

        let mut warnings = Vec::new();

        // Check for agents with no model assigned.
        for agent in &self.agents {
            let is_copilot = agent.provider.as_deref() == Some("copilot");
            if !is_copilot && agent.model.as_deref().map(str::is_empty).unwrap_or(true) {
                warnings.push(format!(
                    "agent '{}' has no model assigned — will use first available",
                    agent.id
                ));
            }
        }

        // Check for models with no API key.
        for model in &self.models {
            let needs_key = !matches!(
                model.provider.as_str(),
                "copilot" | "ollama" | "lmstudio" | "vllm" | "anthropic"
            );
            if needs_key && model.api_key.is_none() {
                warnings.push(format!(
                    "model '{}' (provider: {}) has no api_key configured",
                    model.id, model.provider,
                ));
            }
        }

        // Check for Azure OpenAI models missing endpoint.
        for model in &self.models {
            if matches!(
                model.provider.as_str(),
                "azure-openai" | "azure_openai" | "azure"
            ) && model.endpoint.is_none()
            {
                warnings.push(format!(
                    "model '{}' (azure-openai) has no endpoint configured",
                    model.id,
                ));
            }
        }

        // Check Discord config is present when agents exist.
        if !self.agents.is_empty() && self.channels.discord.is_none() {
            warnings.push("no discord channel configured — bot will not connect".into());
        }

        Ok(warnings)
    }

    /// Serialize and write the configuration back to a YAML file.
    pub async fn save(&self, path: &Path) -> anyhow::Result<()> {
        let mut normalized = self.clone();
        normalized.normalize_agent_models();
        for model in &mut normalized.models {
            normalize_http_headers(&mut model.headers, &format!("model '{}'", model.id))?;
        }
        for agent in &mut normalized.agents {
            normalize_http_headers(
                &mut agent.header_overrides,
                &format!("agent '{}'", agent.id),
            )?;
        }
        normalized
            .validate()
            .context("refusing to save invalid config")?;
        let contents = serde_yaml_ng::to_string(&normalized).context("serialize config YAML")?;
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

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_channels() -> ChannelsConfig {
        ChannelsConfig {
            discord: None,
            default_channel: None,
        }
    }

    #[test]
    fn copilot_provider_with_empty_model_resolves_to_stable_fallback() {
        let cfg = Config {
            models: vec![],
            channels: empty_channels(),
            agents: vec![AgentConfig {
                id: "agent-a".into(),
                root: "agents/agent-a".into(),
                model: None,
                provider: Some("copilot".into()),
                ..Default::default()
            }],
            secrets: None,
            routing: None,
            skills: None,
            timezone: None,
            session_expiry_days: Some(30),
            cron_session_expiry_days: Some(7),
            cron_events_max_keep: Some(50),
            chromium_path: None,
            mcp_servers: std::collections::HashMap::new(),
            shared_memory: None,
        };

        let resolved = cfg.resolve_agent_model_pair(&cfg.agents[0]);
        assert_eq!(
            resolved,
            Some(("copilot".to_string(), COPILOT_FALLBACK_MODEL_ID.to_string()))
        );
    }

    #[test]
    fn normalize_agent_models_fills_copilot_fallback() {
        let mut cfg = Config {
            models: vec![],
            channels: empty_channels(),
            agents: vec![AgentConfig {
                id: "agent-a".into(),
                root: "agents/agent-a".into(),
                model: None,
                provider: Some("copilot".into()),
                ..Default::default()
            }],
            secrets: None,
            routing: None,
            skills: None,
            timezone: None,
            session_expiry_days: Some(30),
            cron_session_expiry_days: Some(7),
            cron_events_max_keep: Some(50),
            chromium_path: None,
            mcp_servers: std::collections::HashMap::new(),
            shared_memory: None,
        };

        cfg.normalize_agent_models();

        assert_eq!(cfg.agents[0].provider.as_deref(), Some("copilot"));
        assert_eq!(
            cfg.agents[0].model.as_deref(),
            Some(COPILOT_FALLBACK_MODEL_ID)
        );
    }

    #[test]
    fn validate_allows_copilot_without_explicit_model() {
        let cfg = Config {
            models: vec![],
            channels: empty_channels(),
            agents: vec![AgentConfig {
                id: "agent-a".into(),
                root: "agents/agent-a".into(),
                model: None,
                provider: Some("copilot".into()),
                ..Default::default()
            }],
            secrets: None,
            routing: None,
            skills: None,
            timezone: None,
            session_expiry_days: Some(30),
            cron_session_expiry_days: Some(7),
            cron_events_max_keep: Some(50),
            chromium_path: None,
            mcp_servers: std::collections::HashMap::new(),
            shared_memory: None,
        };

        assert!(cfg.validate().is_ok());
    }
}
