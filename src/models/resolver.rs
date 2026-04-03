//! Centralized provider resolution — credential, baseURL, and option resolution.
//!
//! This module provides Kilo-aligned provider resolution that consolidates:
//! - Environment variable resolution with fallback chains
//! - Auth store integration (unified auth)
//! - Config.provider section options
//! - Base URL template substitution (e.g., `${GOOGLE_CLOUD_PROJECT}`)
//! - Provider-specific resolution logic
//!
//! Resolution precedence (highest to lowest):
//! 1. Explicit config values (config.yaml provider.options)
//! 2. Environment variables
//! 3. Auth store (API keys, OAuth tokens)
//! 4. Static registry defaults

use std::collections::HashMap;

use tracing::debug;

/// Resolved provider configuration ready for provider construction.
#[derive(Debug, Clone, Default)]
pub struct ResolvedProviderConfig {
    /// Provider ID (canonical)
    pub provider_id: String,
    /// Model ID to use
    pub model_id: String,
    /// Resolved API key or access token
    pub api_key: String,
    /// Resolved base URL (with template substitution applied)
    pub base_url: Option<String>,
    /// Resolved endpoint (provider-specific)
    pub endpoint: Option<String>,
    /// API version (for Azure, etc.)
    pub api_version: Option<String>,
    /// Extra headers to include
    pub headers: Option<HashMap<String, String>>,
    /// Provider-specific options
    pub options: HashMap<String, serde_json::Value>,
    /// Whether the provider is properly configured
    pub is_configured: bool,
    /// Reason if not configured
    pub unconfigured_reason: Option<String>,
}

/// Resolve credentials for a provider using the standard precedence chain.
///
/// Precedence (highest to lowest):
/// 1. Config-provided key
/// 2. Environment variable(s) from provider metadata
/// 3. Auth store (API key or access token)
/// 4. Generic env var (PROVIDER_API_KEY)
pub fn resolve_credentials(provider_id: &str, config_key: Option<&str>) -> (bool, String, String) {
    let normalized = crate::models::providers::normalize_provider_id(provider_id);

    // 1. Config key (highest priority)
    if let Some(key) = config_key {
        let resolved = resolve_config_key_value(key);
        if !resolved.is_empty() {
            debug!(provider = %normalized, source = "config", "resolved credentials");
            return (true, resolved, "config".to_string());
        }
    }

    // 2. Environment variables from provider metadata
    if let Some(metadata) = crate::models::providers::get_provider_metadata(&normalized) {
        for var in metadata.env_vars {
            if let Ok(value) = std::env::var(var) {
                if !value.is_empty() {
                    debug!(provider = %normalized, source = "env", var = %var, "resolved credentials");
                    return (true, value, format!("env:{var}"));
                }
            }
        }
    }

    // 3. Auth store (unified auth)
    if let Some(entry) = crate::auth::store::get_auth(&normalized) {
        if let Some(ref key) = entry.api_key {
            if !key.is_empty() {
                debug!(provider = %normalized, source = "auth_store", auth_type = "api_key", "resolved credentials");
                return (true, key.clone(), "auth_store:api_key".to_string());
            }
        }
        if let Some(ref token) = entry.access_token {
            if !token.is_empty() {
                debug!(provider = %normalized, source = "auth_store", auth_type = "oauth", "resolved credentials");
                return (true, token.clone(), "auth_store:oauth".to_string());
            }
        }
    }

    // 4. Generic env var fallback (PROVIDER_API_KEY)
    let generic_var = format!("{}_API_KEY", normalized.to_uppercase().replace('-', "_"));
    if let Ok(value) = std::env::var(&generic_var) {
        if !value.is_empty() {
            debug!(provider = %normalized, source = "env", var = %generic_var, "resolved credentials via generic env var");
            return (true, value, format!("env:{generic_var}"));
        }
    }

    // Special case: Copilot - check for token file
    if normalized == "copilot" || normalized == "github-copilot-enterprise" {
        if let Some(home) = dirs::home_dir() {
            let token_path = home.join(".pinchy").join("copilot-token");
            if token_path.exists() {
                if let Ok(token) = std::fs::read_to_string(&token_path) {
                    let token = token.trim().to_string();
                    if !token.is_empty() {
                        debug!(provider = %normalized, source = "token_file", path = %token_path.display(), "resolved credentials");
                        return (
                            true,
                            token,
                            "token_file:~/.pinchy/copilot-token".to_string(),
                        );
                    }
                }
            }
        }

        // Check for GitHub device flow token
        if let Ok(Some(token)) = crate::auth::github_device::retrieve_token() {
            debug!(provider = %normalized, source = "keyring", "resolved credentials");
            return (true, token, "keyring:github_device".to_string());
        }
    }

    debug!(provider = %normalized, "no credentials found");
    (false, String::new(), String::new())
}

