//! Kilo-aligned provider catalog — complete provider inventory and metadata.
//!
//! This module provides:
//! - A comprehensive provider catalog matching Kilo's provider registry
//! - Provider listing API compatible with Kilo's `/provider` endpoint
//! - Provider categorization, auth methods, and metadata
//! - Model discovery and listing
//!
//! ## Architecture
//!
//! The catalog combines:
//! 1. Static metadata from `crate::models::providers` (PROVIDER_REGISTRY)
//! 2. Dynamic metadata from models.dev (via `crate::models_dev`)
//! 3. Runtime configuration from `config.yaml`
//!
//! This ensures Pinchy has a complete source of truth for all providers,
//! even when models.dev is unavailable.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Provider entry in the catalog.
///
/// Aligned with Kilo's `Provider.Info` and `ModelsDev.Provider` schemas.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CatalogProvider {
    /// Canonical provider ID (e.g., "openai", "anthropic")
    pub id: String,
    /// Human-readable display name
    pub name: String,
    /// Source of this provider entry
    pub source: ProviderSource,
    /// Environment variables required for authentication
    pub env: Vec<String>,
    /// NPM package for AI SDK compatibility
    #[serde(skip_serializing_if = "Option::is_none")]
    pub npm: Option<String>,
    /// Base API URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    /// Documentation URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub doc: Option<String>,
    /// Authentication type (bearer, api-key, oauth, etc.)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_type: Option<String>,
    /// Provider category for UI grouping
    pub category: ProviderCategory,
    /// Whether this provider is available (configured)
    pub available: bool,
    /// Whether this provider requires authentication
    pub auth_required: bool,
    /// Whether this is a local/self-hosted provider
    pub is_local: bool,
    /// Whether this provider uses OAuth
    pub uses_oauth: bool,
    /// Known configuration options for this provider
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub known_options: Vec<String>,
    /// Model IDs available from this provider
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub models: Vec<String>,
    /// Default model ID (if known)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default_model: Option<String>,
    /// Provider capabilities
    pub capabilities: ProviderCapabilities,
    /// Provider aliases (alternative IDs that map to this provider)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub aliases: Vec<String>,
    /// Extra metadata from the source
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}

/// Source of provider metadata.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderSource {
    /// From models.dev API/registry.
    ModelsDev,
    /// From Pinchy's static provider registry.
    StaticRegistry,
    /// From user configuration (config.yaml).
    Config,
    /// Dynamically discovered at runtime.
    Discovered,
}

/// Provider category for UI grouping.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProviderCategory {
    /// Major cloud providers (OpenAI, Anthropic, etc.)
    Major,
    /// Cloud platform providers (Azure, AWS, GCP, etc.)
    Cloud,
    /// Open source model hosts (Together, Fireworks, etc.)
    OpenSourceHost,
    /// Local/self-hosted providers (Ollama, LM Studio, etc.)
    Local,
    /// Model routers and aggregators (OpenRouter, etc.)
    Router,
    /// Enterprise providers (Copilot Enterprise, SAP AI Core, etc.)
    Enterprise,
    /// Specialized providers (Discord, etc.)
    Specialized,
    /// AI Gateways (Kilo, etc.)
    Gateway,
}

impl ProviderCategory {
    /// Get a display name for the category.
    pub const fn display_name(&self) -> &'static str {
        match self {
            ProviderCategory::Major => "Major Providers",
            ProviderCategory::Cloud => "Cloud Providers",
            ProviderCategory::OpenSourceHost => "Open Source Hosts",
            ProviderCategory::Local => "Local / Self-Hosted",
            ProviderCategory::Router => "Model Routers",
            ProviderCategory::Enterprise => "Enterprise",
            ProviderCategory::Specialized => "Specialized",
            ProviderCategory::Gateway => "AI Gateways",
        }
    }

    /// Get the sort order for categories (lower = first).
    pub const fn sort_order(&self) -> u8 {
        match self {
            ProviderCategory::Major => 0,
            ProviderCategory::Gateway => 1,
            ProviderCategory::Router => 2,
            ProviderCategory::Cloud => 3,
            ProviderCategory::OpenSourceHost => 4,
            ProviderCategory::Local => 5,
            ProviderCategory::Enterprise => 6,
            ProviderCategory::Specialized => 7,
        }
    }
}

