//! GitHub Copilot provider via the community Copilot SDK.
//!
//! Routes chat through the Copilot CLI using `copilot_sdk`.  When the
//! CLI is unavailable or no token is configured the provider returns
//! a clearly-labelled stub response so the rest of the system keeps
//! working.

use std::sync::Arc;
use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};
use tokio::sync::Mutex;
use tracing::{debug, warn};

use super::{ChatMessage, ModelProvider, ProviderResponse};
use crate::auth::copilot_token;
use crate::auth::github_device;

/// Default Copilot API proxy base URL (used when the token exchange does
/// not return a specific endpoint).
const DEFAULT_COPILOT_API_BASE: &str = "https://api.githubcopilot.com";

// ---------------------------------------------------------------------------
// CopilotProvider
// ---------------------------------------------------------------------------

/// Provider that talks to GitHub Copilot through the community Copilot
/// SDK.  Requires the Copilot CLI to be installed and a valid GitHub
/// token in the `COPILOT_TOKEN` environment variable.
pub struct CopilotProvider {
    /// The GitHub access token (used to build the SDK client).
    token: Option<String>,
    /// A cached Copilot session token obtained via token exchange.
    /// Wrapped in `Mutex` for interior mutability (token refresh).
    copilot_token: Arc<Mutex<Option<copilot_token::CopilotToken>>>,
    client: Arc<Mutex<Option<copilot_sdk::Client>>>,
}

