//! Centralized provider registry with metadata, aliases, and auth configuration.
//!
//! This module provides a single source of truth for:
//! - Provider ID normalization (aliases)
//! - Environment variable mappings
//! - Provider capabilities (local, oauth, api-key requirements)
//! - Bidirectional alias resolution
//! - Rich metadata aligned with models.dev schema
//!
//! ## Architecture
//!
//! The registry combines static metadata (for well-known providers) with dynamic
//! metadata from models.dev. This provides:
//! 1. Fallback metadata when models.dev is unavailable
//! 2. Richer provider-specific configuration options
//! 3. Kilo-compatible provider ID normalization

use std::collections::HashMap;

/// Provider metadata including aliases, env vars, capabilities, and rich config.
///
/// Aligned with Kilo's `ModelsDev.Provider` schema for cross-compatibility.
#[derive(Debug, Clone)]
pub struct ProviderMetadata {
    /// Canonical provider ID (used in models.dev registry)
    pub canonical_id: &'static str,
    /// Display name for UI
    pub display_name: &'static str,
    /// Alternative IDs that map to this provider (e.g., "fireworks" -> "fireworks-ai")
    pub aliases: &'static [&'static str],
    /// Environment variable names for API keys/auth
    pub env_vars: &'static [&'static str],
    /// Whether this provider requires an API key
    pub requires_api_key: bool,
    /// Whether this is a local/self-hosted provider (no auth needed)
    pub is_local: bool,
    /// Whether this provider uses OAuth instead of API key
    pub uses_oauth: bool,
    /// Default endpoint URL (for local providers or compat layers)
    pub default_endpoint: Option<&'static str>,
    /// Provider category for grouping in UI
    pub category: ProviderCategory,
    /// NPM package name for AI SDK compatibility (e.g., "@ai-sdk/openai")
    pub npm_package: Option<&'static str>,
    /// Base API URL for this provider (if known/fixed)
    pub api_base_url: Option<&'static str>,
    /// Authentication type hint (bearer, api-key, oauth, etc.)
    pub auth_type: Option<&'static str>,
    /// Documentation URL
    pub doc_url: Option<&'static str>,
    /// Whether this provider supports model listing/fetching
    pub supports_model_fetch: bool,
    /// Provider-specific configuration keys (for validation)
    pub known_options: &'static [&'static str],
}

/// Provider categories for UI grouping.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProviderCategory {
    Major,
    Cloud,
    OpenSourceHost,
    Local,
    Router,
    Enterprise,
    Specialized,
    Gateway,
}

impl ProviderCategory {
    /// Get a display name for the category.
    pub const fn display_name(&self) -> &'static str {
        match self {
            ProviderCategory::Major => "Major Providers",
            ProviderCategory::Cloud => "Cloud Providers",
            ProviderCategory::OpenSourceHost => "Open Source Hosts",
            ProviderCategory::Local => "Local/Self-Hosted",
            ProviderCategory::Router => "Model Routers",
            ProviderCategory::Enterprise => "Enterprise",
            ProviderCategory::Specialized => "Specialized",
            ProviderCategory::Gateway => "AI Gateways",
        }
    }
}

