//! GitHub Copilot provider via direct HTTP proxy.
//!
//! Routes chat through the Copilot API proxy using direct HTTP requests.
//! When no token is configured the provider returns a clearly-labelled
//! stub response so the rest of the system keeps working.

use std::sync::Arc;
use std::time::Duration;

use anyhow::Context as _;
use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::Mutex;
use tracing::{debug, trace, warn};

use super::{ChatMessage, ModelProvider, ProviderResponse};
use crate::auth::copilot_token;
use crate::auth::github_device;

/// Default Copilot API proxy base URL (used when the token exchange does
/// not return a specific endpoint).
const DEFAULT_COPILOT_API_BASE: &str = "https://api.githubcopilot.com";

// ---------------------------------------------------------------------------
// CopilotProvider
// ---------------------------------------------------------------------------

/// Provider that talks to GitHub Copilot through direct HTTP requests
/// to the Copilot API proxy.  Requires a valid GitHub token obtained
/// via device-flow auth or the `COPILOT_TOKEN` environment variable.
pub struct CopilotProvider {
    /// The GitHub access token (used for token exchange).
    token: Arc<Mutex<Option<String>>>,
    /// A cached Copilot session token obtained via token exchange.
    /// Wrapped in `Mutex` for interior mutability (token refresh).
    copilot_token: Arc<Mutex<Option<copilot_token::CopilotToken>>>,
    /// Optional header overrides from config.
    header_overrides: Option<std::collections::HashMap<String, String>>,
    /// Model identifier sent in the request body (e.g. "claude-sonnet-4").
    model_id: String,
    /// Reasoning effort level: "low", "medium", or "high".
    reasoning_effort: Option<String>,
    /// Cached model metadata from discovery (populated by `list_models`).
    discovered_models: Arc<Mutex<Option<DiscoveredModels>>>,
}

/// Cached model discovery results with a TTL.
struct DiscoveredModels {
    models: Vec<super::ModelInfo>,
    fetched_at: std::time::Instant,
}

impl DiscoveredModels {
    const TTL: Duration = Duration::from_secs(300); // 5 minutes

    fn is_stale(&self) -> bool {
        self.fetched_at.elapsed() > Self::TTL
    }
}

/// Which API path variant to use for a model on the Copilot proxy.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CopilotApiPath {
    /// Standard OpenAI `/chat/completions`
    ChatCompletions,
    /// OpenAI Responses API `/responses`
    Responses,
    /// Anthropic Messages API `/v1/messages`
    Messages,
}

impl Default for CopilotProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CopilotProvider {
    /// Create a new provider.
    ///
    /// Reads `COPILOT_TOKEN` from the environment.  When the variable
    /// is absent the provider attempts to load a stored GitHub token
    /// from keyring/file.  If neither is available it operates in stub
    /// mode.
    pub fn new() -> Self {
        Self::with_model_and_headers("gpt-4o", None)
    }

    pub fn new_with_headers(
        header_overrides: Option<std::collections::HashMap<String, String>>,
    ) -> Self {
        Self::with_model_and_headers("gpt-4o", header_overrides)
    }

    pub fn with_model_and_headers(
        model_id: &str,
        header_overrides: Option<std::collections::HashMap<String, String>>,
    ) -> Self {
        Self::with_model_headers_and_effort(model_id, header_overrides, None)
    }

    pub fn with_model_headers_and_effort(
        model_id: &str,
        header_overrides: Option<std::collections::HashMap<String, String>>,
        reasoning_effort: Option<String>,
    ) -> Self {
        // --- 1. Try to load a cached Copilot session token ----------------
        let cached_ct: Option<copilot_token::CopilotToken> =
            match copilot_token::retrieve_cached_copilot_token() {
                Ok(Some(ct)) if !ct.is_expired() => {
                    debug!("CopilotProvider: using cached Copilot session token");
                    Some(ct)
                }
                Ok(Some(_)) => {
                    debug!("CopilotProvider: cached Copilot token expired, ignoring");
                    None
                }
                Ok(None) => None,
                Err(e) => {
                    warn!("CopilotProvider: failed to load cached Copilot token: {e}");
                    None
                }
            };

        // --- 2. Resolve a GitHub access token ----------------------------
        let token =
            std::env::var("COPILOT_TOKEN")
                .ok()
                .or_else(|| match github_device::retrieve_token() {
                    Ok(Some(t)) => {
                        debug!("CopilotProvider: using stored token from keyring/file");
                        Some(t)
                    }
                    Ok(None) => None,
                    Err(e) => {
                        warn!("CopilotProvider: failed to retrieve stored token: {e}");
                        None
                    }
                });

        if cached_ct.is_some() {
            debug!("CopilotProvider: will use cached Copilot session token");
        } else if token.is_some() {
            debug!("CopilotProvider: GitHub token available for token exchange");
        } else {
            warn!("CopilotProvider: no COPILOT_TOKEN or stored token — stub mode");
        }

        let s = Self {
            token: Arc::new(Mutex::new(token)),
            copilot_token: Arc::new(Mutex::new(cached_ct)),
            header_overrides: header_overrides.clone(),
            model_id: model_id.to_string(),
            reasoning_effort,
            discovered_models: Arc::new(Mutex::new(None)),
        };

        debug!(
            model = %s.model_id,
            header_overrides = ?s.header_overrides,
            "CopilotProvider: constructed"
        );

        s
    }

    /// Ensure the cached Copilot session token is fresh, refreshing it
    /// from the GitHub access token when expired or missing (#5).
    ///
    /// Returns `(endpoint, bearer)` on success, or `None` if no valid
    /// token is available.
    async fn ensure_fresh_token(&self) -> Option<(String, String)> {
        let mut ct_guard = self.copilot_token.lock().await;

        let should_exchange = match &*ct_guard {
            None => true,
            Some(ct) => ct.is_expired(),
        };

        if should_exchange {
            if let Some(gh_token) = resolve_gh_token(&self.token).await {
                debug!("CopilotProvider: exchanging/refreshing Copilot session token…");
                match copilot_token::exchange_github_for_copilot_token(&gh_token).await {
                    Ok(new_ct) => {
                        let _ = copilot_token::cache_copilot_token(&new_ct);
                        debug!("CopilotProvider: token refresh succeeded");
                        *ct_guard = Some(new_ct);
                    }
                    Err(e) => {
                        warn!("CopilotProvider: token refresh failed: {e:#}");
                    }
                }
            }
        }

        if let Some(ref ct) = *ct_guard {
            if !ct.is_expired() {
                let ep = ct
                    .proxy_ep
                    .as_deref()
                    .filter(|s| !s.is_empty())
                    .unwrap_or(DEFAULT_COPILOT_API_BASE)
                    .to_string();
                return Some((ep, ct.token.clone()));
            }
        }

        None
    }

    /// Build a provider for testing with a pre-injected Copilot session
    /// token pointing at a custom proxy endpoint (e.g. a wiremock server).
    #[doc(hidden)]
    pub fn with_test_token(proxy_url: &str, bearer: &str) -> Self {
        let ct = copilot_token::CopilotToken {
            token: bearer.to_string(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::seconds(3600)),
            proxy_ep: Some(proxy_url.to_string()),
        };
        Self {
            token: Arc::new(Mutex::new(Some("test-gh-token".to_string()))),
            copilot_token: Arc::new(Mutex::new(Some(ct))),
            header_overrides: None,
            model_id: "gpt-4o".to_string(),
            reasoning_effort: None,
            discovered_models: Arc::new(Mutex::new(None)),
        }
    }

    /// Inherent method for sending chat with functions, used by the trait
    /// implementation to avoid async recursion and provide a direct path
    /// for the provider manager.
    pub async fn send_chat_with_functions_inner(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<super::TokenUsage>), anyhow::Error> {
        // -----------------------------------------------------------------
        // Proxy HTTP with tools — 3-way dispatch based on model capabilities
        // -----------------------------------------------------------------
        if let Some((ep, bearer)) = self.ensure_fresh_token().await {
            let api_path = self.resolve_api_path().await;
            debug!(model = %self.model_id, ?api_path, "CopilotProvider: routing function-call request");

            let result = match api_path {
                CopilotApiPath::Messages => {
                    self.try_anthropic_http_with_tools(&ep, &bearer, messages, functions)
                        .await
                }
                CopilotApiPath::Responses => {
                    self.try_responses_api_with_tools(&ep, &bearer, messages, functions)
                        .await
                }
                CopilotApiPath::ChatCompletions => {
                    self.try_proxy_http_with_tools(&ep, &bearer, messages, functions)
                        .await
                }
            };
            match result {
                Ok((resp, usage)) => return Ok((resp, usage)),
                Err(e) => {
                    warn!("CopilotProvider: proxy (fn-call) failed ({e:#})");
                }
            }
        }

        // No valid token available
        Err(crate::auth::AuthError {
            provider: "GitHub Copilot".into(),
            hint: "your token may have expired or is invalid — run `/gh-login` to re-authorise"
                .into(),
        }
        .into())
    }

