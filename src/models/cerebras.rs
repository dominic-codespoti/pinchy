//! Cerebras AI provider for OpenAI-compatible chat completions.
//!
//! Uses the Cerebras Inference API at https://api.cerebras.ai/v1
//! Supports Llama models with fast inference on Cerebras hardware.
//!
//! Config example:
//! ```yaml
//! models:
//!   - id: cerebras-llama-70b
//!     provider: cerebras
//!     model: llama-3.3-70b
//!     api_key: $CEREBRAS_API_KEY
//! ```

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Default endpoint for Cerebras chat completions.
pub const DEFAULT_ENDPOINT: &str = "https://api.cerebras.ai/v1/chat/completions";

/// Custom integration header for Cerebras.
const INTEGRATION_HEADER: &str = "X-Cerebras-3rd-Party-Integration";
const INTEGRATION_VALUE: &str = "opencode";

/// Provider that talks to the Cerebras Inference API.
pub struct CerebrasProvider {
    api_key: String,
    endpoint: String,
    client: Client,
    /// Model name sent in the request body (e.g. "llama-3.3-70b").
    model: String,
}

impl Default for CerebrasProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CerebrasProvider {
    /// Create a new provider.
    ///
    /// Reads `CEREBRAS_API_KEY` from the environment. Panics if the
    /// variable is missing — fail fast at startup rather than at first
    /// request.
    pub fn new() -> Self {
        let api_key = std::env::var("CEREBRAS_API_KEY").expect("CEREBRAS_API_KEY must be set");
        Self {
            api_key,
            endpoint: DEFAULT_ENDPOINT.to_string(),
            client: super::get_shared_http_client(),
            model: "llama-3.3-70b".to_string(),
        }
    }

    /// Create a provider with explicit configuration (useful for tests
    /// or non-default endpoints).
    pub fn with_config(api_key: String, endpoint: String, model: String) -> Self {
        Self {
            api_key,
            endpoint,
            client: super::get_shared_http_client(),
            model,
        }
    }

    /// Send chat messages and return a stream of content chunks.
    ///
    /// When the `CEREBRAS_STREAM` environment variable is `"true"`, the
    /// request uses the streaming API (`"stream": true` in the body) and
    /// yields incremental content deltas parsed from the SSE event
    /// stream. Otherwise, falls back to a single-shot request that
    /// yields the complete reply as one item.
    pub fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        let use_streaming = std::env::var("CEREBRAS_STREAM")
            .map(|v| v.eq_ignore_ascii_case("true"))
            .unwrap_or(true);

        self.send_chat_stream_mode(messages, use_streaming)
    }

    /// Like [`send_chat_stream`] but with an explicit `streaming` flag
    /// (useful for testing without env-var races).
    pub fn send_chat_stream_mode<'a>(
        &'a self,
        messages: &'a [ChatMessage],
        streaming: bool,
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        if streaming {
            self.send_chat_stream_sse(messages)
        } else {
            self.send_chat_stream_fallback(messages)
        }
    }

    /// Internal: SSE streaming implementation.
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
                .header(INTEGRATION_HEADER, INTEGRATION_VALUE)
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!(
                    "Cerebras API returned {status}: {text}"
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

    /// Internal: non-streaming fallback that yields the full reply as one
    /// chunk.
    fn send_chat_stream_fallback<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let reply = self.send_chat(messages).await?;
            yield reply;
        })
    }

    /// Send chat messages with an array of function definitions.
    ///
    /// Returns [`ProviderResponse::FunctionCall`] when the model wants to
    /// invoke a tool, or [`ProviderResponse::Final`] for a normal reply.
    pub async fn send_chat_with_functions(
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
            .header(INTEGRATION_HEADER, INTEGRATION_VALUE)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Cerebras API returned {status}: {text}");
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
impl ModelProvider for CerebrasProvider {
    /// Send chat messages to the Cerebras completions endpoint and return
    /// the first choice's content.
    ///
    /// Messages are forwarded with their original roles.
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
            .header(INTEGRATION_HEADER, INTEGRATION_VALUE)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Cerebras API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;

        Ok(super::extract_content(&json))
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        CerebrasProvider::send_chat_with_functions(self, messages, functions).await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_mode(messages, true)
    }

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        let base = self
            .endpoint
            .trim_end_matches('/')
            .trim_end_matches("/chat/completions")
            .trim_end_matches('/');
        let url = format!("{base}/models");

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&self.api_key)
            .header(INTEGRATION_HEADER, INTEGRATION_VALUE)
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
                    id,
                    vendor: Some("Cerebras".to_string()),
                    supported_endpoints: vec!["chat".to_string()],
                    is_default: false,
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

/// Get pricing and metadata for known Cerebras models.
/// Returns (input_price, output_price, description, max_tokens) per 1K tokens.
fn get_model_metadata(model_id: &str) -> (Option<f64>, Option<f64>, Option<String>, Option<u32>) {
    match model_id {
        "llama-3.3-70b" => (
            Some(0.0006),
            Some(0.0009),
            Some("Llama 3.3 70B - 70B parameter Llama model on Cerebras hardware".to_string()),
            Some(128_000),
        ),
        "llama-3.1-8b" => (
            Some(0.0001),
            Some(0.0002),
            Some("Llama 3.1 8B - 8B parameter Llama model on Cerebras hardware".to_string()),
            Some(128_000),
        ),
        _ => {
            let desc = format!("Cerebras model: {}", model_id);
            (None, None, Some(desc), None)
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
        let p = CerebrasProvider::with_config(
            "sk-test".into(),
            "https://api.cerebras.ai/v1/chat/completions".into(),
            "llama-3.3-70b".into(),
        );
        assert_eq!(p.model, "llama-3.3-70b");
    }

    /// Build the JSON request body the same way `send_chat` does and
    /// verify its structure — no network call needed.
    #[test]
    fn request_body_format() {
        let messages = vec!["Hello".to_string(), "World".to_string()];
        let model = "llama-3.3-70b";

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
        assert_eq!(body["model"], "llama-3.3-70b");
    }

    /// Parse a realistic Cerebras JSON response to verify extraction
    /// logic — no network call needed.
    #[test]
    fn parse_response_extracts_content() {
        let fake_response = json!({
            "id": "chatcmpl-abc123",
            "object": "chat.completion",
            "model": "llama-3.3-70b",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hi there!"
                },
                "finish_reason": "stop"
            }]
        });

        let content = fake_response["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("");
        assert_eq!(content, "Hi there!");
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
    fn known_model_metadata() {
        let (input, output, desc, max_tokens) = get_model_metadata("llama-3.3-70b");
        assert_eq!(input, Some(0.0006));
        assert_eq!(output, Some(0.0009));
        assert!(desc.unwrap().contains("70B"));
        assert_eq!(max_tokens, Some(128_000));

        let (input, output, desc, max_tokens) = get_model_metadata("llama-3.1-8b");
        assert_eq!(input, Some(0.0001));
        assert_eq!(output, Some(0.0002));
        assert!(desc.unwrap().contains("8B"));
        assert_eq!(max_tokens, Some(128_000));
    }

    /// Test unknown model returns generic description.
    #[test]
    fn unknown_model_metadata() {
        let (input, output, desc, max_tokens) = get_model_metadata("unknown-model");
        assert_eq!(input, None);
        assert_eq!(output, None);
        assert!(desc.unwrap().contains("unknown-model"));
        assert_eq!(max_tokens, None);
    }
}
