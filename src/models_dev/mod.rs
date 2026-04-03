//! Models.dev registry — centralized model metadata from https://models.dev/api.json
//!
//! This module fetches provider and model metadata from the models.dev API
//! (or a local snapshot) and caches it with a 60-minute TTL.

use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;
use tokio::sync::RwLock;
use tracing::{debug, info};

/// Global singleton for the models.dev registry.
/// Initialized lazily via [`get_or_load_registry`] or [`refresh_registry`].
static REGISTRY: OnceLock<RwLock<Option<ModelsDevRegistry>>> = OnceLock::new();

/// API endpoint for the models.dev data.
const API_URL: &str = "https://models.dev/api.json";

/// Cache TTL in minutes.
const CACHE_TTL_MINUTES: i64 = 60;

/// HTTP timeout for fetching in seconds.
const FETCH_TIMEOUT_SECONDS: u64 = 30;

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/// Deserialize an f64 that might come in as various types (number, string, bool, null).
/// Returns None for any non-numeric value.
fn deserialize_flexible_f64<'de, D>(deserializer: D) -> Result<Option<f64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{self, Visitor};
    use std::fmt;

    struct F64Visitor;

    impl<'de> Visitor<'de> for F64Visitor {
        type Value = Option<f64>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a number, string representing a number, or null")
        }

        fn visit_f64<E>(self, value: f64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Some(value))
        }

        fn visit_i64<E>(self, value: i64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Some(value as f64))
        }

        fn visit_u64<E>(self, value: u64) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Some(value as f64))
        }

        fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            value
                .parse()
                .ok()
                .map(Some)
                .ok_or_else(|| de::Error::custom(format!("invalid numeric string: {}", value)))
        }

        fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            value
                .parse()
                .ok()
                .map(Some)
                .ok_or_else(|| de::Error::custom(format!("invalid numeric string: {}", value)))
        }

        fn visit_bool<E>(self, _value: bool) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            // Booleans are not valid temperatures - return None
            Ok(None)
        }

        fn visit_none<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(None)
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(None)
        }
    }

    deserializer.deserialize_any(F64Visitor)
}

/// Deserialize a boolean that might come in as various types (bool, object, null).
/// Returns `Some(true)` if the value is a truthy boolean or a non-empty object.
/// Returns `Some(false)` if the value is `false`.
/// Returns `None` for null or missing values.
fn deserialize_flexible_bool<'de, D>(deserializer: D) -> Result<Option<bool>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    use serde::de::{self, Visitor};
    use std::fmt;

    struct BoolVisitor;

    impl<'de> Visitor<'de> for BoolVisitor {
        type Value = Option<bool>;

        fn expecting(&self, formatter: &mut fmt::Formatter) -> fmt::Result {
            formatter.write_str("a boolean, object, or null")
        }

        fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(Some(value))
        }

        fn visit_map<M>(self, mut map: M) -> Result<Self::Value, M::Error>
        where
            M: de::MapAccess<'de>,
        {
            // If it's a map (object), treat it as `true` (attachments are supported)
            // Consume the map to satisfy the deserializer
            while map
                .next_entry::<serde::de::IgnoredAny, serde::de::IgnoredAny>()?
                .is_some()
            {}
            Ok(Some(true))
        }

        fn visit_none<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(None)
        }

        fn visit_unit<E>(self) -> Result<Self::Value, E>
        where
            E: de::Error,
        {
            Ok(None)
        }
    }

    deserializer.deserialize_any(BoolVisitor)
}

// ---------------------------------------------------------------------------
// Data Types
// ---------------------------------------------------------------------------

/// A single model entry from models.dev.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsDevModel {
    /// Unique key for the model (e.g., "gpt-4o").
    /// Falls back to `id` when not present (models.dev map format).
    #[serde(default)]
    pub model_key: Option<String>,
    /// Model ID (usually same as model_key).
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// Model family (e.g., "gpt-4", "claude-3").
    #[serde(default)]
    pub family: Option<String>,
    /// Release date in YYYY-MM-DD format.
    #[serde(default)]
    pub release_date: Option<String>,
    /// Last update date in YYYY-MM-DD format.
    #[serde(default)]
    pub last_updated: Option<String>,
    /// Whether the model supports file/image attachments.
    #[serde(default, deserialize_with = "deserialize_flexible_bool")]
    pub attachment: Option<bool>,
    /// Whether the model supports reasoning/thinking.
    #[serde(default)]
    pub reasoning: Option<bool>,
    /// Whether the model supports tool calling.
    #[serde(default)]
    pub tool_call: Option<bool>,
    /// Temperature setting (nullable).
    #[serde(default, deserialize_with = "deserialize_flexible_f64")]
    pub temperature: Option<f64>,
    /// Default temperature (nullable).
    #[serde(default, deserialize_with = "deserialize_flexible_f64")]
    pub default_temperature: Option<f64>,
    /// Pricing information.
    #[serde(default)]
    pub cost: Option<ModelsDevCost>,
    /// Context and output limits.
    #[serde(default)]
    pub limit: Option<ModelsDevLimit>,
    /// Input/output modalities.
    #[serde(default)]
    pub modalities: Option<ModelsDevModalities>,
    /// Whether the model is free (nullable).
    #[serde(default)]
    pub is_free: Option<bool>,
    /// Recommended index for sorting (nullable).
    #[serde(default, rename = "recommendedIndex")]
    pub recommended_index: Option<i32>,
    /// System prompt or instructions (nullable).
    #[serde(default)]
    pub prompt: Option<String>,
    /// Whether the model has open weights.
    #[serde(default)]
    pub open_weights: Option<bool>,
    /// Knowledge cutoff date.
    #[serde(default)]
    pub knowledge: Option<String>,
    /// Status (e.g., "stable", "preview", null).
    #[serde(default)]
    pub status: Option<String>,
    /// Whether the model is experimental.
    #[serde(default)]
    pub experimental: Option<bool>,
    /// Support level (nullable).
    #[serde(default)]
    pub support: Option<String>,
}

