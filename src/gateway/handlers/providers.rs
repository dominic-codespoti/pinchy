use std::time::Instant;

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use tokio::sync::Mutex;
use tracing::{debug, error, info, warn};

use super::super::types::*;
use super::super::AppState;

/// In-flight device flow state shared between start and poll handlers.
/// Uses tokio::sync::Mutex for async compatibility and poison-safety.
static DEVICE_FLOW: Mutex<Option<DeviceFlowState>> = Mutex::const_new(None);

struct DeviceFlowState {
    device_code: String,
    client_id: String,
    interval: u64,
    started_at: Instant,
    status: DeviceFlowStatus,
}

#[allow(dead_code)]
enum DeviceFlowStatus {
    Waiting,
    Complete(String), // github_token - stored but not exposed in API
    Failed(String),   // error message
}

/// Timeout for device flow (10 minutes).
const DEVICE_FLOW_TIMEOUT_SECS: u64 = 600;

/// Maximum number of concurrent device flows to prevent memory leaks.
/// If a flow is older than this, it will be cleaned up on the next poll.
const MAX_FLOW_AGE_SECS: u64 = 600; // 10 minutes

#[derive(Debug, serde::Serialize)]
pub struct ProviderStatus {
    pub provider: String,
    pub name: String, // NEW: display name from models.dev
    pub configured: bool,
    pub has_api_key: bool,
    pub env_var: Option<String>,
    pub env_vars: Vec<String>, // NEW: all env vars from models.dev
    pub details: Option<String>,
    pub source: Option<String>,
    pub api: Option<String>, // NEW: API base URL from models.dev
    pub model_count: usize,  // NEW: number of models available
}

#[derive(Debug, serde::Deserialize)]
pub struct SaveApiKeyRequest {
    pub api_key: String,
}

/// Return the primary environment variable name for a provider.
/// First checks the models.dev registry, then falls back to hardcoded map.
#[allow(dead_code)]
async fn env_var_for_provider(provider: &str) -> Option<String> {
    // First try to get from models.dev registry
    if let Ok(registry) = crate::models_dev::get_or_load_registry().await {
        if let Some(p) = registry.provider(provider) {
            if !p.env.is_empty() {
                return Some(p.env[0].clone());
            }
        }
    }

    // Fall back to hardcoded map
    env_var_for_provider_sync(provider)
}

/// Check env var(s) for a provider and return `true` if any are set.
/// Uses models.dev registry if available, otherwise falls back to hardcoded.
async fn check_env_for_provider(
    provider: &str,
    env_vars: Option<&[String]>,
) -> (bool, Option<String>) {
    // If env_vars provided (from models.dev), check those first
    if let Some(vars) = env_vars {
        // Special handling for certain providers
        match provider {
            "anthropic" => {
                if std::env::var("ANTHROPIC_API_KEY").is_ok() {
                    return (true, Some("ANTHROPIC_API_KEY".to_string()));
                } else if std::env::var("CLAUDE_CODE_OAUTH_TOKEN").is_ok() {
                    return (true, Some("CLAUDE_CODE_OAUTH_TOKEN".to_string()));
                }
                // Also check the provided env vars
                for var in vars {
                    if std::env::var(var).is_ok() {
                        return (true, Some(var.clone()));
                    }
                }
                return (false, None);
            }
            "copilot" => {
                if std::env::var("COPILOT_TOKEN").is_ok() {
                    return (true, Some("COPILOT_TOKEN".to_string()));
                } else if crate::auth::github_device::retrieve_token()
                    .ok()
                    .flatten()
                    .is_some()
                {
                    return (true, Some("keyring (device flow)".to_string()));
                }
                // Also check the provided env vars
                for var in vars {
                    if std::env::var(var).is_ok() {
                        return (true, Some(var.clone()));
                    }
                }
                return (false, None);
            }
            "bedrock" => {
                let has_bearer = std::env::var("AWS_BEARER_TOKEN_BEDROCK").is_ok();
                let has_creds = std::env::var("AWS_ACCESS_KEY_ID").is_ok()
                    && std::env::var("AWS_SECRET_ACCESS_KEY").is_ok();
                if has_bearer {
                    return (true, Some("AWS_BEARER_TOKEN_BEDROCK".to_string()));
                } else if has_creds {
                    return (
                        true,
                        Some("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY".to_string()),
                    );
                }
                // Also check the provided env vars
                for var in vars {
                    if std::env::var(var).is_ok() {
                        return (true, Some(var.clone()));
                    }
                }
                return (false, None);
            }
            _ => {
                // Check the provided env vars
                for var in vars {
                    if std::env::var(var).is_ok() {
                        return (true, Some(var.clone()));
                    }
                }
                return (false, None);
            }
        }
    }

    // Fall back to hardcoded logic
    match provider {
        "anthropic" => {
            if std::env::var("ANTHROPIC_API_KEY").is_ok() {
                (true, Some("ANTHROPIC_API_KEY".to_string()))
            } else if std::env::var("CLAUDE_CODE_OAUTH_TOKEN").is_ok() {
                (true, Some("CLAUDE_CODE_OAUTH_TOKEN".to_string()))
            } else {
                (false, None)
            }
        }
        "copilot" => {
            if std::env::var("COPILOT_TOKEN").is_ok() {
                (true, Some("COPILOT_TOKEN".to_string()))
            } else if crate::auth::github_device::retrieve_token()
                .ok()
                .flatten()
                .is_some()
            {
                (true, Some("keyring (device flow)".to_string()))
            } else {
                (false, None)
            }
        }
        "bedrock" => {
            let has_bearer = std::env::var("AWS_BEARER_TOKEN_BEDROCK").is_ok();
            let has_creds = std::env::var("AWS_ACCESS_KEY_ID").is_ok()
                && std::env::var("AWS_SECRET_ACCESS_KEY").is_ok();
            if has_bearer {
                (true, Some("AWS_BEARER_TOKEN_BEDROCK".to_string()))
            } else if has_creds {
                (
                    true,
                    Some("AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY".to_string()),
                )
            } else {
                (false, None)
            }
        }
        other => {
            if let Some(var) = env_var_for_provider_sync(other) {
                let ok = std::env::var(&var).is_ok();
                (ok, if ok { Some(var) } else { None })
            } else {
                (false, None)
            }
        }
    }
}