/// Provider capabilities.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProviderCapabilities {
    /// Supports model listing/fetching
    #[serde(default)]
    pub supports_model_fetch: bool,
    /// Supports streaming responses
    #[serde(default)]
    pub supports_streaming: bool,
    /// Supports function calling
    #[serde(default)]
    pub supports_functions: bool,
    /// Supports embeddings
    #[serde(default)]
    pub supports_embeddings: bool,
    /// Supports image attachments
    #[serde(default)]
    pub supports_attachments: bool,
    /// Supports reasoning/thinking
    #[serde(default)]
    pub supports_reasoning: bool,
}

/// Provider list response.
///
/// Matches Kilo's `/provider` endpoint response format.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderListResponse {
    /// All providers (both available and unavailable)
    pub all: Vec<CatalogProvider>,
    /// Default model for each provider
    pub default: HashMap<String, String>,
    /// Provider IDs that are currently connected/configured
    pub connected: Vec<String>,
}

/// Provider detail response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderDetailResponse {
    /// Provider details
    pub provider: CatalogProvider,
    /// Available models with metadata
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub models: Vec<crate::models::ModelInfo>,
    /// Authentication methods available
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub auth_methods: Vec<AuthMethod>,
}

/// Authentication method for a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMethod {
    /// Method type
    pub method_type: AuthMethodType,
    /// Display name for the method
    pub name: String,
    /// Description of the method
    pub description: String,
    /// Whether this method requires user interaction
    pub requires_interaction: bool,
    /// Instructions for the user
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructions: Option<String>,
}

/// Type of authentication method.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethodType {
    /// API key authentication
    ApiKey,
    /// OAuth 2.0 authentication
    OAuth,
    /// Bearer token authentication
    Bearer,
    /// Google Application Default Credentials
    GoogleAdc,
    /// AWS credentials
    AwsCredentials,
    /// No authentication required (local providers)
    None,
}

// ---------------------------------------------------------------------------
// Catalog Construction
// ---------------------------------------------------------------------------

