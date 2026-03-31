//! Groq API provider – fast inference with OpenAI-compatible API.
//!
//! Groq provides very fast inference (100+ tokens/sec) on popular open models
//! using their custom LPU hardware. API is fully OpenAI-compatible.
//!
//! Env var: `GROQ_API_KEY`
//! Base URL: `https://api.groq.com/openai/v1`

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Default endpoint for Groq API (OpenAI-compatible).
pub const DEFAULT_BASE_URL: &str = "https://api.groq.com/openai/v1";

/// Default model for Groq – Llama 3.3 70B (versatile).
pub const DEFAULT_MODEL: &str = "llama-3.3-70b-versatile";

/// Provider for Groq's fast inference API.
pub struct GroqProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: Client,
}

impl Default for GroqProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl GroqProvider {
    /// Create a new Groq provider from the `GROQ_API_KEY` environment variable.
    ///
    /// Uses the default model `llama-3.3-70b-versatile`.
    /// Panics if `GROQ_API_KEY` is not set.
    pub fn new() -> Self {
        let api_key = std::env::var("GROQ_API_KEY").expect("GROQ_API_KEY must be set");
        Self {
            api_key,
            base_url: DEFAULT_BASE_URL.to_string(),
            model: DEFAULT_MODEL.to_string(),
            client: super::get_shared_http_client(),
        }
    }

    /// Create a provider with explicit configuration.
    ///
    /// # Arguments
    /// * `api_key` – Groq API key
    /// * `model` – Model identifier (e.g., "llama-3.3-70b-versatile")
    pub fn with_config(api_key: String, model: String) -> Self {
        Self::with_full_config(api_key, DEFAULT_BASE_URL.to_string(), model)
    }

    /// Create a provider with full configuration including custom base URL.
    ///
    /// # Arguments
    /// * `api_key` – Groq API key
    /// * `base_url` – Base URL for the API (default: `https://api.groq.com/openai/v1`)
    /// * `model` – Model identifier
    pub fn with_full_config(api_key: String, base_url: String, model: String) -> Self {
        Self {
            api_key,
            base_url,
            model,
            client: super::get_shared_http_client(),
        }
    }

    /// Build the full chat completions endpoint URL.
    fn chat_endpoint(&self) -> String {
        format!("{}/chat/completions", self.base_url.trim_end_matches('/'))
    }

    /// Send chat messages and return a stream of content chunks.
    ///
    /// Uses SSE streaming when `GROQ_STREAM` env var is "true".
    pub fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        let use_streaming = std::env::var("GROQ_STREAM")
            .map(|v| v.eq_ignore_ascii_case("true"))
            .unwrap_or(true); // Default to streaming for Groq (fast!)

        if use_streaming {
            self.send_chat_stream_sse(messages)
        } else {
            self.send_chat_stream_fallback(messages)
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
            .post(self.chat_endpoint())
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!(
                    "Groq API returned {status}: {text}"
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

    /// Non-streaming fallback that yields the full reply as one chunk.
    fn send_chat_stream_fallback<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let reply = self.send_chat(messages).await?;
            yield reply;
        })
    }

    /// Send chat messages with function/tool calling support.
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
            .post(self.chat_endpoint())
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Groq API returned {status}: {text}");
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
impl ModelProvider for GroqProvider {
    /// Send chat messages to Groq and return the assistant's reply.
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

        let body = json!({
            "model": self.model,
            "messages": api_messages,
        });

        let resp = self
            .client
            .post(self.chat_endpoint())
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Groq API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;

        Ok(super::extract_content(&json))
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        GroqProvider::send_chat_with_functions(self, messages, functions).await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_sse(messages)
    }

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        let url = format!("{}/models", self.base_url.trim_end_matches('/'));

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
                        .get("owned_by")
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

