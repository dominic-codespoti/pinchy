//! Model discovery handler.
//!
//! `GET /api/models/:config_model_id` — return the list of available models
//! for a configured provider entry.
//! `GET /api/models` — return ALL available models from all configured providers.
//! `GET /api/models/registry` — return the FULL models.dev registry.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use std::collections::HashSet;

use crate::models::ModelProvider;

use super::super::types::*;
use super::super::AppState;

/// Normalize a model name for deduplication.
///
/// - Lowercase the name
/// - Convert separators (hyphens, underscores, periods) to spaces
/// - Strip remaining special characters (keep only alphanumeric and spaces)
/// - Collapse multiple whitespace to single spaces
fn normalize_model_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .map(|c| {
            if c == '-' || c == '_' || c == '.' {
                ' '
            } else {
                c
            }
        })
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Check if a provider ID should be treated as an alias for catalog/auth purposes.
///
/// This handles cases where a distinct provider (like `openai-codex`) should
/// resolve to another provider's catalog (like `openai`) for model lookup.
fn is_catalog_alias(provider_id: &str, target_provider: &str) -> bool {
    matches!((provider_id, target_provider), ("openai-codex", "openai"))
}

fn copilot_fallback_model() -> ModelInfo {
    ModelInfo {
        id: crate::config::COPILOT_FALLBACK_MODEL_ID.to_string(),
        name: crate::config::COPILOT_FALLBACK_MODEL_NAME.to_string(),
        provider: "copilot".to_string(),
        description: Some("stable fallback model for Copilot-backed agents".to_string()),
        input_price: None,
        output_price: None,
        context_window: None,
        max_output: None,
        tool_call: true,
        reasoning: false,
        attachment: false,
        family: None,
        cache_read_price: None,
        cache_write_price: None,
        modalities: None,
    }
}

fn enrich_copilot_model_from_registry(
    model: &mut ModelInfo,
    registry: &crate::models_dev::ModelsDevRegistry,
) {
    let normalized_id = normalize_model_name(&model.id);
    let normalized_name = normalize_model_name(&model.name);

    let matching_models: Vec<_> = registry
        .providers()
        .iter()
        .flat_map(|provider| provider.models.iter())
        .filter(|candidate| {
            let candidate_id = normalize_model_name(&candidate.id);
            let candidate_name = normalize_model_name(&candidate.name);

            (!normalized_id.is_empty()
                && (candidate_id == normalized_id || candidate_name == normalized_id))
                || (!normalized_name.is_empty()
                    && (candidate_id == normalized_name || candidate_name == normalized_name))
        })
        .collect();

    if let Some(candidate) = matching_models.first() {
        // Use the registry as a coarse capability source for routed Copilot models.
        // Some providers disagree on flags for the same normalized model name, so
        // prefer "supported anywhere" for boolean visibility hints.
        if matching_models.iter().any(|m| m.reasoning == Some(true)) {
            model.reasoning = true;
        }
        if matching_models.iter().any(|m| m.attachment == Some(true)) {
            model.attachment = true;
        }
        model.family = candidate.family.clone().or_else(|| model.family.clone());
        model.cache_read_price = candidate.cost.as_ref().and_then(|c| c.cache_read);
        model.cache_write_price = candidate.cost.as_ref().and_then(|c| c.cache_write);
        model.modalities = candidate.modalities.as_ref().map(|m| {
            let mut mods = Vec::new();
            if let Some(ref inputs) = m.input {
                for input in inputs {
                    mods.push(format!("input:{}", input));
                }
            }
            if let Some(ref outputs) = m.output {
                for output in outputs {
                    mods.push(format!("output:{}", output));
                }
            }
            mods
        });

        if model.description.is_none() {
            model.description = candidate.prompt.clone();
        }
    }
}