    /// Attempt a direct HTTP POST to the Copilot proxy endpoint.
    ///
    /// Tries several likely sub-paths (configurable via
    /// `COPILOT_PROXY_ENDPOINTS`) in order and returns the first
    /// successful assistant text.  Each endpoint is retried up to 2
    /// times for transient errors (5xx / connection failures) with
    /// exponential backoff.  Returns `Err` only when **all** endpoints
    /// fail.
    async fn try_proxy_http(
        &self,
        proxy_ep: &str,
        bearer: &str,
        messages: &[ChatMessage],
    ) -> anyhow::Result<String> {
        let http = super::get_shared_http_client();

        let body = json!({
            "model": &self.model_id,
            "messages": super::serialize_messages(messages),
        });

        let headers = copilot_headers(bearer, self.header_overrides.as_ref());
        let paths = proxy_paths();
        let base = proxy_ep.trim_end_matches('/');
        let mut last_err: Option<String> = None;

        for path in &paths {
            let url = format!("{base}{path}");
            debug!(model = %self.model_id, "CopilotProvider: trying proxy endpoint {url}");

            match post_with_retry(&http, &url, &headers, &body).await {
                Ok(json_val) => {
                    if let Some(text) = extract_assistant_text(&json_val) {
                        debug!("CopilotProvider: got reply via {url}");
                        return Ok(text);
                    }
                    warn!(url = %url, body = %json_val, "copilot proxy returned 200 but no assistant text found");
                    last_err = Some(format!("{url}: no assistant text found in response"));
                }
                Err(msg) => {
                    last_err = msg;
                }
            }
        }

        anyhow::bail!(
            "all proxy endpoints failed: {}",
            last_err.unwrap_or_else(|| "unknown".into())
        );
    }