/// Get pricing and metadata for known Groq models.
/// Prices are per 1K tokens in USD.
fn get_model_metadata(model_id: &str) -> (Option<f64>, Option<f64>, Option<String>, Option<u32>) {
    // Exact model ID matching for Groq models
    match model_id {
        "llama-3.3-70b-versatile" => (
            Some(0.00059),
            Some(0.00079),
            Some("Llama 3.3 70B Versatile – Meta's latest 70B model, very capable general-purpose model".to_string()),
            Some(128_000),
        ),
        "llama-3.1-8b-instant" => (
            Some(0.00005),
            Some(0.00008),
            Some("Llama 3.1 8B Instant – Fast, efficient model for quick tasks".to_string()),
            Some(128_000),
        ),
        "llama3-70b-8192" => (
            Some(0.00059),
            Some(0.00079),
            Some("Llama 3 70B – High-performance 70B parameter model".to_string()),
            Some(8_192),
        ),
        "llama3-8b-8192" => (
            Some(0.00005),
            Some(0.00008),
            Some("Llama 3 8B – Fast and affordable 8B parameter model".to_string()),
            Some(8_192),
        ),
        "gemma2-9b-it" => (
            Some(0.00020),
            Some(0.00020),
            Some("Gemma 2 9B IT – Google's 9B instruction-tuned model".to_string()),
            Some(8_192),
        ),
        "mixtral-8x7b-32768" => (
            Some(0.00024),
            Some(0.00024),
            Some("Mixtral 8x7B – Mistral's MoE model with 32K context".to_string()),
            Some(32_768),
        ),
        "mixtral-8x22b-instruct" => (
            Some(0.00065),
            Some(0.00065),
            Some("Mixtral 8x22B Instruct – Larger MoE model with improved capabilities".to_string()),
            Some(65_536),
        ),
        "deepseek-r1-distill-llama-70b" => (
            Some(0.00075),
            Some(0.00099),
            Some("DeepSeek R1 Distill Llama 70B – Reasoning model distilled from DeepSeek-R1".to_string()),
            Some(128_000),
        ),
        "deepseek-r1-distill-qwen-32b" => (
            Some(0.00069),
            Some(0.00069),
            Some("DeepSeek R1 Distill Qwen 32B – Reasoning model based on Qwen architecture".to_string()),
            Some(128_000),
        ),
        "qwen-2.5-32b" => (
            Some(0.00079),
            Some(0.00079),
            Some("Qwen 2.5 32B – Alibaba's Qwen 2.5 model".to_string()),
            Some(128_000),
        ),
        "qwen-2.5-coder-32b" => (
            Some(0.00079),
            Some(0.00079),
            Some("Qwen 2.5 Coder 32B – Code-specialized Qwen model".to_string()),
            Some(128_000),
        ),
        "llama-3.2-1b-preview" => (
            Some(0.00004),
            Some(0.00004),
            Some("Llama 3.2 1B Preview – Ultra-fast tiny model".to_string()),
            Some(128_000),
        ),
        "llama-3.2-3b-preview" => (
            Some(0.00006),
            Some(0.00006),
            Some("Llama 3.2 3B Preview – Small efficient model".to_string()),
            Some(128_000),
        ),
        "llama-3.2-11b-vision-preview" => (
            Some(0.00018),
            Some(0.00018),
            Some("Llama 3.2 11B Vision Preview – Multimodal vision model".to_string()),
            Some(128_000),
        ),
        "llama-3.2-90b-vision-preview" => (
            Some(0.00090),
            Some(0.00090),
            Some("Llama 3.2 90B Vision Preview – Large multimodal vision model".to_string()),
            Some(128_000),
        ),
        "whisper-large-v3" => (
            Some(0.00010),
            Some(0.00010),
            Some("Whisper Large v3 – Speech-to-text model (per second pricing approx)".to_string()),
            None,
        ),
        "whisper-large-v3-turbo" => (
            Some(0.00004),
            Some(0.00004),
            Some("Whisper Large v3 Turbo – Faster speech-to-text model".to_string()),
            None,
        ),
        _ => {
            // Unknown model – return None for pricing but provide a generic description
            let desc = format!("Groq model: {}", model_id);
            (None, None, Some(desc), None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construct_with_config() {
        let p = GroqProvider::with_config("gsk_test_key".into(), "llama-3.3-70b-versatile".into());
        assert_eq!(p.model, "llama-3.3-70b-versatile");
        assert_eq!(p.base_url, DEFAULT_BASE_URL);
    }

    #[test]
    fn construct_with_full_config() {
        let p = GroqProvider::with_full_config(
            "gsk_test_key".into(),
            "https://custom.groq.com/v1".into(),
            "mixtral-8x7b-32768".into(),
        );
        assert_eq!(p.model, "mixtral-8x7b-32768");
        assert_eq!(p.base_url, "https://custom.groq.com/v1");
    }

    #[test]
    fn chat_endpoint_format() {
        let p = GroqProvider::with_config("gsk_test".into(), "llama-3.3-70b-versatile".into());
        assert_eq!(
            p.chat_endpoint(),
            "https://api.groq.com/openai/v1/chat/completions"
        );
    }

    #[test]
    fn model_metadata_llama_33_70b() {
        let (input, output, desc, max_tokens) = get_model_metadata("llama-3.3-70b-versatile");
        assert_eq!(input, Some(0.00059));
        assert_eq!(output, Some(0.00079));
        assert!(desc.unwrap().contains("70B"));
        assert_eq!(max_tokens, Some(128_000));
    }

    #[test]
    fn model_metadata_llama_31_8b() {
        let (input, output, desc, max_tokens) = get_model_metadata("llama-3.1-8b-instant");
        assert_eq!(input, Some(0.00005));
        assert_eq!(output, Some(0.00008));
        assert!(desc.unwrap().contains("8B"));
        assert_eq!(max_tokens, Some(128_000));
    }

    #[test]
    fn model_metadata_deepseek_r1() {
        let (input, output, desc, max_tokens) = get_model_metadata("deepseek-r1-distill-llama-70b");
        assert_eq!(input, Some(0.00075));
        assert_eq!(output, Some(0.00099));
        assert!(desc.unwrap().contains("DeepSeek"));
        assert_eq!(max_tokens, Some(128_000));
    }

    #[test]
    fn model_metadata_unknown() {
        let (input, output, desc, max_tokens) = get_model_metadata("some-unknown-model");
        assert_eq!(input, None);
        assert_eq!(output, None);
        assert!(desc.unwrap().contains("some-unknown-model"));
        assert_eq!(max_tokens, None);
    }

    #[test]
    fn as_any_downcast() {
        let p = GroqProvider::with_config("gsk_test".into(), "llama-3.3-70b-versatile".into());
        let provider: &dyn ModelProvider = &p;
        assert!(provider.as_any().downcast_ref::<GroqProvider>().is_some());
    }
}