/// Resolve a config key value, handling $ENV_VAR syntax.
fn resolve_config_key_value(key: &str) -> String {
    if let Some(var) = key.strip_prefix('$') {
        std::env::var(var).unwrap_or_default()
    } else {
        key.to_string()
    }
}

/// Resolve base URL with template substitution.
///
/// Supported variables:
/// - `${ENV_VAR}` - Any environment variable
/// - Provider-specific variables (e.g., `${GOOGLE_CLOUD_PROJECT}`, `${GOOGLE_CLOUD_LOCATION}`)
pub fn resolve_base_url(
    provider_id: &str,
    config_url: Option<&str>,
    options: Option<&HashMap<String, serde_json::Value>>,
) -> Option<String> {
    let normalized = crate::models::providers::normalize_provider_id(provider_id);

    // Get raw URL from config or static registry
    let raw = config_url
        .map(|s| s.to_string())
        .or_else(|| crate::models::providers::get_api_base_url(&normalized).map(|s| s.to_string()))
        .or_else(|| {
            crate::models::providers::get_default_endpoint(&normalized).map(|s| s.to_string())
        });

    let raw = raw?;

    // For Google Vertex providers, resolve project/location variables
    let vars = if normalized.starts_with("google-vertex") {
        google_vertex_vars(options)
    } else {
        HashMap::new()
    };

    // Apply template substitution
    let resolved = substitute_template_vars(&raw, &vars);

    if resolved != raw {
        debug!(provider = %normalized, original = %raw, resolved = %resolved, "substituted base URL variables");
    }

    Some(resolved)
}