/// Pricing information for a model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsDevCost {
    /// Cost per 1M input tokens (in USD).
    #[serde(default)]
    pub input: Option<f64>,
    /// Cost per 1M output tokens (in USD).
    #[serde(default)]
    pub output: Option<f64>,
    /// Cost per 1M cache read tokens.
    #[serde(default)]
    pub cache_read: Option<f64>,
    /// Cost per 1M cache write tokens.
    #[serde(default)]
    pub cache_write: Option<f64>,
}

/// Context window and output limits for a model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsDevLimit {
    /// Context window size in tokens.
    #[serde(default)]
    pub context: Option<u64>,
    /// Maximum output tokens.
    #[serde(default)]
    pub output: Option<u64>,
}

/// Input and output modalities supported by a model.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsDevModalities {
    /// Input modalities (e.g., ["text", "image"]).
    #[serde(default)]
    pub input: Option<Vec<String>>,
    /// Output modalities (e.g., ["text"]).
    #[serde(default)]
    pub output: Option<Vec<String>>,
}

/// A provider entry from models.dev.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsDevProvider {
    /// Provider ID (e.g., "openai", "anthropic").
    pub id: String,
    /// Human-readable provider name.
    pub name: String,
    /// Environment variables required (e.g., ["OPENAI_API_KEY"]).
    #[serde(default)]
    pub env: Vec<String>,
    /// NPM package for AI SDK compatibility.
    #[serde(default)]
    pub npm: Option<String>,
    /// Base API URL.
    #[serde(default)]
    pub api: Option<String>,
    /// Documentation URL.
    #[serde(default)]
    pub doc: Option<String>,
    /// Authentication type (e.g., "bearer", null).
    #[serde(default)]
    pub auth_type: Option<String>,
    /// Prompt/instructions for using this provider (nullable).
    #[serde(default)]
    pub prompt: Option<String>,
    /// AI SDK provider identifier (nullable).
    #[serde(default, rename = "ai_sdk_provider")]
    pub ai_sdk_provider: Option<String>,
    /// Models available from this provider.
    #[serde(default)]
    pub models: Vec<ModelsDevModel>,
}

/// The cached registry wrapper containing all providers and metadata.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelsDevRegistry {
    /// List of all providers and their models.
    pub providers: Vec<ModelsDevProvider>,
    /// When this registry was cached.
    pub cached_at: DateTime<Utc>,
}

// ---------------------------------------------------------------------------
// Cache Helpers
// ---------------------------------------------------------------------------

/// Returns the path to the cache file (~/.config/pinchy/models-cache.json).
fn cache_path() -> Result<PathBuf> {
    let config_dir = dirs::config_dir()
        .context("failed to determine config directory")?
        .join("pinchy");

    // Ensure the directory exists.
    std::fs::create_dir_all(&config_dir).with_context(|| {
        format!(
            "failed to create config directory: {}",
            config_dir.display()
        )
    })?;

    Ok(config_dir.join("models-cache.json"))
}

// ---------------------------------------------------------------------------
// Registry Implementation
// ---------------------------------------------------------------------------

/// Path to the bundled snapshot file.
const BUNDLED_SNAPSHOT_PATH: &str = "/tmp/complete_model_snapshot.json";

impl ModelsDevRegistry {
    /// Load the registry from cache, API, or bundled snapshot.
    ///
    /// Tries in order:
    /// 1. Fresh cache (within 60 min TTL)
    /// 2. Fetch from models.dev API
    /// 3. Load from bundled snapshot at `/tmp/complete_model_snapshot.json`
    /// 4. Return empty registry as last resort (never fails)
    pub async fn load() -> Result<Self> {
        // Try cache first.
        let cached = match Self::load_from_cache() {
            Ok(c) => c,
            Err(e) => {
                tracing::warn!(error = %e, "failed to load from cache, trying other sources");
                None
            }
        };
        if let Some(cached) = cached {
            if cached.is_cache_fresh() {
                debug!("using fresh models.dev cache");
                return Ok(cached);
            }
            debug!("models.dev cache is stale, refreshing");
        } else {
            debug!("no models.dev cache found, fetching fresh");
        }

        // Try fetching fresh from API.
        match Self::fetch_fresh().await {
            Ok(fresh) => {
                if let Err(e) = fresh.save_to_cache() {
                    tracing::warn!(error = %e, "failed to save registry to cache");
                }
                return Ok(fresh);
            }
            Err(e) => {
                tracing::warn!(error = %e, "failed to fetch from API, trying snapshot");
            }
        }

        // Try loading from bundled snapshot.
        let snapshot_path = std::path::Path::new(BUNDLED_SNAPSHOT_PATH);
        if snapshot_path.exists() {
            match from_snapshot_file(snapshot_path) {
                Ok(snapshot) => {
                    info!("loaded models.dev registry from bundled snapshot");
                    // Don't save snapshot to cache - it's a fallback
                    return Ok(snapshot);
                }
                Err(e) => {
                    tracing::warn!(error = %e, "failed to load from bundled snapshot");
                }
            }
        } else {
            debug!(path = %BUNDLED_SNAPSHOT_PATH, "bundled snapshot not found");
        }

        // Last resort: return empty registry with warning.
        tracing::warn!("all registry sources failed, returning empty registry");
        Ok(Self {
            providers: vec![],
            cached_at: Utc::now(),
        })
    }