/// Synchronous version for fallback when we can't use async
fn env_var_for_provider_sync(provider: &str) -> Option<String> {
    match provider {
        "openai" => Some("OPENAI_API_KEY".to_string()),
        "anthropic" => Some("ANTHROPIC_API_KEY".to_string()),
        "copilot" => Some("COPILOT_TOKEN".to_string()),
        "azure-openai" => Some("AZURE_OPENAI_API_KEY".to_string()),
        "bedrock" => Some("AWS_BEARER_TOKEN_BEDROCK".to_string()),
        "gitlab" => Some("GITLAB_TOKEN".to_string()),
        "discord" => Some("DISCORD_TOKEN".to_string()),
        "google" => Some("GOOGLE_API_KEY".to_string()),
        "xai" => Some("XAI_API_KEY".to_string()),
        "groq" => Some("GROQ_API_KEY".to_string()),
        "together" => Some("TOGETHER_API_KEY".to_string()),
        "mistral" => Some("MISTRAL_API_KEY".to_string()),
        "cohere" => Some("COHERE_API_KEY".to_string()),
        "cerebras" => Some("CEREBRAS_API_KEY".to_string()),
        "fireworks" => Some("FIREWORKS_API_KEY".to_string()),
        "deepseek" => Some("DEEPSEEK_API_KEY".to_string()),
        "openrouter" => Some("OPENROUTER_API_KEY".to_string()),
        _ => None,
    }
}

/// Check if a provider is configured.
///
/// Priority order:
/// 1. Environment variable
/// 2. Auth store (`~/.local/share/pinchy/auth.json`)
/// 3. Config file `models[].api_key`
async fn check_provider_config(
    provider: &str,
    config_models: &[crate::config::ModelConfig],
    registry: Option<&crate::models_dev::ModelsDevRegistry>,
) -> ProviderStatus {
    // Get provider metadata from models.dev if available (with alias fallback for openai-codex -> openai)
    let registry_provider = registry.and_then(|r| r.provider_with_alias(provider));
    let env_vars = registry_provider.map(|p| p.env.as_slice()).unwrap_or(&[]);
    let display_name = registry_provider
        .map(|p| p.name.clone())
        .unwrap_or_else(|| provider.to_string());
    let api_url = registry_provider.and_then(|p| p.api.clone());
    let model_count = registry_provider.map(|p| p.models.len()).unwrap_or(0);

    let env_var_name = env_var_for_provider_sync(provider);
    let normalized = crate::models::providers::normalize_provider_id(provider);

    // Check if provider is persistently disabled (survives restarts)
    let is_disabled = crate::auth::store::is_provider_disabled(&normalized)
        || crate::auth::store::is_provider_disabled(provider);

    // 1. Check environment variables
    let (env_ok, env_detail) = check_env_for_provider(provider, Some(env_vars)).await;
    if env_ok {
        let details = match provider {
            "copilot" => env_detail.map(|d| format!("via {d}")),
            _ => None,
        };
        return ProviderStatus {
            provider: provider.to_string(),
            name: display_name,
            configured: !is_disabled,
            has_api_key: provider != "copilot" && provider != "gitlab",
            env_var: env_var_name,
            env_vars: env_vars.to_vec(),
            details,
            source: if is_disabled {
                None
            } else {
                Some("env".to_string())
            },
            api: api_url,
            model_count,
        };
    }

    // 2. Check auth store
    if let Some(entry) = crate::auth::store::get_auth(provider) {
        let has_key = entry
            .api_key
            .as_ref()
            .map(|k| !k.is_empty())
            .unwrap_or(false);
        let has_token = entry
            .access_token
            .as_ref()
            .map(|t| !t.is_empty())
            .unwrap_or(false);
        if has_key || has_token {
            return ProviderStatus {
                provider: provider.to_string(),
                name: display_name,
                configured: !is_disabled,
                has_api_key: has_key,
                env_var: env_var_name,
                env_vars: env_vars.to_vec(),
                details: Some("via auth store".to_string()),
                source: if is_disabled {
                    None
                } else {
                    Some("auth_store".to_string())
                },
                api: api_url,
                model_count,
            };
        }
    }

    // 3. Check config.yaml models
    let config_has_key = config_models.iter().any(|m| {
        m.provider == provider
            && m.api_key
                .as_ref()
                .map(|k| !k.is_empty() && !k.starts_with('$'))
                .unwrap_or(false)
    });
    if config_has_key {
        return ProviderStatus {
            provider: provider.to_string(),
            name: display_name,
            configured: !is_disabled,
            has_api_key: true,
            env_var: env_var_name,
            env_vars: env_vars.to_vec(),
            details: Some("via config.yaml".to_string()),
            source: if is_disabled {
                None
            } else {
                Some("config".to_string())
            },
            api: api_url,
            model_count,
        };
    }

    // Copilot special case: suggest device flow
    let details = match provider {
        "copilot" => Some("run `pinchy copilot login` to authenticate".to_string()),
        _ => None,
    };

    ProviderStatus {
        provider: provider.to_string(),
        name: display_name,
        configured: false,
        has_api_key: false,
        env_var: env_var_name,
        env_vars: env_vars.to_vec(),
        details,
        source: None,
        api: api_url,
        model_count,
    }
}