/// Build the complete provider catalog.
///
/// This combines data from:
/// 1. Static provider registry (all known providers)
/// 2. models.dev registry (dynamic model lists)
/// 3. Configured providers from config.yaml
pub async fn build_catalog(cfg: &crate::config::Config) -> anyhow::Result<ProviderListResponse> {
    let mut providers = HashMap::new();
    let mut connected = Vec::new();
    let mut defaults = HashMap::new();

    // Start with all providers from static registry
    for meta in crate::models::providers::PROVIDER_REGISTRY {
        let id = meta.canonical_id.to_string();

        // Determine if this provider is available
        let (available, source) = check_provider_availability(&id, cfg).await;

        if available {
            connected.push(id.clone());
        }

        // Get capabilities from metadata
        let capabilities = ProviderCapabilities {
            supports_model_fetch: meta.supports_model_fetch,
            supports_streaming: true,    // Most providers support streaming
            supports_functions: true,    // Most providers support functions
            supports_embeddings: false,  // Varies by provider
            supports_attachments: false, // Varies by model
            supports_reasoning: false,   // Varies by model
        };

        let provider = CatalogProvider {
            id: id.clone(),
            name: meta.display_name.to_string(),
            source,
            env: meta.env_vars.iter().map(|s| s.to_string()).collect(),
            npm: meta.npm_package.map(|s| s.to_string()),
            api: meta.api_base_url.map(|s| s.to_string()),
            doc: meta.doc_url.map(|s| s.to_string()),
            auth_type: meta.auth_type.map(|s| s.to_string()),
            category: convert_category(meta.category),
            available,
            auth_required: !meta.is_local && (meta.requires_api_key || meta.uses_oauth),
            is_local: meta.is_local,
            uses_oauth: meta.uses_oauth,
            known_options: meta.known_options.iter().map(|s| s.to_string()).collect(),
            models: Vec::new(), // Will be populated from models.dev
            default_model: None,
            capabilities,
            aliases: meta.aliases.iter().map(|s| s.to_string()).collect(),
            extra: None,
        };

        providers.insert(id, provider);
    }

    // Enrich with models.dev data
    if let Ok(registry) = crate::models_dev::get_or_load_registry().await {
        for md_provider in &registry.providers {
            let raw_id = md_provider.id.clone();
            let normalized_id = crate::models::providers::normalize_provider_id(&raw_id);

            // Skip adding alias providers - they should be handled under their canonical ID
            if raw_id != normalized_id {
                // This is an alias - enrich the canonical entry if it exists
                if let Some(existing) = providers.get_mut(&normalized_id) {
                    // Merge/enrich the canonical entry with this alias's models.dev data
                    existing.source = ProviderSource::ModelsDev;
                    if existing.npm.is_none() {
                        existing.npm = md_provider.npm.clone();
                    }
                    if existing.api.is_none() {
                        existing.api = md_provider.api.clone();
                    }
                    if existing.auth_type.is_none() {
                        existing.auth_type = md_provider.auth_type.clone();
                    }

                    // Add model IDs
                    existing.models = md_provider.models.iter().map(|m| m.id.clone()).collect();

                    // Set default model (first one, or "recommended")
                    if let Some(first_model) = md_provider.models.first() {
                        existing.default_model = Some(first_model.id.clone());
                        defaults.insert(normalized_id.clone(), first_model.id.clone());
                    }

                    // Update capabilities based on models
                    for model in &md_provider.models {
                        if model.tool_call == Some(true) {
                            existing.capabilities.supports_functions = true;
                        }
                        if model.attachment == Some(true) {
                            existing.capabilities.supports_attachments = true;
                        }
                        if model.reasoning == Some(true) {
                            existing.capabilities.supports_reasoning = true;
                        }
                    }
                }
                continue;
            }

            if let Some(existing) = providers.get_mut(&normalized_id) {
                // Enrich existing provider with models.dev data
                existing.source = ProviderSource::ModelsDev;
                if existing.npm.is_none() {
                    existing.npm = md_provider.npm.clone();
                }
                if existing.api.is_none() {
                    existing.api = md_provider.api.clone();
                }
                if existing.auth_type.is_none() {
                    existing.auth_type = md_provider.auth_type.clone();
                }

                // Add model IDs
                existing.models = md_provider.models.iter().map(|m| m.id.clone()).collect();

                // Set default model (first one, or "recommended")
                if let Some(first_model) = md_provider.models.first() {
                    existing.default_model = Some(first_model.id.clone());
                    defaults.insert(normalized_id.clone(), first_model.id.clone());
                }

                // Update capabilities based on models
                for model in &md_provider.models {
                    if model.tool_call == Some(true) {
                        existing.capabilities.supports_functions = true;
                    }
                    if model.attachment == Some(true) {
                        existing.capabilities.supports_attachments = true;
                    }
                    if model.reasoning == Some(true) {
                        existing.capabilities.supports_reasoning = true;
                    }
                }
            } else {
                // Add provider from models.dev that's not in static registry
                // Use normalized_id as the key to ensure canonical IDs only
                let (available, _) = check_provider_availability(&normalized_id, cfg).await;
                if available {
                    connected.push(normalized_id.clone());
                }

                let category = categorize_models_dev_provider(&normalized_id);

                let capabilities = ProviderCapabilities {
                    supports_model_fetch: true,
                    supports_streaming: true,
                    supports_functions: md_provider
                        .models
                        .iter()
                        .any(|m| m.tool_call == Some(true)),
                    supports_embeddings: false,
                    supports_attachments: md_provider
                        .models
                        .iter()
                        .any(|m| m.attachment == Some(true)),
                    supports_reasoning: md_provider
                        .models
                        .iter()
                        .any(|m| m.reasoning == Some(true)),
                };

                let provider = CatalogProvider {
                    id: normalized_id.clone(), // Use canonical ID, not raw alias
                    name: md_provider.name.clone(),
                    source: ProviderSource::ModelsDev,
                    env: md_provider.env.clone(),
                    npm: md_provider.npm.clone(),
                    api: md_provider.api.clone(),
                    doc: md_provider.doc.clone(),
                    auth_type: md_provider.auth_type.clone(),
                    category,
                    available,
                    auth_required: !md_provider.env.is_empty(),
                    is_local: false,
                    uses_oauth: false, // Detected via metadata if available
                    known_options: Vec::new(),
                    models: md_provider.models.iter().map(|m| m.id.clone()).collect(),
                    default_model: md_provider.models.first().map(|m| m.id.clone()),
                    capabilities,
                    aliases: Vec::new(),
                    extra: None,
                };

                providers.insert(normalized_id.clone(), provider);

                // Set default
                if let Some(first_model) = md_provider.models.first() {
                    defaults.insert(normalized_id, first_model.id.clone());
                }
            }
        }
    }

    // Add configured providers that might not be in either registry
    for model in &cfg.models {
        let normalized = crate::models::providers::normalize_provider_id(&model.provider);
        if !providers.contains_key(&normalized) {
            let (available, _) = check_provider_availability(&normalized, cfg).await;
            if available {
                connected.push(normalized.clone());
            }

            let provider = CatalogProvider {
                id: normalized.clone(),
                name: model.provider.clone(),
                source: ProviderSource::Config,
                env: Vec::new(),
                npm: None,
                api: model.endpoint.clone(),
                doc: None,
                auth_type: None,
                category: ProviderCategory::OpenSourceHost, // Default for unknown
                available,
                auth_required: model.api_key.is_some(),
                is_local: false,
                uses_oauth: false,
                known_options: Vec::new(),
                models: Vec::new(),
                default_model: model.model.clone(),
                capabilities: ProviderCapabilities::default(),
                aliases: Vec::new(),
                extra: None,
            };

            providers.insert(normalized.clone(), provider);
            if let Some(ref m) = model.model {
                defaults.insert(normalized, m.clone());
            }
        }
    }

    // Sort providers: available first, then by category, then by name
    let mut provider_list: Vec<CatalogProvider> = providers.into_values().collect();
    provider_list.sort_by(|a, b| {
        // Available providers first
        let a_avail = if a.available { 0 } else { 1 };
        let b_avail = if b.available { 0 } else { 1 };
        if a_avail != b_avail {
            return a_avail.cmp(&b_avail);
        }

        // Then by category order
        let a_cat = a.category.sort_order();
        let b_cat = b.category.sort_order();
        if a_cat != b_cat {
            return a_cat.cmp(&b_cat);
        }

        // Then by name
        a.name.cmp(&b.name)
    });

    // Deduplicate connected list using normalized provider IDs
    let mut normalized_connected: Vec<String> = connected
        .iter()
        .map(|id| crate::models::providers::normalize_provider_id(id))
        .collect();
    normalized_connected.sort();
    normalized_connected.dedup();

    Ok(ProviderListResponse {
        all: provider_list,
        default: defaults,
        connected: normalized_connected,
    })
}