    /// Fetch fresh data from the models.dev API.
    ///
    /// Timeout: 30 seconds.
    pub async fn fetch_fresh() -> Result<Self> {
        info!(url = API_URL, "fetching models.dev registry");

        let client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECONDS))
            .build()
            .context("failed to build HTTP client")?;

        let resp = client
            .get(API_URL)
            .send()
            .await
            .context("failed to fetch models.dev API")?;

        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!(
                "models.dev API returned {}: {}",
                status.as_u16(),
                body.chars().take(200).collect::<String>()
            );
        }

        let bytes = resp.bytes().await.context("failed to read response body")?;
        let registry = Self::from_json(&bytes)?;

        info!(
            providers = registry.providers.len(),
            total_models = registry
                .providers
                .iter()
                .map(|p| p.models.len())
                .sum::<usize>(),
            "loaded models.dev registry"
        );

        Ok(registry)
    }

    /// Parse registry data from JSON bytes.
    ///
    /// Handles both the old array format and the new map format where:
    /// - Root is `{ "provider-id": { ... }, ... }` instead of `[{ ... }, ...]`
    /// - `models` is `{ "model-id": { ... }, ... }` instead of `[{ ... }, ...]`
    pub fn from_json(data: &[u8]) -> Result<Self> {
        let raw: serde_json::Value =
            serde_json::from_slice(data).context("failed to parse models.dev JSON")?;

        // Handle both array format (old) and map format (new)
        let provider_values: Vec<serde_json::Value> = if let Some(arr) = raw.as_array() {
            arr.clone()
        } else if let Some(obj) = raw.as_object() {
            obj.values().cloned().collect()
        } else {
            anyhow::bail!("models.dev JSON root is neither array nor object");
        };

        let mut providers = Vec::new();
        let mut skipped_count = 0;
        let total_provider_values = provider_values.len();

        for mut pv in provider_values {
            // Get provider id for logging if available
            let provider_id = pv
                .get("id")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            // Convert models map to array and populate model_key from map keys
            if let Some(obj) = pv.get("models").and_then(|m| m.as_object()) {
                let models_count = obj.len();
                let models_arr: Vec<serde_json::Value> = obj
                    .iter()
                    .map(|(key, model_value)| {
                        let mut model = model_value.clone();
                        if let Some(model_obj) = model.as_object_mut() {
                            // If model_key is missing, populate from the map key
                            if !model_obj.contains_key("model_key") {
                                model_obj.insert(
                                    "model_key".to_string(),
                                    serde_json::Value::String(key.clone()),
                                );
                            }
                        }
                        model
                    })
                    .collect();
                if let Some(provider_obj) = pv.as_object_mut() {
                    provider_obj.insert("models".to_string(), serde_json::Value::Array(models_arr));
                }
                tracing::debug!(provider = %provider_id, models_count, "converted models map to array");
            }

            match serde_json::from_value::<ModelsDevProvider>(pv) {
                Ok(p) => {
                    tracing::debug!(provider = %p.id, model_count = p.models.len(), "parsed provider");
                    providers.push(p);
                }
                Err(e) => {
                    skipped_count += 1;
                    tracing::warn!(provider = %provider_id, error = %e, "skipping unparseable provider");
                }
            }
        }

        tracing::info!(
            total_provider_values,
            parsed = providers.len(),
            skipped = skipped_count,
            "models.dev parsing complete"
        );

        Ok(Self {
            providers,
            cached_at: Utc::now(),
        })
    }

    /// Load the registry from the local cache file if it exists.
    pub fn load_from_cache() -> Result<Option<Self>> {
        let path = cache_path()?;

        if !path.exists() {
            debug!(path = %path.display(), "cache file does not exist");
            return Ok(None);
        }

        let data = std::fs::read(&path)
            .with_context(|| format!("failed to read cache file: {}", path.display()))?;

        let registry: ModelsDevRegistry = serde_json::from_slice(&data)
            .with_context(|| format!("failed to parse cache file: {}", path.display()))?;

        debug!(
            path = %path.display(),
            cached_at = %registry.cached_at,
            "loaded registry from cache"
        );

        Ok(Some(registry))
    }

    /// Save the registry to the local cache file.
    pub fn save_to_cache(&self) -> Result<()> {
        let path = cache_path()?;

        let data = serde_json::to_vec_pretty(self).context("failed to serialize registry")?;

        std::fs::write(&path, data)
            .with_context(|| format!("failed to write cache file: {}", path.display()))?;

        info!(path = %path.display(), "saved models.dev registry to cache");

        Ok(())
    }

    /// Check if the cached registry is still fresh (within TTL).
    pub fn is_cache_fresh(&self) -> bool {
        let age = Utc::now() - self.cached_at;
        let ttl = Duration::minutes(CACHE_TTL_MINUTES);

        let is_fresh = age < ttl;
        debug!(
            cached_at = %self.cached_at,
            age_minutes = age.num_minutes(),
            ttl_minutes = CACHE_TTL_MINUTES,
            is_fresh,
            "checking cache freshness"
        );

        is_fresh
    }

    /// Get all providers.
    pub fn providers(&self) -> &[ModelsDevProvider] {
        &self.providers
    }

    /// Look up a provider by ID.
    pub fn provider(&self, id: &str) -> Option<&ModelsDevProvider> {
        self.providers.iter().find(|p| p.id == id)
    }

    /// Look up a provider by ID with alias fallback.
    ///
    /// If the provider is not found directly, tries known aliases:
    /// - `openai-codex` → `openai`
    pub fn provider_with_alias(&self, id: &str) -> Option<&ModelsDevProvider> {
        // Try direct lookup first
        if let Some(provider) = self.provider(id) {
            return Some(provider);
        }

        // Try known alias fallbacks
        let fallback_id = match id {
            "openai-codex" => "openai",
            _ => return None,
        };

        self.provider(fallback_id)
    }

    /// Get all models for a specific provider.
    pub fn models_for_provider(&self, provider_id: &str) -> Vec<&ModelsDevModel> {
        self.provider(provider_id)
            .map(|p| p.models.iter().collect())
            .unwrap_or_default()
    }

    /// Get all models for a specific provider with alias fallback.
    pub fn models_for_provider_with_alias(&self, provider_id: &str) -> Vec<&ModelsDevModel> {
        self.provider_with_alias(provider_id)
            .map(|p| p.models.iter().collect())
            .unwrap_or_default()
    }

    /// Get all models across all providers, with their provider IDs.
    ///
    /// Returns tuples of (provider_id, model).
    pub fn all_models(&self) -> Vec<(&str, &ModelsDevModel)> {
        self.providers
            .iter()
            .flat_map(|p| p.models.iter().map(move |m| (p.id.as_str(), m)))
            .collect()
    }

    /// Find a model by ID across all providers.
    ///
    /// Returns (provider_id, model) if found.
    pub fn find_model(&self, model_id: &str) -> Option<(&str, &ModelsDevModel)> {
        self.providers.iter().find_map(|p| {
            p.models
                .iter()
                .find(|m| m.id == model_id || m.model_key.as_deref() == Some(model_id))
                .map(|m| (p.id.as_str(), m))
        })
    }

    /// Count total models across all providers.
    pub fn total_models(&self) -> usize {
        self.providers.iter().map(|p| p.models.len()).sum()
    }
}