/// `GET /api/providers/status` — return authentication status for all providers.
pub(crate) async fn api_providers_status(State(state): State<AppState>) -> impl IntoResponse {
    let cfg = match crate::config::Config::load(&state.config_path).await {
        Ok(c) => c,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "failed to load config".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    let mut providers = Vec::new();

    // Try to load models.dev registry for provider metadata
    let registry = match crate::models_dev::get_or_load_registry().await {
        Ok(r) => {
            tracing::info!(
                provider_count = r.providers().len(),
                "loaded models.dev registry for provider status"
            );
            Some(r)
        }
        Err(e) => {
            tracing::warn!(error = %e, "failed to load models.dev registry, using hardcoded providers");
            None
        }
    };

    // Check configured model providers from registry
    if let Some(ref r) = registry {
        for provider in r.providers() {
            providers.push(check_provider_config(&provider.id, &cfg.models, Some(r)).await);
        }
    }

    // Check configured model providers that might not be in registry
    for model in &cfg.models {
        if !providers.iter().any(|p| p.provider == model.provider) {
            providers
                .push(check_provider_config(&model.provider, &cfg.models, registry.as_ref()).await);
        }
    }

    // Also check common providers even if not in config (for setup guidance)
    // Use hardcoded list as fallback when registry isn't available
    let common_providers = [
        "openai",
        "anthropic",
        "copilot",
        "azure-openai",
        "bedrock",
        "google",
        "xai",
        "groq",
        "together",
        "mistral",
        "cohere",
        "cerebras",
        "fireworks",
        "deepseek",
        "openrouter",
        "ollama",
        "lmstudio",
        "vllm",
    ];
    for provider in common_providers {
        if !providers.iter().any(|p| p.provider == provider) {
            providers.push(check_provider_config(provider, &cfg.models, registry.as_ref()).await);
        }
    }

    // Map internal ProviderStatus to ProviderStatusItem for the response
    let provider_items: Vec<ProviderStatusItem> = providers
        .into_iter()
        .map(|p| ProviderStatusItem {
            provider: p.provider,
            name: p.name,
            configured: p.configured,
            has_api_key: p.has_api_key,
            env_var: p.env_var,
            env_vars: p.env_vars,
            details: p.details,
            source: p.source,
            api: p.api,
            model_count: p.model_count,
        })
        .collect();

    (
        StatusCode::OK,
        Json(ProviderStatusListResponse {
            providers: provider_items,
        }),
    )
        .into_response()
}

/// Response format for provider test result.
#[derive(Debug, serde::Serialize)]
pub struct ProviderTestResponse {
    pub success: bool,
    pub message: String,
    pub latency_ms: u64,
}

/// `POST /api/providers/:provider/test`
///
/// Tests the connection to a provider by attempting to list models.
/// Returns success status, message, and latency.
pub(crate) async fn api_provider_test(
    State(state): State<AppState>,
    Path(provider): Path<String>,
) -> impl IntoResponse {
    let start = std::time::Instant::now();

    // Load config to find provider settings.
    let cfg = match crate::config::Config::load(&state.config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ProviderTestResponse {
                    success: false,
                    message: format!("Failed to load config: {e}"),
                    latency_ms: 0,
                }),
            )
                .into_response();
        }
    };

    // Find the provider in config or use defaults for auth-only providers.
    let model_cfg = cfg.models.iter().find(|m| m.provider == provider);

    // Build the provider.
    let provider_instance: Box<dyn crate::models::ModelProvider> = match model_cfg {
        Some(m) => {
            let model_id = m.model.as_deref().unwrap_or(&m.provider);
            crate::models::build_provider_with_config_fields(
                &m.provider,
                model_id,
                m.endpoint.as_deref(),
                m.api_version.as_deref(),
                m.embedding_deployment.as_deref(),
                m.api_key.as_deref(),
                m.headers.as_ref(),
                None,
                None,
            )
        }
        None => {
            // Provider not in config - try to build from env/auth for known providers.
            match provider.as_str() {
                "copilot" => Box::new(crate::models::CopilotProvider::new()),
                "openai" => {
                    if std::env::var("OPENAI_API_KEY").is_ok() {
                        Box::new(crate::models::OpenAIProvider::new())
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message: "OpenAI provider not configured (OPENAI_API_KEY not set)"
                                    .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "anthropic" => {
                    if std::env::var("ANTHROPIC_API_KEY").is_ok()
                        || std::env::var("CLAUDE_CODE_OAUTH_TOKEN").is_ok()
                    {
                        Box::new(crate::models::AnthropicProvider::new())
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message: "Anthropic provider not configured (no API key found)"
                                    .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "azure-openai" | "azure_openai" => {
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(ProviderTestResponse {
                            success: false,
                            message: "Azure OpenAI requires endpoint configuration. Please add it to config.yaml.".to_string(),
                            latency_ms: 0,
                        }),
                    )
                        .into_response();
                }
                "google" => {
                    let key = crate::models::resolve_config_key(None, "google");
                    if !key.is_empty() {
                        Box::new(crate::models::GoogleProvider::with_config(
                            key,
                            crate::models::google::DEFAULT_BASE_URL.to_string(),
                            "gemini-2.0-flash".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message: "Google provider not configured (GOOGLE_API_KEY not set)"
                                    .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "xai" => {
                    let key = crate::models::resolve_config_key(None, "xai");
                    if !key.is_empty() {
                        Box::new(crate::models::XaiProvider::with_config(
                            key,
                            "grok-3".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message: "xAI provider not configured (XAI_API_KEY not set)"
                                    .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "groq" => {
                    let key = crate::models::resolve_config_key(None, "groq");
                    if !key.is_empty() {
                        Box::new(crate::models::GroqProvider::with_config(
                            key,
                            "llama-3.3-70b-versatile".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message: "Groq provider not configured (GROQ_API_KEY not set)"
                                    .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "together" => {
                    let key = crate::models::resolve_config_key(None, "together");
                    if !key.is_empty() {
                        Box::new(crate::models::TogetherProvider::new(
                            key,
                            "meta-llama/Llama-3.3-70B-Instruct-Turbo".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message:
                                    "Together provider not configured (TOGETHER_API_KEY not set)"
                                        .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "mistral" => {
                    let key = crate::models::resolve_config_key(None, "mistral");
                    if !key.is_empty() {
                        Box::new(crate::models::MistralProvider::new(
                            key,
                            "mistral-large-latest".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message:
                                    "Mistral provider not configured (MISTRAL_API_KEY not set)"
                                        .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "cohere" => {
                    let key = crate::models::resolve_config_key(None, "cohere");
                    if !key.is_empty() {
                        Box::new(crate::models::CohereProvider::with_config(
                            key,
                            crate::models::cohere::DEFAULT_ENDPOINT.to_string(),
                            "command-r-plus".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message: "Cohere provider not configured (COHERE_API_KEY not set)"
                                    .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "cerebras" => {
                    let key = crate::models::resolve_config_key(None, "cerebras");
                    if !key.is_empty() {
                        Box::new(crate::models::CerebrasProvider::with_config(
                            key,
                            crate::models::cerebras::DEFAULT_ENDPOINT.to_string(),
                            "llama-3.3-70b".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message:
                                    "Cerebras provider not configured (CEREBRAS_API_KEY not set)"
                                        .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "fireworks" => {
                    let key = crate::models::resolve_config_key(None, "fireworks");
                    if !key.is_empty() {
                        Box::new(crate::models::OpenAICompatProvider::new(
                            "https://api.fireworks.ai/inference/v1/chat/completions".to_string(),
                            key,
                            "accounts/fireworks/models/llama-v3p1-70b-instruct".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message:
                                    "Fireworks provider not configured (FIREWORKS_API_KEY not set)"
                                        .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "deepseek" => {
                    let key = crate::models::resolve_config_key(None, "deepseek");
                    if !key.is_empty() {
                        Box::new(crate::models::OpenAICompatProvider::new(
                            "https://api.deepseek.com/v1/chat/completions".to_string(),
                            key,
                            "deepseek-chat".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message:
                                    "DeepSeek provider not configured (DEEPSEEK_API_KEY not set)"
                                        .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "openrouter" => {
                    let key = crate::models::resolve_config_key(None, "openrouter");
                    if !key.is_empty() {
                        Box::new(crate::models::OpenAICompatProvider::new(
                            "https://openrouter.ai/api/v1/chat/completions".to_string(),
                            key,
                            "anthropic/claude-3.5-sonnet".to_string(),
                        ))
                    } else {
                        return (
                            StatusCode::BAD_REQUEST,
                            Json(ProviderTestResponse {
                                success: false,
                                message: "OpenRouter provider not configured (OPENROUTER_API_KEY not set)"
                                    .to_string(),
                                latency_ms: 0,
                            }),
                        )
                            .into_response();
                    }
                }
                "ollama" => {
                    // Local provider - no API key needed, just try to connect
                    Box::new(crate::models::OpenAICompatProvider::new(
                        "http://localhost:11434/v1/chat/completions".to_string(),
                        String::new(),
                        "llama3.2".to_string(),
                    ))
                }
                "lmstudio" => {
                    // Local provider - no API key needed, just try to connect
                    Box::new(crate::models::OpenAICompatProvider::new(
                        "http://localhost:1234/v1/chat/completions".to_string(),
                        String::new(),
                        "local-model".to_string(),
                    ))
                }
                "vllm" => {
                    // Local provider - no API key needed, just try to connect
                    Box::new(crate::models::OpenAICompatProvider::new(
                        "http://localhost:8000/v1/chat/completions".to_string(),
                        String::new(),
                        "local-model".to_string(),
                    ))
                }
                _ => {
                    return (
                        StatusCode::NOT_FOUND,
                        Json(ProviderTestResponse {
                            success: false,
                            message: format!("Provider '{provider}' not found in config"),
                            latency_ms: 0,
                        }),
                    )
                        .into_response();
                }
            }
        }
    };

    // Try to list models with a timeout of 10 seconds.
    let timeout_duration = std::time::Duration::from_secs(10);
    let test_result = tokio::time::timeout(timeout_duration, provider_instance.list_models()).await;

    let latency_ms = start.elapsed().as_millis() as u64;

    match test_result {
        Ok(Ok(Some(_))) => (
            StatusCode::OK,
            Json(ProviderTestResponse {
                success: true,
                message: "Connection successful - models retrieved".to_string(),
                latency_ms,
            }),
        )
            .into_response(),
        Ok(Ok(None)) => (
            StatusCode::OK,
            Json(ProviderTestResponse {
                success: true,
                message: "Connection successful - provider does not support model listing"
                    .to_string(),
                latency_ms,
            }),
        )
            .into_response(),
        Ok(Err(e)) => {
            let msg = format!("Connection failed: {e}");
            (
                StatusCode::OK,
                Json(ProviderTestResponse {
                    success: false,
                    message: msg,
                    latency_ms,
                }),
            )
                .into_response()
        }
        Err(_) => (
            StatusCode::GATEWAY_TIMEOUT,
            Json(ProviderTestResponse {
                success: false,
                message: "Connection timed out (10s)".to_string(),
                latency_ms: 10000,
            }),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// GitHub Copilot device-flow auth endpoints
// ---------------------------------------------------------------------------

/// `POST /api/auth/copilot/start` — initiate GitHub device-flow login.
///
/// Returns the verification URI, user code, and interval for the user to
/// authorize the app. The frontend should open the URI and display the code.
pub(crate) async fn api_auth_copilot_start() -> impl IntoResponse {
    let client_id = crate::auth::github_device::DEFAULT_CLIENT_ID.to_string();
    let http = reqwest::Client::new();

    info!(client_id = %client_id, "Starting GitHub device flow");

    // Request a device code from GitHub.
    let resp = match http
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id.as_str()), ("scope", "read:user")])
        .send()
        .await
    {
        Ok(r) => {
            debug!(status = %r.status(), "GitHub device code endpoint responded");
            r
        }
        Err(e) => {
            error!(error = %e, "GitHub device code request failed");
            return (
                StatusCode::BAD_GATEWAY,
                Json(DeviceFlowStartResponse {
                    device_code: String::new(),
                    user_code: String::new(),
                    verification_uri: String::new(),
                    interval: 0,
                    expires_in: None,
                }),
            );
        }
    };

    let status = resp.status();
    let body: serde_json::Value = match resp.json().await {
        Ok(b) => b,
        Err(e) => {
            error!(error = %e, status = %status, "Failed to parse GitHub device code response");
            return (
                StatusCode::BAD_GATEWAY,
                Json(DeviceFlowStartResponse {
                    device_code: String::new(),
                    user_code: String::new(),
                    verification_uri: String::new(),
                    interval: 0,
                    expires_in: None,
                }),
            );
        }
    };

    // Check for error response from GitHub
    if let Some(err_msg) = body["error"].as_str() {
        error!(github_error = %err_msg, description = %body["error_description"].as_str().unwrap_or("unknown"), "GitHub returned error");
        return (
            StatusCode::BAD_GATEWAY,
            Json(DeviceFlowStartResponse {
                device_code: String::new(),
                user_code: String::new(),
                verification_uri: String::new(),
                interval: 0,
                expires_in: None,
            }),
        );
    }

    let device_code = match body["device_code"].as_str() {
        Some(c) => c.to_string(),
        None => {
            error!(response = %body, "Missing device_code in GitHub response");
            return (
                StatusCode::BAD_GATEWAY,
                Json(DeviceFlowStartResponse {
                    device_code: String::new(),
                    user_code: String::new(),
                    verification_uri: String::new(),
                    interval: 0,
                    expires_in: None,
                }),
            );
        }
    };

    let user_code = body["user_code"].as_str().unwrap_or("???").to_string();
    let verification_uri = body["verification_uri"]
        .as_str()
        .unwrap_or("https://github.com/login/device")
        .to_string();
    let interval = body["interval"].as_u64().unwrap_or(5);
    let expires_in = body["expires_in"].as_u64();

    info!("GitHub device flow initiated successfully");

    // Store device flow state for polling.
    {
        let mut flow = DEVICE_FLOW.lock().await;
        *flow = Some(DeviceFlowState {
            device_code: device_code.clone(),
            client_id,
            interval,
            started_at: Instant::now(),
            status: DeviceFlowStatus::Waiting,
        });
    }

    (
        StatusCode::OK,
        Json(DeviceFlowStartResponse {
            device_code,
            user_code,
            verification_uri,
            interval,
            expires_in,
        }),
    )
}

/// `POST /api/auth/copilot/poll` — check device-flow status.
///
/// If the user has authorized the app, exchanges the GitHub token for a
/// Copilot session token and stores it. Returns the current status.
pub(crate) async fn api_auth_copilot_poll() -> impl IntoResponse {
    // Check device flow state.
    let (device_code, client_id, interval) = {
        let flow = DEVICE_FLOW.lock().await;
        match flow.as_ref() {
            Some(f) => {
                // Check if the flow has expired (internal cleanup)
                if f.started_at.elapsed().as_secs() > MAX_FLOW_AGE_SECS {
                    warn!("Device flow state is stale, treating as no_flow");
                    return (
                        StatusCode::BAD_REQUEST,
                        Json(DeviceFlowPollResponse {
                            status: "no_flow".to_string(),
                            token: None,
                            error: Some(
                                "Device flow expired. Please start a new authentication flow."
                                    .to_string(),
                            ),
                            interval: None,
                        }),
                    );
                }
                (f.device_code.clone(), f.client_id.clone(), f.interval)
            }
            None => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(DeviceFlowPollResponse {
                        status: "no_flow".to_string(),
                        token: None,
                        error: Some(
                            "no device flow in progress — call /api/auth/copilot/start first"
                                .to_string(),
                        ),
                        interval: None,
                    }),
                );
            }
        }
    };

    // Check if already complete or failed.
    {
        let flow = DEVICE_FLOW.lock().await;
        if let Some(ref f) = *flow {
            match &f.status {
                DeviceFlowStatus::Complete(_) => {
                    return (
                        StatusCode::OK,
                        Json(DeviceFlowPollResponse {
                            status: "complete".to_string(),
                            token: None,
                            error: None,
                            interval: None,
                        }),
                    );
                }
                DeviceFlowStatus::Failed(err) => {
                    return (
                        StatusCode::OK,
                        Json(DeviceFlowPollResponse {
                            status: "failed".to_string(),
                            token: None,
                            error: Some(err.clone()),
                            interval: None,
                        }),
                    );
                }
                DeviceFlowStatus::Waiting => {}
            }
        }
    }

    // Check timeout.
    {
        let flow = DEVICE_FLOW.lock().await;
        if let Some(ref f) = *flow {
            if f.started_at.elapsed().as_secs() > DEVICE_FLOW_TIMEOUT_SECS {
                return (
                    StatusCode::OK,
                    Json(DeviceFlowPollResponse {
                        status: "timeout".to_string(),
                        token: None,
                        error: Some("device flow timed out — please start again".to_string()),
                        interval: None,
                    }),
                );
            }
        }
    }

    // Poll GitHub for the access token.
    let http = reqwest::Client::new();
    let poll: serde_json::Value = match http
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", client_id.as_str()),
            ("device_code", device_code.as_str()),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await
    {
        Ok(r) => match r.json().await {
            Ok(b) => b,
            Err(e) => {
                error!(error = %e, "Failed to parse GitHub poll response");
                return (
                    StatusCode::BAD_GATEWAY,
                    Json(DeviceFlowPollResponse {
                        status: "error".to_string(),
                        token: None,
                        error: Some(format!("bad poll response: {e}")),
                        interval: None,
                    }),
                );
            }
        },
        Err(e) => {
            error!(error = %e, "GitHub poll request failed");
            return (
                StatusCode::BAD_GATEWAY,
                Json(DeviceFlowPollResponse {
                    status: "error".to_string(),
                    token: None,
                    error: Some(format!("poll request failed: {e}")),
                    interval: None,
                }),
            );
        }
    };

    // Check for access token (authorization complete).
    if let Some(tok) = poll["access_token"].as_str() {
        let github_token = tok.to_string();
        info!("GitHub authorization complete, exchanging for Copilot token");

        // Exchange for Copilot session token.
        match crate::auth::copilot_token::exchange_github_for_copilot_token(&github_token).await {
            Ok(copilot) => {
                info!("Copilot token exchange successful");
                // Store the token.
                if let Err(e) = crate::auth::github_device::store_token(&github_token) {
                    warn!(error = %e, "failed to store GitHub token");
                }
                // Write COPILOT_TOKEN env-style file for the provider.
                write_copilot_token_file(&copilot.token);

                // Cache the full structured token (with expiry) so CopilotProvider can find it.
                if let Err(e) = crate::auth::copilot_token::cache_copilot_token(&copilot) {
                    warn!(error = %e, "failed to cache Copilot session token");
                }

                // Clear the disabled state since user is reconnecting this provider
                if let Err(e) = crate::auth::store::enable_provider("copilot") {
                    tracing::warn!(error = %e, "failed to clear disabled state for copilot");
                }

                // Update flow state.
                {
                    let mut flow = DEVICE_FLOW.lock().await;
                    if let Some(ref mut f) = *flow {
                        f.status = DeviceFlowStatus::Complete(copilot.token.clone());
                    }
                }

                info!("Copilot device flow complete");

                (
                    StatusCode::OK,
                    Json(DeviceFlowPollResponse {
                        status: "complete".to_string(),
                        token: Some(copilot.token),
                        error: None,
                        interval: None,
                    }),
                )
            }
            Err(e) => {
                let msg = format!("copilot token exchange failed: {e}");
                error!(error = %msg, "Copilot token exchange failed");
                {
                    let mut flow = DEVICE_FLOW.lock().await;
                    if let Some(ref mut f) = *flow {
                        f.status = DeviceFlowStatus::Failed(msg.clone());
                    }
                }
                (
                    StatusCode::BAD_GATEWAY,
                    Json(DeviceFlowPollResponse {
                        status: "failed".to_string(),
                        token: None,
                        error: Some(msg),
                        interval: None,
                    }),
                )
            }
        }
    } else if let Some(err) = poll["error"].as_str() {
        match err {
            "authorization_pending" => (
                StatusCode::OK,
                Json(DeviceFlowPollResponse {
                    status: "pending".to_string(),
                    token: None,
                    error: None,
                    interval: Some(interval),
                }),
            ),
            "slow_down" => {
                let new_interval = interval + 5;
                debug!(new_interval, "GitHub requested slow_down");
                (
                    StatusCode::OK,
                    Json(DeviceFlowPollResponse {
                        status: "pending".to_string(),
                        token: None,
                        error: None,
                        interval: Some(new_interval),
                    }),
                )
            }
            "expired_token" | "access_denied" => {
                let msg = format!("device flow failed: {err}");
                warn!(github_error = %err, "GitHub device flow error");
                {
                    let mut flow = DEVICE_FLOW.lock().await;
                    if let Some(ref mut f) = *flow {
                        f.status = DeviceFlowStatus::Failed(msg.clone());
                    }
                }
                (
                    StatusCode::OK,
                    Json(DeviceFlowPollResponse {
                        status: "failed".to_string(),
                        token: None,
                        error: Some(msg),
                        interval: None,
                    }),
                )
            }
            _ => {
                warn!(github_error = %err, "Unexpected GitHub device flow error");
                (
                    StatusCode::OK,
                    Json(DeviceFlowPollResponse {
                        status: "pending".to_string(),
                        token: None,
                        error: None,
                        interval: Some(interval),
                    }),
                )
            }
        }
    } else {
        warn!(response = %poll, "Unexpected GitHub poll response");
        (
            StatusCode::OK,
            Json(DeviceFlowPollResponse {
                status: "pending".to_string(),
                token: None,
                error: None,
                interval: Some(interval),
            }),
        )
    }
}

/// Write copilot token to a file so the Copilot provider can read it.
fn write_copilot_token_file(token: &str) {
    if let Some(home) = dirs::home_dir() {
        let dir = home.join(".pinchy");
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("copilot-token");
        let _ = std::fs::write(path, token);
    }
}

/// `DELETE /api/auth/:provider` — clear stored auth for a provider.
pub(crate) async fn api_auth_clear(Path(provider): Path<String>) -> impl IntoResponse {
    let normalized = crate::models::providers::normalize_provider_id(&provider);

    // Persist the disabled state to auth.json so it survives restarts
    // This is critical for local providers (ollama, lmstudio, vllm) which don't use auth store
    if let Err(e) = crate::auth::store::disable_provider(&normalized) {
        tracing::warn!(provider = %normalized, error = %e, "failed to persist disabled provider state");
    }

    // Copilot has extra cleanup (keyring + token file)
    if provider == "copilot" {
        if let Err(e) = crate::auth::github_device::remove_token() {
            tracing::warn!(error = %e, "failed to remove GitHub token from keyring");
        }
        if let Some(home) = dirs::home_dir() {
            let _ = std::fs::remove_file(home.join(".pinchy").join("copilot-token"));
        }
        std::env::remove_var("COPILOT_TOKEN");
    }

    // Remove from auth store (works for all providers)
    if let Err(e) = crate::auth::store::remove_auth(&provider) {
        tracing::warn!(provider = %provider, error = %e, "failed to remove auth entry");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ProviderSetKeyResponse {
                ok: false,
                provider,
            }),
        );
    }

    (
        StatusCode::OK,
        Json(ProviderSetKeyResponse { ok: true, provider }),
    )
}

// ---------------------------------------------------------------------------
// Save / query API keys
// ---------------------------------------------------------------------------

/// `POST /api/auth/:provider` — save an API key to the auth store.
pub(crate) async fn api_auth_save_key(
    Path(provider): Path<String>,
    Json(body): Json<SaveApiKeyRequest>,
) -> impl IntoResponse {
    let key = body.api_key.trim().to_string();

    if key.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(ProviderAuthResponse {
                success: false,
                message: "api_key must not be empty".to_string(),
            }),
        );
    }

    let entry = crate::auth::store::AuthEntry::new_api_key(&provider, &key);
    if let Err(e) = crate::auth::store::set_auth(&provider, entry) {
        tracing::error!(provider = %provider, error = %e, "failed to save API key");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(ProviderAuthResponse {
                success: false,
                message: format!("failed to save key for {provider}: {e}"),
            }),
        );
    }

    // Clear the disabled state since user is reconnecting this provider
    if let Err(e) = crate::auth::store::enable_provider(&provider) {
        tracing::warn!(provider = %provider, error = %e, "failed to clear disabled state for provider");
    }

    (
        StatusCode::OK,
        Json(ProviderAuthResponse {
            success: true,
            message: format!("API key saved for {provider}"),
        }),
    )
}

/// Mask a key string: show first 4 chars + "…" + last 3 chars.
/// If the key is ≤ 8 chars, just return "••••".
fn mask_key(key: &str) -> String {
    if key.len() <= 8 {
        "••••".to_string()
    } else {
        let prefix: String = key.chars().take(4).collect();
        let suffix: String = key
            .chars()
            .rev()
            .take(3)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        format!("{prefix}…{suffix}")
    }
}

/// `GET /api/auth/:provider/masked` — return a masked version of the stored key.
pub(crate) async fn api_auth_masked_key(
    Path(provider): Path<String>,
    State(state): State<AppState>,
) -> impl IntoResponse {
    // 1. Check auth store
    if let Some(entry) = crate::auth::store::get_auth(&provider) {
        if let Some(ref key) = entry.api_key {
            if !key.is_empty() {
                return (
                    StatusCode::OK,
                    Json(MaskedKeyResponse {
                        provider: provider.clone(),
                        has_key: true,
                        masked_key: Some(mask_key(key)),
                        env_var: None,
                    }),
                );
            }
        }
        if let Some(ref token) = entry.access_token {
            if !token.is_empty() {
                return (
                    StatusCode::OK,
                    Json(MaskedKeyResponse {
                        provider: provider.clone(),
                        has_key: true,
                        masked_key: Some(mask_key(token)),
                        env_var: None,
                    }),
                );
            }
        }
    }

    // 2. Check config.yaml api_key
    if let Ok(cfg) = crate::config::Config::load(&state.config_path).await {
        for model in &cfg.models {
            if model.provider == provider {
                if let Some(ref key) = model.api_key {
                    if !key.is_empty() && !key.starts_with('$') {
                        return (
                            StatusCode::OK,
                            Json(MaskedKeyResponse {
                                provider: provider.clone(),
                                has_key: true,
                                masked_key: Some(mask_key(key)),
                                env_var: None,
                            }),
                        );
                    }
                }
            }
        }
    }

    (
        StatusCode::OK,
        Json(MaskedKeyResponse {
            provider: provider.clone(),
            has_key: false,
            masked_key: None,
            env_var: None,
        }),
    )
}