/// Check if a provider is available (configured and has credentials).
async fn check_provider_availability(
    provider_id: &str,
    cfg: &crate::config::Config,
) -> (bool, ProviderSource) {
    let normalized = crate::models::providers::normalize_provider_id(provider_id);

    // Check environment variables
    if let Some(metadata) = crate::models::providers::get_provider_metadata(&normalized) {
        // Local providers are always available
        if metadata.is_local {
            return (true, ProviderSource::StaticRegistry);
        }

        // Check env vars
        for var in metadata.env_vars {
            if std::env::var(var).is_ok() {
                return (true, ProviderSource::StaticRegistry);
            }
        }
    }

    // Check auth store
    if crate::auth::store::get_auth(&normalized).is_some() {
        return (true, ProviderSource::StaticRegistry);
    }

    // Check config
    let config_has_key = cfg.models.iter().any(|m| {
        let m_normalized = crate::models::providers::normalize_provider_id(&m.provider);
        m_normalized == normalized
            && m.api_key
                .as_ref()
                .map(|k| !k.is_empty() && !k.starts_with('$'))
                .unwrap_or(false)
    });
    if config_has_key {
        return (true, ProviderSource::Config);
    }

    // Special cases
    match normalized.as_str() {
        "copilot" => {
            if crate::auth::github_device::has_token() {
                return (true, ProviderSource::StaticRegistry);
            }
            if let Some(home) = dirs::home_dir() {
                if home.join(".pinchy/copilot-token").exists() {
                    return (true, ProviderSource::StaticRegistry);
                }
            }
        }
        "gitlab" => {
            if crate::auth::gitlab::is_authed() {
                return (true, ProviderSource::StaticRegistry);
            }
        }
        _ => {}
    }

    (false, ProviderSource::StaticRegistry)
}