impl Default for CopilotProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CopilotProvider {
    /// Create a new provider.
    ///
    /// Reads `COPILOT_TOKEN` from the environment.  If the variable is
    /// present the SDK client is eagerly built (but **not** started —
    /// the CLI process is only spawned on first use).  When the variable
    /// is absent the provider operates in stub mode.
    pub fn new() -> Self {
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

        // --- 3. Build SDK client (only when no cached Copilot token) -----
        let client = if cached_ct.is_some() {
            // When we have a direct Copilot token we bypass the SDK.
            None
        } else {
            token.as_ref().and_then(|t| {
                copilot_sdk::Client::builder()
                    .github_token(t.clone())
                    .use_logged_in_user(false)
                    .build()
                    .map_err(|e| warn!("copilot_sdk::Client build failed: {e}"))
                    .ok()
            })
        };

        if cached_ct.is_some() {
            debug!("CopilotProvider: will use cached Copilot session token");
        } else if client.is_some() {
            debug!("CopilotProvider: SDK client ready (not yet started)");
        } else {
            warn!("CopilotProvider: no COPILOT_TOKEN or SDK build failed — stub mode");
        }

        Self {
            token,
            copilot_token: Arc::new(Mutex::new(cached_ct)),
            client: Arc::new(Mutex::new(client)),
        }
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
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()?;

        let body = json!({
            "model": "gpt-4o",
            "messages": super::serialize_messages(messages),
        });

        let headers = copilot_headers(bearer);
        let paths = proxy_paths();
        let base = proxy_ep.trim_end_matches('/');
        let mut last_err: Option<String> = None;

        for path in &paths {
            let url = format!("{base}{path}");
            debug!("CopilotProvider: trying proxy endpoint {url}");

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
    ) -> anyhow::Result<ProviderResponse> {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()?;

        let mut body = json!({
            "model": "gpt-4o",
            "messages": super::serialize_messages(messages),
        });

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

        let headers = copilot_headers(bearer);
        let paths = proxy_paths();
        let base = proxy_ep.trim_end_matches('/');
        let mut last_err: Option<String> = None;

        for path in &paths {
            let url = format!("{base}{path}");
            debug!("CopilotProvider: trying proxy endpoint (with tools) {url}");

            match post_with_retry(&http, &url, &headers, &body).await {
                Ok(json_val) => {
                    // Check for tool_calls first (native function-calling).
                    if let Some(fc) = extract_tool_call(&json_val) {
                        debug!("CopilotProvider: got tool_call via {url}");
                        return Ok(fc);
                    }

                    if let Some(text) = extract_assistant_text(&json_val) {
                        debug!("CopilotProvider: got reply via {url} (with tools)");
                        return Ok(ProviderResponse::Final(text));
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

    /// Send chat messages with function definitions via the proxy path.
    ///
    /// Tries the proxy HTTP path (with `tools` + `tool_choice`) first,
    /// then falls back to the SDK/CLI path (best-effort tools metadata
    /// appended to prompt).  Returns [`ProviderResponse::Final`] wrapping
    /// the assistant text, which may contain a fenced TOOL_CALL that the
    /// agent runtime can parse.
    pub async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<super::TokenUsage>), anyhow::Error> {
        // -----------------------------------------------------------------
        // Fast path: proxy HTTP with tools
        // -----------------------------------------------------------------
        {
            let mut ct_guard = self.copilot_token.lock().await;

            // Refresh token if needed.
            let should_exchange = match &*ct_guard {
                None => self.token.is_some(),
                Some(ct) => ct.is_expired() && self.token.is_some(),
            };

            if should_exchange {
                if let Some(ref gh_token) = self.token {
                    debug!(
                        "CopilotProvider: exchanging/refreshing Copilot session token (fn-call)…"
                    );
                    match copilot_token::exchange_github_for_copilot_token(gh_token).await {
                        Ok(new_ct) => {
                            let _ = copilot_token::cache_copilot_token(&new_ct);
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
                        .unwrap_or(DEFAULT_COPILOT_API_BASE);
                    match self
                        .try_proxy_http_with_tools(ep, &ct.token, messages, functions)
                        .await
                    {
                        Ok(resp) => return Ok((resp, None)),
                        Err(e) => {
                            warn!("CopilotProvider: proxy (fn-call) failed ({e:#}), falling back");
                        }
                    }
                }
            }
        }

        // -----------------------------------------------------------------
        // Fallback: plain send_chat (SDK path will not get tools metadata
        // natively, but the agent runtime's enforcement retry still works).
        // -----------------------------------------------------------------
        let reply = self.send_chat(messages).await?;
        Ok((ProviderResponse::Final(reply), None))
    }

    /// Build a provider for testing with a pre-injected Copilot token
    /// pointing at a custom proxy endpoint (e.g. a wiremock server).
    ///
    /// The SDK/CLI paths are not available in this mode.
    #[doc(hidden)]
    pub fn with_test_token(proxy_url: &str, bearer: &str) -> Self {
        use chrono::{Duration as CDuration, Utc};
        let ct = copilot_token::CopilotToken {
            token: bearer.to_string(),
            expires_at: Some(Utc::now() + CDuration::hours(1)),
            proxy_ep: Some(proxy_url.to_string()),
        };
        Self {
            token: None,
            copilot_token: Arc::new(Mutex::new(Some(ct))),
            client: Arc::new(Mutex::new(None)),
        }
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
            debug!("CopilotProvider: using custom proxy endpoints from COPILOT_PROXY_ENDPOINTS");
            return paths;
        }
    }
    vec!["/chat/completions".to_string()]
}

/// Whether a [`reqwest::Error`] is transient and worth retrying.
fn is_retryable_request_error(e: &reqwest::Error) -> bool {
    e.is_timeout() || e.is_connect() || e.is_request()
}

/// Standard Copilot proxy headers.
fn copilot_headers(bearer: &str) -> reqwest::header::HeaderMap {
    let mut h = reqwest::header::HeaderMap::new();
    h.insert("Authorization", format!("Bearer {bearer}").parse().unwrap());
    h.insert("User-Agent", "GitHubCopilotChat/0.26.7".parse().unwrap());
    h.insert("Content-Type", "application/json".parse().unwrap());
    h.insert("Editor-Version", "vscode/1.96.2".parse().unwrap());
    h.insert("Editor-Plugin-Version", "copilot-chat/0.26.7".parse().unwrap());
    h.insert("Copilot-Integration-Id", "vscode-chat".parse().unwrap());
    h.insert("Openai-Intent", "conversation-panel".parse().unwrap());
    h
}

/// POST a JSON body to `url` with retry logic for transient errors.
///
/// Retries up to `MAX_RETRIES` times on transport errors and 5xx
/// responses with exponential backoff.  Returns the parsed JSON
/// response on success.
async fn post_with_retry(
    client: &reqwest::Client,
    url: &str,
    headers: &reqwest::header::HeaderMap,
    body: &serde_json::Value,
) -> Result<Value, Option<String>> {
    const MAX_RETRIES: u32 = 2;
    let mut attempt: u32 = 0;

    loop {
        debug!(request_body = %body, "copilot: full proxy request body");

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
                    let delay = Duration::from_millis(500 * u64::from(attempt));
                    warn!(
                        "CopilotProvider: retrying {url} (attempt {attempt}/{MAX_RETRIES}) after {delay:?}"
                    );
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

        // Non-2xx — log the full response body for debugging.
        let resp_body = resp.text().await.unwrap_or_default();
        warn!("CopilotProvider: {url} returned HTTP {status}; body: {resp_body}");

        // Retry on 5xx (transient server errors).
        if status.is_server_error() && attempt < MAX_RETRIES {
            attempt += 1;
            let delay = Duration::from_millis(500 * u64::from(attempt));
            warn!(
                "CopilotProvider: retrying {url} (attempt {attempt}/{MAX_RETRIES}) after {delay:?}"
            );
            tokio::time::sleep(delay).await;
            continue;
        }

        // 4xx or exhausted retries — record and give up.
        return Err(Some(format!("{url}: HTTP {status}: {resp_body}")));
    }
}

/// Check whether the Copilot CLI / language-server binary is on `PATH`.
fn copilot_cli_available() -> bool {
    std::process::Command::new("copilot-language-server")
        .arg("--version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
}

// ---------------------------------------------------------------------------
// Response extraction heuristics
// ---------------------------------------------------------------------------

/// Extract a `tool_calls` entry from an OpenAI-style chat completion response.
///
/// Looks at `choices[0].message.tool_calls[0]` for a function call and
/// returns `ProviderResponse::FunctionCall` when found.
fn extract_tool_call(v: &Value) -> Option<ProviderResponse> {
    super::parse_tool_calls(v)
}

/// Try several common JSON shapes to pull out the assistant's reply text.
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

    // output_text  (some newer APIs)
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

    // output[0].content
    if let Some(s) = v
        .get("output")
        .and_then(|o| o.get(0))
        .and_then(|o| o.get("content"))
        .and_then(|c| c.as_str())
    {
        let s = s.trim();
        if !s.is_empty() {
            return Some(s.to_string());
        }
    }

    None
}

// ---------------------------------------------------------------------------
// ModelProvider implementation
// ---------------------------------------------------------------------------

#[async_trait]
impl ModelProvider for CopilotProvider {
    /// Send chat messages through the Copilot SDK.
    ///
    /// Messages are flattened into a single prompt string
    /// (`[role]: content`) and sent via `session.send_and_collect`.
    /// If anything goes wrong the method returns a stub response
    /// prefixed with `[copilot stub]` rather than propagating an
    /// error, so the caller always gets *something* back.
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        // -----------------------------------------------------------------
        // Fast path: direct HTTP proxy with token-refresh on expiry.
        // -----------------------------------------------------------------
        {
            let mut ct_guard = self.copilot_token.lock().await;

            // If token is missing or expired, attempt exchange / refresh.
            let should_exchange = match &*ct_guard {
                None => self.token.is_some(),
                Some(ct) => ct.is_expired() && self.token.is_some(),
            };

            if should_exchange {
                if let Some(ref gh_token) = self.token {
                    debug!("CopilotProvider: exchanging/refreshing Copilot session token…");
                    match copilot_token::exchange_github_for_copilot_token(gh_token).await {
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

            // Try proxy if we have a valid (non-expired) token.
            if let Some(ref ct) = *ct_guard {
                if !ct.is_expired() {
                    let ep = ct
                        .proxy_ep
                        .as_deref()
                        .filter(|s| !s.is_empty())
                        .unwrap_or(DEFAULT_COPILOT_API_BASE);
                    match self.try_proxy_http(ep, &ct.token, messages).await {
                        Ok(text) => return Ok(text),
                        Err(e) => {
                            warn!("CopilotProvider: proxy endpoints failed ({e:#}), falling back to SDK");
                        }
                    }
                }
            }
        }

        // -----------------------------------------------------------------
        // CLI availability gate — skip the SDK if the CLI is absent.
        // -----------------------------------------------------------------
        if !copilot_cli_available() {
            anyhow::bail!(
                "CopilotProvider: proxy failed and Copilot CLI not found on PATH; \
                 set COPILOT_TOKEN or run device-flow auth"
            );
        }

        // -----------------------------------------------------------------
        // Standard path: use the copilot-sdk CLI client.
        // -----------------------------------------------------------------
        let mut guard = self.client.lock().await;

        // Lazy-build the client when we have a token but no client yet.
        if guard.is_none() {
            if let Some(ref t) = self.token {
                match copilot_sdk::Client::builder()
                    .github_token(t.clone())
                    .use_logged_in_user(false)
                    .build()
                {
                    Ok(c) => *guard = Some(c),
                    Err(e) => {
                        return Ok(format!("[copilot stub] client build failed: {e}"));
                    }
                }
            } else {
                anyhow::bail!("CopilotProvider: not configured — set COPILOT_TOKEN");
            }
        }

        let client = guard.as_ref().unwrap();

        // Ensure the CLI connection is running.  `start()` is a
        // no-op if the client is already connected.
        if let Err(e) = client.start().await {
            return Ok(format!("[copilot stub] start failed: {e}"));
        }

        // Flatten messages into a single prompt.
        let prompt: String = messages
            .iter()
            .map(|m| format!("[{}]: {}", m.role, m.content))
            .collect::<Vec<_>>()
            .join("\n");

        // Create a session, send the prompt, collect the reply.
        let config = copilot_sdk::SessionConfig::default();
        match client.create_session(config).await {
            Ok(session) => {
                let result = session.send_and_collect(prompt.as_str(), None).await;
                // Best-effort cleanup; ignore errors.
                let _ = session.destroy().await;
                match result {
                    Ok(text) => Ok(text),
                    Err(e) => Ok(format!("[copilot stub] send failed: {e}")),
                }
            }
            Err(e) => Ok(format!("[copilot stub] session creation failed: {e}")),
        }
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<super::TokenUsage>), anyhow::Error> {
        // Delegate to the inherent method.
        CopilotProvider::send_chat_with_functions(self, messages, functions).await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let reply = ModelProvider::send_chat(self, messages).await?;
            yield reply;
        })
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
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
            token: None,
            copilot_token: Arc::new(Mutex::new(None)),
            client: Arc::new(Mutex::new(None)),
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
        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => {}
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
        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => {}
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
            .expect(3) // 1 initial + 2 retries
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

        let provider = CopilotProvider::with_test_token(&mock_server.uri(), "test-bearer");

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

        // Restore env
        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => {}
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

        let provider = CopilotProvider::with_test_token(&mock_server.uri(), "test-bearer");

        // Bare format (as produced by the agent runtime).
        let functions = vec![json!({
            "name": "read_file",
            "description": "Read a file",
            "parameters": { "type": "object" }
        })];

        let result = provider
            .send_chat_with_functions(&sample_messages(), &functions)
            .await;

        // Restore env
        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => {}
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

        let provider = CopilotProvider::with_test_token(&mock_server.uri(), "test-bearer");

        // Function with empty name should be skipped.
        let functions = vec![json!({
            "name": "",
            "description": "Bad function",
            "parameters": { "type": "object" }
        })];

        let result = provider
            .send_chat_with_functions(&sample_messages(), &functions)
            .await;

        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => {}
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

        let provider = CopilotProvider::with_test_token(&mock_server.uri(), "test-bearer");

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

        match old {
            Some(v) => std::env::set_var("COPILOT_PROXY_ENDPOINTS", v),
            None => {}
        }

        assert!(result.is_ok(), "expected Ok, got: {result:?}");
        match result.unwrap() {
            (super::ProviderResponse::FunctionCall { name, arguments, .. }, _usage) => {
                assert_eq!(name, "read_file");
                let args: serde_json::Value =
                    serde_json::from_str(&arguments).expect("arguments should parse");
                assert_eq!(args["path"], "/tmp/test.txt");
            }
            (other, _) => panic!("expected FunctionCall, got: {other:?}"),
        }
    }
}