/// Static provider registry with all known providers and their metadata.
///
/// This is the fallback source of truth when models.dev is unavailable.
/// When models.dev is available, its data takes precedence for model lists,
/// but static metadata fills in missing fields (env vars, npm packages, etc.).
pub const PROVIDER_REGISTRY: &[ProviderMetadata] = &[
    // Major cloud providers
    ProviderMetadata {
        canonical_id: "openai",
        display_name: "OpenAI",
        aliases: &[],
        env_vars: &["OPENAI_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Major,
        npm_package: Some("@ai-sdk/openai"),
        api_base_url: Some("https://api.openai.com/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://platform.openai.com/docs"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "organization", "project", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "openai-codex",
        display_name: "OpenAI Codex",
        aliases: &[],
        env_vars: &["OPENAI_API_KEY"],
        requires_api_key: false,
        is_local: false,
        uses_oauth: true,
        default_endpoint: None,
        category: ProviderCategory::Major,
        npm_package: Some("@ai-sdk/openai"),
        api_base_url: Some("https://api.openai.com/v1"),
        auth_type: Some("oauth"),
        doc_url: Some("https://platform.openai.com/docs"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "organization", "project", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "anthropic",
        display_name: "Anthropic",
        aliases: &[],
        env_vars: &["ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Major,
        npm_package: Some("@ai-sdk/anthropic"),
        api_base_url: Some("https://api.anthropic.com/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.anthropic.com"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout", "headers"],
    },
    ProviderMetadata {
        canonical_id: "copilot",
        display_name: "GitHub Copilot",
        aliases: &["github-copilot"],
        env_vars: &["COPILOT_TOKEN"],
        requires_api_key: false,
        is_local: false,
        uses_oauth: true,
        default_endpoint: Some("https://api.githubcopilot.com"),
        category: ProviderCategory::Major,
        npm_package: Some("@ai-sdk/github-copilot"),
        api_base_url: Some("https://api.githubcopilot.com"),
        auth_type: Some("oauth"),
        doc_url: Some("https://github.com/features/copilot"),
        supports_model_fetch: true,
        known_options: &["enterpriseUrl", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "github-copilot-enterprise",
        display_name: "GitHub Copilot Enterprise",
        aliases: &[],
        env_vars: &["COPILOT_TOKEN"],
        requires_api_key: false,
        is_local: false,
        uses_oauth: true,
        default_endpoint: None,
        category: ProviderCategory::Enterprise,
        npm_package: Some("@ai-sdk/github-copilot"),
        api_base_url: None, // Determined by enterpriseUrl option
        auth_type: Some("oauth"),
        doc_url: Some("https://docs.github.com/en/enterprise-cloud@latest/copilot"),
        supports_model_fetch: true,
        known_options: &["enterpriseUrl", "timeout", "apiKey"],
    },
    // Cloud providers
    ProviderMetadata {
        canonical_id: "azure",
        display_name: "Azure OpenAI",
        aliases: &["azure-openai", "azure_openai"],
        env_vars: &["AZURE_OPENAI_API_KEY", "AZURE_OPENAI_ENDPOINT"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Cloud,
        npm_package: Some("@ai-sdk/azure"),
        api_base_url: None, // Determined by endpoint
        auth_type: Some("api-key"),
        doc_url: Some("https://learn.microsoft.com/en-us/azure/ai-services/openai/"),
        supports_model_fetch: false,
        known_options: &[
            "apiKey",
            "baseURL",
            "apiVersion",
            "useCompletionUrls",
            "timeout",
        ],
    },
    ProviderMetadata {
        canonical_id: "azure-cognitive-services",
        display_name: "Azure Cognitive Services",
        aliases: &[],
        env_vars: &[
            "AZURE_COGNITIVE_SERVICES_RESOURCE_NAME",
            "AZURE_COGNITIVE_SERVICES_API_KEY",
        ],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Cloud,
        npm_package: Some("@ai-sdk/azure"),
        api_base_url: None,
        auth_type: Some("api-key"),
        doc_url: Some("https://learn.microsoft.com/en-us/azure/cognitive-services/"),
        supports_model_fetch: false,
        known_options: &["apiKey", "baseURL", "apiVersion", "useCompletionUrls"],
    },
    ProviderMetadata {
        canonical_id: "google",
        display_name: "Google AI",
        aliases: &["google-ai", "google-gemini", "gemini"],
        env_vars: &["GOOGLE_API_KEY", "GOOGLE_AI_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Major,
        npm_package: Some("@ai-sdk/google"),
        api_base_url: Some("https://generativelanguage.googleapis.com/v1beta"),
        auth_type: Some("api-key"),
        doc_url: Some("https://ai.google.dev"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "google-vertex",
        display_name: "Google Vertex AI",
        aliases: &["vertex", "vertex-ai", "google-vertex-ai"],
        env_vars: &[
            "GOOGLE_CLOUD_PROJECT",
            "GCP_PROJECT",
            "GCLOUD_PROJECT",
            "GOOGLE_CLOUD_LOCATION",
            "VERTEX_LOCATION",
        ],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Cloud,
        npm_package: Some("@ai-sdk/google-vertex"),
        api_base_url: Some("https://aiplatform.googleapis.com"),
        auth_type: Some("google-auth"),
        doc_url: Some("https://cloud.google.com/vertex-ai"),
        supports_model_fetch: false,
        known_options: &["project", "location", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "google-vertex-anthropic",
        display_name: "Google Vertex AI (Anthropic)",
        aliases: &["vertex-anthropic"],
        env_vars: &[
            "GOOGLE_CLOUD_PROJECT",
            "GCP_PROJECT",
            "GCLOUD_PROJECT",
            "GOOGLE_CLOUD_LOCATION",
            "VERTEX_LOCATION",
        ],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Cloud,
        npm_package: Some("@ai-sdk/google-vertex/anthropic"),
        api_base_url: Some("https://aiplatform.googleapis.com"),
        auth_type: Some("google-auth"),
        doc_url: Some("https://cloud.google.com/vertex-ai"),
        supports_model_fetch: false,
        known_options: &["project", "location", "baseURL", "timeout"],
    },
    // AWS
    ProviderMetadata {
        canonical_id: "amazon-bedrock",
        display_name: "AWS Bedrock",
        aliases: &["bedrock", "aws-bedrock"],
        env_vars: &[
            "AWS_BEARER_TOKEN_BEDROCK",
            "AWS_ACCESS_KEY_ID",
            "AWS_SECRET_ACCESS_KEY",
            "AWS_REGION",
            "AWS_PROFILE",
        ],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Cloud,
        npm_package: Some("@ai-sdk/amazon-bedrock"),
        api_base_url: None, // Determined by region
        auth_type: Some("aws-sigv4"),
        doc_url: Some("https://aws.amazon.com/bedrock/"),
        supports_model_fetch: true,
        known_options: &[
            "region",
            "profile",
            "endpoint",
            "baseURL",
            "credentialProvider",
            "timeout",
        ],
    },
    // Open source model hosts
    ProviderMetadata {
        canonical_id: "togetherai",
        display_name: "Together AI",
        aliases: &["together", "together-ai"],
        env_vars: &["TOGETHER_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/togetherai"),
        api_base_url: Some("https://api.together.xyz/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.together.ai"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "fireworks-ai",
        display_name: "Fireworks AI",
        aliases: &["fireworks"],
        env_vars: &["FIREWORKS_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: Some("https://api.fireworks.ai/inference/v1/chat/completions"),
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/fireworks"),
        api_base_url: Some("https://api.fireworks.ai/inference/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.fireworks.ai"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "groq",
        display_name: "Groq",
        aliases: &[],
        env_vars: &["GROQ_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/groq"),
        api_base_url: Some("https://api.groq.com/openai/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://console.groq.com/docs"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "mistral",
        display_name: "Mistral AI",
        aliases: &["mistral-ai"],
        env_vars: &["MISTRAL_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/mistral"),
        api_base_url: Some("https://api.mistral.ai/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.mistral.ai"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "cohere",
        display_name: "Cohere",
        aliases: &[],
        env_vars: &["COHERE_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/cohere"),
        api_base_url: Some("https://api.cohere.com/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.cohere.com"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "cerebras",
        display_name: "Cerebras",
        aliases: &[],
        env_vars: &["CEREBRAS_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/cerebras"),
        api_base_url: Some("https://api.cerebras.ai/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.cerebras.ai"),
        supports_model_fetch: false,
        known_options: &["apiKey", "baseURL", "timeout", "headers"],
    },
    ProviderMetadata {
        canonical_id: "deepinfra",
        display_name: "DeepInfra",
        aliases: &[],
        env_vars: &["DEEPINFRA_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/deepinfra"),
        api_base_url: Some("https://api.deepinfra.com/v1/openai"),
        auth_type: Some("bearer"),
        doc_url: Some("https://deepinfra.com"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "deepseek",
        display_name: "DeepSeek",
        aliases: &[],
        env_vars: &["DEEPSEEK_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: Some("https://api.deepseek.com/v1/chat/completions"),
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/deepseek"),
        api_base_url: Some("https://api.deepseek.com/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://platform.deepseek.com"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    // Routers/aggregators
    ProviderMetadata {
        canonical_id: "openrouter",
        display_name: "OpenRouter",
        aliases: &["open-router", "openai-compat", "openai_compat", "compat"],
        env_vars: &["OPENROUTER_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: Some("https://openrouter.ai/api/v1/chat/completions"),
        category: ProviderCategory::Router,
        npm_package: Some("@openrouter/ai-sdk-provider"),
        api_base_url: Some("https://openrouter.ai/api/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://openrouter.ai/docs"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout", "headers"],
    },
    ProviderMetadata {
        canonical_id: "apertis",
        display_name: "Apertis",
        aliases: &[],
        env_vars: &["APERTIS_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: Some("https://api.apertis.ai/v1"),
        category: ProviderCategory::Router,
        npm_package: Some("@ai-sdk/openai-compatible"),
        api_base_url: Some("https://api.apertis.ai/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://apertis.ai"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    // AI Gateways
    ProviderMetadata {
        canonical_id: "kilo",
        display_name: "Kilo Gateway",
        aliases: &["kilo-gateway", "kilocode"],
        env_vars: &["KILO_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: Some("https://api.kilo.ai/api/openrouter"),
        category: ProviderCategory::Gateway,
        npm_package: Some("@kilocode/kilo-gateway"),
        api_base_url: Some("https://api.kilo.ai/api/openrouter"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.kilo.ai"),
        supports_model_fetch: true,
        known_options: &[
            "apiKey",
            "baseURL",
            "kilocodeOrganizationId",
            "timeout",
            "headers",
        ],
    },
    ProviderMetadata {
        canonical_id: "vercel",
        display_name: "Vercel AI",
        aliases: &[],
        env_vars: &["VERCEL_AI_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Gateway,
        npm_package: Some("@ai-sdk/vercel"),
        api_base_url: Some("https://api.vercel.ai"),
        auth_type: Some("bearer"),
        doc_url: Some("https://vercel.com/docs/ai"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout", "headers"],
    },
    ProviderMetadata {
        canonical_id: "zenmux",
        display_name: "ZenMux",
        aliases: &[],
        env_vars: &["ZENMUX_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Gateway,
        npm_package: Some("@ai-sdk/openai-compatible"),
        api_base_url: None,
        auth_type: Some("bearer"),
        doc_url: None,
        supports_model_fetch: false,
        known_options: &["apiKey", "baseURL", "timeout", "headers"],
    },
    // Local/self-hosted providers
    ProviderMetadata {
        canonical_id: "ollama",
        display_name: "Ollama",
        aliases: &[],
        env_vars: &["OLLAMA_HOST", "OLLAMA_BASE_URL"],
        requires_api_key: false,
        is_local: true,
        uses_oauth: false,
        default_endpoint: Some("http://localhost:11434/v1/chat/completions"),
        category: ProviderCategory::Local,
        npm_package: Some("@ai-sdk/ollama"),
        api_base_url: Some("http://localhost:11434/v1"),
        auth_type: None,
        doc_url: Some("https://ollama.ai"),
        supports_model_fetch: true,
        known_options: &["baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "lmstudio",
        display_name: "LM Studio",
        aliases: &["lm-studio"],
        env_vars: &["LMSTUDIO_BASE_URL"],
        requires_api_key: false,
        is_local: true,
        uses_oauth: false,
        default_endpoint: Some("http://localhost:1234/v1/chat/completions"),
        category: ProviderCategory::Local,
        npm_package: Some("@ai-sdk/lmstudio"),
        api_base_url: Some("http://localhost:1234/v1"),
        auth_type: None,
        doc_url: Some("https://lmstudio.ai"),
        supports_model_fetch: false,
        known_options: &["baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "vllm",
        display_name: "vLLM",
        aliases: &[],
        env_vars: &["VLLM_BASE_URL"],
        requires_api_key: false,
        is_local: true,
        uses_oauth: false,
        default_endpoint: Some("http://localhost:8000/v1/chat/completions"),
        category: ProviderCategory::Local,
        npm_package: Some("@ai-sdk/vllm"),
        api_base_url: Some("http://localhost:8000/v1"),
        auth_type: None,
        doc_url: Some("https://docs.vllm.ai"),
        supports_model_fetch: false,
        known_options: &["baseURL", "timeout"],
    },
    // Additional providers
    ProviderMetadata {
        canonical_id: "xai",
        display_name: "xAI (Grok)",
        aliases: &["x-ai", "grok"],
        env_vars: &["XAI_API_KEY", "X_AI_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/xai"),
        api_base_url: Some("https://api.x.ai/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.x.ai"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    // Non-model providers (for auth status)
    ProviderMetadata {
        canonical_id: "gitlab",
        display_name: "GitLab",
        aliases: &[],
        env_vars: &["GITLAB_TOKEN", "GITLAB_INSTANCE_URL"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: Some("https://gitlab.com"),
        category: ProviderCategory::Specialized,
        npm_package: Some("@gitlab/gitlab-ai-provider"),
        api_base_url: Some("https://gitlab.com/api/v4"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.gitlab.com"),
        supports_model_fetch: false,
        known_options: &["instanceUrl", "apiKey", "aiGatewayHeaders", "featureFlags"],
    },
    ProviderMetadata {
        canonical_id: "discord",
        display_name: "Discord",
        aliases: &[],
        env_vars: &["DISCORD_TOKEN"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Specialized,
        npm_package: None,
        api_base_url: Some("https://discord.com/api/v10"),
        auth_type: Some("bot-token"),
        doc_url: Some("https://discord.com/developers/docs"),
        supports_model_fetch: false,
        known_options: &[],
    },
    // Additional enterprise/cloud providers
    ProviderMetadata {
        canonical_id: "perplexity",
        display_name: "Perplexity",
        aliases: &[],
        env_vars: &["PERPLEXITY_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Specialized,
        npm_package: Some("@ai-sdk/perplexity"),
        api_base_url: Some("https://api.perplexity.ai"),
        auth_type: Some("bearer"),
        doc_url: Some("https://docs.perplexity.ai"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "sap-ai-core",
        display_name: "SAP AI Core",
        aliases: &["sap", "sap-aicore"],
        env_vars: &[
            "AICORE_SERVICE_KEY",
            "AICORE_DEPLOYMENT_ID",
            "AICORE_RESOURCE_GROUP",
        ],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Enterprise,
        npm_package: Some("@ai-sdk/sap-ai-core"),
        api_base_url: None, // Determined by service key
        auth_type: Some("sap-service-key"),
        doc_url: Some("https://help.sap.com/docs/sap-ai-core"),
        supports_model_fetch: false,
        known_options: &[
            "serviceKey",
            "deploymentId",
            "resourceGroup",
            "baseURL",
            "timeout",
        ],
    },
    ProviderMetadata {
        canonical_id: "cloudflare-workers-ai",
        display_name: "Cloudflare Workers AI",
        aliases: &["cloudflare", "workers-ai", "cloudflare-ai"],
        env_vars: &[
            "CLOUDFLARE_ACCOUNT_ID",
            "CLOUDFLARE_API_KEY",
            "CLOUDFLARE_API_TOKEN",
        ],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Cloud,
        npm_package: Some("@ai-sdk/cloudflare-workers-ai"),
        api_base_url: None, // Determined by account ID
        auth_type: Some("api-key"),
        doc_url: Some("https://developers.cloudflare.com/workers-ai"),
        supports_model_fetch: true,
        known_options: &["accountId", "apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "cloudflare-ai-gateway",
        display_name: "Cloudflare AI Gateway",
        aliases: &[],
        env_vars: &[
            "CLOUDFLARE_ACCOUNT_ID",
            "CLOUDFLARE_GATEWAY_ID",
            "CLOUDFLARE_API_TOKEN",
            "CF_AIG_TOKEN",
        ],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::Gateway,
        npm_package: Some("ai-gateway-provider"),
        api_base_url: None, // Determined by account ID and gateway ID
        auth_type: Some("api-key"),
        doc_url: Some("https://developers.cloudflare.com/ai-gateway"),
        supports_model_fetch: false,
        known_options: &[
            "accountId",
            "gateway",
            "apiToken",
            "metadata",
            "cacheTtl",
            "cacheKey",
            "skipCache",
            "collectLog",
            "timeout",
        ],
    },
    ProviderMetadata {
        canonical_id: "opentalk",
        display_name: "OpenTalk",
        aliases: &[],
        env_vars: &["OPENTALK_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/openai-compatible"),
        api_base_url: None,
        auth_type: Some("bearer"),
        doc_url: None,
        supports_model_fetch: false,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "opencode",
        display_name: "OpenCode",
        aliases: &[],
        env_vars: &["OPENCODE_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/openai-compatible"),
        api_base_url: None,
        auth_type: Some("bearer"),
        doc_url: None,
        supports_model_fetch: false,
        known_options: &["apiKey", "baseURL", "timeout", "headers"],
    },
    ProviderMetadata {
        canonical_id: "kimi",
        display_name: "Kimi",
        aliases: &[],
        env_vars: &["KIMI_API_KEY", "MOONSHOT_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/openai-compatible"),
        api_base_url: Some("https://api.moonshot.cn/v1"),
        auth_type: Some("bearer"),
        doc_url: Some("https://platform.moonshot.cn"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
    ProviderMetadata {
        canonical_id: "hunyuan",
        display_name: "Hunyuan",
        aliases: &[],
        env_vars: &["HUNYUAN_API_KEY", "TENCENT_CLOUD_API_KEY"],
        requires_api_key: true,
        is_local: false,
        uses_oauth: false,
        default_endpoint: None,
        category: ProviderCategory::OpenSourceHost,
        npm_package: Some("@ai-sdk/openai-compatible"),
        api_base_url: None,
        auth_type: Some("bearer"),
        doc_url: Some("https://cloud.tencent.com/document/product/1729"),
        supports_model_fetch: true,
        known_options: &["apiKey", "baseURL", "timeout"],
    },
];

/// Lazy-initialized bidirectional alias map.
/// Maps any provider ID (alias or canonical) to the canonical ID.
fn build_alias_map() -> HashMap<String, String> {
    let mut map = HashMap::new();

    for provider in PROVIDER_REGISTRY {
        // Map canonical ID to itself
        map.insert(
            provider.canonical_id.to_lowercase().replace('_', "-"),
            provider.canonical_id.to_string(),
        );

        // Map all aliases to canonical ID
        for alias in provider.aliases {
            map.insert(
                alias.to_lowercase().replace('_', "-"),
                provider.canonical_id.to_string(),
            );
        }
    }

    map
}

/// Normalize a provider ID to its canonical form.
///
/// This handles:
/// - Case insensitivity (OPENAI -> openai)
/// - Underscore to dash conversion (azure_openai -> azure-openai)
/// - Alias resolution (fireworks -> fireworks-ai, github-copilot -> copilot)
///
/// Returns the canonical ID if found, otherwise returns the normalized input.
pub fn normalize_provider_id(provider_id: &str) -> String {
    if provider_id.is_empty() {
        return String::new();
    }

    let normalized_input = provider_id.to_lowercase().replace('_', "-");

    // Use the bidirectional alias map
    static ALIAS_MAP: std::sync::OnceLock<HashMap<String, String>> = std::sync::OnceLock::new();
    let alias_map = ALIAS_MAP.get_or_init(build_alias_map);

    alias_map
        .get(&normalized_input)
        .cloned()
        .unwrap_or(normalized_input)
}

/// Get provider metadata by ID (handles aliases).
pub fn get_provider_metadata(provider_id: &str) -> Option<&'static ProviderMetadata> {
    let canonical = normalize_provider_id(provider_id);

    PROVIDER_REGISTRY
        .iter()
        .find(|p| p.canonical_id == canonical)
}

/// Check if a provider is configured based on environment variables.
/// Returns (is_configured, detected_env_var)
pub fn check_provider_env_auth(provider_id: &str) -> (bool, Option<String>) {
    let canonical = normalize_provider_id(provider_id);

    // Handle copilot specially due to its complex auth flow
    if canonical == "copilot" || canonical == "github-copilot-enterprise" {
        return check_copilot_auth();
    }

    if let Some(metadata) = get_provider_metadata(&canonical) {
        // Local providers are always "configured"
        if metadata.is_local {
            return (true, None);
        }

        // Check env vars
        for var in metadata.env_vars {
            if std::env::var(var).is_ok() {
                return (true, Some(var.to_string()));
            }
        }

        // Generic fallback: {PROVIDER}_API_KEY
        let generic_var = format!("{}_API_KEY", canonical.to_uppercase().replace('-', ""));
        if std::env::var(&generic_var).is_ok() {
            return (true, Some(generic_var));
        }
    }

    (false, None)
}

/// Check copilot auth which has multiple sources.
fn check_copilot_auth() -> (bool, Option<String>) {
    // 1. Direct COPILOT_TOKEN
    if std::env::var("COPILOT_TOKEN").is_ok() {
        return (true, Some("COPILOT_TOKEN".to_string()));
    }

    // 2. GitHub device flow token
    if let Ok(Some(_)) = crate::auth::github_device::retrieve_token() {
        return (true, Some("keyring (device flow)".to_string()));
    }

    // 3. Cached copilot token file
    if let Some(home) = dirs::home_dir() {
        if home.join(".pinchy/copilot-token").exists() {
            return (true, Some("~/.pinchy/copilot-token".to_string()));
        }
    }

    (false, None)
}

/// Get the primary environment variable for a provider.
pub fn get_provider_env_var(provider_id: &str) -> Option<&'static str> {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical).and_then(|m| m.env_vars.first().copied())
}

/// Get all environment variables for a provider.
pub fn get_provider_env_vars(provider_id: &str) -> &'static [&'static str] {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical)
        .map(|m| m.env_vars)
        .unwrap_or(&[])
}

/// Check if a provider is a local/self-hosted provider (no auth needed).
pub fn is_local_provider(provider_id: &str) -> bool {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical)
        .map(|m| m.is_local)
        .unwrap_or(false)
}

/// Check if a provider uses OAuth instead of API key.
pub fn uses_oauth(provider_id: &str) -> bool {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical)
        .map(|m| m.uses_oauth)
        .unwrap_or(false)
}

/// Get the default endpoint for a provider (if any).
pub fn get_default_endpoint(provider_id: &str) -> Option<&'static str> {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical).and_then(|m| m.default_endpoint)
}

/// Get the NPM package for a provider (if known).
pub fn get_npm_package(provider_id: &str) -> Option<&'static str> {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical).and_then(|m| m.npm_package)
}

/// Get the API base URL for a provider (if known).
pub fn get_api_base_url(provider_id: &str) -> Option<&'static str> {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical).and_then(|m| m.api_base_url)
}

/// Get the authentication type for a provider (if known).
pub fn get_auth_type(provider_id: &str) -> Option<&'static str> {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical).and_then(|m| m.auth_type)
}

/// Check if a provider supports dynamic model fetching.
pub fn supports_model_fetch(provider_id: &str) -> bool {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical)
        .map(|m| m.supports_model_fetch)
        .unwrap_or(false)
}

/// Get the known option keys for a provider.
pub fn get_known_options(provider_id: &str) -> &'static [&'static str] {
    let canonical = normalize_provider_id(provider_id);

    get_provider_metadata(&canonical)
        .map(|m| m.known_options)
        .unwrap_or(&[])
}

/// Get all canonical provider IDs.
pub fn get_all_canonical_ids() -> Vec<&'static str> {
    PROVIDER_REGISTRY.iter().map(|p| p.canonical_id).collect()
}

/// Get all provider IDs including aliases (for discovery).
pub fn get_all_provider_ids() -> Vec<String> {
    let mut ids = Vec::new();

    for provider in PROVIDER_REGISTRY {
        ids.push(provider.canonical_id.to_string());
        for alias in provider.aliases {
            ids.push(alias.to_string());
        }
    }

    ids
}

/// Get providers by category.
pub fn get_providers_by_category(category: ProviderCategory) -> Vec<&'static ProviderMetadata> {
    PROVIDER_REGISTRY
        .iter()
        .filter(|p| p.category == category)
        .collect()
}

/// Get all provider categories with their display names.
pub fn get_all_categories() -> Vec<(ProviderCategory, &'static str)> {
    use ProviderCategory::*;
    vec![
        (Major, Major.display_name()),
        (Cloud, Cloud.display_name()),
        (OpenSourceHost, OpenSourceHost.display_name()),
        (Local, Local.display_name()),
        (Router, Router.display_name()),
        (Enterprise, Enterprise.display_name()),
        (Specialized, Specialized.display_name()),
        (Gateway, Gateway.display_name()),
    ]
}

/// Validate a provider option key.
pub fn is_valid_provider_option(provider_id: &str, option_key: &str) -> bool {
    let known = get_known_options(provider_id);

    // Empty known options means all options are valid (no validation)
    if known.is_empty() {
        return true;
    }

    known.contains(&option_key)
}

// ---------------------------------------------------------------------------
// Integration with unified auth framework (Wave 2)
// ---------------------------------------------------------------------------

/// Get auth capabilities for a provider from the registry.
///
/// This bridges the static provider registry with the dynamic auth capabilities
/// system, providing Kilo-compatible provider auth metadata.
pub fn get_provider_auth_capabilities(
    provider_id: &str,
) -> Option<crate::auth::provider_auth::ProviderAuthCapabilities> {
    let metadata = get_provider_metadata(provider_id)?;

    // Determine auth method from metadata
    let methods = if metadata.uses_oauth {
        vec![crate::auth::provider_auth::oauth_method(
            format!("Sign in with {}", metadata.display_name),
            true,
        )]
    } else if metadata.requires_api_key && !metadata.is_local {
        vec![crate::auth::provider_auth::api_key_method(format!(
            "Enter {} API Key",
            metadata.display_name
        ))]
    } else if metadata.is_local {
        // Local providers don't need auth methods
        vec![]
    } else {
        vec![crate::auth::provider_auth::api_key_method(format!(
            "Enter {} API Key",
            metadata.display_name
        ))]
    };

    // Build config options from known_options
    let config_options = if metadata.known_options.is_empty() {
        None
    } else {
        Some(
            metadata
                .known_options
                .iter()
                .map(|opt| crate::auth::provider_auth::ConfigOption {
                    key: opt.to_string(),
                    label: opt.to_string(),
                    option_type: "string".to_string(),
                    required: false,
                    default: None,
                    enum_values: None,
                    help: None,
                })
                .collect(),
        )
    };

    // Check authentication status
    let is_authenticated = if metadata.is_local {
        true
    } else {
        check_provider_auth_status(provider_id)
    };

    // Determine auth source
    let auth_source = if is_authenticated {
        determine_auth_source(provider_id)
    } else {
        None
    };

    Some(crate::auth::provider_auth::ProviderAuthCapabilities {
        provider_id: metadata.canonical_id.to_string(),
        display_name: metadata.display_name.to_string(),
        methods,
        auth_required: !metadata.is_local && (metadata.requires_api_key || metadata.uses_oauth),
        is_authenticated,
        auth_source,
        config_options,
        category: Some(format!("{:?}", metadata.category).to_lowercase()),
    })
}

/// Check if a provider is currently authenticated.
fn check_provider_auth_status(provider_id: &str) -> bool {
    let normalized = normalize_provider_id(provider_id);

    // Check env vars
    if let Some(metadata) = get_provider_metadata(&normalized) {
        for var in metadata.env_vars {
            if std::env::var(var).is_ok() {
                return true;
            }
        }
    }

    // Check auth store
    if crate::auth::store::get_auth(&normalized).is_some() {
        return true;
    }

    // Special cases
    match normalized.as_str() {
        "copilot" => crate::auth::github_device::has_token(),
        "gitlab" => crate::auth::gitlab::is_authed(),
        _ => false,
    }
}

/// Determine the auth source for a provider.
fn determine_auth_source(provider_id: &str) -> Option<String> {
    let normalized = normalize_provider_id(provider_id);

    // Check env first
    if let Some(metadata) = get_provider_metadata(&normalized) {
        for var in metadata.env_vars {
            if std::env::var(var).is_ok() {
                return Some("env".to_string());
            }
        }
    }

    // Check auth store
    if crate::auth::store::get_auth(&normalized).is_some() {
        return Some("auth_store".to_string());
    }

    // Special cases
    match normalized.as_str() {
        "copilot" => {
            if crate::auth::github_device::has_token() {
                Some("oauth".to_string())
            } else {
                None
            }
        }
        "gitlab" => {
            if crate::auth::gitlab::is_authed() {
                Some("oauth".to_string())
            } else {
                None
            }
        }
        _ => None,
    }
}

/// Get all providers with their auth capabilities.
pub fn get_all_provider_auth_capabilities(
) -> Vec<crate::auth::provider_auth::ProviderAuthCapabilities> {
    PROVIDER_REGISTRY
        .iter()
        .filter_map(|p| get_provider_auth_capabilities(p.canonical_id))
        .collect()
}

/// Check if a provider supports OAuth based on registry metadata.
pub fn provider_supports_oauth(provider_id: &str) -> bool {
    get_provider_metadata(provider_id)
        .map(|p| p.uses_oauth)
        .unwrap_or(false)
}

/// Check if a provider requires authentication.
pub fn provider_requires_auth(provider_id: &str) -> bool {
    get_provider_metadata(provider_id)
        .map(|p| !p.is_local && (p.requires_api_key || p.uses_oauth))
        .unwrap_or(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_canonical_ids() {
        assert_eq!(normalize_provider_id("openai"), "openai");
        assert_eq!(normalize_provider_id("anthropic"), "anthropic");
        assert_eq!(normalize_provider_id("copilot"), "copilot");
    }

    #[test]
    fn test_normalize_aliases() {
        // Fireworks
        assert_eq!(normalize_provider_id("fireworks"), "fireworks-ai");
        assert_eq!(normalize_provider_id("fireworks-ai"), "fireworks-ai");

        // Together
        assert_eq!(normalize_provider_id("together"), "togetherai");
        assert_eq!(normalize_provider_id("togetherai"), "togetherai");

        // Copilot
        assert_eq!(normalize_provider_id("github-copilot"), "copilot");
        assert_eq!(normalize_provider_id("copilot"), "copilot");

        // Azure
        assert_eq!(normalize_provider_id("azure-openai"), "azure");
        assert_eq!(normalize_provider_id("azure_openai"), "azure");
        assert_eq!(normalize_provider_id("azure"), "azure");

        // Bedrock
        assert_eq!(normalize_provider_id("bedrock"), "amazon-bedrock");
        assert_eq!(normalize_provider_id("amazon-bedrock"), "amazon-bedrock");

        // OpenRouter
        assert_eq!(normalize_provider_id("openrouter"), "openrouter");
        assert_eq!(normalize_provider_id("openai-compat"), "openrouter");
        assert_eq!(normalize_provider_id("compat"), "openrouter");

        // OpenAI Codex (now a distinct provider, not an alias)
        assert_eq!(normalize_provider_id("openai-codex"), "openai-codex");
    }

    #[test]
    fn test_normalize_new_providers() {
        // Kilo
        assert_eq!(normalize_provider_id("kilo"), "kilo");
        assert_eq!(normalize_provider_id("kilo-gateway"), "kilo");
        assert_eq!(normalize_provider_id("kilocode"), "kilo");

        // GitHub Copilot Enterprise
        assert_eq!(
            normalize_provider_id("github-copilot-enterprise"),
            "github-copilot-enterprise"
        );

        // Google Vertex
        assert_eq!(normalize_provider_id("google-vertex"), "google-vertex");
        assert_eq!(normalize_provider_id("vertex"), "google-vertex");
        assert_eq!(normalize_provider_id("vertex-ai"), "google-vertex");

        // Google Vertex Anthropic
        assert_eq!(
            normalize_provider_id("google-vertex-anthropic"),
            "google-vertex-anthropic"
        );
        assert_eq!(
            normalize_provider_id("vertex-anthropic"),
            "google-vertex-anthropic"
        );

        // SAP AI Core
        assert_eq!(normalize_provider_id("sap"), "sap-ai-core");
        assert_eq!(normalize_provider_id("sap-aicore"), "sap-ai-core");

        // Cloudflare
        assert_eq!(normalize_provider_id("cloudflare"), "cloudflare-workers-ai");
        assert_eq!(normalize_provider_id("workers-ai"), "cloudflare-workers-ai");
    }

    #[test]
    fn test_normalize_case_insensitive() {
        assert_eq!(normalize_provider_id("OPENAI"), "openai");
        assert_eq!(normalize_provider_id("OpenAI"), "openai");
        assert_eq!(normalize_provider_id("GitHub-Copilot"), "copilot");
        assert_eq!(normalize_provider_id("FIREWORKS"), "fireworks-ai");
        assert_eq!(normalize_provider_id("KILO"), "kilo");
        assert_eq!(normalize_provider_id("GOOGLE-VERTEX"), "google-vertex");
    }

    #[test]
    fn test_get_provider_metadata() {
        let meta = get_provider_metadata("openai").unwrap();
        assert_eq!(meta.canonical_id, "openai");
        assert_eq!(meta.display_name, "OpenAI");
        assert!(meta.requires_api_key);
        assert!(!meta.is_local);
        assert_eq!(meta.npm_package, Some("@ai-sdk/openai"));
        assert_eq!(meta.api_base_url, Some("https://api.openai.com/v1"));
        assert!(meta.supports_model_fetch);

        // Via alias
        let meta = get_provider_metadata("fireworks").unwrap();
        assert_eq!(meta.canonical_id, "fireworks-ai");
        assert_eq!(meta.display_name, "Fireworks AI");

        // Kilo
        let meta = get_provider_metadata("kilo").unwrap();
        assert_eq!(meta.canonical_id, "kilo");
        assert_eq!(meta.display_name, "Kilo Gateway");
        assert_eq!(meta.category, ProviderCategory::Gateway);
        assert_eq!(meta.npm_package, Some("@kilocode/kilo-gateway"));

        // GitHub Copilot Enterprise
        let meta = get_provider_metadata("github-copilot-enterprise").unwrap();
        assert_eq!(meta.canonical_id, "github-copilot-enterprise");
        assert_eq!(meta.display_name, "GitHub Copilot Enterprise");
        assert_eq!(meta.category, ProviderCategory::Enterprise);

        // OpenAI Codex (distinct provider with OAuth)
        let meta = get_provider_metadata("openai-codex").unwrap();
        assert_eq!(meta.canonical_id, "openai-codex");
        assert_eq!(meta.display_name, "OpenAI Codex");
        assert!(meta.uses_oauth);
        assert!(!meta.requires_api_key);
        assert_eq!(meta.category, ProviderCategory::Major);
    }

    #[test]
    fn test_get_provider_env_var() {
        assert_eq!(get_provider_env_var("openai"), Some("OPENAI_API_KEY"));
        assert_eq!(get_provider_env_var("anthropic"), Some("ANTHROPIC_API_KEY"));
        assert_eq!(get_provider_env_var("fireworks"), Some("FIREWORKS_API_KEY"));
        assert_eq!(get_provider_env_var("kilo"), Some("KILO_API_KEY"));

        // Unknown provider returns None
        assert_eq!(get_provider_env_var("unknown-provider"), None);
    }

    #[test]
    fn test_get_npm_package() {
        assert_eq!(get_npm_package("openai"), Some("@ai-sdk/openai"));
        assert_eq!(get_npm_package("anthropic"), Some("@ai-sdk/anthropic"));
        assert_eq!(get_npm_package("kilo"), Some("@kilocode/kilo-gateway"));
        assert_eq!(
            get_npm_package("github-copilot-enterprise"),
            Some("@ai-sdk/github-copilot")
        );
    }

    #[test]
    fn test_get_api_base_url() {
        assert_eq!(
            get_api_base_url("openai"),
            Some("https://api.openai.com/v1")
        );
        assert_eq!(
            get_api_base_url("kilo"),
            Some("https://api.kilo.ai/api/openrouter")
        );
        assert_eq!(
            get_api_base_url("ollama"),
            Some("http://localhost:11434/v1")
        );
    }

    #[test]
    fn test_get_auth_type() {
        assert_eq!(get_auth_type("openai"), Some("bearer"));
        assert_eq!(get_auth_type("copilot"), Some("oauth"));
        assert_eq!(get_auth_type("amazon-bedrock"), Some("aws-sigv4"));
        assert_eq!(get_auth_type("google-vertex"), Some("google-auth"));
    }

    #[test]
    fn test_supports_model_fetch() {
        assert!(supports_model_fetch("openai"));
        assert!(supports_model_fetch("anthropic"));
        assert!(supports_model_fetch("kilo"));
        assert!(supports_model_fetch("github-copilot-enterprise"));
        assert!(!supports_model_fetch("lmstudio"));
    }

    #[test]
    fn test_is_local_provider() {
        assert!(is_local_provider("ollama"));
        assert!(is_local_provider("lmstudio"));
        assert!(is_local_provider("vllm"));
        assert!(!is_local_provider("openai"));
        assert!(!is_local_provider("anthropic"));
        assert!(!is_local_provider("kilo"));
    }

    #[test]
    fn test_uses_oauth() {
        assert!(uses_oauth("copilot"));
        assert!(uses_oauth("github-copilot"));
        assert!(uses_oauth("github-copilot-enterprise"));
        assert!(!uses_oauth("openai"));
        assert!(!uses_oauth("anthropic"));
        assert!(!uses_oauth("kilo"));
    }

    #[test]
    fn test_get_default_endpoint() {
        assert_eq!(
            get_default_endpoint("ollama"),
            Some("http://localhost:11434/v1/chat/completions")
        );
        assert_eq!(
            get_default_endpoint("lmstudio"),
            Some("http://localhost:1234/v1/chat/completions")
        );
        assert_eq!(get_default_endpoint("openai"), None);
    }

    #[test]
    fn test_get_all_canonical_ids() {
        let ids = get_all_canonical_ids();
        assert!(ids.contains(&"openai"));
        assert!(ids.contains(&"anthropic"));
        assert!(ids.contains(&"copilot"));
        assert!(ids.contains(&"ollama"));
        assert!(ids.contains(&"kilo"));
        assert!(ids.contains(&"github-copilot-enterprise"));
        assert!(ids.contains(&"google-vertex"));
        assert!(ids.contains(&"google-vertex-anthropic"));
        assert!(!ids.contains(&"fireworks")); // fireworks is an alias, not canonical
        assert!(ids.contains(&"fireworks-ai")); // this is canonical
    }

    #[test]
    fn test_get_providers_by_category() {
        let major = get_providers_by_category(ProviderCategory::Major);
        assert!(major.iter().any(|p| p.canonical_id == "openai"));
        assert!(major.iter().any(|p| p.canonical_id == "anthropic"));
        assert!(major.iter().any(|p| p.canonical_id == "copilot"));

        let gateways = get_providers_by_category(ProviderCategory::Gateway);
        assert!(gateways.iter().any(|p| p.canonical_id == "kilo"));

        let routers = get_providers_by_category(ProviderCategory::Router);
        assert!(routers.iter().any(|p| p.canonical_id == "openrouter"));

        let enterprise = get_providers_by_category(ProviderCategory::Enterprise);
        assert!(enterprise
            .iter()
            .any(|p| p.canonical_id == "github-copilot-enterprise"));
        assert!(enterprise.iter().any(|p| p.canonical_id == "sap-ai-core"));
    }

    #[test]
    fn test_is_valid_provider_option() {
        assert!(is_valid_provider_option("openai", "apiKey"));
        assert!(is_valid_provider_option("openai", "baseURL"));
        assert!(is_valid_provider_option("openai", "timeout"));
        assert!(!is_valid_provider_option("openai", "unknown_option"));

        // Providers with no known_options allow all
        assert!(is_valid_provider_option("discord", "anything"));
    }

    #[test]
    fn test_empty_provider_id() {
        assert_eq!(normalize_provider_id(""), "");
    }

    #[test]
    fn test_known_options_length() {
        // Ensure all providers have reasonable known_options
        for provider in PROVIDER_REGISTRY {
            // known_options should be reasonable in size
            assert!(
                provider.known_options.len() <= 20,
                "{} has too many known_options ({})",
                provider.canonical_id,
                provider.known_options.len()
            );
        }
    }

    // -----------------------------------------------------------------------
    // Wave 1 Kilo-alignment tests for new providers
    // -----------------------------------------------------------------------

    #[test]
    fn test_new_providers_from_wave1() {
        // Azure Cognitive Services
        let meta = get_provider_metadata("azure-cognitive-services").unwrap();
        assert_eq!(meta.canonical_id, "azure-cognitive-services");
        assert_eq!(meta.category, ProviderCategory::Cloud);
        assert!(meta
            .env_vars
            .contains(&"AZURE_COGNITIVE_SERVICES_RESOURCE_NAME"));

        // DeepInfra
        let meta = get_provider_metadata("deepinfra").unwrap();
        assert_eq!(meta.canonical_id, "deepinfra");
        assert_eq!(meta.category, ProviderCategory::OpenSourceHost);
        assert_eq!(meta.npm_package, Some("@ai-sdk/deepinfra"));

        // Apertis
        let meta = get_provider_metadata("apertis").unwrap();
        assert_eq!(meta.canonical_id, "apertis");
        assert_eq!(meta.category, ProviderCategory::Router);
        assert!(meta.env_vars.contains(&"APERTIS_API_KEY"));

        // ZenMux
        let meta = get_provider_metadata("zenmux").unwrap();
        assert_eq!(meta.canonical_id, "zenmux");
        assert_eq!(meta.category, ProviderCategory::Gateway);

        // OpenTalk
        let meta = get_provider_metadata("opentalk").unwrap();
        assert_eq!(meta.canonical_id, "opentalk");
        assert_eq!(meta.category, ProviderCategory::OpenSourceHost);

        // OpenCode
        let meta = get_provider_metadata("opencode").unwrap();
        assert_eq!(meta.canonical_id, "opencode");
        assert_eq!(meta.category, ProviderCategory::OpenSourceHost);

        // Kimi (Moonshot)
        let meta = get_provider_metadata("kimi").unwrap();
        assert_eq!(meta.canonical_id, "kimi");
        assert_eq!(meta.category, ProviderCategory::OpenSourceHost);
        assert!(meta.env_vars.contains(&"KIMI_API_KEY"));
        assert!(meta.env_vars.contains(&"MOONSHOT_API_KEY"));

        // Hunyuan
        let meta = get_provider_metadata("hunyuan").unwrap();
        assert_eq!(meta.canonical_id, "hunyuan");
        assert_eq!(meta.category, ProviderCategory::OpenSourceHost);
    }

    #[test]
    fn test_new_provider_aliases() {
        // Cloudflare aliases
        assert_eq!(normalize_provider_id("cloudflare"), "cloudflare-workers-ai");
        assert_eq!(normalize_provider_id("workers-ai"), "cloudflare-workers-ai");

        // Vercel
        assert_eq!(normalize_provider_id("vercel"), "vercel");

        // Perplexity
        assert_eq!(normalize_provider_id("perplexity"), "perplexity");

        // Kimi
        assert_eq!(normalize_provider_id("kimi"), "kimi");

        // Hunyuan
        assert_eq!(normalize_provider_id("hunyuan"), "hunyuan");

        // ZenMux
        assert_eq!(normalize_provider_id("zenmux"), "zenmux");
    }

    #[test]
    fn test_provider_env_vars_count() {
        // Ensure all providers have at least one env var (except local providers)
        for provider in PROVIDER_REGISTRY {
            if !provider.is_local && !provider.uses_oauth {
                assert!(
                    !provider.env_vars.is_empty(),
                    "{} should have at least one env var",
                    provider.canonical_id
                );
            }
        }
    }

    #[test]
    fn test_all_providers_have_unique_canonical_ids() {
        let mut ids = std::collections::HashSet::new();
        for provider in PROVIDER_REGISTRY {
            assert!(
                ids.insert(provider.canonical_id),
                "Duplicate canonical_id: {}",
                provider.canonical_id
            );
        }
    }

    #[test]
    fn test_all_providers_have_unique_aliases() {
        // Aliases should not conflict with each other or canonical IDs
        let mut all_ids: std::collections::HashSet<&str> = std::collections::HashSet::new();

        for provider in PROVIDER_REGISTRY {
            // Check canonical ID
            assert!(
                all_ids.insert(provider.canonical_id),
                "Duplicate ID (canonical): {}",
                provider.canonical_id
            );

            // Check aliases
            for alias in provider.aliases {
                assert!(
                    all_ids.insert(alias),
                    "Duplicate ID (alias): {} for provider {}",
                    alias,
                    provider.canonical_id
                );
            }
        }
    }

    #[test]
    fn test_total_provider_count() {
        // After Wave 1, we should have a comprehensive provider registry
        assert!(
            PROVIDER_REGISTRY.len() >= 35,
            "Expected at least 35 providers after Wave 1, got {}",
            PROVIDER_REGISTRY.len()
        );
    }
}