/// Convert internal category to catalog category.
fn convert_category(category: crate::models::providers::ProviderCategory) -> ProviderCategory {
    use crate::models::providers::ProviderCategory as Src;
    match category {
        Src::Major => ProviderCategory::Major,
        Src::Cloud => ProviderCategory::Cloud,
        Src::OpenSourceHost => ProviderCategory::OpenSourceHost,
        Src::Local => ProviderCategory::Local,
        Src::Router => ProviderCategory::Router,
        Src::Enterprise => ProviderCategory::Enterprise,
        Src::Specialized => ProviderCategory::Specialized,
        Src::Gateway => ProviderCategory::Gateway,
    }
}

/// Categorize a provider from models.dev.
fn categorize_models_dev_provider(provider_id: &str) -> ProviderCategory {
    // Normalize to canonical ID first to handle aliases
    let canonical = crate::models::providers::normalize_provider_id(provider_id);

    match canonical.as_str() {
        "openai" | "anthropic" | "copilot" => ProviderCategory::Major,
        "azure" | "amazon-bedrock" | "google-vertex" | "google-vertex-anthropic" => {
            ProviderCategory::Cloud
        }
        "kilo" | "openrouter" => ProviderCategory::Gateway,
        "ollama" | "lmstudio" | "vllm" => ProviderCategory::Local,
        "github-copilot-enterprise" | "sap-ai-core" => ProviderCategory::Enterprise,
        "discord" | "gitlab" => ProviderCategory::Specialized,
        _ => ProviderCategory::OpenSourceHost,
    }
}

/// Get detailed information about a specific provider.
pub async fn get_provider_detail(
    provider_id: &str,
    cfg: &crate::config::Config,
) -> anyhow::Result<Option<ProviderDetailResponse>> {
    let normalized = crate::models::providers::normalize_provider_id(provider_id);

    // Build the full catalog
    let catalog = build_catalog(cfg).await?;

    // Find the provider
    let provider = catalog.all.into_iter().find(|p| p.id == normalized);

    let Some(provider) = provider else {
        return Ok(None);
    };

    // Get models with full metadata
    let mut models = Vec::new();

    // Try to get from models.dev
    if let Ok(registry) = crate::models_dev::get_or_load_registry().await {
        if let Some(md_provider) = registry.provider(&normalized) {
            for md_model in &md_provider.models {
                models.push(crate::models::ModelInfo {
                    id: md_model.id.clone(),
                    name: md_model.name.clone(),
                    vendor: Some(md_provider.name.clone()),
                    supported_endpoints: vec!["/chat/completions".to_string()],
                    is_default: md_provider.models.first().map(|m| m.id.clone())
                        == Some(md_model.id.clone()),
                    input_price: md_model.cost.as_ref().and_then(|c| c.input),
                    output_price: md_model.cost.as_ref().and_then(|c| c.output),
                    description: md_model.family.clone(),
                    max_tokens: md_model
                        .limit
                        .as_ref()
                        .and_then(|l| l.context.map(|c| c as u32)),
                });
            }
        }
    }

    // Build auth methods
    let auth_methods = build_auth_methods(&provider);

    Ok(Some(ProviderDetailResponse {
        provider,
        models,
        auth_methods,
    }))
}