// ---------------------------------------------------------------------------
// Global Registry Access
// ---------------------------------------------------------------------------

/// Initialize the global registry singleton.
fn init_global() -> &'static RwLock<Option<ModelsDevRegistry>> {
    REGISTRY.get_or_init(|| RwLock::new(None))
}

/// Get or load the global registry singleton.
///
/// If the registry has already been loaded, returns it.
/// If not, loads from cache or fetches fresh and stores in the singleton.
///
/// This is safe to call from multiple concurrent tasks — uses async RwLock.
pub async fn get_or_load_registry() -> Result<ModelsDevRegistry> {
    let lock = init_global();

    // Fast path: check if already loaded.
    {
        let read_guard = lock.read().await;
        if let Some(ref registry) = *read_guard {
            return Ok(registry.clone());
        }
    }

    // Slow path: load and store.
    let mut write_guard = lock.write().await;

    // Double-check in case another task loaded while we waited.
    if let Some(ref registry) = *write_guard {
        return Ok(registry.clone());
    }

    let registry = ModelsDevRegistry::load().await?;
    *write_guard = Some(registry.clone());

    Ok(registry)
}

/// Force a fresh fetch of the global registry.
///
/// Always fetches from the API, updates the cache, and stores the new
/// registry in the global singleton.
pub async fn refresh_registry() -> Result<ModelsDevRegistry> {
    let lock = init_global();
    let mut write_guard = lock.write().await;

    info!("refreshing models.dev registry from API");

    let registry = ModelsDevRegistry::fetch_fresh().await?;
    registry.save_to_cache()?;
    *write_guard = Some(registry.clone());

    Ok(registry)
}

/// Clear the global registry singleton (useful for testing).
pub async fn clear_registry() {
    let lock = init_global();
    let mut write_guard = lock.write().await;
    *write_guard = None;
}

// ---------------------------------------------------------------------------
// Convenience Helpers
// ---------------------------------------------------------------------------

