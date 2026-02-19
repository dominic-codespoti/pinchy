//! Model provider abstractions.
//!
//! Defines the [`ModelProvider`] trait, the [`ChatMessage`] type,
//! [`ProviderManager`] for retry/fallback semantics, and concrete
//! implementations ([`OpenAIProvider`], [`CopilotProvider`]).

pub mod azure_openai;
pub mod copilot;
pub mod openai;
pub mod openai_compat;

use std::any::Any;
use std::pin::Pin;
use std::time::Duration;

use async_trait::async_trait;
use futures_core::Stream;
use tracing::warn;

// ---------------------------------------------------------------------------
// ChatMessage – shared message representation
// ---------------------------------------------------------------------------

/// A single chat message with a role and content.
///
/// Optionally carries OpenAI tool-calling metadata so that
/// `tool` role messages and assistant `tool_calls` responses
/// are serialised correctly for the API.
#[derive(Debug, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
    /// For assistant messages that invoke tools: the raw
    /// OpenAI-format `tool_calls` array.
    pub tool_calls: Option<Vec<serde_json::Value>>,
    /// For `role: "tool"` messages: the id of the tool call
    /// this result corresponds to.
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    /// Convenience constructor for a plain message (no tool metadata).
    pub fn new(role: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: role.into(),
            content: content.into(),
            tool_calls: None,
            tool_call_id: None,
        }
    }
}

/// Serialise a slice of [`ChatMessage`]s into the OpenAI-compatible
/// JSON array format, including `tool_calls` and `tool_call_id` when
/// present.
pub fn serialize_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
    messages
        .iter()
        .map(|m| {
            let mut msg = serde_json::json!({ "role": m.role });
            if let Some(ref tcs) = m.tool_calls {
                msg["tool_calls"] = serde_json::json!(tcs);
                // OpenAI expects content to be null (or absent) on
                // assistant messages that carry tool_calls.
                if m.content.is_empty() {
                    msg["content"] = serde_json::Value::Null;
                } else {
                    msg["content"] = serde_json::json!(m.content);
                }
            } else {
                msg["content"] = serde_json::json!(m.content);
            }
            if let Some(ref tcid) = m.tool_call_id {
                msg["tool_call_id"] = serde_json::json!(tcid);
            }
            msg
        })
        .collect()
}

// ---------------------------------------------------------------------------
// ModelProvider trait
// ---------------------------------------------------------------------------

/// Trait implemented by every LLM backend.
///
/// Each provider knows how to turn a list of chat messages into a
/// single assistant reply string.
#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// Send a sequence of chat messages and return the assistant's reply.
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error>;

    /// Send chat messages with an array of function/tool definitions.
    ///
    /// The default implementation returns an error indicating that the
    /// provider does not support function calling.  Concrete providers
    /// (e.g. OpenAI, Copilot) override this.
    async fn send_chat_with_functions(
        &self,
        _messages: &[ChatMessage],
        _functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        Err(anyhow::anyhow!(
            "this provider does not support function calling"
        ))
    }

    /// Send chat messages and return a stream of content-delta strings.
    ///
    /// The default implementation calls `send_chat` and yields the
    /// entire reply as a single chunk.  Providers that support real SSE
    /// streaming (OpenAI, Azure) override this.
    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>>;

    /// Generate embedding vectors for the given texts.
    ///
    /// Returns `None` when the provider does not support embeddings.
    /// The default implementation returns `Ok(None)`.
    async fn embed(&self, _texts: &[&str]) -> Result<Option<Vec<Vec<f32>>>, anyhow::Error> {
        Ok(None)
    }

    /// Downcast helper so `ProviderManager` can check concrete type.
    fn as_any(&self) -> &dyn Any;
}

// Re-export the concrete providers for convenience.
pub use azure_openai::AzureOpenAIProvider;
pub use copilot::CopilotProvider;
pub use openai::OpenAIProvider;
pub use openai_compat::OpenAICompatProvider;

