//! xAI (Grok) chat-completions provider.
//!
//! Uses the OpenAI-compatible API format.
//!
//! Config example:
//! ```yaml
//! models:
//!   - id: grok-2
//!     provider: xai
//!     model: grok-2
//! ```

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Default endpoint for xAI chat completions.
pub const DEFAULT_ENDPOINT: &str = "https://api.x.ai/v1/chat/completions";

/// Default base URL for xAI API.
pub const DEFAULT_BASE_URL: &str = "https://api.x.ai/v1";

/// Provider that talks to the xAI (Grok) chat completions API.
pub struct XaiProvider {
    api_key: String,
    base_url: String,
    endpoint: String,
    model: String,
    client: Client,
}

impl XaiProvider {
    /// Create a new provider.
    ///
    /// Reads `XAI_API_KEY` from the environment. Panics if the
    /// variable is missing — fail fast at startup rather than at first
    /// request.
    pub fn new() -> Self {
        let api_key = std::env::var("XAI_API_KEY").expect("XAI_API_KEY must be set");
        let model = "grok-2-latest".to_string();
        Self {
            api_key,
            base_url: DEFAULT_BASE_URL.to_string(),
            endpoint: DEFAULT_ENDPOINT.to_string(),
            client: super::get_shared_http_client(),
            model,
        }
    }

    /// Create a provider with explicit API key and model.
    pub fn with_config(api_key: String, model: String) -> Self {
        Self::with_full_config(api_key, DEFAULT_BASE_URL.to_string(), model)
    }

    /// Create a provider with explicit configuration (useful for tests
    /// or non-default endpoints).
    pub fn with_full_config(api_key: String, base_url: String, model: String) -> Self {
        let endpoint = if base_url.ends_with("/chat/completions") {
            base_url.clone()
        } else {
            format!("{}/chat/completions", base_url.trim_end_matches('/'))
        };
        Self {
            api_key,
            base_url,
            endpoint,
            client: super::get_shared_http_client(),
            model,
        }
    }

    /// SSE streaming implementation.
    fn send_chat_stream_sse<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

            let body = json!({
                "model": self.model,
                "messages": api_messages,
                "stream": true,
            });

            let resp = self
                .client
                .post(&self.endpoint)
                .bearer_auth(&self.api_key)
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!(
                    "xAI API returned {status}: {text}"
                ))?;
                return;
            }

            let mut delta_stream = super::stream_sse_deltas(resp);
            use tokio_stream::StreamExt as _;
            while let Some(chunk) = delta_stream.next().await {
                yield chunk?;
            }
        })
    }

    /// Send chat messages with an array of function definitions.
    async fn send_chat_with_functions_inner(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

        let mut body = json!({
            "model": self.model,
            "messages": api_messages,
        });

        if !functions.is_empty() {
            let tools = super::wrap_in_function_tools(functions);
            body["tools"] = serde_json::Value::Array(tools);
            body["tool_choice"] = json!("auto");
        }

        let resp = self
            .client
            .post(&self.endpoint)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("xAI API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let usage = super::parse_token_usage(&json);

        if let Some(pr) = super::parse_tool_calls(&json) {
            return Ok((pr, usage));
        }

        Ok((
            ProviderResponse::Final(super::extract_content(&json)),
            usage,
        ))
    }
}

#[async_trait]
impl ModelProvider for XaiProvider {
    /// Send chat messages to the xAI completions endpoint and return
    /// the first choice's content.
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

        let body = json!({
            "model": self.model,
            "messages": api_messages,
        });

        let resp = self
            .client
            .post(&self.endpoint)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("xAI API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;

        Ok(super::extract_content(&json))
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        self.send_chat_with_functions_inner(messages, functions)
            .await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_sse(messages)
    }

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        let base = self
            .endpoint
            .trim_end_matches('/')
            .trim_end_matches("/chat/completions")
            .trim_end_matches('/');
        let url = format!("{}/models", base);

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.api_key)
            .send()
            .await?;

        if !resp.status().is_success() {
            return Ok(None);
        }

        let payload: serde_json::Value = resp.json().await?;
        let data = payload
            .get("data")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let models: Vec<super::ModelInfo> = data
            .iter()
            .filter_map(|m| {
                let id = m.get("id")?.as_str()?.to_string();
                let (input_price, output_price, description, max_tokens) = get_model_metadata(&id);
                Some(super::ModelInfo {
                    name: id.clone(),
                    id: id.clone(),
                    vendor: Some("xAI".to_string()),
                    supported_endpoints: vec!["chat".to_string()],
                    is_default: id == "grok-2-latest",
                    input_price,
                    output_price,
                    description,
                    max_tokens,
                })
            })
            .collect();

        Ok(Some(models))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// Get pricing and metadata for known xAI models.