    /// Like [`try_proxy_http`] but includes `tools` and `tool_choice` in
    /// the request body for function-calling support.
    ///
    /// Accepts `functions` in either bare format (`{name, description,
    /// parameters}`) as produced by the agent runtime, or already-wrapped
    /// OpenAI tools format (`{type: "function", function: {...}}`).
    /// Normalises both into the Copilot proxy `tools` schema.
    async fn try_proxy_http_with_tools(
        &self,
        proxy_ep: &str,
        bearer: &str,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> anyhow::Result<(ProviderResponse, Option<super::TokenUsage>)> {
        let http = super::get_shared_http_client();

        let mut body = json!({
            "model": &self.model_id,
            "messages": super::serialize_messages(messages),
        });

        // Inject reasoning effort for OpenAI models (o-series).
        if let Some(ref effort) = self.reasoning_effort {
            body["reasoning"] = json!({"effort": effort});
        }

        if !functions.is_empty() {
            // Convert each function definition into the Copilot proxy
            // tools schema: {"type": "function", "function": {"name": ..,
            // "description": .., "parameters": ..}}.
            let copilot_tools: Vec<serde_json::Value> = functions
                .iter()
                .filter_map(|f| {
                    // Detect whether already wrapped or bare.
                    let func_obj = if f.get("type").and_then(|t| t.as_str()) == Some("function")
                        && f.get("function").is_some()
                    {
                        // Already in tools format — extract the inner function object.
                        f.get("function").unwrap().clone()
                    } else {
                        // Bare format: {"name": .., "description": .., "parameters": ..}
                        f.clone()
                    };

                    let name = func_obj
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or_default();
                    if name.is_empty() {
                        warn!("copilot: skipping function with empty name: {func_obj}");
                        return None;
                    }

                    Some(json!({
                        "type": "function",
                        "function": {
                            "name": name,
                            "description": func_obj.get("description")
                                .and_then(|d| d.as_str())
                                .unwrap_or(""),
                            "parameters": func_obj.get("parameters")
                                .cloned()
                                .unwrap_or_else(|| json!({"type": "object"})),
                        }
                    }))
                })
                .collect();

            debug!(tools = ?copilot_tools, "copilot: sending tools payload to proxy");

            if !copilot_tools.is_empty() {
                body["tools"] = serde_json::Value::Array(copilot_tools);
                body["tool_choice"] = json!("auto");
            }
        }

        let headers = copilot_headers(bearer, self.header_overrides.as_ref());
        let paths = proxy_paths();
        let base = proxy_ep.trim_end_matches('/');
        let mut last_err: Option<String> = None;

        for path in &paths {
            let url = format!("{base}{path}");
            debug!("CopilotProvider: trying proxy endpoint (with tools) {url}");

            match post_with_retry(&http, &url, &headers, &body).await {
                Ok(json_val) => {
                    let usage = super::parse_token_usage(&json_val);

                    // Check for tool_calls first (native function-calling).
                    if let Some(fc) = extract_tool_call(&json_val) {
                        debug!("CopilotProvider: got tool_call via {url}");
                        return Ok((fc, usage));
                    }

                    if let Some(text) = extract_assistant_text(&json_val) {
                        debug!("CopilotProvider: got reply via {url} (with tools)");
                        return Ok((ProviderResponse::Final(text), usage));
                    }

                    warn!(url = %url, body = %json_val, "copilot proxy returned 200 but no assistant text found");
                    last_err = Some(format!("{url}: no assistant text found in response"));
                }
                Err(msg) => {
                    last_err = msg;
                }
            }
        }

        anyhow::bail!(
            "all proxy endpoints failed (with tools): {}",
            last_err.unwrap_or_else(|| "unknown".into())
        );
    }

    // -- Anthropic Messages API paths (Claude models) ---------------------

    /// POST to `/v1/messages` with Anthropic Messages format, parse SSE.
    async fn try_anthropic_http(
        &self,
        proxy_ep: &str,
        bearer: &str,
        messages: &[ChatMessage],
    ) -> anyhow::Result<String> {
        let (resp, _usage) = self
            .try_anthropic_http_with_tools(proxy_ep, bearer, messages, &[])
            .await?;
        match resp {
            super::ProviderResponse::Final(text) => Ok(text),
            other => Ok(format!("{other:?}")),
        }
    }

    /// POST to `/v1/messages` with tools, parse SSE, return
    /// `(ProviderResponse, Option<TokenUsage>)`.
    async fn try_anthropic_http_with_tools(
        &self,
        proxy_ep: &str,
        bearer: &str,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> anyhow::Result<(super::ProviderResponse, Option<super::TokenUsage>)> {
        let http = super::get_shared_http_client();
        let base = proxy_ep.trim_end_matches('/');
        let url = format!("{base}/v1/messages");

        let (system, api_msgs) = serialize_anthropic_messages(messages);
        let mut body = json!({
            "model": &self.model_id,
            "messages": api_msgs,
            "max_tokens": 16384,
            "stream": true,
        });
        if let Some(sys) = &system {
            body["system"] = json!(sys);
        }

        // Inject extended thinking based on reasoning_effort.
        if let Some(ref effort) = self.reasoning_effort {
            if self.model_id.contains("claude-opus-4") {
                // Opus uses adaptive thinking with effort level.
                body["thinking"] = json!({
                    "type": "adaptive",
                });
            } else {
                // Other Claude models use enabled + budget_tokens.
                // budget_tokens MUST be < max_tokens (Anthropic validation requirement).
                let budget: u32 = match effort.as_str() {
                    "low" => 1024,
                    "medium" => 8192,
                    "high" => 12288,
                    _ => 8192,
                };
                body["thinking"] = json!({
                    "type": "enabled",
                    "budget_tokens": budget,
                });
            }
        }

        if !functions.is_empty() {
            let tools: Vec<Value> = functions.iter().filter_map(to_anthropic_tool).collect();
            if !tools.is_empty() {
                body["tools"] = Value::Array(tools);
                body["tool_choice"] = json!({"type": "auto"});
            }
        }

        let mut headers = copilot_headers(bearer, self.header_overrides.as_ref());
        // Anthropic-specific headers for the Copilot proxy.
        headers.insert(
            "anthropic-beta",
            "interleaved-thinking-2025-05-14".parse().unwrap(),
        );

        let tool_count = body
            .get("tools")
            .and_then(|t| t.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        debug!(model = %self.model_id, url = %url, body = %body, "CopilotProvider: trying Anthropic Messages endpoint");
        debug!(
            model = %self.model_id,
            url = %url,
            msg_count = api_msgs.len(),
            has_system = system.is_some(),
            tool_count,
            "Anthropic: sending request"
        );

        let resp = http
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .context("Anthropic proxy request failed")?;

        let status = resp.status();
        if !status.is_success() {
            let body_text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Anthropic proxy HTTP {status}: {body_text}");
        }

        let parsed = parse_anthropic_sse(resp).await?;
        debug!(
            text_len = parsed.text.len(),
            tool_uses = parsed.tool_uses.len(),
            input_tokens = parsed.input_tokens,
            output_tokens = parsed.output_tokens,
            model = %parsed.model,
            "Anthropic: SSE parse result"
        );
        Ok(anthropic_result_to_response(parsed))
    }

    // -- OpenAI Responses API path (/responses) ---------------------------

    /// POST to `{base}/responses` with the OpenAI Responses API format.
    ///
    /// Converts messages to the responses format: system message goes to
    /// `instructions`, user/assistant messages go to `input` array.
    /// Parses the response `output` array for `function_call` items (tool
    /// calls) or `message` items (text).
    async fn try_responses_api_with_tools(
        &self,
        proxy_ep: &str,
        bearer: &str,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> anyhow::Result<(super::ProviderResponse, Option<super::TokenUsage>)> {
        let http = super::get_shared_http_client();
        let base = proxy_ep.trim_end_matches('/');
        let url = format!("{base}/responses");

        // Split system messages into `instructions`, the rest into `input`.
        let mut instructions_parts: Vec<String> = Vec::new();
        let mut input: Vec<Value> = Vec::new();

        for m in messages {
            if m.is_system() {
                instructions_parts.push(m.content.clone());
                continue;
            }
            // Tool result messages: convert to responses API format.
            if m.is_tool() {
                if let Some(ref tcid) = m.tool_call_id {
                    input.push(json!({
                        "type": "function_call_output",
                        "call_id": tcid,
                        "output": m.content,
                    }));
                } else {
                    input.push(json!({"role": "user", "content": m.content}));
                }
                continue;
            }
            // Assistant with tool_calls: emit function_call items.
            if m.is_assistant() && m.tool_calls.is_some() {
                if !m.content.is_empty() {
                    input.push(json!({"role": "assistant", "content": m.content}));
                }
                if let Some(ref tcs) = m.tool_calls {
                    for tc in tcs {
                        let func = tc.get("function").unwrap_or(tc);
                        let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("");
                        let call_id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("");
                        let arguments = func
                            .get("arguments")
                            .and_then(|a| a.as_str())
                            .unwrap_or("{}");
                        input.push(json!({
                            "type": "function_call",
                            "call_id": call_id,
                            "name": name,
                            "arguments": arguments,
                        }));
                    }
                }
                continue;
            }
            // Regular user / assistant messages.
            input.push(json!({"role": &m.role, "content": m.content}));
        }

        let mut body = json!({
            "model": &self.model_id,
            "input": input,
            "stream": false,
        });

        if !instructions_parts.is_empty() {
            body["instructions"] = json!(instructions_parts.join("\n\n"));
        }

        // Inject reasoning effort for OpenAI models (o-series).
        if let Some(ref effort) = self.reasoning_effort {
            body["reasoning"] = json!({"effort": effort});
        }

        if !functions.is_empty() {
            let tools: Vec<Value> = functions
                .iter()
                .filter_map(|f| {
                    let func_obj = if f.get("type").and_then(|t| t.as_str()) == Some("function")
                        && f.get("function").is_some()
                    {
                        f.get("function").unwrap().clone()
                    } else {
                        f.clone()
                    };

                    let name = func_obj
                        .get("name")
                        .and_then(|n| n.as_str())
                        .unwrap_or_default();
                    if name.is_empty() {
                        warn!("copilot/responses: skipping function with empty name: {func_obj}");
                        return None;
                    }

                    Some(json!({
                        "type": "function",
                        "function": {
                            "name": name,
                            "description": func_obj.get("description")
                                .and_then(|d| d.as_str())
                                .unwrap_or(""),
                            "parameters": func_obj.get("parameters")
                                .cloned()
                                .unwrap_or_else(|| json!({"type": "object"})),
                        }
                    }))
                })
                .collect();

            if !tools.is_empty() {
                body["tools"] = Value::Array(tools);
                body["tool_choice"] = json!("auto");
            }
        }

        let headers = copilot_headers(bearer, self.header_overrides.as_ref());

        debug!(
            model = %self.model_id,
            url = %url,
            "CopilotProvider: trying Responses API endpoint"
        );

        match post_with_retry(&http, &url, &headers, &body).await {
            Ok(json_val) => {
                let usage = parse_responses_usage(&json_val);

                // Look for function_call items in the output array.
                if let Some(output) = json_val.get("output").and_then(|o| o.as_array()) {
                    let mut func_calls: Vec<super::FunctionCallItem> = Vec::new();
                    let mut text_parts: Vec<String> = Vec::new();

                    for item in output {
                        let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match item_type {
                            "function_call" => {
                                let name = item
                                    .get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                let arguments = item
                                    .get("arguments")
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("{}")
                                    .to_string();
                                let call_id = item
                                    .get("call_id")
                                    .and_then(|i| i.as_str())
                                    .unwrap_or("")
                                    .to_string();
                                func_calls.push(super::FunctionCallItem {
                                    id: call_id,
                                    name,
                                    arguments,
                                });
                            }
                            "message" => {
                                // Extract text from content array.
                                if let Some(content) =
                                    item.get("content").and_then(|c| c.as_array())
                                {
                                    for part in content {
                                        let ptype =
                                            part.get("type").and_then(|t| t.as_str()).unwrap_or("");
                                        if ptype == "output_text" {
                                            if let Some(text) =
                                                part.get("text").and_then(|t| t.as_str())
                                            {
                                                text_parts.push(text.to_string());
                                            }
                                        }
                                    }
                                }
                            }
                            _ => {
                                debug!(
                                    item_type,
                                    "CopilotProvider/responses: ignoring unknown output item type"
                                );
                            }
                        }
                    }

                    // Prefer function calls over text.
                    if !func_calls.is_empty() {
                        if func_calls.len() == 1 {
                            let fc = func_calls.into_iter().next().unwrap();
                            debug!(name = %fc.name, "CopilotProvider/responses: got function_call");
                            return Ok((
                                super::ProviderResponse::FunctionCall {
                                    id: fc.id,
                                    name: fc.name,
                                    arguments: fc.arguments,
                                },
                                usage,
                            ));
                        }
                        debug!(
                            count = func_calls.len(),
                            "CopilotProvider/responses: got multi function_call"
                        );
                        return Ok((
                            super::ProviderResponse::MultiFunctionCall(func_calls),
                            usage,
                        ));
                    }

                    if !text_parts.is_empty() {
                        let text = text_parts.join("");
                        debug!(
                            text_len = text.len(),
                            "CopilotProvider/responses: got text reply"
                        );
                        return Ok((super::ProviderResponse::Final(text), usage));
                    }
                }

                // Fallback: check for top-level output_text field.
                if let Some(text) = json_val.get("output_text").and_then(|t| t.as_str()) {
                    let text = text.trim();
                    if !text.is_empty() {
                        return Ok((super::ProviderResponse::Final(text.to_string()), usage));
                    }
                }

                anyhow::bail!(
                    "Responses API returned 200 but no usable output: {}",
                    serde_json::to_string(&json_val).unwrap_or_default()
                );
            }
            Err(msg) => {
                anyhow::bail!(
                    "Responses API failed: {}",
                    msg.unwrap_or_else(|| "unknown".into())
                );
            }
        }
    }

    // ------------------------------------------------------------------
    // Model discovery
    // ------------------------------------------------------------------

    /// Fetch the list of available models from the Copilot proxy
    /// `GET /models` endpoint and return them as `ModelInfo` entries.
    async fn fetch_models_from_api(&self) -> anyhow::Result<Vec<super::ModelInfo>> {
        let (ep, bearer) = self
            .ensure_fresh_token()
            .await
            .context("no valid Copilot token for model discovery")?;

        let http = super::get_shared_http_client();
        let base = ep.trim_end_matches('/');
        let url = format!("{base}/models");

        debug!("CopilotProvider: fetching model list from {url}");

        let headers = copilot_headers(&bearer, self.header_overrides.as_ref());
        let mut req = http.get(&url);
        for (k, v) in &headers {
            if let Ok(v_str) = v.to_str() {
                req = req.header(k.as_str(), v_str);
            }
        }

        let resp = req.send().await.context("model list request failed")?;
        let status = resp.status();
        if !status.is_success() {
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("GET /models returned {status}: {body}");
        }

        let payload: Value = resp.json().await.context("model list JSON parse error")?;

        // Copilot returns `{ "data": [ { "id": "..", "name": "..",
        // "capabilities": { "type": "chat"|"embeddings", "family": .. },
        // ... } ] }`.
        let data = payload
            .get("data")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let models: Vec<super::ModelInfo> = data
            .iter()
            .filter_map(|m| {
                let id = m.get("id")?.as_str()?.to_string();
                let name = m
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or(id.as_str())
                    .to_string();
                let vendor = m
                    .get("vendor")
                    .and_then(|v| v.as_str())
                    .map(|s| s.to_string());

                // Collect supported endpoints from capabilities/limits.
                let mut endpoints = Vec::new();
                if let Some(caps) = m.get("capabilities") {
                    if caps.get("type").and_then(|v| v.as_str()) == Some("chat") {
                        endpoints.push("chat".to_string());
                    }
                }
                // The proxy also surfaces `supported_api_types` in newer payloads.
                if let Some(api_types) = m.get("supported_api_types").and_then(|v| v.as_array()) {
                    for t in api_types {
                        if let Some(s) = t.as_str() {
                            if !endpoints.contains(&s.to_string()) {
                                endpoints.push(s.to_string());
                            }
                        }
                    }
                }

                let is_default = m
                    .get("is_default")
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                Some(super::ModelInfo {
                    id,
                    name,
                    vendor,
                    supported_endpoints: endpoints,
                    is_default,
                })
            })
            .collect();

        debug!(count = models.len(), "CopilotProvider: discovered models");
        Ok(models)
    }

    /// Decide which API path to use for the current `model_id`.
    ///
    /// 1. If we have discovery data and the model declares
    ///    `supported_endpoints`, pick the best match.
    /// 2. Otherwise fall back to `is_anthropic_model()` heuristic.
    async fn resolve_api_path(&self) -> CopilotApiPath {
        let guard = self.discovered_models.lock().await;
        if let Some(ref cached) = *guard {
            if let Some(info) = cached.models.iter().find(|m| m.id == self.model_id) {
                let eps = &info.supported_endpoints;
                // Prefer /responses when available, then /v1/messages, then /chat/completions.
                if eps.iter().any(|e| e == "responses") {
                    return CopilotApiPath::Responses;
                }
                if eps.iter().any(|e| e == "messages") {
                    return CopilotApiPath::Messages;
                }
                return CopilotApiPath::ChatCompletions;
            }
        }
        drop(guard);

        // Fallback heuristic
        if is_anthropic_model(&self.model_id) {
            CopilotApiPath::Messages
        } else {
            CopilotApiPath::ChatCompletions
        }
    }
}

// ---------------------------------------------------------------------------
// Token resolution helper
// ---------------------------------------------------------------------------

/// Attempt to resolve a GitHub token from the `Arc<Mutex>` field,
/// lazy-loading from persistent storage if not yet present.
async fn resolve_gh_token(token: &Mutex<Option<String>>) -> Option<String> {
    let mut guard = token.lock().await;
    if let Some(ref t) = *guard {
        return Some(t.clone());
    }
    // Lazy-load from keyring/file.
    match github_device::retrieve_token() {
        Ok(Some(t)) => {
            *guard = Some(t.clone());
            Some(t)
        }
        _ => None,
    }
}

#[async_trait]
impl ModelProvider for CopilotProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> anyhow::Result<String> {
        // -----------------------------------------------------------------
        // Direct HTTP proxy
        // -----------------------------------------------------------------
        if let Some((ep, bearer)) = self.ensure_fresh_token().await {
            let result = if is_anthropic_model(&self.model_id) {
                self.try_anthropic_http(&ep, &bearer, messages).await
            } else {
                self.try_proxy_http(&ep, &bearer, messages).await
            };
            match result {
                Ok(text) => return Ok(text),
                Err(e) => {
                    warn!("CopilotProvider: proxy failed ({e:#})");
                }
            }
        }

        // No valid token available
        Err(crate::auth::AuthError {
            provider: "GitHub Copilot".into(),
            hint: "your token may have expired or is invalid — run `/gh-login` to re-authorise"
                .into(),
        }
        .into())
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<super::TokenUsage>), anyhow::Error> {
        self.send_chat_with_functions_inner(messages, functions)
            .await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> std::pin::Pin<
        Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>,
    > {
        Box::pin(async_stream::try_stream! {
            if let Some((ep, bearer)) = self.ensure_fresh_token().await {
                let api_path = self.resolve_api_path().await;
                debug!(model = %self.model_id, ?api_path, "CopilotProvider: routing stream request");
                use tokio_stream::StreamExt as _;

                match api_path {
                    CopilotApiPath::Messages => {
                        // Anthropic path — use existing SSE streaming via try_anthropic_http
                        let reply = self.try_anthropic_http(&ep, &bearer, messages).await?;
                        yield reply;
                    }
                    CopilotApiPath::Responses => {
                        // OpenAI Responses API — SSE streaming
                        let http = super::get_shared_http_client();
                        let base = ep.trim_end_matches('/');
                        let url = format!("{base}/responses");

                        // Build input from messages (system → instructions, rest → input).
                        let mut instructions_parts = Vec::<String>::new();
                        let mut input = Vec::<serde_json::Value>::new();
                        for m in messages {
                            if m.is_system() {
                                instructions_parts.push(m.content.clone());
                            } else {
                                input.push(serde_json::json!({"role": &m.role, "content": m.content}));
                            }
                        }

                        let mut body = serde_json::json!({
                            "model": &self.model_id,
                            "input": input,
                            "stream": true,
                        });
                        if !instructions_parts.is_empty() {
                            body["instructions"] = serde_json::json!(instructions_parts.join("\n\n"));
                        }

                        let headers = copilot_headers(&bearer, self.header_overrides.as_ref());
                        let resp = http.post(&url).headers(headers).json(&body).send().await?;
                        if !resp.status().is_success() {
                            let status = resp.status();
                            let text = resp.text().await.unwrap_or_default();
                            Err(anyhow::anyhow!("Copilot /responses streaming returned {status}: {text}"))?;
                            return;
                        }

                        // Parse SSE events for response.output_text.delta
                        let mut delta_stream = stream_responses_sse_deltas(resp);
                        while let Some(chunk) = delta_stream.next().await {
                            yield chunk?;
                        }
                    }
                    CopilotApiPath::ChatCompletions => {
                        // OpenAI /chat/completions path — real SSE streaming
                        let http = super::get_shared_http_client();
                        let body = serde_json::json!({
                            "model": &self.model_id,
                            "messages": super::serialize_messages(messages),
                            "stream": true,
                        });
                        let headers = copilot_headers(&bearer, self.header_overrides.as_ref());
                        let base = ep.trim_end_matches('/');
                        let url = format!("{base}/chat/completions");
                        let resp = http.post(&url).headers(headers).json(&body).send().await?;
                        if !resp.status().is_success() {
                            let status = resp.status();
                            let text = resp.text().await.unwrap_or_default();
                            Err(anyhow::anyhow!("Copilot streaming returned {status}: {text}"))?;
                            return;
                        }
                        let mut delta_stream = super::stream_sse_deltas(resp);
                        while let Some(chunk) = delta_stream.next().await {
                            yield chunk?;
                        }
                    }
                }
            } else {
                Err(crate::auth::AuthError {
                    provider: "GitHub Copilot".into(),
                    hint: "your token may have expired or is invalid — run `/gh-login` to re-authorise".into(),
                })?;
            }
        })
    }

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        // Return cached if fresh.
        {
            let guard = self.discovered_models.lock().await;
            if let Some(ref cached) = *guard {
                if !cached.is_stale() {
                    return Ok(Some(cached.models.clone()));
                }
            }
        }

        // Fetch from API.
        let models = self.fetch_models_from_api().await?;

        // Cache the result.
        {
            let mut guard = self.discovered_models.lock().await;
            *guard = Some(DiscoveredModels {
                models: models.clone(),
                fetched_at: std::time::Instant::now(),
            });
        }

        Ok(Some(models))
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

// ---------------------------------------------------------------------------
// Proxy configuration helpers
// ---------------------------------------------------------------------------

/// Return the list of proxy path suffixes to try.
///
/// Reads `COPILOT_PROXY_ENDPOINTS` (comma-separated) at call time.
/// Falls back to the built-in list when the variable is absent or empty.
fn proxy_paths() -> Vec<String> {
    if let Ok(val) = std::env::var("COPILOT_PROXY_ENDPOINTS") {
        let paths: Vec<String> = val
            .split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect();
        if !paths.is_empty() {
            return paths;
        }
    }
    vec!["/chat/completions".to_string()]
}

/// Whether a [`reqwest::Error`] is transient and worth retrying.
fn is_retryable_request_error(e: &reqwest::Error) -> bool {
    e.is_timeout()
        || e.is_connect()
        || e.is_request()
        || e.status() == Some(reqwest::StatusCode::TOO_MANY_REQUESTS)
}

/// Standard Copilot proxy headers, with optional overrides merged on top.
fn copilot_headers(
    bearer: &str,
    overrides: Option<&std::collections::HashMap<String, String>>,
) -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    h.insert("Authorization", format!("Bearer {bearer}").parse().unwrap());
    h.insert("Content-Type", "application/json".parse().unwrap());

    // Minimal headers — Editor-Version is required by the Copilot proxy
    // for IDE auth. Copilot-Integration-Id is intentionally omitted
    // (unknown values cause 400 "unknown Copilot-Integration-Id" errors,
    // and OpenCode doesn't send it at all).
    let version = env!("CARGO_PKG_VERSION");
    h.insert("User-Agent", format!("Pinchy/{version}").parse().unwrap());
    h.insert("Editor-Version", "vscode/1.99.0".parse().unwrap());
    h.insert("Editor-Plugin-Version", "copilot/1.300.0".parse().unwrap());
    h.insert("Copilot-Integration-Id", "vscode-chat".parse().unwrap());
    h.insert("Openai-Intent", "conversation-edits".parse().unwrap());

    if let Some(overrides) = overrides {
        debug!(overrides = ?overrides, "copilot_headers: applying header overrides");
        for (key, value) in overrides {
            if let (Ok(name), Ok(val)) = (
                reqwest::header::HeaderName::from_bytes(key.as_bytes()),
                reqwest::header::HeaderValue::from_str(value),
            ) {
                h.insert(name, val);
            } else {
                warn!(header = %key, "copilot: skipping invalid header override");
            }
        }
    } else {
        debug!("copilot_headers: no header overrides configured");
    }

    h
}

/// Parse the `Retry-After` header from an HTTP response.
///
/// Supports the header as an integer (seconds) which is what GitHub's API returns.
/// Returns `None` if the header is absent or unparseable.
fn parse_retry_after(resp: &reqwest::Response) -> Option<Duration> {
    let val = resp
        .headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?;
    let secs: u64 = val.trim().parse().ok()?;
    Some(Duration::from_secs(secs))
}

/// POST a JSON body to `url` with retry logic for transient errors.
///
/// Retries up to `MAX_RETRIES` times on transport errors and 5xx
/// responses with exponential backoff capped at 30 s (#4).
/// On 429 (Too Many Requests), honours the `Retry-After` header if present.
async fn post_with_retry(
    client: &reqwest::Client,
    url: &str,
    headers: &reqwest::header::HeaderMap,
    body: &serde_json::Value,
) -> Result<Value, Option<String>> {
    const MAX_RETRIES: u32 = 4;
    const MAX_DELAY: Duration = Duration::from_secs(30);
    let mut attempt: u32 = 0;

    loop {
        let resp = client
            .post(url)
            .headers(headers.clone())
            .json(body)
            .send()
            .await;

        let resp = match resp {
            Ok(r) => r,
            Err(e) => {
                let msg = format!("{url}: request error: {e}");
                warn!("CopilotProvider: {msg}");
                if attempt < MAX_RETRIES && is_retryable_request_error(&e) {
                    attempt += 1;
                    let delay = Duration::from_millis(1000 * 2u64.pow(attempt - 1)).min(MAX_DELAY);
                    warn!("CopilotProvider: retrying {url} (attempt {attempt}/{MAX_RETRIES}) after {delay:?}");
                    tokio::time::sleep(delay).await;
                    continue;
                }
                return Err(Some(msg));
            }
        };

        let status = resp.status();

        if status.is_success() {
            let json_val: Value = match resp.json().await {
                Ok(v) => v,
                Err(e) => {
                    return Err(Some(format!("{url}: JSON parse error: {e}")));
                }
            };
            return Ok(json_val);
        }

        // Extract Retry-After before consuming the body
        let retry_after = parse_retry_after(&resp);

        let resp_body = resp.text().await.unwrap_or_default();
        warn!("CopilotProvider: {url} returned HTTP {status}; body: {resp_body}");

        if (status.is_server_error() || status == reqwest::StatusCode::TOO_MANY_REQUESTS)
            && attempt < MAX_RETRIES
        {
            attempt += 1;
            let delay = if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
                // Prefer Retry-After header (seconds) from the API, fall back to exp backoff
                retry_after
                    .unwrap_or_else(|| Duration::from_millis(1000 * 2u64.pow(attempt - 1)))
                    .min(MAX_DELAY)
            } else {
                Duration::from_millis(1000 * 2u64.pow(attempt - 1)).min(MAX_DELAY)
            };
            warn!(
                "CopilotProvider: retrying {url} (attempt {attempt}/{MAX_RETRIES}) after {delay:?}"
            );
            tokio::time::sleep(delay).await;
            continue;
        }

        return Err(Some(format!("{url}: HTTP {status}: {resp_body}")));
    }
}

/// Extract the assistant message text from an OpenAI-compatible response JSON.
///
/// Tries several common shapes: OpenAI chat completions, completions,
/// `output_text`, and `result`.
fn extract_assistant_text(v: &Value) -> Option<String> {
    // choices[0].message.content  (OpenAI chat completions)
    if let Some(s) = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("content"))
        .and_then(|c| c.as_str())
    {
        let s = s.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    // choices[0].message.reasoning_text  (Gemini / reasoning models with
    // content: null but reasoning_text populated)
    if let Some(s) = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("message"))
        .and_then(|m| m.get("reasoning_text"))
        .and_then(|c| c.as_str())
    {
        let s = s.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    // choices[0].text  (OpenAI completions)
    if let Some(s) = v
        .get("choices")
        .and_then(|c| c.get(0))
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str())
    {
        let s = s.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    // output_text
    if let Some(s) = v.get("output_text").and_then(|t| t.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    // result
    if let Some(s) = v.get("result").and_then(|t| t.as_str()) {
        let s = s.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }
    None
}

/// Extract a tool call from an OpenAI-compatible response JSON.
fn extract_tool_call(json: &Value) -> Option<ProviderResponse> {
    crate::models::parse_tool_calls(json)
}

// ---------------------------------------------------------------------------
// Anthropic Messages API support (for Claude models via Copilot proxy)
// ---------------------------------------------------------------------------

/// Returns `true` when the model identifier refers to a Claude / Anthropic
/// model that must be routed through the `/v1/messages` SSE endpoint
/// rather than the OpenAI-compatible `/chat/completions` path.
fn is_anthropic_model(model_id: &str) -> bool {
    let m = model_id.to_ascii_lowercase();
    m.starts_with("claude")
}

/// Convert an OpenAI-style function definition into the Anthropic tool format.
///
/// OpenAI: `{"type": "function", "function": {"name", "description", "parameters"}}`
/// or bare: `{"name", "description", "parameters"}`
///
/// Anthropic: `{"name", "description", "input_schema"}`
fn to_anthropic_tool(f: &Value) -> Option<Value> {
    let func_obj = if f.get("type").and_then(|t| t.as_str()) == Some("function")
        && f.get("function").is_some()
    {
        f.get("function").unwrap()
    } else {
        f
    };
    let name = func_obj.get("name").and_then(|n| n.as_str())?;
    if name.is_empty() {
        return None;
    }
    let mut schema = func_obj
        .get("parameters")
        .cloned()
        .unwrap_or_else(|| json!({"type": "object"}));
    // Anthropic requires input_schema to be a valid JSON Schema object.
    // Ensure it always has "type": "object" at the top level.
    if schema.is_null() || !schema.is_object() {
        schema = json!({"type": "object"});
    }
    if schema.get("type").is_none() {
        schema["type"] = json!("object");
    }
    Some(json!({
        "name": name,
        "description": func_obj.get("description")
            .and_then(|d| d.as_str())
            .unwrap_or(""),
        "input_schema": schema,
    }))
}

/// Serialise Pinchy `ChatMessage`s into the Anthropic Messages API format.
///
/// Returns `(system, messages)` where `system` is the extracted system
/// prompt (if any) and `messages` is the array for the request body.
///
/// Key transformations:
/// - `role: "system"` → extracted to the top-level `system` param
/// - `role: "tool"` with `tool_call_id` → `role: "user"` with a
///   `tool_result` content block (Anthropic format)
/// - `role: "assistant"` with `tool_calls` → `role: "assistant"` with
///   `tool_use` content blocks
/// - Adjacent messages with the same role are merged (Anthropic requires
///   strict user/assistant alternation)
fn serialize_anthropic_messages(messages: &[super::ChatMessage]) -> (Option<String>, Vec<Value>) {
    let mut system_parts: Vec<String> = Vec::new();
    let mut out: Vec<Value> = Vec::new();

    for m in messages {
        // ── System messages → top-level param ────────────────────────
        if m.is_system() {
            system_parts.push(m.content.clone());
            continue;
        }

        // ── Tool result messages → user role with tool_result block ──
        if m.is_tool() {
            let block = if let Some(ref tcid) = m.tool_call_id {
                json!({
                    "type": "tool_result",
                    "tool_use_id": tcid,
                    "content": m.content,
                })
            } else {
                json!({"type": "text", "text": m.content})
            };
            // Merge into previous user message if possible, otherwise
            // create a new user message.
            if let Some(last) = out.last_mut() {
                if last.get("role").and_then(|r| r.as_str()) == Some("user") {
                    if let Some(arr) = last.get_mut("content").and_then(|c| c.as_array_mut()) {
                        arr.push(block);
                        continue;
                    }
                }
            }
            out.push(json!({"role": "user", "content": [block]}));
            continue;
        }

        // ── Assistant with tool_calls → tool_use content blocks ──────
        if m.is_assistant() && m.tool_calls.is_some() {
            let mut blocks: Vec<Value> = Vec::new();
            if !m.content.is_empty() {
                blocks.push(json!({"type": "text", "text": m.content}));
            }
            if let Some(ref tcs) = m.tool_calls {
                for tc in tcs {
                    let func = tc.get("function").unwrap_or(tc);
                    let name = func.get("name").and_then(|n| n.as_str()).unwrap_or("");
                    let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("");
                    let input: Value = func
                        .get("arguments")
                        .and_then(|a| a.as_str())
                        .and_then(|s| serde_json::from_str(s).ok())
                        .unwrap_or(json!({}));
                    blocks.push(json!({
                        "type": "tool_use",
                        "id": id,
                        "name": name,
                        "input": input,
                    }));
                }
            }
            // Merge into previous assistant if possible
            if let Some(last) = out.last_mut() {
                if last.get("role").and_then(|r| r.as_str()) == Some("assistant") {
                    if let Some(arr) = last.get_mut("content").and_then(|c| c.as_array_mut()) {
                        arr.extend(blocks);
                        continue;
                    }
                }
            }
            out.push(json!({"role": "assistant", "content": blocks}));
            continue;
        }

        // ── Regular user / assistant messages ────────────────────────
        let role = &m.role;
        let mut blocks: Vec<Value> = Vec::new();

        if !m.content.is_empty() {
            blocks.push(json!({"type": "text", "text": m.content}));
        }

        // Image attachments (base64 data URIs)
        for img in &m.images {
            if let Some(rest) = img.strip_prefix("data:") {
                // data:image/png;base64,iVBOR...
                if let Some((mime_and_enc, data)) = rest.split_once(',') {
                    let media_type = mime_and_enc.split(';').next().unwrap_or("image/png");
                    blocks.push(json!({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data,
                        }
                    }));
                }
            } else {
                // Plain URL
                blocks.push(json!({
                    "type": "image",
                    "source": {"type": "url", "url": img}
                }));
            }
        }

        if blocks.is_empty() {
            blocks.push(json!({"type": "text", "text": ""}));
        }

        // Merge into previous message with the same role (Anthropic
        // requires strict alternation).
        if let Some(last) = out.last_mut() {
            if last.get("role").and_then(|r| r.as_str()) == Some(role.as_str()) {
                if let Some(arr) = last.get_mut("content").and_then(|c| c.as_array_mut()) {
                    arr.extend(blocks);
                    continue;
                }
            }
        }
        out.push(json!({"role": role, "content": blocks}));
    }

    let system = if system_parts.is_empty() {
        None
    } else {
        Some(system_parts.join("\n\n"))
    };

    // ── Strip orphaned tool_result blocks ────────────────────────────
    // Anthropic requires every tool_result to reference a tool_use in
    // a preceding assistant message.  When history is truncated by the
    // context-window pruner, the first messages may contain tool_results
    // whose matching tool_use was pruned.  We collect all seen tool_use
    // IDs, then remove any tool_result blocks that reference unknown IDs.
    let mut seen_tool_use_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    // First pass: collect all tool_use IDs from assistant messages.
    for msg in &out {
        if msg.get("role").and_then(|r| r.as_str()) != Some("assistant") {
            continue;
        }
        if let Some(blocks) = msg.get("content").and_then(|c| c.as_array()) {
            for b in blocks {
                if b.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                    if let Some(id) = b.get("id").and_then(|i| i.as_str()) {
                        seen_tool_use_ids.insert(id.to_string());
                    }
                }
            }
        }
    }
    // Second pass: filter out orphaned tool_result blocks and empty messages.
    let out: Vec<Value> = out
        .into_iter()
        .filter_map(|mut msg| {
            if let Some(blocks) = msg.get("content").and_then(|c| c.as_array()) {
                let has_tool_result = blocks
                    .iter()
                    .any(|b| b.get("type").and_then(|t| t.as_str()) == Some("tool_result"));
                if has_tool_result {
                    let filtered: Vec<Value> = blocks
                        .iter()
                        .filter(|b| {
                            if b.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                                b.get("tool_use_id")
                                    .and_then(|id| id.as_str())
                                    .is_some_and(|id| seen_tool_use_ids.contains(id))
                            } else {
                                true
                            }
                        })
                        .cloned()
                        .collect();
                    if filtered.is_empty() {
                        return None; // Drop entirely empty message
                    }
                    msg["content"] = Value::Array(filtered);
                }
            }
            Some(msg)
        })
        .collect();

    (system, out)
}

// ── Anthropic SSE parsing ────────────────────────────────────────────────

/// Accumulated result from parsing an Anthropic Messages SSE stream.
struct AnthropicResult {
    text: String,
    tool_uses: Vec<AnthropicToolUse>,
    input_tokens: u64,
    output_tokens: u64,
    model: String,
}

struct AnthropicToolUse {
    id: String,
    name: String,
    input_json: String,
}

/// Per-block accumulator for SSE content blocks (#17).
struct BlockAccum {
    block_type: String,
    tool_id: String,
    tool_name: String,
    json_buf: String,
}

/// Parse a full Anthropic SSE stream from the response body into an
/// [`AnthropicResult`].
///
/// Processes events: `message_start`, `content_block_start`,
/// `content_block_delta`, `content_block_stop`, `message_delta`.
/// Thinking blocks are silently discarded.
async fn parse_anthropic_sse(resp: reqwest::Response) -> anyhow::Result<AnthropicResult> {
    use tokio_stream::StreamExt;

    let mut result = AnthropicResult {
        text: String::new(),
        tool_uses: Vec::new(),
        input_tokens: 0,
        output_tokens: 0,
        model: String::new(),
    };

    // Single map for per-block state (#17).
    let mut blocks: std::collections::HashMap<u64, BlockAccum> = std::collections::HashMap::new();

    // Read the byte stream and process SSE lines.
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = StreamExt::next(&mut stream).await {
        let chunk = chunk.map_err(|e| anyhow::anyhow!("SSE read error: {e}"))?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        // Process complete lines from the buffer.
        while let Some(newline_pos) = buffer.find('\n') {
            let line = buffer[..newline_pos].trim_end_matches('\r').to_string();
            buffer = buffer[newline_pos + 1..].to_string();

            if line.is_empty() || line.starts_with(':') || line == "event: ping" {
                continue;
            }

            // We only care about `data:` lines.
            let data = if let Some(d) = line.strip_prefix("data: ") {
                d
            } else if let Some(d) = line.strip_prefix("data:") {
                d
            } else {
                trace!(line = %line, "Anthropic SSE: skipping non-data line");
                continue;
            };

            if data == "[DONE]" {
                debug!("Anthropic SSE: [DONE]");
                break;
            }

            let v: Value = match serde_json::from_str(data) {
                Ok(v) => v,
                Err(_) => continue,
            };

            let event_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("");

            match event_type {
                "message_start" => {
                    if let Some(msg) = v.get("message") {
                        result.model = msg
                            .get("model")
                            .and_then(|m| m.as_str())
                            .unwrap_or("")
                            .to_string();
                        if let Some(usage) = msg.get("usage") {
                            result.input_tokens = usage["input_tokens"].as_u64().unwrap_or(0);
                        }
                    }
                }
                "content_block_start" => {
                    let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                    if let Some(cb) = v.get("content_block") {
                        let btype = cb
                            .get("type")
                            .and_then(|t| t.as_str())
                            .unwrap_or("")
                            .to_string();
                        let (tool_id, tool_name) = if btype == "tool_use" {
                            (
                                cb.get("id")
                                    .and_then(|i| i.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                                cb.get("name")
                                    .and_then(|n| n.as_str())
                                    .unwrap_or("")
                                    .to_string(),
                            )
                        } else {
                            (String::new(), String::new())
                        };
                        blocks.insert(
                            idx,
                            BlockAccum {
                                block_type: btype,
                                tool_id,
                                tool_name,
                                json_buf: String::new(),
                            },
                        );
                    }
                }
                "content_block_delta" => {
                    let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                    if let Some(delta) = v.get("delta") {
                        let dtype = delta.get("type").and_then(|t| t.as_str()).unwrap_or("");
                        match dtype {
                            "text_delta" => {
                                if let Some(text) = delta.get("text").and_then(|t| t.as_str()) {
                                    result.text.push_str(text);
                                }
                            }
                            "input_json_delta" => {
                                if let Some(pj) = delta.get("partial_json").and_then(|p| p.as_str())
                                {
                                    if let Some(block) = blocks.get_mut(&idx) {
                                        block.json_buf.push_str(pj);
                                    }
                                }
                            }
                            "thinking_delta" | "signature_delta" => {
                                // Internal reasoning — silently discard
                            }
                            _ => {}
                        }
                    }
                }
                "content_block_stop" => {
                    let idx = v.get("index").and_then(|i| i.as_u64()).unwrap_or(0);
                    if let Some(block) = blocks.remove(&idx) {
                        if block.block_type == "tool_use" {
                            result.tool_uses.push(AnthropicToolUse {
                                id: block.tool_id,
                                name: block.tool_name,
                                input_json: block.json_buf,
                            });
                        }
                    }
                }
                "message_delta" => {
                    if let Some(usage) = v.get("usage") {
                        result.output_tokens = usage["output_tokens"]
                            .as_u64()
                            .unwrap_or(result.output_tokens);
                    }
                }
                _ => {}
            }
        }
    }

    Ok(result)
}

/// Convert a parsed [`AnthropicResult`] into Pinchy's
/// `(ProviderResponse, Option<TokenUsage>)` pair.
fn anthropic_result_to_response(
    r: AnthropicResult,
) -> (super::ProviderResponse, Option<super::TokenUsage>) {
    let usage = Some(super::TokenUsage {
        prompt_tokens: r.input_tokens,
        completion_tokens: r.output_tokens,
        total_tokens: r.input_tokens + r.output_tokens,
        cached_tokens: 0,
        reasoning_tokens: 0,
        model: r.model,
    });

    if r.tool_uses.is_empty() {
        (super::ProviderResponse::Final(r.text), usage)
    } else if r.tool_uses.len() == 1 {
        let tu = r.tool_uses.into_iter().next().unwrap();
        (
            super::ProviderResponse::FunctionCall {
                id: tu.id,
                name: tu.name,
                arguments: tu.input_json,
            },
            usage,
        )
    } else {
        let items: Vec<super::FunctionCallItem> = r
            .tool_uses
            .into_iter()
            .map(|tu| super::FunctionCallItem {
                id: tu.id,
                name: tu.name,
                arguments: tu.input_json,
            })
            .collect();
        (super::ProviderResponse::MultiFunctionCall(items), usage)
    }
}

// ---------------------------------------------------------------------------
// OpenAI Responses API helpers
// ---------------------------------------------------------------------------

/// Parse token usage from an OpenAI Responses API response.
///
/// The Responses API returns usage as `{ "input_tokens", "output_tokens",
/// "total_tokens" }` (note: `input_tokens` not `prompt_tokens`).
fn parse_responses_usage(json: &Value) -> Option<super::TokenUsage> {
    let usage = json.get("usage")?;
    let model = json
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("")
        .to_string();
    let input = usage
        .get("input_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let output = usage
        .get("output_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let total = usage
        .get("total_tokens")
        .and_then(|v| v.as_u64())
        .unwrap_or(input + output);
    Some(super::TokenUsage {
        prompt_tokens: input,
        completion_tokens: output,
        total_tokens: total,
        cached_tokens: 0,
        reasoning_tokens: 0,
        model,
    })
}

/// Parse an SSE stream from the OpenAI Responses API and yield text
/// deltas as they arrive.
///
/// The Responses API SSE format uses typed events:
/// - `response.output_text.delta` → `{"delta": "text chunk"}`
/// - `response.completed` → signals stream end
fn stream_responses_sse_deltas(
    resp: reqwest::Response,
) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send>> {
    Box::pin(async_stream::try_stream! {
        use tokio_stream::StreamExt as _;
        let mut byte_stream = resp.bytes_stream();
        let mut buffer = String::new();
        let mut current_event_type = String::new();

        while let Some(chunk) = byte_stream.next().await {
            let chunk = chunk?;
            buffer.push_str(&String::from_utf8_lossy(&chunk));

            while let Some(newline_pos) = buffer.find('\n') {
                let line = buffer[..newline_pos].trim_end().to_string();
                buffer = buffer[newline_pos + 1..].to_string();

                if line.is_empty() {
                    // Empty line resets the event type for the next event.
                    current_event_type.clear();
                    continue;
                }

                // Track event type from `event:` lines.
                if let Some(evt) = line.strip_prefix("event: ").or_else(|| line.strip_prefix("event:")) {
                    current_event_type = evt.trim().to_string();
                    continue;
                }

                // Process `data:` lines.
                let data = if let Some(d) = line.strip_prefix("data: ") {
                    d
                } else if let Some(d) = line.strip_prefix("data:") {
                    d
                } else {
                    continue;
                };

                if data == "[DONE]" {
                    return;
                }

                // Parse text deltas from response.output_text.delta events.
                if current_event_type == "response.output_text.delta" {
                    if let Ok(v) = serde_json::from_str::<Value>(data) {
                        if let Some(delta) = v.get("delta").and_then(|d| d.as_str()) {
                            if !delta.is_empty() {
                                yield delta.to_string();
                            }
                        }
                    }
                }

                // Check for stream completion.
                if current_event_type == "response.completed" {
                    return;
                }
            }
        }
    })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    /// Without `COPILOT_TOKEN` env var. The provider may still find a
    /// stored GitHub token from keyring/file, so we only assert that
    /// it doesn't panic and constructs successfully.
    #[test]
    fn new_without_env() {
        std::env::remove_var("COPILOT_TOKEN");
        let p = CopilotProvider::new();
        // On CI with no stored tokens, p.token will be None.
        // On a dev machine with a prior device-flow auth it may be Some.
        // Either way, construction must succeed.
        let _ = p.token;
    }

    /// `send_chat` without `COPILOT_TOKEN` env var: if no fallback token
    /// sources exist either it should error; if a stored token is found
    /// the provider can still attempt (and possibly fail) gracefully.
    #[tokio::test(flavor = "current_thread")]
    #[ignore = "makes real network calls; run manually with --ignored"]
    async fn send_chat_returns_error_without_token() {
        std::env::remove_var("COPILOT_TOKEN");
        let p = CopilotProvider::new();
        let msgs = vec![ChatMessage::new("user", "hello")];
        let res = p.send_chat(&msgs).await;
        // With no token sources at all this errors; with a stored token
        // it may return Ok with a stub/fallback message. Either is fine.
        match res {
            Err(_) => {} // expected on clean environments
            Ok(text) => {
                // If it succeeds, the reply should be non-empty
                assert!(!text.is_empty(), "send_chat returned empty Ok");
            }
        }
    }

    // -------------------------------------------------------------------
    // Helper: build a test-only provider (no env / SDK needed)
    // -------------------------------------------------------------------

    fn test_provider() -> CopilotProvider {
        CopilotProvider {
            token: Arc::new(Mutex::new(None)),
            copilot_token: Arc::new(Mutex::new(None)),
            header_overrides: None,
            model_id: "gpt-4o".to_string(),
            reasoning_effort: None,
            discovered_models: Arc::new(Mutex::new(None)),
        }
    }

    /// Build a test-only provider with a pre-set Copilot session token
    /// pointing at a wiremock server.
    fn with_test_token(base_url: &str, bearer: &str) -> CopilotProvider {
        let ct = crate::auth::copilot_token::CopilotToken {
            token: bearer.to_string(),
            expires_at: Some(chrono::Utc::now() + chrono::Duration::seconds(3600)),
            proxy_ep: Some(base_url.to_string()),
        };
        CopilotProvider {
            token: Arc::new(Mutex::new(Some("test-gh-token".to_string()))),
            copilot_token: Arc::new(Mutex::new(Some(ct))),
            header_overrides: None,
            model_id: "gpt-4o".to_string(),
            reasoning_effort: None,
            discovered_models: Arc::new(Mutex::new(None)),
        }
    }

    fn sample_messages() -> Vec<ChatMessage> {
        vec![ChatMessage::new("user", "hello")]
    }

    // -------------------------------------------------------------------
    // proxy_paths tests
    // -------------------------------------------------------------------

    #[test]
    fn proxy_paths_defaults() {
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::remove_var("COPILOT_PROXY_ENDPOINTS");
        let paths = proxy_paths();
        // Restore
        if let Some(v) = old {
            std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
        }
        assert_eq!(paths.len(), 1);
        assert_eq!(paths[0], "/chat/completions");
    }

    #[test]
    fn proxy_paths_from_env() {
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::set_var("COPILOT_PROXY_ENDPOINTS", "/custom/chat,/custom/complete");
        let paths = proxy_paths();
        // Restore
        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => std::env::remove_var("COPILOT_PROXY_ENDPOINTS"),
        }
        assert_eq!(paths, vec!["/custom/chat", "/custom/complete"]);
    }

    // -------------------------------------------------------------------
    // try_proxy_http tests (wiremock)
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn proxy_http_200_success() {
        // Guard against env leaks from parallel tests.
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

        let mock_server = wiremock::MockServer::start().await;

        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/chat/completions"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "Hello! How can I help?"
                    }
                }]
            })))
            .mount(&mock_server)
            .await;

        let provider = test_provider();
        let result = provider
            .try_proxy_http(&mock_server.uri(), "fake-token", &sample_messages())
            .await;

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        assert_eq!(result.unwrap(), "Hello! How can I help?");

        // Restore env
        if let Some(v) = old {
            std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
        }
    }

    #[tokio::test]
    async fn proxy_http_404_tries_all_then_fails() {
        let mock_server = wiremock::MockServer::start().await;

        wiremock::Mock::given(wiremock::matchers::any())
            .respond_with(wiremock::ResponseTemplate::new(404).set_body_string("not found"))
            .mount(&mock_server)
            .await;

        let provider = test_provider();
        let result = provider
            .try_proxy_http(&mock_server.uri(), "fake-token", &sample_messages())
            .await;

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("all proxy endpoints failed"),
            "unexpected error: {err_msg}"
        );
    }

    #[tokio::test]
    async fn proxy_http_500_retries_then_fails() {
        // Use a single endpoint to keep the test fast (retries sleep).
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::set_var("COPILOT_PROXY_ENDPOINTS", "/chat/completions");

        let mock_server = wiremock::MockServer::start().await;

        wiremock::Mock::given(wiremock::matchers::any())
            .respond_with(wiremock::ResponseTemplate::new(500).set_body_string("internal error"))
            .expect(5) // 1 initial + 4 retries (MAX_RETRIES = 4)
            .mount(&mock_server)
            .await;

        let provider = test_provider();
        let result = provider
            .try_proxy_http(&mock_server.uri(), "fake-token", &sample_messages())
            .await;

        // Restore env
        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => std::env::remove_var("COPILOT_PROXY_ENDPOINTS"),
        }

        assert!(result.is_err());
        let err_msg = result.unwrap_err().to_string();
        assert!(
            err_msg.contains("HTTP 500"),
            "expected 500 in error: {err_msg}"
        );
    }

    // -------------------------------------------------------------------
    // send_chat_with_functions tests (wiremock)
    // -------------------------------------------------------------------

    #[tokio::test]
    async fn send_chat_with_functions_proxy_returns_fenced_tool_call() {
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

        let mock_server = wiremock::MockServer::start().await;

        let fenced_tool_call = "```json\n{\"name\":\"exec_shell\",\"args\":{\"command\":\"pwd\"},\"nonce\":\"nonce-1234\"}\n```";

        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/chat/completions"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": fenced_tool_call
                    }
                }]
            })))
            .mount(&mock_server)
            .await;

        let provider = with_test_token(&mock_server.uri(), "test-bearer");

        let functions = vec![json!({
            "type": "function",
            "function": {
                "name": "exec_shell",
                "description": "Execute a shell command",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "command": { "type": "string" }
                    },
                    "required": ["command"]
                }
            }
        })];

        let result = provider
            .send_chat_with_functions(&sample_messages(), &functions)
            .await;

        if let Some(v) = old {
            std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
        }

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        match result.unwrap() {
            (super::ProviderResponse::Final(text), _usage) => {
                assert!(
                    text.contains("exec_shell"),
                    "response should contain tool call name, got: {text}"
                );
                assert!(
                    text.contains("nonce-1234"),
                    "response should contain nonce, got: {text}"
                );
            }
            (other, _) => panic!("expected ProviderResponse::Final, got: {other:?}"),
        }
    }

    #[tokio::test]
    async fn send_chat_with_functions_includes_tools_in_body() {
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

        let mock_server = wiremock::MockServer::start().await;

        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/chat/completions"))
            .and(wiremock::matchers::body_partial_json(json!({
                "tools": [{
                    "type": "function",
                    "function": {
                        "name": "read_file",
                        "description": "Read a file",
                        "parameters": { "type": "object" }
                    }
                }],
                "tool_choice": "auto"
            })))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "I'll help you."
                    }
                }]
            })))
            .mount(&mock_server)
            .await;

        let provider = with_test_token(&mock_server.uri(), "test-bearer");

        // Bare format (as produced by the agent runtime).
        let functions = vec![json!({
            "name": "read_file",
            "description": "Read a file",
            "parameters": { "type": "object" }
        })];

        let result = provider
            .send_chat_with_functions(&sample_messages(), &functions)
            .await;

        if let Some(v) = old {
            std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
        }

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
    }

    #[tokio::test]
    async fn send_chat_with_functions_skips_empty_name() {
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

        let mock_server = wiremock::MockServer::start().await;

        // The mock expects NO tools key (the only function has an empty name
        // and should be skipped, leaving zero tools → no tools key sent).
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/chat/completions"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{
                    "message": {
                        "role": "assistant",
                        "content": "No tools available."
                    }
                }]
            })))
            .mount(&mock_server)
            .await;

        let provider = with_test_token(&mock_server.uri(), "test-bearer");

        // Function with empty name should be skipped.
        let functions = vec![json!({
            "name": "",
            "description": "Bad function",
            "parameters": { "type": "object" }
        })];

        let result = provider
            .send_chat_with_functions(&sample_messages(), &functions)
            .await;

        if let Some(v) = old {
            std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
        }

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        match result.unwrap() {
            (super::ProviderResponse::Final(text), _usage) => {
                assert_eq!(text, "No tools available.");
            }
            (other, _) => panic!("expected Final, got: {other:?}"),
        }
    }

    /// Verify that calling `send_chat_with_functions` through the
    /// `ModelProvider` trait object delegates to the inherent method
    /// which uses `try_proxy_http_with_tools`.
    #[tokio::test]
    async fn trait_send_chat_with_functions_delegates_to_inherent() {
        let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
        std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

        let mock_server = wiremock::MockServer::start().await;

        // Return an OpenAI-style tool_calls response to exercise the
        // `extract_tool_call` branch inside `try_proxy_http_with_tools`.
        wiremock::Mock::given(wiremock::matchers::method("POST"))
            .and(wiremock::matchers::path("/chat/completions"))
            .respond_with(wiremock::ResponseTemplate::new(200).set_body_json(json!({
                "choices": [{
                    "index": 0,
                    "message": {
                        "role": "assistant",
                        "content": serde_json::Value::Null,
                        "tool_calls": [{
                            "id": "call_test1",
                            "type": "function",
                            "function": {
                                "name": "read_file",
                                "arguments": "{\"path\":\"/tmp/test.txt\"}"
                            }
                        }]
                    },
                    "finish_reason": "tool_calls"
                }]
            })))
            .mount(&mock_server)
            .await;

        let provider = with_test_token(&mock_server.uri(), "test-bearer");

        // Call through the trait interface (dyn ModelProvider).
        let provider_ref: &dyn super::ModelProvider = &provider;
        let functions = vec![json!({
            "name": "read_file",
            "description": "Read a file from disk",
            "parameters": {
                "type": "object",
                "properties": { "path": { "type": "string" } },
                "required": ["path"]
            }
        })];

        let result = provider_ref
            .send_chat_with_functions(&sample_messages(), &functions)
            .await;

        if let Some(v) = old {
            std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
        }

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        match result.unwrap() {
            (
                super::ProviderResponse::FunctionCall {
                    name, arguments, ..
                },
                _usage,
            ) => {
                assert_eq!(name, "read_file");
                let args: serde_json::Value =
                    serde_json::from_str(&arguments).expect("arguments should parse");
                assert_eq!(args["path"], "/tmp/test.txt");
            }
            (other, _) => panic!("expected FunctionCall, got: {other:?}"),
        }
    }
}