/// Extract token usage statistics from an OpenAI / Azure response JSON.
pub fn parse_token_usage(json: &serde_json::Value) -> Option<TokenUsage> {
    let usage = json.get("usage")?;
    Some(TokenUsage {
        prompt_tokens: usage["prompt_tokens"].as_u64().unwrap_or(0),
        completion_tokens: usage["completion_tokens"].as_u64().unwrap_or(0),
        total_tokens: usage["total_tokens"].as_u64().unwrap_or(0),
    })
}

/// Parse `tool_calls` from an OpenAI-style chat completion response.
///
/// Returns `Some(ProviderResponse)` if the response contains tool calls.
/// A single tool call returns `FunctionCall`; multiple returns
/// `MultiFunctionCall`.  Falls back to the legacy `function_call` field.
pub fn parse_tool_calls(json: &serde_json::Value) -> Option<ProviderResponse> {
    let message = json.get("choices")?.get(0)?.get("message")?;

    // Try modern `tool_calls` array first.
    if let Some(tool_calls) = message.get("tool_calls").and_then(|v| v.as_array()) {
        let items: Vec<FunctionCallItem> = tool_calls
            .iter()
            .filter_map(|tc| {
                let func = tc.get("function")?;
                let name = func.get("name")?.as_str()?.to_string();
                let arguments = func
                    .get("arguments")
                    .and_then(|a| a.as_str())
                    .unwrap_or("{}")
                    .to_string();
                let id = tc
                    .get("id")
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                Some(FunctionCallItem { id, name, arguments })
            })
            .collect();

        if items.len() == 1 {
            let item = items.into_iter().next().unwrap();
            return Some(ProviderResponse::FunctionCall {
                id: item.id,
                name: item.name,
                arguments: item.arguments,
            });
        } else if items.len() > 1 {
            return Some(ProviderResponse::MultiFunctionCall(items));
        }
    }

    // Legacy `function_call` field.
    if let Some(fc) = message.get("function_call").and_then(|v| v.as_object()) {
        let name = fc
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        let arguments = fc
            .get("arguments")
            .and_then(|v| v.as_str())
            .unwrap_or("{}")
            .to_string();
        return Some(ProviderResponse::FunctionCall {
            id: String::new(),
            name,
            arguments,
        });
    }

    None
}

// ---------------------------------------------------------------------------
// ProviderManager – retry / fallback wrapper
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// ProviderResponse – function-calling aware response
// ---------------------------------------------------------------------------

/// Token usage statistics returned by the API.
#[derive(Debug, Clone, Default)]
pub struct TokenUsage {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

/// A single function call within a multi-call response.
#[derive(Debug, Clone)]
pub struct FunctionCallItem {
    /// Tool call id (from the API).
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// Response from a model that may be a final text reply or a function call.
#[derive(Debug, Clone)]
pub enum ProviderResponse {
    /// Plain text reply from the model.
    Final(String),
    /// The model wants to invoke a single function.
    FunctionCall {
        /// Tool-call id assigned by the API.
        id: String,
        name: String,
        arguments: String,
    },
    /// The model wants to invoke multiple functions in parallel.
    MultiFunctionCall(Vec<FunctionCallItem>),
}

impl ProviderResponse {
    /// Attach usage data, returning a `(ProviderResponse, Option<TokenUsage>)` pair.
    pub fn with_usage(self, usage: Option<TokenUsage>) -> (ProviderResponse, Option<TokenUsage>) {
        (self, usage)
    }
}

// ---------------------------------------------------------------------------
// ProviderManager
// ---------------------------------------------------------------------------

/// Manages an ordered list of providers with per-provider retry and
/// automatic fallback to the next provider on exhaustion.
///
/// Implements [`ModelProvider`] itself so it can be used transparently
/// anywhere a single provider is expected.
pub struct ProviderManager {
    providers: Vec<Box<dyn ModelProvider>>,
    max_retries: usize,
    /// Whether the primary provider supports OpenAI-style function calling.
    pub supports_functions: bool,
}

impl ProviderManager {
    /// Create a new manager.
    ///
    /// * `providers` – ordered list (first = preferred).
    /// * `max_retries` – attempts per provider (clamped to ≥ 1).
    pub fn new(providers: Vec<Box<dyn ModelProvider>>, max_retries: usize) -> Self {
        Self {
            providers,
            max_retries: max_retries.max(1),
            supports_functions: false,
        }
    }