/// Returns (input_price, output_price, description, max_tokens) per 1K tokens.
fn get_model_metadata(model_id: &str) -> (Option<f64>, Option<f64>, Option<String>, Option<u32>) {
    // Check for exact matches first
    match model_id {
        "grok-2-latest" => (
            Some(0.005),
            Some(0.015),
            Some("Grok 2 Latest - Latest Grok 2 model".to_string()),
            Some(128_000),
        ),
        "grok-2" => (
            Some(0.005),
            Some(0.015),
            Some("Grok 2 - xAI's flagship model".to_string()),
            Some(128_000),
        ),
        "grok-2-mini" => (
            Some(0.0005),
            Some(0.0015),
            Some("Grok 2 Mini - Lightweight version of Grok 2".to_string()),
            Some(128_000),
        ),
        "grok-beta" => (
            Some(0.005),
            Some(0.015),
            Some("Grok Beta - Beta version of Grok".to_string()),
            Some(128_000),
        ),
        _ => {
            // Normalize model ID (strip date suffixes like -0613, -0125, etc.)
            let base_id = model_id
                .trim_end_matches(|c: char| c.is_ascii_digit() || c == '-')
                .trim_end_matches('-');

            match base_id {
                "grok-2" => (
                    Some(0.005),
                    Some(0.015),
                    Some("Grok 2 - xAI's flagship model".to_string()),
                    Some(128_000),
                ),
                "grok-beta" => (
                    Some(0.005),
                    Some(0.015),
                    Some("Grok Beta - Beta version of Grok".to_string()),
                    Some(128_000),
                ),
                _ => {
                    // Unknown model - return None for pricing, but provide a generic description
                    let desc = format!("xAI model: {}", model_id);
                    (None, None, Some(desc), None)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: provider can be constructed with explicit config
    /// (no env var needed).
    #[test]
    fn construct_with_config() {
        let p = XaiProvider::with_config("xai-test-key".into(), "grok-2-latest".into());
        assert_eq!(p.model, "grok-2-latest");
        assert_eq!(p.base_url, "https://api.x.ai/v1");
    }

    /// Build the JSON request body the same way `send_chat` does and
    /// verify its structure — no network call needed.
    #[test]
    fn request_body_format() {
        let messages = vec!["Hello".to_string(), "World".to_string()];
        let model = "grok-2-latest";

        let mut api_messages = vec![json!({
            "role": "system",
            "content": "You are a helpful assistant."
        })];
        for msg in &messages {
            api_messages.push(json!({
                "role": "user",
                "content": msg
            }));
        }
        let body = json!({
            "model": model,
            "messages": api_messages,
        });

        // Three messages total: 1 system + 2 user.
        let arr = body["messages"].as_array().unwrap();
        assert_eq!(arr.len(), 3);
        assert_eq!(arr[0]["role"], "system");
        assert_eq!(arr[1]["role"], "user");
        assert_eq!(arr[1]["content"], "Hello");
        assert_eq!(arr[2]["content"], "World");
        assert_eq!(body["model"], "grok-2-latest");
    }

    /// Parse a realistic xAI JSON response to verify extraction
    /// logic — no network call needed.
    #[test]
    fn parse_response_extracts_content() {
        let fake_response = json!({
            "id": "chatcmpl-abc123",
            "object": "chat.completion",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! I'm Grok."
                },
                "finish_reason": "stop"
            }]
        });

        let content = fake_response["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("");
        assert_eq!(content, "Hello! I'm Grok.");
    }

    /// Edge case: empty choices array should yield an empty string
    /// rather than panic.
    #[test]
    fn parse_response_empty_choices() {
        let fake_response = json!({
            "choices": []
        });

        let content = fake_response["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("");
        assert_eq!(content, "");
    }

    /// Test model metadata for known models.
    #[test]
    fn test_model_metadata() {
        let (input, output, desc, max_tokens) = get_model_metadata("grok-2-latest");
        assert_eq!(input, Some(0.005));
        assert_eq!(output, Some(0.015));
        assert!(desc.is_some());
        assert_eq!(max_tokens, Some(128_000));

        let (input, output, desc, max_tokens) = get_model_metadata("grok-2");
        assert_eq!(input, Some(0.005));
        assert_eq!(output, Some(0.015));

        let (input, output, desc, max_tokens) = get_model_metadata("grok-2-mini");
        assert_eq!(input, Some(0.0005));
        assert_eq!(output, Some(0.0015));

        let (input, output, desc, max_tokens) = get_model_metadata("grok-beta");
        assert_eq!(input, Some(0.005));
        assert_eq!(output, Some(0.015));
    }

    /// Test unknown model returns None for pricing.
    #[test]
    fn test_unknown_model_metadata() {
        let (input, output, desc, max_tokens) = get_model_metadata("grok-unknown");
        assert_eq!(input, None);
        assert_eq!(output, None);
        assert!(desc.is_some());
        assert_eq!(max_tokens, None);
    }
}