/// Build the current selectable model inventory used by the UI and agent validation.
pub(crate) async fn collect_model_inventory(cfg: &crate::config::Config) -> Vec<ModelInfo> {
    let mut all_models: Vec<ModelInfo> = Vec::new();
    let timeout_duration = std::time::Duration::from_secs(5);
    let mut providers_with_live_models: HashSet<String> = HashSet::new();
    let registry = crate::models_dev::get_or_load_registry().await.ok();

    all_models.push(copilot_fallback_model());

    let copilot_auth = std::env::var("COPILOT_TOKEN")
        .ok()
        .or_else(|| crate::auth::github_device::retrieve_token().ok().flatten())
        .or_else(|| {
            dirs::home_dir()
                .map(|h| h.join(".pinchy/copilot-token"))
                .filter(|p| p.exists())
                .and_then(|p| std::fs::read_to_string(&p).ok())
        });

    if copilot_auth.is_some() {
        let copilot_provider = crate::models::CopilotProvider::new();
        let timeout_duration = std::time::Duration::from_secs(10);

        match tokio::time::timeout(timeout_duration, copilot_provider.list_models()).await {
            Ok(Ok(Some(models))) if !models.is_empty() => {
                providers_with_live_models.insert("copilot".to_string());
                for model in models {
                    let mut model_info = ModelInfo {
                        id: model.id.clone(),
                        name: model.name.clone(),
                        provider: "copilot".to_string(),
                        description: model.vendor.clone(),
                        input_price: model.input_price,
                        output_price: model.output_price,
                        context_window: model.max_tokens.map(|t| t as u64),
                        max_output: None,
                        tool_call: model
                            .supported_endpoints
                            .iter()
                            .any(|e: &String| e.contains("chat")),
                        reasoning: false,
                        attachment: false,
                        family: None,
                        cache_read_price: None,
                        cache_write_price: None,
                        modalities: None,
                    };

                    if let Some(ref registry) = registry {
                        enrich_copilot_model_from_registry(&mut model_info, registry);
                    }

                    all_models.push(model_info);
                }
            }
            _ => {}
        }
    }

    try_local_providers(
        &mut all_models,
        &mut providers_with_live_models,
        cfg,
        timeout_duration,
    )
    .await;

    match registry {
        Some(registry) => {
            for provider in registry.providers() {
                if providers_with_live_models.contains(&provider.id) {
                    continue;
                }

                let has_auth = provider
                    .env
                    .iter()
                    .any(|env_var| std::env::var(env_var).is_ok());
                let has_auth_store = cfg.models.iter().any(|m| {
                    m.provider == provider.id
                        || is_catalog_alias(&m.provider, &provider.id)
                        || crate::models::providers::normalize_provider_id(&m.provider)
                            == provider.id
                }) || crate::auth::store::get_auth(&provider.id).is_some();
                let has_config_key = cfg.models.iter().any(|m| {
                    let provider_matches = m.provider == provider.id
                        || is_catalog_alias(&m.provider, &provider.id)
                        || crate::models::providers::normalize_provider_id(&m.provider)
                            == provider.id;
                    provider_matches
                        && m.api_key
                            .as_ref()
                            .map(|k| !k.is_empty() && !k.starts_with('$'))
                            .unwrap_or(false)
                });
                let has_special_auth = match provider.id.as_str() {
                    "copilot" => {
                        std::env::var("COPILOT_TOKEN").is_ok()
                            || crate::auth::github_device::retrieve_token()
                                .ok()
                                .flatten()
                                .is_some()
                            || dirs::home_dir()
                                .map(|h| h.join(".pinchy/copilot-token").exists())
                                .unwrap_or(false)
                    }
                    "anthropic" => {
                        std::env::var("ANTHROPIC_API_KEY").is_ok()
                            || std::env::var("CLAUDE_CODE_OAUTH_TOKEN").is_ok()
                    }
                    "bedrock" => {
                        std::env::var("AWS_BEARER_TOKEN_BEDROCK").is_ok()
                            || (std::env::var("AWS_ACCESS_KEY_ID").is_ok()
                                && std::env::var("AWS_SECRET_ACCESS_KEY").is_ok())
                    }
                    _ => false,
                };

                if has_auth || has_auth_store || has_config_key || has_special_auth {
                    for model in &provider.models {
                        let modalities = model.modalities.as_ref().map(|m| {
                            let mut mods = Vec::new();
                            if let Some(ref inputs) = m.input {
                                for input in inputs {
                                    mods.push(format!("input:{}", input));
                                }
                            }
                            if let Some(ref outputs) = m.output {
                                for output in outputs {
                                    mods.push(format!("output:{}", output));
                                }
                            }
                            mods
                        });
                        all_models.push(ModelInfo {
                            id: model.id.clone(),
                            name: model.name.clone(),
                            provider: provider.id.clone(),
                            description: model.prompt.clone(),
                            input_price: model.cost.as_ref().and_then(|c| c.input),
                            output_price: model.cost.as_ref().and_then(|c| c.output),
                            context_window: model.limit.as_ref().and_then(|l| l.context),
                            max_output: model.limit.as_ref().and_then(|l| l.output),
                            tool_call: model.tool_call.unwrap_or(false),
                            reasoning: model.reasoning.unwrap_or(false),
                            attachment: model.attachment.unwrap_or(false),
                            family: model.family.clone(),
                            cache_read_price: model.cost.as_ref().and_then(|c| c.cache_read),
                            cache_write_price: model.cost.as_ref().and_then(|c| c.cache_write),
                            modalities,
                        });
                    }
                }
            }
        }
        None => {
            tracing::warn!("failed to load models.dev registry");
        }
    }

    let mut seen: std::collections::HashSet<(String, String)> = std::collections::HashSet::new();
    all_models.retain(|m| {
        let key = (m.provider.clone(), normalize_model_name(&m.name));
        if seen.contains(&key) {
            false
        } else {
            seen.insert(key);
            true
        }
    });

    all_models
}

