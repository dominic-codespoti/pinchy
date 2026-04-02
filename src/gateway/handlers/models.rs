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

use super::super::types::*;
use super::super::AppState;

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
/// Uses models.dev registry as the PRIMARY source for model metadata.
/// Falls back to live provider discovery for local providers (ollama, lmstudio, vllm)
/// that aren't in models.dev.
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

    let mut all_models: Vec<ModelInfo> = Vec::new();
    let timeout_duration = std::time::Duration::from_secs(5);

    // Try to load models.dev registry as primary source
    match crate::models_dev::get_or_load_registry().await {
        Ok(registry) => {
            tracing::info!(
                providers = registry.providers().len(),
                "loaded models.dev registry"
            );

            // For each provider in the registry, check if user has auth configured
            for provider in registry.providers() {
                // Check if any of the env vars are set
                let has_auth = provider
                    .env
                    .iter()
                    .any(|env_var| std::env::var(env_var).is_ok());

                // Also check if there's an auth store entry
                let has_auth_store = crate::auth::store::get_auth(&provider.id)
                    .map(|e| {
                        e.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false)
                            || e.access_token
                                .as_ref()
                                .map(|t| !t.is_empty())
                                .unwrap_or(false)
                    })
                    .unwrap_or(false);

                // Check config for api_key
                let has_config_key = cfg.models.iter().any(|m| {
                    m.provider == provider.id
                        && m.api_key
                            .as_ref()
                            .map(|k| !k.is_empty() && !k.starts_with('$'))
                            .unwrap_or(false)
                });

                // Special cases
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
                    // Add all models from this provider
                    for model in &provider.models {
                        // Convert modalities from ModelsDevModalities to Vec<String>
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
                    tracing::debug!(
                        provider = %provider.id,
                        model_count = provider.models.len(),
                        "added models from models.dev registry"
                    );
                }
            }
        }
        Err(e) => {
            tracing::warn!(error = %e, "failed to load models.dev registry, falling back to provider discovery");
        }
    }

    // Collect already-checked providers from models.dev
    let already_checked: Vec<String> = all_models
        .iter()
        .map(|m| m.provider.clone())
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();

    // Also try live discovery for local providers not in models.dev
    try_local_providers(&mut all_models, &already_checked, &cfg, timeout_duration).await;

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
    already_checked: &[String],
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
        if already_checked.iter().any(|p| p == provider_name) {
            continue;
        }

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
                )
            }
            None => Box::new(crate::models::OpenAICompatProvider::new(
                endpoint.to_string(),
                String::new(),
                default_model.to_string(),
            )) as Box<dyn crate::models::ModelProvider>,
        };

        match tokio::time::timeout(timeout_duration, provider.list_models()).await {
            Ok(Ok(Some(models))) => {
                for model in &models {
                    if !all_models
                        .iter()
                        .any(|m| m.id == model.id && m.provider == provider_name)
                    {
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