    /// Create a new manager with function-calling support flag.
    pub fn new_with_functions(
        providers: Vec<Box<dyn ModelProvider>>,
        max_retries: usize,
        supports_functions: bool,
    ) -> Self {
        Self {
            providers,
            max_retries: max_retries.max(1),
            supports_functions,
        }
    }

    /// Return a stream of content deltas from the primary provider.
    pub fn stream_chat<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        if let Some(primary) = self.providers.first() {
            primary.send_chat_stream(messages)
        } else {
            Box::pin(tokio_stream::once(Err(anyhow::anyhow!(
                "no providers configured"
            ))))
        }
    }

    /// Number of configured providers.
    pub fn provider_count(&self) -> usize {
        self.providers.len()
    }

    /// Try to generate embeddings using the first provider that supports them.
    pub async fn embed(&self, texts: &[&str]) -> Result<Option<Vec<Vec<f32>>>, anyhow::Error> {
        for provider in &self.providers {
            match provider.embed(texts).await {
                Ok(Some(vecs)) => return Ok(Some(vecs)),
                Ok(None) => continue,
                Err(e) => {
                    warn!(error = %e, "embed call failed, trying next provider");
                    continue;
                }
            }
        }
        Ok(None)
    }

    /// Send chat messages with an optional list of function definitions.
    ///
    /// When the primary provider supports functions, delegates to its
    /// trait-based [`ModelProvider::send_chat_with_functions`] method.
    /// Otherwise falls back to plain `send_chat` and wraps the reply
    /// in [`ProviderResponse::Final`].
    pub async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        if self.supports_functions && !functions.is_empty() {
            if let Some(primary) = self.providers.first() {
                return primary.send_chat_with_functions(messages, functions).await;
            }
        }
        // Fallback: plain send_chat
        let reply = self.send_chat(messages).await?;
        Ok((ProviderResponse::Final(reply), None))
    }

    /// Send chat messages with automatic retries and provider fallback.
    ///
    /// For each provider in order, retries up to `max_attempts` times
    /// with exponential backoff (100 ms × 2^attempt).  Falls through to
    /// the next provider when all attempts are exhausted.
    ///
    /// Permanent errors (401, 403, 404) skip remaining retries for that
    /// provider and immediately fall through to the next one.
    pub async fn send_chat_with_retry(
        &self,
        messages: &[ChatMessage],
        max_attempts: usize,
    ) -> Result<String, anyhow::Error> {
        let attempts = max_attempts.max(1);
        let mut last_err = anyhow::anyhow!("no providers configured");

        for (idx, provider) in self.providers.iter().enumerate() {
            for attempt in 0..attempts {
                match provider.send_chat(messages).await {
                    Ok(reply) => return Ok(reply),
                    Err(e) => {
                        let is_permanent = is_permanent_error(&e);
                        warn!(
                            provider_idx = idx,
                            attempt = attempt + 1,
                            max_attempts = attempts,
                            permanent = is_permanent,
                            error = %e,
                            "provider call failed"
                        );
                        last_err = e;

                        // Don't retry auth failures, bad requests, or not-found.
                        if is_permanent {
                            break;
                        }

                        if attempt + 1 < attempts {
                            let delay = Duration::from_millis(100 * 2u64.pow(attempt as u32));
                            tokio::time::sleep(delay).await;
                        }
                    }
                }
            }
            warn!(
                provider_idx = idx,
                "all retries exhausted, trying next provider"
            );
        }

        Err(last_err.context("all providers exhausted"))
    }
}