/// Load the registry from a local snapshot file.
///
/// Useful for offline development with a known-good snapshot.
pub fn from_snapshot_file(path: &std::path::Path) -> Result<ModelsDevRegistry> {
    let data = std::fs::read(path)
        .with_context(|| format!("failed to read snapshot: {}", path.display()))?;

    ModelsDevRegistry::from_json(&data)
}

// ---------------------------------------------------------------------------
// Module Initialization
// ---------------------------------------------------------------------------

/// Module initialization stub (called from main).
pub fn init() {
    tracing::debug!("models_dev module loaded");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Sample JSON matching the models.dev format.
    const SAMPLE_JSON: &str = r#"[
        {
            "id": "test-provider",
            "name": "Test Provider",
            "env": ["TEST_API_KEY"],
            "npm": "@ai-sdk/test",
            "api": "https://api.test.com/v1",
            "doc": "https://docs.test.com",
            "auth_type": "bearer",
            "prompt": null,
            "ai_sdk_provider": "test",
            "models": [
                {
                    "model_key": "test-model",
                    "id": "test-model",
                    "name": "Test Model",
                    "family": "test-family",
                    "release_date": "2025-01-01",
                    "last_updated": "2025-06-01",
                    "attachment": true,
                    "reasoning": false,
                    "tool_call": true,
                    "temperature": null,
                    "default_temperature": 0.7,
                    "cost": {
                        "input": 0.001,
                        "output": 0.002,
                        "cache_read": 0.0005,
                        "cache_write": 0.001
                    },
                    "limit": {
                        "context": 128000,
                        "output": 4096
                    },
                    "modalities": {
                        "input": ["text", "image"],
                        "output": ["text"]
                    },
                    "isFree": null,
                    "recommendedIndex": 1,
                    "prompt": null,
                    "open_weights": false,
                    "knowledge": "2024-06",
                    "status": "stable",
                    "experimental": null,
                    "support": "production"
                }
            ]
        }
    ]"#;

    #[test]
    fn parse_sample_json() {
        let registry = ModelsDevRegistry::from_json(SAMPLE_JSON.as_bytes()).unwrap();

        assert_eq!(registry.providers.len(), 1);
        assert_eq!(registry.total_models(), 1);

        let provider = &registry.providers[0];
        assert_eq!(provider.id, "test-provider");
        assert_eq!(provider.name, "Test Provider");
        assert_eq!(provider.env, vec!["TEST_API_KEY"]);
        assert_eq!(provider.npm, Some("@ai-sdk/test".to_string()));

        let model = &provider.models[0];
        assert_eq!(model.id, "test-model");
        assert_eq!(model.name, "Test Model");
        assert_eq!(model.family, Some("test-family".to_string()));
        assert_eq!(model.attachment, Some(true));
        assert_eq!(model.reasoning, Some(false));
        assert_eq!(model.tool_call, Some(true));

        // Check cost parsing.
        let cost = model.cost.as_ref().unwrap();
        assert_eq!(cost.input, Some(0.001));
        assert_eq!(cost.output, Some(0.002));
        assert_eq!(cost.cache_read, Some(0.0005));
        assert_eq!(cost.cache_write, Some(0.001));

        // Check limit parsing.
        let limit = model.limit.as_ref().unwrap();
        assert_eq!(limit.context, Some(128000));
        assert_eq!(limit.output, Some(4096));

        // Check modalities.
        let modalities = model.modalities.as_ref().unwrap();
        assert_eq!(
            modalities.input,
            Some(vec!["text".to_string(), "image".to_string()])
        );
        assert_eq!(modalities.output, Some(vec!["text".to_string()]));
    }

    #[test]
    fn registry_lookup_methods() {
        let registry = ModelsDevRegistry::from_json(SAMPLE_JSON.as_bytes()).unwrap();

        // Test provider lookup.
        assert!(registry.provider("test-provider").is_some());
        assert!(registry.provider("nonexistent").is_none());

        // Test models_for_provider.
        let models = registry.models_for_provider("test-provider");
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].id, "test-model");

        // Test all_models.
        let all = registry.all_models();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].0, "test-provider");
        assert_eq!(all[0].1.id, "test-model");

        // Test find_model.
        let found = registry.find_model("test-model");
        assert!(found.is_some());
        assert_eq!(found.unwrap().0, "test-provider");

        assert!(registry.find_model("nonexistent").is_none());
    }

    #[test]
    fn cache_freshness() {
        let fresh_registry = ModelsDevRegistry {
            providers: vec![],
            cached_at: Utc::now(),
        };
        assert!(fresh_registry.is_cache_fresh());

        let stale_registry = ModelsDevRegistry {
            providers: vec![],
            cached_at: Utc::now() - Duration::minutes(61),
        };
        assert!(!stale_registry.is_cache_fresh());

        let borderline_registry = ModelsDevRegistry {
            providers: vec![],
            cached_at: Utc::now() - Duration::minutes(59),
        };
        assert!(borderline_registry.is_cache_fresh());
    }

    // -----------------------------------------------------------------------
    // Snapshot-based tests (require /tmp/complete_model_snapshot.json)
    // -----------------------------------------------------------------------

    /// Load the 4MB snapshot and verify parsing works correctly.
    #[test]
    fn test_parse_snapshot() {
        let snapshot_path = std::path::Path::new("/tmp/complete_model_snapshot.json");
        if !snapshot_path.exists() {
            println!("Skipping test_parse_snapshot: snapshot file not found");
            return;
        }

        let data = std::fs::read(snapshot_path).expect("failed to read snapshot file");
        let registry = ModelsDevRegistry::from_json(&data).expect("failed to parse snapshot");

        // Verify we have a significant number of providers
        assert!(
            registry.providers.len() > 50,
            "expected > 50 providers, got {}",
            registry.providers.len()
        );

        // Check for expected providers (using actual IDs from snapshot)
        let expected_providers = [
            "openai",
            "anthropic",
            "google",
            "xai",
            "groq",
            "togetherai", // Together AI
            "mistral",
            "cohere",
            "deepseek",
            "openrouter",
            "fireworks-ai", // Fireworks AI
            "cerebras",
            "azure",          // Azure OpenAI
            "amazon-bedrock", // AWS Bedrock
        ];

        for provider_id in &expected_providers {
            assert!(
                registry.provider(provider_id).is_some(),
                "expected provider '{}' not found in registry",
                provider_id
            );
        }

        // Verify models have expected fields
        let openai = registry.provider("openai").expect("openai provider");
        assert!(!openai.models.is_empty(), "openai should have models");

        let gpt4o = openai
            .models
            .iter()
            .find(|m| m.id == "gpt-4o" || m.model_key.as_deref() == Some("gpt-4o"));
        if let Some(model) = gpt4o {
            assert!(!model.name.is_empty(), "model should have a name");
            assert!(
                model.tool_call.is_some(),
                "gpt-4o should have tool_call field"
            );
        }

        println!(
            "Successfully parsed snapshot: {} providers, {} total models",
            registry.providers.len(),
            registry.total_models()
        );
    }

    /// Test provider lookup functionality with real data.
    #[test]
    fn test_provider_lookup() {
        let snapshot_path = std::path::Path::new("/tmp/complete_model_snapshot.json");
        if !snapshot_path.exists() {
            println!("Skipping test_provider_lookup: snapshot file not found");
            return;
        }

        let data = std::fs::read(snapshot_path).expect("failed to read snapshot file");
        let registry = ModelsDevRegistry::from_json(&data).expect("failed to parse snapshot");

        // Test openai provider lookup
        let openai = registry
            .provider("openai")
            .expect("openai should exist in snapshot");
        assert_eq!(openai.id, "openai");
        assert!(!openai.env.is_empty(), "openai should have env vars");
        assert!(
            openai.env.contains(&"OPENAI_API_KEY".to_string()),
            "openai should require OPENAI_API_KEY"
        );

        // Check for gpt-4o model
        let has_gpt4o = openai
            .models
            .iter()
            .any(|m| m.id == "gpt-4o" || m.model_key.as_deref() == Some("gpt-4o"));
        assert!(has_gpt4o, "openai should have gpt-4o model");

        // Test anthropic provider
        let anthropic = registry
            .provider("anthropic")
            .expect("anthropic should exist in snapshot");
        assert_eq!(anthropic.id, "anthropic");
        assert!(
            anthropic.env.contains(&"ANTHROPIC_API_KEY".to_string()),
            "anthropic should require ANTHROPIC_API_KEY"
        );

        // Check for Claude models
        let has_claude = anthropic.models.iter().any(|m| {
            m.id.contains("claude")
                || m.model_key.as_deref().unwrap_or("").contains("claude")
                || m.name.to_lowercase().contains("claude")
        });
        assert!(has_claude, "anthropic should have claude models");

        // Test models_for_provider
        let openai_models = registry.models_for_provider("openai");
        assert!(!openai_models.is_empty(), "openai should have models");

        // Test non-existent provider
        assert!(
            registry.provider("nonexistent-provider").is_none(),
            "nonexistent provider should return None"
        );
        assert!(
            registry.models_for_provider("nonexistent").is_empty(),
            "nonexistent provider should return empty models"
        );
    }

    /// Test model capabilities are correctly parsed.
    #[test]
    fn test_model_capabilities() {
        let snapshot_path = std::path::Path::new("/tmp/complete_model_snapshot.json");
        if !snapshot_path.exists() {
            println!("Skipping test_model_capabilities: snapshot file not found");
            return;
        }

        let data = std::fs::read(snapshot_path).expect("failed to read snapshot file");
        let registry = ModelsDevRegistry::from_json(&data).expect("failed to parse snapshot");

        let all_models = registry.all_models();
        assert!(
            !all_models.is_empty(),
            "should have models to check capabilities"
        );

        // Find models with tool_call support
        let tool_call_models: Vec<_> = all_models
            .iter()
            .filter(|(_, m)| m.tool_call == Some(true))
            .collect();
        assert!(
            !tool_call_models.is_empty(),
            "should have some models with tool_call=true"
        );

        // Find models with reasoning support
        let reasoning_models: Vec<_> = all_models
            .iter()
            .filter(|(_, m)| m.reasoning == Some(true))
            .collect();
        // Note: reasoning models might be rare, so we just check the field exists
        println!(
            "Found {} models with reasoning support",
            reasoning_models.len()
        );

        // Find models with cost data
        let models_with_cost: Vec<_> = all_models
            .iter()
            .filter(|(_, m)| m.cost.is_some())
            .collect();
        assert!(
            !models_with_cost.is_empty(),
            "should have some models with cost data"
        );

        // Verify cost structure for a model with cost data
        if let Some((provider_id, model)) = models_with_cost.first() {
            let cost = model.cost.as_ref().unwrap();
            println!(
                "Sample cost data: {} {} - input: {:?}, output: {:?}",
                provider_id, model.id, cost.input, cost.output
            );
        }

        // Check for attachment support
        let attachment_models: Vec<_> = all_models
            .iter()
            .filter(|(_, m)| m.attachment == Some(true))
            .collect();
        assert!(
            !attachment_models.is_empty(),
            "should have some models with attachment support"
        );
    }

    /// Test cache roundtrip: save and load registry to/from temp file.
    #[test]
    fn test_cache_roundtrip() {
        use std::io::Write;
        use tempfile::NamedTempFile;

        // Create a small registry for testing
        let test_registry = ModelsDevRegistry {
            providers: vec![ModelsDevProvider {
                id: "test-provider".to_string(),
                name: "Test Provider".to_string(),
                env: vec!["TEST_API_KEY".to_string()],
                npm: Some("@ai-sdk/test".to_string()),
                api: Some("https://api.test.com".to_string()),
                doc: None,
                auth_type: Some("bearer".to_string()),
                prompt: None,
                ai_sdk_provider: Some("test".to_string()),
                models: vec![ModelsDevModel {
                    model_key: Some("test-model".to_string()),
                    id: "test-model".to_string(),
                    name: "Test Model".to_string(),
                    family: Some("test-family".to_string()),
                    release_date: Some("2025-01-01".to_string()),
                    last_updated: Some("2025-06-01".to_string()),
                    attachment: Some(true),
                    reasoning: Some(false),
                    tool_call: Some(true),
                    temperature: None,
                    default_temperature: Some(0.7),
                    cost: Some(ModelsDevCost {
                        input: Some(0.001),
                        output: Some(0.002),
                        cache_read: Some(0.0005),
                        cache_write: Some(0.001),
                    }),
                    limit: Some(ModelsDevLimit {
                        context: Some(128000),
                        output: Some(4096),
                    }),
                    modalities: Some(ModelsDevModalities {
                        input: Some(vec!["text".to_string()]),
                        output: Some(vec!["text".to_string()]),
                    }),
                    is_free: None,
                    recommended_index: Some(1),
                    prompt: None,
                    open_weights: Some(false),
                    knowledge: Some("2024-06".to_string()),
                    status: Some("stable".to_string()),
                    experimental: None,
                    support: Some("production".to_string()),
                }],
            }],
            cached_at: Utc::now(),
        };

        // Serialize full registry (as cache does)
        let json_data =
            serde_json::to_vec_pretty(&test_registry).expect("failed to serialize registry");

        // Write to temp file
        let mut temp_file = NamedTempFile::new().expect("failed to create temp file");
        temp_file
            .write_all(&json_data)
            .expect("failed to write to temp file");

        // Load from temp file using full registry deserialization (as load_from_cache does)
        let loaded_data = std::fs::read(temp_file.path()).expect("failed to read temp file");
        let loaded_registry: ModelsDevRegistry = serde_json::from_slice(&loaded_data)
            .expect("failed to parse loaded registry as full registry");

        // Verify contents match
        assert_eq!(
            loaded_registry.providers.len(),
            test_registry.providers.len(),
            "provider count should match"
        );
        assert_eq!(
            loaded_registry.total_models(),
            test_registry.total_models(),
            "model count should match"
        );
        assert_eq!(
            loaded_registry.cached_at.timestamp(),
            test_registry.cached_at.timestamp(),
            "cached_at should match"
        );

        let original_provider = &test_registry.providers[0];
        let loaded_provider = &loaded_registry.providers[0];
        assert_eq!(loaded_provider.id, original_provider.id);
        assert_eq!(loaded_provider.name, original_provider.name);
        assert_eq!(loaded_provider.env, original_provider.env);
        assert_eq!(loaded_provider.models.len(), original_provider.models.len());

        let original_model = &original_provider.models[0];
        let loaded_model = &loaded_provider.models[0];
        assert_eq!(loaded_model.id, original_model.id);
        assert_eq!(loaded_model.name, original_model.name);
        assert_eq!(loaded_model.tool_call, original_model.tool_call);
        assert_eq!(loaded_model.reasoning, original_model.reasoning);
        assert_eq!(loaded_model.attachment, original_model.attachment);
    }

    /// Test find_model() searching across all providers.
    #[test]
    fn test_find_model() {
        let snapshot_path = std::path::Path::new("/tmp/complete_model_snapshot.json");
        if !snapshot_path.exists() {
            println!("Skipping test_find_model: snapshot file not found");
            return;
        }

        let data = std::fs::read(snapshot_path).expect("failed to read snapshot file");
        let registry = ModelsDevRegistry::from_json(&data).expect("failed to parse snapshot");

        // Find gpt-4o
        let gpt4o_result = registry.find_model("gpt-4o");
        assert!(
            gpt4o_result.is_some(),
            "should find gpt-4o across providers"
        );
        let (provider_id, model) = gpt4o_result.unwrap();
        assert_eq!(provider_id, "openai", "gpt-4o should be from openai");
        assert!(
            model.id == "gpt-4o" || model.model_key.as_deref() == Some("gpt-4o"),
            "found model should be gpt-4o"
        );

        // Find by model_key
        if let Some((provider_id, model)) = registry.find_model("gpt-4o") {
            assert_eq!(provider_id, "openai");
            assert_eq!(model.model_key.as_deref(), Some("gpt-4o"));
        }

        // Test non-existent model
        let not_found = registry.find_model("definitely-not-a-real-model-12345");
        assert!(not_found.is_none(), "non-existent model should return None");
    }

    /// Test total_models() returns a reasonable count.
    #[test]
    fn test_all_models_count() {
        let snapshot_path = std::path::Path::new("/tmp/complete_model_snapshot.json");
        if !snapshot_path.exists() {
            println!("Skipping test_all_models_count: snapshot file not found");
            return;
        }

        let data = std::fs::read(snapshot_path).expect("failed to read snapshot file");
        let registry = ModelsDevRegistry::from_json(&data).expect("failed to parse snapshot");

        let total = registry.total_models();
        assert!(total > 500, "expected > 500 total models, got {}", total);

        // Verify all_models() matches total_models()
        let all = registry.all_models();
        assert_eq!(
            all.len(),
            total,
            "all_models() length should match total_models()"
        );

        println!("Total models in registry: {}", total);
    }

    /// Test parsing the new map-based API format (root is object, models is object).
    /// This matches the current models.dev API format.
    const MAP_FORMAT_JSON: &str = r#"{
        "openai": {
            "id": "openai",
            "name": "OpenAI",
            "env": ["OPENAI_API_KEY"],
            "npm": "@ai-sdk/openai",
            "api": "https://api.openai.com/v1",
            "models": {
                "gpt-4o": {
                    "model_key": "gpt-4o",
                    "id": "gpt-4o",
                    "name": "GPT-4o",
                    "family": "gpt-4o",
                    "attachment": { "image": true },
                    "reasoning": false,
                    "tool_call": true,
                    "cost": { "input": 2.5, "output": 10.0 }
                },
                "gpt-4o-mini": {
                    "model_key": "gpt-4o-mini",
                    "id": "gpt-4o-mini",
                    "name": "GPT-4o Mini",
                    "family": "gpt-4o",
                    "attachment": true,
                    "reasoning": false,
                    "tool_call": true
                }
            }
        },
        "anthropic": {
            "id": "anthropic",
            "name": "Anthropic",
            "env": ["ANTHROPIC_API_KEY"],
            "models": {
                "claude-3-5-sonnet": {
                    "model_key": "claude-3-5-sonnet",
                    "id": "claude-3-5-sonnet-20241022",
                    "name": "Claude 3.5 Sonnet",
                    "attachment": { "image": true, "pdf": true },
                    "reasoning": true,
                    "tool_call": true
                }
            }
        }
    }"#;

    #[test]
    fn parse_map_format_json() {
        let registry = ModelsDevRegistry::from_json(MAP_FORMAT_JSON.as_bytes()).unwrap();

        // Should have 2 providers
        assert_eq!(registry.providers.len(), 2, "should have 2 providers");

        // Check openai provider
        let openai = registry
            .provider("openai")
            .expect("openai provider should exist");
        assert_eq!(openai.name, "OpenAI");
        assert_eq!(openai.models.len(), 2, "openai should have 2 models");

        // Check gpt-4o model - attachment is an object { "image": true }
        let gpt4o = openai
            .models
            .iter()
            .find(|m| m.id == "gpt-4o")
            .expect("gpt-4o should exist");
        assert_eq!(gpt4o.name, "GPT-4o");
        assert_eq!(
            gpt4o.attachment,
            Some(true),
            "attachment object should deserialize as Some(true)"
        );
        assert_eq!(gpt4o.tool_call, Some(true));

        // Check gpt-4o-mini model - attachment is a boolean true
        let mini = openai
            .models
            .iter()
            .find(|m| m.id == "gpt-4o-mini")
            .expect("gpt-4o-mini should exist");
        assert_eq!(
            mini.attachment,
            Some(true),
            "attachment boolean should deserialize as Some(true)"
        );

        // Check anthropic provider
        let anthropic = registry
            .provider("anthropic")
            .expect("anthropic provider should exist");
        assert_eq!(anthropic.models.len(), 1);

        // Check claude model - attachment is an object with multiple fields
        let claude = &anthropic.models[0];
        assert_eq!(
            claude.attachment,
            Some(true),
            "attachment object with multiple fields should deserialize as Some(true)"
        );
        assert_eq!(claude.reasoning, Some(true));
    }

    /// Test that the old array format still works (backward compatibility).
    #[test]
    fn parse_array_format_still_works() {
        // The existing SAMPLE_JSON uses the old array format - verify it still works
        let registry = ModelsDevRegistry::from_json(SAMPLE_JSON.as_bytes()).unwrap();
        assert_eq!(registry.providers.len(), 1);
        assert_eq!(registry.total_models(), 1);
    }
}