/// `GET /api/models/:config_model_id`
///
/// Looks up the model config entry by `id`, builds a provider, and calls
/// `list_models()` to discover available models from that provider's API.
pub(crate) async fn api_models_list(
    State(state): State<AppState>,
    Path(config_model_id): Path<String>,
) -> impl IntoResponse {
    // Load the current config.
    let cfg = match crate::config::Config::load(&state.config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("config load: {e:#}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Find the matching model config entry.
    let model_cfg = match cfg.models.iter().find(|m| m.id == config_model_id) {
        Some(m) => m,
        None => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: format!("model config '{config_model_id}' not found"),
                    id: Some(config_model_id),
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Build a provider from the config entry.
    let model_id = model_cfg.model.as_deref().unwrap_or(&model_cfg.provider);
    let provider = crate::models::build_provider_with_config_fields(
        &model_cfg.provider,
        model_id,
        model_cfg.endpoint.as_deref(),
        model_cfg.api_version.as_deref(),
        model_cfg.embedding_deployment.as_deref(),
        model_cfg.api_key.as_deref(),
        model_cfg.headers.as_ref(),
        None,
        None,
    );

    // Call list_models.
    match provider.list_models().await {
        Ok(Some(models)) => {
            let model_infos: Vec<ModelInfo> = models
                .into_iter()
                .map(|m| ModelInfo {
                    id: m.id,
                    name: m.name,
                    provider: model_cfg.provider.clone(),
                    description: m.vendor,
                    input_price: None,
                    output_price: None,
                    context_window: None,
                    max_output: None,
                    tool_call: false,
                    reasoning: false,
                    attachment: false,
                    family: None,
                    cache_read_price: None,
                    cache_write_price: None,
                    modalities: None,
                })
                .collect();
            (
                StatusCode::OK,
                Json(ModelsListResponse {
                    models: Some(model_infos),
                    message: None,
                }),
            )
                .into_response()
        }
        Ok(None) => (
            StatusCode::OK,
            Json(ModelsListResponse {
                models: None,
                message: Some("provider does not support model discovery".to_string()),
            }),
        )
            .into_response(),
        Err(e) => (
            StatusCode::BAD_GATEWAY,
            Json(ErrorResponse {
                error: format!("model discovery failed: {e:#}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

/// `GET /api/models`
///
/// Returns ALL available models from all configured providers.
/// Uses live provider discovery as PRIMARY source for each provider.
/// Falls back to models.dev registry only when live discovery returns zero models.
pub(crate) async fn api_all_models(State(state): State<AppState>) -> impl IntoResponse {
    // Load the current config.
    let cfg = match crate::config::Config::load(&state.config_path).await {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: format!("config load: {e:#}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    let all_models = collect_model_inventory(&cfg).await;

    (
        StatusCode::OK,
        Json(ModelsListResponse {
            models: Some(all_models),
            message: None,
        }),
    )
        .into_response()
}

/// Try to list models from local providers that may not be in models.dev.
async fn try_local_providers(
    all_models: &mut Vec<ModelInfo>,
    providers_with_live_models: &mut HashSet<String>,
    cfg: &crate::config::Config,
    timeout_duration: std::time::Duration,
) {
    // Local providers: ollama, lmstudio, vllm
    let local_providers = [
        (
            "ollama",
            "http://localhost:11434/v1/chat/completions",
            "llama3.2",
        ),
        (
            "lmstudio",
            "http://localhost:1234/v1/chat/completions",
            "local-model",
        ),
        (
            "vllm",
            "http://localhost:8000/v1/chat/completions",
            "local-model",
        ),
    ];

    for (provider_name, endpoint, default_model) in local_providers {
        // Check if there's a config entry for this provider
        let model_cfg = cfg.models.iter().find(|m| m.provider == provider_name);

        let provider: Box<dyn crate::models::ModelProvider> = match model_cfg {
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
            None => Box::new(crate::models::OpenAICompatProvider::new(
                endpoint.to_string(),
                String::new(),
                default_model.to_string(),
            )) as Box<dyn crate::models::ModelProvider>,
        };

        match tokio::time::timeout(timeout_duration, provider.list_models()).await {
            Ok(Ok(Some(models))) if !models.is_empty() => {
                providers_with_live_models.insert(provider_name.to_string());
                for model in &models {
                    all_models.push(ModelInfo {
                        id: model.id.clone(),
                        name: model.name.clone(),
                        provider: provider_name.to_string(),
                        description: model.vendor.clone(),
                        input_price: None,
                        output_price: None,
                        context_window: None,
                        max_output: None,
                        tool_call: false,
                        reasoning: false,
                        attachment: false,
                        family: None,
                        cache_read_price: None,
                        cache_write_price: None,
                        modalities: None,
                    });
                }
                tracing::debug!(
                    provider = provider_name,
                    model_count = models.len(),
                    "added models from live discovery"
                );
            }
            _ => {
                tracing::debug!(provider = provider_name, "no response from local provider");
            }
        }
    }
}

/// `GET /api/models/registry`
///
/// Returns the FULL models.dev registry (all providers with all models)
/// for the frontend to use for provider selection.
pub(crate) async fn api_models_registry() -> impl IntoResponse {
    match crate::models_dev::get_or_load_registry().await {
        Ok(registry) => {
            // Convert providers to serde_json::Value
            let providers: Vec<serde_json::Value> = registry
                .providers()
                .iter()
                .filter_map(|p| serde_json::to_value(p).ok())
                .collect();

            // Return the full registry
            (
                StatusCode::OK,
                Json(ModelsRegistryResponse {
                    providers,
                    cached_at: registry.cached_at.timestamp() as u64,
                    total_providers: registry.providers().len(),
                    total_models: registry.total_models(),
                }),
            )
                .into_response()
        }
        Err(e) => {
            tracing::warn!(error = %e, "failed to load models.dev registry");
            (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: format!("failed to load models.dev registry: {e:#}"),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_model_name;

    #[test]
    fn test_normalize_model_name_basic() {
        // Basic lowercasing
        assert_eq!(normalize_model_name("GPT-4o"), "gpt 4o");
        assert_eq!(normalize_model_name("gpt-4o"), "gpt 4o");
        assert_eq!(normalize_model_name("GPT 4o"), "gpt 4o");

        // Same model, different formats should normalize to same value
        assert_eq!(
            normalize_model_name("GPT-4o"),
            normalize_model_name("gpt-4o")
        );
        assert_eq!(
            normalize_model_name("GPT-4o"),
            normalize_model_name("GPT 4o")
        );
        assert_eq!(
            normalize_model_name("gpt-4o"),
            normalize_model_name("GPT 4o")
        );
    }

    #[test]
    fn test_normalize_model_name_whitespace() {
        // Multiple spaces collapsed
        assert_eq!(normalize_model_name("GPT   4o"), "gpt 4o");
        assert_eq!(normalize_model_name("GPT\t\t4o"), "gpt 4o");
        assert_eq!(normalize_model_name("  GPT 4o  "), "gpt 4o");

        // Leading/trailing whitespace removed
        assert_eq!(normalize_model_name("  gpt-4o  "), "gpt 4o");
    }

    #[test]
    fn test_normalize_model_name_special_chars() {
        // Various special characters stripped
        assert_eq!(normalize_model_name("GPT-4o-Mini"), "gpt 4o mini");
        assert_eq!(normalize_model_name("claude-3-opus"), "claude 3 opus");
        assert_eq!(normalize_model_name("o3-mini (high)"), "o3 mini high");
        assert_eq!(normalize_model_name("gpt-4o@latest"), "gpt 4olatest");
    }

    #[test]
    fn test_normalize_model_name_complex() {
        // Complex real-world cases
        assert_eq!(
            normalize_model_name("Claude 3.5 Sonnet"),
            "claude 3 5 sonnet" // Period is stripped, leaving space between 3 and 5
        );
        assert_eq!(
            normalize_model_name("GPT-4 Turbo Preview"),
            "gpt 4 turbo preview"
        );
        assert_eq!(
            normalize_model_name("o1-preview-2024-09-12"),
            "o1 preview 2024 09 12"
        );
    }

    #[test]
    fn test_normalize_model_name_empty() {
        // Empty and whitespace-only
        assert_eq!(normalize_model_name(""), "");
        assert_eq!(normalize_model_name("   "), "");
        assert_eq!(normalize_model_name("---"), "");
    }

    #[test]
    fn test_normalize_model_name_unicode() {
        // Unicode alphanumeric should be preserved
        assert_eq!(normalize_model_name("模型-123"), "模型 123");
    }
}