/// Check if an error represents a permanent HTTP failure that should not
/// be retried (auth errors, bad request, not found).
///
/// Parses status codes from error messages like "OpenAI API returned 401: …"
fn is_permanent_error(err: &anyhow::Error) -> bool {
    let msg = err.to_string();
    // Match patterns like "returned 401", "returned 403", "returned 404", "returned 400"
    for code in &["400", "401", "403", "404", "422"] {
        if msg.contains(&format!("returned {code}"))
            || msg.contains(&format!("status: {code}"))
            || msg.contains(&format!("{code} "))
                && (msg.contains("Unauthorized")
                    || msg.contains("Forbidden")
                    || msg.contains("Not Found")
                    || msg.contains("Bad Request"))
        {
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// Global ProviderManager accessor (for embedding from tools)
// ---------------------------------------------------------------------------

/// Global provider manager stashed at startup so tools (e.g. semantic memory)
/// can embed text without plumbing the manager through every call site.
pub static GLOBAL_PROVIDERS: std::sync::OnceLock<std::sync::Mutex<std::sync::Arc<ProviderManager>>> =
    std::sync::OnceLock::new();

/// Store the provider manager globally.
pub fn set_global_providers(pm: std::sync::Arc<ProviderManager>) {
    let _ = GLOBAL_PROVIDERS.set(std::sync::Mutex::new(pm));
}

#[async_trait]
impl ModelProvider for ProviderManager {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        self.send_chat_with_retry(messages, self.max_retries).await
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        // Delegate to the inherent method which handles
        // supports_functions gating and fallback logic.
        ProviderManager::send_chat_with_functions(self, messages, functions).await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.stream_chat(messages)
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

// ---------------------------------------------------------------------------
// Convenience helper
// ---------------------------------------------------------------------------

/// Send chat messages via the best available provider.
///
/// Selection order:
/// 1. **Copilot** — if `COPILOT_TOKEN` or `COPILOT_CLIENT_ID` is set.
/// 2. **OpenAI**  — if `OPENAI_API_KEY` is set.
/// 3. **Stub**    — echoes the last user message (development fallback).
pub async fn send_chat_messages(messages: &[ChatMessage]) -> anyhow::Result<String> {
    if std::env::var("COPILOT_TOKEN").is_ok() || std::env::var("COPILOT_CLIENT_ID").is_ok() {
        let provider = CopilotProvider::new();
        provider.send_chat(messages).await
    } else if std::env::var("OPENAI_API_KEY").is_ok() {
        let provider = OpenAIProvider::new();
        provider.send_chat(messages).await
    } else {
        warn!("No model credentials found — using local stub reply");
        // Stub: echo the last user message back.
        let last_user = messages
            .iter()
            .rev()
            .find(|m| m.role == "user")
            .map(|m| m.content.clone())
            .unwrap_or_default();
        Ok(format!("[stub] echo: {last_user}"))
    }
}

// ---------------------------------------------------------------------------
// Provider factory
// ---------------------------------------------------------------------------

/// Build a concrete provider based on a provider identifier and model string.
///
/// * If `provider_id` contains `"copilot"` → [`CopilotProvider`].
/// * If `provider_id` contains `"openai"` → [`OpenAIProvider`] when
///   `OPENAI_API_KEY` is set, otherwise [`FallbackProvider`].
/// * Anything else → [`FallbackProvider`] (auto-selects best available).
pub fn build_provider(provider_id: &str, model_id: &str) -> Box<dyn ModelProvider> {
    build_provider_with_config_fields(provider_id, model_id, None, None, None, None)
}

/// Build a provider with optional config fields.
pub fn build_provider_with_config_fields(
    provider_id: &str,
    model_id: &str,
    endpoint: Option<&str>,
    api_version: Option<&str>,
    embedding_deployment: Option<&str>,
    api_key: Option<&str>,
) -> Box<dyn ModelProvider> {
    if provider_id.contains("copilot") {
        Box::new(CopilotProvider::new())
    } else if matches!(provider_id, "azure-openai" | "azure_openai" | "azure") {
        let ep = endpoint
            .map(String::from)
            .or_else(|| std::env::var("AZURE_OPENAI_ENDPOINT").ok())
            .unwrap_or_else(|| {
                warn!("Azure provider requested but no endpoint configured — using fallback");
                String::new()
            });
        let key = std::env::var("AZURE_OPENAI_API_KEY")
            .unwrap_or_default();
        if ep.is_empty() || key.is_empty() {
            warn!("Azure provider missing endpoint or api_key — using fallback");
            return Box::new(FallbackProvider);
        }
        Box::new(AzureOpenAIProvider::new(
            ep,
            key,
            model_id.to_string(),
            api_version.map(String::from),
            embedding_deployment.map(String::from),
        ))
    } else if matches!(provider_id, "openai-compat" | "openai_compat" | "compat" | "openrouter" | "ollama" | "groq" | "together" | "fireworks" | "mistral" | "lmstudio" | "vllm" | "deepseek" | "xai") {
        // Generic OpenAI-compatible: requires endpoint in config.
        // NB: must come before the `contains("openai")` catch-all.
        let ep = endpoint
            .map(String::from)
            .unwrap_or_default();
        if ep.is_empty() {
            warn!("openai-compat provider requires an endpoint — using fallback");
            return Box::new(FallbackProvider);
        }
        // API key from config, then env var, then empty (local servers).
        let key = resolve_config_key(api_key, provider_id);
        Box::new(OpenAICompatProvider::new(ep, key, model_id.to_string()))
    } else if provider_id.contains("openai") {
        if let Ok(api_key) = std::env::var("OPENAI_API_KEY") {
            Box::new(OpenAIProvider::with_config(
                api_key,
                openai::DEFAULT_ENDPOINT.to_string(),
                model_id.to_string(),
            ))
        } else {
            warn!("provider \"openai\" requested but OPENAI_API_KEY not set — using fallback");
            Box::new(FallbackProvider)
        }
    } else {
        Box::new(FallbackProvider)
    }
}

/// Build a [`ProviderManager`] for an agent with the given provider and
/// model config.
///
/// Creates the primary provider via [`build_provider`] and appends a
/// [`FallbackProvider`] when the primary is a specific (non-fallback)
/// provider, so there is always a safety net.
pub fn build_provider_manager(provider_id: &str, model_id: &str) -> ProviderManager {
    let primary = build_provider(provider_id, model_id);
    let mut providers = vec![primary];

    // Add fallback if the primary is a specific provider.
    if !provider_id.is_empty() {
        providers.push(Box::new(FallbackProvider));
    }

    let supports_functions = provider_id.contains("openai") || provider_id.contains("copilot") || provider_id.contains("compat");
    ProviderManager::new_with_functions(providers, 3, supports_functions)
}

/// Build a [`ProviderManager`] for an agent using its config and the
/// top-level model definitions.  Chains primary + `fallback_models` in
/// order, with a final [`FallbackProvider`] safety net.
pub fn build_provider_manager_from_config(
    agent_cfg: &crate::config::AgentConfig,
    cfg: &crate::config::Config,
) -> ProviderManager {
    let mut providers: Vec<Box<dyn ModelProvider>> = Vec::new();
    let mut any_supports_functions = false;

    // Resolve primary model.
    let primary_ref = agent_cfg.model.as_deref().unwrap_or("");
    if let Some(mc) = cfg.models.iter().find(|m| m.id == primary_ref) {
        let model_name = mc.model.as_deref().unwrap_or(&mc.id);
        let p = build_provider_with_config_fields(
            &mc.provider,
            model_name,
            mc.endpoint.as_deref(),
            mc.api_version.as_deref(),
            mc.embedding_deployment.as_deref(),
            mc.api_key.as_deref(),
        );
        if mc.provider.contains("openai") || mc.provider.contains("copilot") || mc.provider.contains("azure") || mc.provider.contains("compat") {
            any_supports_functions = true;
        }
        providers.push(p);
    } else if !primary_ref.is_empty() {
        providers.push(build_provider("", primary_ref));
    }

    // Append fallback models in order.
    for fb_id in &agent_cfg.fallback_models {
        if let Some(mc) = cfg.models.iter().find(|m| &m.id == fb_id) {
            let model_name = mc.model.as_deref().unwrap_or(&mc.id);
            let p = build_provider_with_config_fields(
                &mc.provider,
                model_name,
                mc.endpoint.as_deref(),
                mc.api_version.as_deref(),
                mc.embedding_deployment.as_deref(),
                mc.api_key.as_deref(),
            );
            if mc.provider.contains("openai") || mc.provider.contains("copilot") || mc.provider.contains("azure") || mc.provider.contains("compat") {
                any_supports_functions = true;
            }
            providers.push(p);
        } else {
            warn!(model_ref = %fb_id, "fallback model not found in config, skipping");
        }
    }

    // Always add a final safety net.
    providers.push(Box::new(FallbackProvider));

    ProviderManager::new_with_functions(providers, 3, any_supports_functions)
}

/// Build a concrete provider based on a model identifier string (legacy helper).
///
/// Delegates to [`build_provider`] with an empty provider id so the
/// selection falls through to [`FallbackProvider`].
pub fn build_provider_for_model(model_id: &str) -> Box<dyn ModelProvider> {
    build_provider("", model_id)
}

/// A provider that delegates to the automatic [`send_chat_messages`] helper,
/// which picks the best available backend based on environment variables.
struct FallbackProvider;

/// Resolve an API key: config value → env var → empty string.
///
/// If the config value starts with `$`, it's treated as an env-var reference.
fn resolve_config_key(config_key: Option<&str>, provider_id: &str) -> String {
    if let Some(k) = config_key {
        if let Some(var) = k.strip_prefix('$') {
            return std::env::var(var).unwrap_or_default();
        }
        if !k.is_empty() {
            return k.to_string();
        }
    }
    // Fallback: try PROVIDER_API_KEY env var.
    let env_name = format!("{}_API_KEY", provider_id.to_uppercase().replace('-', "_"));
    std::env::var(env_name).unwrap_or_default()
}

#[async_trait]
impl ModelProvider for FallbackProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        send_chat_messages(messages).await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let reply = send_chat_messages(messages).await?;
            yield reply;
        })
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// Module initialization stub (called from main).
pub fn init() {
    tracing::debug!("models module loaded");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_config_key_plain_value() {
        assert_eq!(resolve_config_key(Some("my-secret"), "test"), "my-secret");
    }

    #[test]
    fn resolve_config_key_env_var_syntax() {
        std::env::set_var("TEST_RESOLVE_KEY_1", "from_env");
        assert_eq!(
            resolve_config_key(Some("$TEST_RESOLVE_KEY_1"), "test"),
            "from_env"
        );
        std::env::remove_var("TEST_RESOLVE_KEY_1");
    }

    #[test]
    fn resolve_config_key_fallback_env() {
        std::env::set_var("OLLAMA_API_KEY", "ollama_key");
        assert_eq!(resolve_config_key(None, "ollama"), "ollama_key");
        std::env::remove_var("OLLAMA_API_KEY");
    }

    #[test]
    fn resolve_config_key_missing_returns_empty() {
        // No config key, no env var → empty string.
        assert_eq!(
            resolve_config_key(None, "nonexistent_provider_xyz"),
            ""
        );
    }

    #[test]
    fn compat_provider_requires_endpoint() {
        // Without endpoint, should fall back to FallbackProvider.
        let p = build_provider_with_config_fields(
            "openai-compat",
            "test-model",
            None, None, None, None,
        );
        // FallbackProvider is the only non-specific provider.
        assert!(p.as_any().downcast_ref::<FallbackProvider>().is_some());
    }

    #[test]
    fn compat_provider_with_endpoint_creates_compat() {
        let p = build_provider_with_config_fields(
            "openai-compat",
            "llama3",
            Some("http://localhost:11434/v1/chat/completions"),
            None, None, None,
        );
        assert!(p.as_any().downcast_ref::<OpenAICompatProvider>().is_some());
    }

    #[test]
    fn compat_aliases_all_resolve() {
        let aliases = [
            "openai_compat", "compat", "openrouter", "ollama", "groq",
            "together", "fireworks", "mistral", "lmstudio", "vllm",
            "deepseek", "xai",
        ];
        for alias in aliases {
            let p = build_provider_with_config_fields(
                alias,
                "model",
                Some("http://localhost:8080/v1/chat/completions"),
                None, None, None,
            );
            assert!(
                p.as_any().downcast_ref::<OpenAICompatProvider>().is_some(),
                "alias '{}' should create OpenAICompatProvider",
                alias,
            );
        }
    }

    #[test]
    fn build_provider_manager_includes_fallback() {
        let pm = build_provider_manager("copilot", "gpt-4o");
        // Should have at least 2 providers (primary + fallback).
        assert!(pm.provider_count() >= 2);
    }
}
