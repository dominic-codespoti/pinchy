//! Together AI provider for OpenAI-compatible chat completions.
//!
//! Uses the Together AI Inference API at https://api.together.xyz/v1
//! Supports open-source models hosted on Together AI.
//!
//! Config example:
//! ```yaml
//! models:
//!   - id: together-llama-70b
//!     provider: together
//!     model: meta-llama/Llama-3.3-70B-Instruct-Turbo
//!     api_key: $TOGETHER_API_KEY
//! ```

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Default endpoint for Together AI chat completions.
pub const DEFAULT_ENDPOINT: &str = "https://api.together.xyz/v1/chat/completions";

/// Default base URL for Together AI API.
pub const DEFAULT_BASE_URL: &str = "https://api.together.xyz/v1";

/// Provider that talks to the Together AI Inference API.
pub struct TogetherProvider {
    api_key: String,
    endpoint: String,
    model: String,
    client: Client,
}

impl TogetherProvider {
    /// Create a new provider with API key and model.
    ///
    /// Uses the default Together AI endpoint.
    pub fn new(api_key: String, model: String) -> Self {
        Self::with_config(api_key, DEFAULT_ENDPOINT.to_string(), model)
    }

    /// Create a provider with explicit configuration.
    ///
    /// `api_key` should be a valid Together AI API key.
    /// `base_url` should be the full URL to the chat completions endpoint.
    pub fn with_config(api_key: String, endpoint: String, model: String) -> Self {
        tracing::debug!(
            endpoint = %endpoint,
            model = %model,
            "TogetherProvider: constructed"
        );
        Self {
            api_key,
            endpoint,
            model,
            client: super::get_shared_http_client(),
        }
    }

    /// Send chat messages and return a stream of content chunks.
    ///
    /// Uses SSE streaming to yield incremental content deltas.
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
                    "Together AI API returned {status}: {text}"
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
    ///
    /// Returns [`ProviderResponse::FunctionCall`] when the model wants to
    /// invoke a tool, or [`ProviderResponse::Final`] for a normal reply.
    pub async fn send_chat_with_functions_impl(
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
            anyhow::bail!("Together AI API returned {status}: {text}");
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
impl ModelProvider for TogetherProvider {
    /// Send chat messages to the Together AI completions endpoint and return
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
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Together AI API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;

        Ok(super::extract_content(&json))
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        self.send_chat_with_functions_impl(messages, functions)
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
        let url = format!("{base}/models");

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
                    id,
                    vendor: m
                        .get("organization")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
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

/// Get pricing and metadata for known Together AI models.
/// Returns (input_price, output_price, description, max_tokens) per 1K tokens.
fn get_model_metadata(model_id: &str) -> (Option<f64>, Option<f64>, Option<String>, Option<u32>) {
    match model_id {
        // Llama models
        "meta-llama/Llama-3.3-70B-Instruct-Turbo" => (
            Some(0.00088),
            Some(0.00088),
            Some("Llama 3.3 70B Instruct Turbo - 70B parameter Llama model optimized for instruction following".to_string()),
            Some(128_000),
        ),
        "meta-llama/Llama-3.1-405B-Instruct-Turbo" => (
            Some(0.005),
            Some(0.005),
            Some("Llama 3.1 405B Instruct Turbo - 405B parameter Llama model, largest open-source LLM".to_string()),
            Some(128_000),
        ),
        "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo" => (
            Some(0.00018),
            Some(0.00018),
            Some("Llama 3.1 8B Instruct Turbo - 8B parameter efficient Llama model".to_string()),
            Some(128_000),
        ),
        // Mistral models
        "mistralai/Mixtral-8x7B-Instruct-v0.1" => (
            Some(0.00054),
            Some(0.00054),
            Some("Mixtral 8x7B Instruct - Sparse mixture-of-experts model with 8 experts".to_string()),
            Some(32_768),
        ),
        // Qwen models
        "Qwen/Qwen2.5-72B-Instruct-Turbo" => (
            Some(0.0012),
            Some(0.0012),
            Some("Qwen 2.5 72B Instruct Turbo - Alibaba's 72B parameter multilingual model".to_string()),
            Some(131_072),
        ),
        // DeepSeek models
        "deepseek-ai/DeepSeek-V3" => (
            Some(0.00125),
            Some(0.00125),
            Some("DeepSeek V3 - Mixture-of-experts model with 671B total parameters".to_string()),
            Some(64_000),
        ),
        "deepseek-ai/DeepSeek-R1" => (
            Some(0.008),
            Some(0.008),
            Some("DeepSeek R1 - Reasoning model trained with reinforcement learning".to_string()),
            Some(64_000),
        ),
        _ => {
            let desc = format!("Together AI model: {}", model_id);
            (None, None, Some(desc), None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: provider can be constructed with explicit config.
    #[test]
    fn construct_with_config() {
        let p = TogetherProvider::with_config(
            "sk-test".into(),
            "https://api.together.xyz/v1/chat/completions".into(),
            "meta-llama/Llama-3.3-70B-Instruct-Turbo".into(),
        );
        assert_eq!(p.model, "meta-llama/Llama-3.3-70B-Instruct-Turbo");
        assert_eq!(p.endpoint, "https://api.together.xyz/v1/chat/completions");
    }

    /// Test the simple constructor with default endpoint.
    #[test]
    fn construct_simple() {
        let p = TogetherProvider::new(
            "sk-test".into(),
            "meta-llama/Llama-3.3-70B-Instruct-Turbo".into(),
        );
        assert_eq!(p.model, "meta-llama/Llama-3.3-70B-Instruct-Turbo");
        assert!(!p.api_key.is_empty());
    }

    /// Test model metadata for known models.
    #[test]
    fn known_model_metadata() {
        let (input, output, desc, max_tokens) =
            get_model_metadata("meta-llama/Llama-3.3-70B-Instruct-Turbo");
        assert!(input.is_some());
        assert!(output.is_some());
        assert!(desc.unwrap().contains("Llama 3.3"));
        assert_eq!(max_tokens, Some(128_000));

        let (input, output, desc, max_tokens) = get_model_metadata("deepseek-ai/DeepSeek-V3");
        assert!(input.is_some());
        assert!(desc.unwrap().contains("DeepSeek V3"));

        let (input, output, desc, max_tokens) =
            get_model_metadata("mistralai/Mixtral-8x7B-Instruct-v0.1");
        assert!(input.is_some());
        assert!(desc.unwrap().contains("Mixtral"));
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

    /// Parse a realistic Together AI JSON response to verify extraction logic.
    #[test]
    fn parse_response_extracts_content() {
        let fake_response = serde_json::json!({
            "id": "chatcmpl-abc123",
            "object": "chat.completion",
            "model": "meta-llama/Llama-3.3-70B-Instruct-Turbo",
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": "Hello! How can I help you today?"
                },
                "finish_reason": "stop"
            }]
        });

        let content = super::super::extract_content(&fake_response);
        assert_eq!(content, "Hello! How can I help you today?");
    }

    /// Test as_any downcast works correctly.
    #[test]
    fn as_any_downcast() {
        let p = TogetherProvider::new(
            "sk-test".into(),
            "meta-llama/Llama-3.3-70B-Instruct-Turbo".into(),
        );
        let provider: &dyn ModelProvider = &p;
        assert!(provider
            .as_any()
            .downcast_ref::<TogetherProvider>()
            .is_some());
    }
}