/// Get Google Vertex environment variables.
fn google_vertex_vars(
    options: Option<&HashMap<String, serde_json::Value>>,
) -> HashMap<String, String> {
    let mut vars = HashMap::new();

    // Project resolution precedence:
    // 1. options.project_id
    // 2. GOOGLE_CLOUD_PROJECT
    // 3. GCP_PROJECT
    // 4. GCLOUD_PROJECT
    let project = options
        .and_then(|o| o.get("project_id"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| std::env::var("GOOGLE_CLOUD_PROJECT").ok())
        .or_else(|| std::env::var("GCP_PROJECT").ok())
        .or_else(|| std::env::var("GCLOUD_PROJECT").ok());

    if let Some(p) = project {
        vars.insert("GOOGLE_CLOUD_PROJECT".to_string(), p.clone());
        vars.insert("GCP_PROJECT".to_string(), p.clone());
        vars.insert("GCLOUD_PROJECT".to_string(), p);
    }

    // Location resolution precedence:
    // 1. options.location
    // 2. GOOGLE_CLOUD_LOCATION
    // 3. VERTEX_LOCATION
    // 4. default: us-central1
    let location = options
        .and_then(|o| o.get("location"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| std::env::var("GOOGLE_CLOUD_LOCATION").ok())
        .or_else(|| std::env::var("VERTEX_LOCATION").ok())
        .unwrap_or_else(|| "us-central1".to_string());

    vars.insert("GOOGLE_CLOUD_LOCATION".to_string(), location.clone());
    vars.insert("VERTEX_LOCATION".to_string(), location.clone());

    // Compute endpoint based on location
    let endpoint = if location == "global" {
        "aiplatform.googleapis.com".to_string()
    } else {
        format!("{location}-aiplatform.googleapis.com")
    };
    vars.insert("GOOGLE_VERTEX_ENDPOINT".to_string(), endpoint);
    vars.insert("GOOGLE_VERTEX_LOCATION".to_string(), location);

    vars
}

/// Substitute template variables like `${VAR}` with values from env and vars map.
fn substitute_template_vars(template: &str, vars: &HashMap<String, String>) -> String {
    let mut result = template.to_string();

    // Find all ${VAR} patterns
    let mut start = 0;
    while let Some(pos) = result[start..].find("${") {
        let abs_pos = start + pos;
        if let Some(end_pos) = result[abs_pos..].find('}') {
            let var_name = &result[abs_pos + 2..abs_pos + end_pos];

            // Try vars map first, then env
            let value = vars
                .get(var_name)
                .cloned()
                .or_else(|| std::env::var(var_name).ok())
                .unwrap_or_else(|| format!("${{{var_name}}}"));

            result.replace_range(abs_pos..abs_pos + end_pos + 1, &value);
            start = abs_pos + value.len();
        } else {
            break;
        }
    }

    result
}

/// Resolve provider options from config and environment.
pub fn resolve_provider_options(
    _provider_id: &str,
    config_options: Option<&crate::config::ProviderOptions>,
) -> HashMap<String, serde_json::Value> {
    let mut options = HashMap::new();

    // Start with config options if provided
    if let Some(opts) = config_options {
        if let Some(ref org) = opts.organization {
            options.insert("organization".to_string(), serde_json::json!(org));
        }
        if let Some(ref project) = opts.project {
            options.insert("project".to_string(), serde_json::json!(project));
        }
        if let Some(ref region) = opts.region {
            options.insert("region".to_string(), serde_json::json!(region));
        }
        if let Some(ref profile) = opts.profile {
            options.insert("profile".to_string(), serde_json::json!(profile));
        }
        if let Some(ref loc) = opts.location {
            options.insert("location".to_string(), serde_json::json!(loc));
        }
        if let Some(ref enterprise_url) = opts.enterprise_url {
            options.insert(
                "enterpriseUrl".to_string(),
                serde_json::json!(enterprise_url),
            );
        }
        if let Some(ref timeout) = opts.timeout {
            match timeout {
                crate::config::ProviderTimeout::Milliseconds(ms) => {
                    options.insert("timeout".to_string(), serde_json::json!(ms));
                }
                crate::config::ProviderTimeout::Disabled(_) => {
                    options.insert("timeout".to_string(), serde_json::json!(false));
                }
            }
        }
        // Include extra options
        for (k, v) in &opts.extra {
            options.insert(k.clone(), v.clone());
        }
    }

    options
}

/// Build a fully resolved provider configuration.
///
/// This is the main entry point for Kilo-aligned provider resolution.
/// It combines all resolution sources into a single `ResolvedProviderConfig`.
pub fn resolve_provider_config(
    provider_id: &str,
    model_id: &str,
    config: Option<&crate::config::ProviderSection>,
    model_cfg: Option<&crate::config::ModelConfig>,
) -> ResolvedProviderConfig {
    let normalized = crate::models::providers::normalize_provider_id(provider_id);

    // Resolve credentials
    let config_key = config
        .and_then(|c| c.options.as_ref())
        .and_then(|o| o.api_key.as_deref())
        .or_else(|| model_cfg.and_then(|m| m.api_key.as_deref()));

    let (has_credentials, api_key, cred_source) = resolve_credentials(&normalized, config_key);

    // Resolve base URL
    let config_url = config
        .and_then(|c| c.options.as_ref())
        .and_then(|o| o.base_url.as_deref())
        .or_else(|| model_cfg.and_then(|m| m.endpoint.as_deref()));

    let base_url = resolve_base_url(&normalized, config_url, None);

    // Resolve endpoint (for Azure-style providers)
    let endpoint = model_cfg
        .and_then(|m| m.endpoint.clone())
        .or_else(|| base_url.clone());

    // Resolve API version
    let api_version = model_cfg.and_then(|m| m.api_version.clone()).or_else(|| {
        config
            .and_then(|c| c.options.as_ref())
            .and_then(|o| o.api_version.clone())
    });

    // Resolve headers
    let headers = model_cfg.and_then(|m| m.headers.clone()).or_else(|| {
        // Try auth store headers
        crate::auth::store::get_auth(&normalized).and_then(|e| e.headers)
    });

    // Resolve options
    let config_options = config.and_then(|c| c.options.as_ref());
    let options = resolve_provider_options(&normalized, config_options);

    // Determine if configured and reason if not
    let (is_configured, unconfigured_reason) = if !has_credentials {
        let is_local = crate::models::providers::is_local_provider(&normalized);
        let uses_oauth = crate::models::providers::uses_oauth(&normalized);

        if is_local {
            (true, None)
        } else if uses_oauth && normalized.starts_with("copilot") {
            // Copilot can work with just a token file
            (true, None)
        } else {
            let reason = if uses_oauth {
                format!("{normalized} requires OAuth authentication - run the appropriate login command")
            } else {
                format!("{normalized} requires API key - set env var or use auth store")
            };
            (false, Some(reason))
        }
    } else {
        (true, None)
    };

    debug!(
        provider = %normalized,
        model = %model_id,
        has_credentials,
        has_base_url = base_url.is_some(),
        cred_source = %cred_source,
        is_configured,
        "resolved provider config"
    );

    ResolvedProviderConfig {
        provider_id: normalized,
        model_id: model_id.to_string(),
        api_key,
        base_url,
        endpoint,
        api_version,
        headers,
        options,
        is_configured,
        unconfigured_reason,
    }
}

/// Get Kilo Gateway base URL with organization normalization.
///
/// Kilo uses a specific URL pattern:
/// - With org: `https://api.kilo.ai/api/organizations/{org_id}`
/// - Without org: `https://api.kilo.ai/api/openrouter`
pub fn resolve_kilo_base_url(org_id: Option<&str>) -> String {
    let base = "https://api.kilo.ai";

    if let Some(org) = org_id {
        if !org.is_empty() {
            return format!("{}/api/organizations/{}", base, org);
        }
    }

    format!("{}/api/openrouter", base)
}

/// Resolve Kilo organization ID from various sources.
///
/// Precedence:
/// 1. Config options.kilocodeOrganizationId
/// 2. KILO_ORG_ID env var
/// 3. OAuth account_id from auth store
pub fn resolve_kilo_org_id(
    config_options: Option<&HashMap<String, serde_json::Value>>,
) -> Option<String> {
    // 1. Config
    if let Some(opts) = config_options {
        if let Some(org) = opts.get("kilocodeOrganizationId").and_then(|v| v.as_str()) {
            return Some(org.to_string());
        }
    }

    // 2. Env var
    if let Ok(org) = std::env::var("KILO_ORG_ID") {
        if !org.is_empty() {
            return Some(org);
        }
    }

    // 3. Auth store OAuth account_id
    if let Some(entry) = crate::auth::store::get_auth("kilo") {
        if let Some(account_id) = entry.account_id {
            if !account_id.is_empty() {
                return Some(account_id);
            }
        }
    }

    None
}

/// Check if a provider requires specific implementation scaffolding.
///
/// Returns `true` for providers that have concrete runtime support.
pub fn provider_has_runtime_support(provider_id: &str) -> bool {
    let normalized = crate::models::providers::normalize_provider_id(provider_id);

    matches!(
        normalized.as_str(),
        "openai"
            | "openai-codex"
            | "anthropic"
            | "copilot"
            | "github-copilot-enterprise"
            | "azure"
            | "google"
            | "amazon-bedrock"
            | "openrouter"
            | "groq"
            | "togetherai"
            | "mistral"
            | "cohere"
            | "cerebras"
            | "xai"
            | "deepseek"
            | "fireworks-ai"
            | "ollama"
            | "lmstudio"
            | "vllm"
            | "kilo"
            | "perplexity"
    )
}

/// Get provider-specific builder guidance.
///
/// Returns hints for providers that need special construction logic.
pub fn get_provider_builder_hints(provider_id: &str) -> ProviderBuilderHints {
    let normalized = crate::models::providers::normalize_provider_id(provider_id);

    match normalized.as_str() {
        "kilo" => ProviderBuilderHints {
            use_openai_compat: true,
            requires_auth: true,
            supports_streaming: true,
            supports_functions: true,
            base_url_override: None, // Will be computed with org ID
        },
        "github-copilot-enterprise" => ProviderBuilderHints {
            use_openai_compat: false,
            requires_auth: true,
            supports_streaming: true,
            supports_functions: true,
            base_url_override: None, // Uses Copilot provider with enterprise URL
        },
        "google-vertex" | "google-vertex-anthropic" => ProviderBuilderHints {
            use_openai_compat: false,
            requires_auth: true,
            supports_streaming: true,
            supports_functions: true,
            base_url_override: None, // Needs ADC - not yet fully supported
        },
        "amazon-bedrock" => ProviderBuilderHints {
            use_openai_compat: false,
            requires_auth: true,
            supports_streaming: true,
            supports_functions: true,
            base_url_override: None,
        },
        _ => ProviderBuilderHints {
            use_openai_compat: true,
            requires_auth: !crate::models::providers::is_local_provider(&normalized),
            supports_streaming: true,
            supports_functions: true,
            base_url_override: None,
        },
    }
}

/// Hints for building a provider instance.
#[derive(Debug, Clone)]
pub struct ProviderBuilderHints {
    /// Use OpenAI-compatible provider wrapper
    pub use_openai_compat: bool,
    /// Requires authentication
    pub requires_auth: bool,
    /// Supports streaming responses
    pub supports_streaming: bool,
    /// Supports function calling
    pub supports_functions: bool,
    /// Override base URL (provider-specific)
    pub base_url_override: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_substitute_template_vars() {
        let mut vars = HashMap::new();
        vars.insert("PROJECT".to_string(), "my-project".to_string());
        vars.insert("REGION".to_string(), "us-central1".to_string());

        assert_eq!(
            substitute_template_vars("https://api.${PROJECT}.com", &vars),
            "https://api.my-project.com"
        );

        assert_eq!(
            substitute_template_vars("https://${REGION}-api.com", &vars),
            "https://us-central1-api.com"
        );

        // Unknown var keeps template
        assert_eq!(
            substitute_template_vars("https://${UNKNOWN}.com", &vars),
            "https://${UNKNOWN}.com"
        );
    }

    #[test]
    fn test_resolve_kilo_base_url() {
        assert_eq!(
            resolve_kilo_base_url(None),
            "https://api.kilo.ai/api/openrouter"
        );
        assert_eq!(
            resolve_kilo_base_url(Some("org_123")),
            "https://api.kilo.ai/api/organizations/org_123"
        );
    }

    #[test]
    fn test_resolve_config_key_value() {
        std::env::set_var("TEST_API_KEY", "test_value_123");
        assert_eq!(resolve_config_key_value("$TEST_API_KEY"), "test_value_123");
        assert_eq!(resolve_config_key_value("plain_key"), "plain_key");
        std::env::remove_var("TEST_API_KEY");
    }

    #[test]
    fn test_provider_has_runtime_support() {
        assert!(provider_has_runtime_support("openai"));
        assert!(provider_has_runtime_support("kilo"));
        assert!(provider_has_runtime_support("github-copilot-enterprise"));
        assert!(!provider_has_runtime_support("unknown-provider"));
    }
}