/// Build authentication methods for a provider.
fn build_auth_methods(provider: &CatalogProvider) -> Vec<AuthMethod> {
    let mut methods = Vec::new();

    if provider.is_local {
        methods.push(AuthMethod {
            method_type: AuthMethodType::None,
            name: "No Authentication".to_string(),
            description: "Local provider requires no authentication".to_string(),
            requires_interaction: false,
            instructions: None,
        });
        return methods;
    }

    if provider.uses_oauth {
        methods.push(AuthMethod {
            method_type: AuthMethodType::OAuth,
            name: format!("{} OAuth", provider.name),
            description: format!("Sign in with your {} account", provider.name),
            requires_interaction: true,
            instructions: Some(
                "Open the authorization URL in your browser and grant access.".to_string(),
            ),
        });
    } else {
        methods.push(AuthMethod {
            method_type: AuthMethodType::ApiKey,
            name: format!("{} API Key", provider.name),
            description: format!("Enter your {} API key", provider.name),
            requires_interaction: false,
            instructions: provider.env.first().map(|env| {
                format!(
                    "Set the {} environment variable or enter the key below.",
                    env
                )
            }),
        });
    }

    // Provider-specific methods
    match provider.auth_type.as_deref() {
        Some("bearer") => {
            if !methods
                .iter()
                .any(|m| m.method_type == AuthMethodType::Bearer)
            {
                methods.push(AuthMethod {
                    method_type: AuthMethodType::Bearer,
                    name: "Bearer Token".to_string(),
                    description: "Use a bearer token for authentication".to_string(),
                    requires_interaction: false,
                    instructions: None,
                });
            }
        }
        Some("google-auth") => {
            methods.push(AuthMethod {
                method_type: AuthMethodType::GoogleAdc,
                name: "Google Application Default Credentials".to_string(),
                description: "Use gcloud ADC for authentication".to_string(),
                requires_interaction: true,
                instructions: Some(
                    "Run 'gcloud auth application-default login' to set up ADC.".to_string(),
                ),
            });
        }
        Some("aws-sigv4") => {
            methods.push(AuthMethod {
                method_type: AuthMethodType::AwsCredentials,
                name: "AWS Credentials".to_string(),
                description: "Use AWS credentials (access key or IAM role)".to_string(),
                requires_interaction: false,
                instructions: Some(
                    "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables."
                        .to_string(),
                ),
            });
        }
        _ => {}
    }

    methods
}

// ---------------------------------------------------------------------------
// Provider Priority List (matching Kilo)
// ---------------------------------------------------------------------------

/// Kilo's provider priority list.
/// Providers are displayed in this order when available.
pub const PROVIDER_PRIORITY: &[&str] = &[
    "kilo",
    "anthropic",
    "copilot",
    "openai",
    "openai-codex",
    "google",
    "openrouter",
    "vercel",
];

/// Get the priority index for a provider (lower = higher priority).
pub fn provider_priority_index(provider_id: &str) -> usize {
    let normalized = provider_id.to_lowercase();
    PROVIDER_PRIORITY
        .iter()
        .position(|p| *p == normalized)
        .unwrap_or(PROVIDER_PRIORITY.len())
}

/// Sort providers by Kilo priority.
pub fn sort_by_priority(providers: &mut [CatalogProvider]) {
    providers.sort_by(|a, b| {
        let a_idx = provider_priority_index(&a.id);
        let b_idx = provider_priority_index(&b.id);
        a_idx.cmp(&b_idx)
    });
}

// ---------------------------------------------------------------------------
// Helper Functions
// ---------------------------------------------------------------------------

/// Parse a model string in the format "provider/model".
pub fn parse_model_string(raw: &str) -> Option<(String, String)> {
    let slash = raw.find('/');
    if let Some(pos) = slash {
        if pos > 0 && pos < raw.len() - 1 {
            let provider = &raw[..pos];
            let model = &raw[pos + 1..];
            return Some((provider.to_string(), model.to_string()));
        }
    }
    None
}

/// Create a fallback Kilo provider entry.
pub fn create_kilo_fallback_provider() -> CatalogProvider {
    CatalogProvider {
        id: "kilo".to_string(),
        name: "Kilo Gateway".to_string(),
        source: ProviderSource::StaticRegistry,
        env: vec!["KILO_API_KEY".to_string()],
        npm: Some("@kilocode/kilo-gateway".to_string()),
        api: Some("https://api.kilo.ai/api/openrouter".to_string()),
        doc: Some("https://docs.kilo.ai".to_string()),
        auth_type: Some("bearer".to_string()),
        category: ProviderCategory::Gateway,
        available: false,
        auth_required: true,
        is_local: false,
        uses_oauth: false,
        known_options: vec![
            "apiKey".to_string(),
            "baseURL".to_string(),
            "kilocodeOrganizationId".to_string(),
            "timeout".to_string(),
            "headers".to_string(),
        ],
        models: vec!["kilo-auto/free".to_string()],
        default_model: Some("kilo-auto/free".to_string()),
        capabilities: ProviderCapabilities {
            supports_model_fetch: true,
            supports_streaming: true,
            supports_functions: true,
            supports_embeddings: false,
            supports_attachments: true,
            supports_reasoning: true,
        },
        aliases: vec!["kilo-gateway".to_string(), "kilocode".to_string()],
        extra: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_provider_category_display() {
        assert_eq!(ProviderCategory::Major.display_name(), "Major Providers");
        assert_eq!(ProviderCategory::Cloud.display_name(), "Cloud Providers");
        assert_eq!(
            ProviderCategory::Local.display_name(),
            "Local / Self-Hosted"
        );
    }

    #[test]
    fn test_provider_category_order() {
        assert!(ProviderCategory::Major.sort_order() < ProviderCategory::Cloud.sort_order());
        assert!(ProviderCategory::Gateway.sort_order() < ProviderCategory::Local.sort_order());
    }

    #[test]
    fn test_parse_model_string() {
        assert_eq!(
            parse_model_string("openai/gpt-4o"),
            Some(("openai".to_string(), "gpt-4o".to_string()))
        );
        assert_eq!(
            parse_model_string("anthropic/claude-sonnet-4"),
            Some(("anthropic".to_string(), "claude-sonnet-4".to_string()))
        );
        assert_eq!(parse_model_string("invalid"), None);
        assert_eq!(parse_model_string("/model"), None);
        assert_eq!(parse_model_string("provider/"), None);
    }

    #[test]
    fn test_provider_priority_index() {
        assert_eq!(provider_priority_index("kilo"), 0);
        assert_eq!(provider_priority_index("anthropic"), 1);
        assert_eq!(provider_priority_index("copilot"), 2);
        assert_eq!(provider_priority_index("openai"), 3);
        assert_eq!(provider_priority_index("openai-codex"), 4);
        assert_eq!(provider_priority_index("unknown"), PROVIDER_PRIORITY.len());
    }

    #[test]
    fn test_sort_by_priority() {
        let mut providers = vec![
            CatalogProvider {
                id: "openai".to_string(),
                name: "OpenAI".to_string(),
                source: ProviderSource::StaticRegistry,
                env: vec![],
                npm: None,
                api: None,
                doc: None,
                auth_type: None,
                category: ProviderCategory::Major,
                available: true,
                auth_required: true,
                is_local: false,
                uses_oauth: false,
                known_options: vec![],
                models: vec![],
                default_model: None,
                capabilities: ProviderCapabilities::default(),
                aliases: vec![],
                extra: None,
            },
            CatalogProvider {
                id: "kilo".to_string(),
                name: "Kilo".to_string(),
                source: ProviderSource::StaticRegistry,
                env: vec![],
                npm: None,
                api: None,
                doc: None,
                auth_type: None,
                category: ProviderCategory::Gateway,
                available: true,
                auth_required: true,
                is_local: false,
                uses_oauth: false,
                known_options: vec![],
                models: vec![],
                default_model: None,
                capabilities: ProviderCapabilities::default(),
                aliases: vec![],
                extra: None,
            },
        ];

        sort_by_priority(&mut providers);

        assert_eq!(providers[0].id, "kilo");
        assert_eq!(providers[1].id, "openai");
    }

    #[test]
    fn test_create_kilo_fallback() {
        let provider = create_kilo_fallback_provider();
        assert_eq!(provider.id, "kilo");
        assert_eq!(provider.name, "Kilo Gateway");
        assert!(provider.aliases.contains(&"kilo-gateway".to_string()));
        assert_eq!(provider.default_model, Some("kilo-auto/free".to_string()));
    }
}
