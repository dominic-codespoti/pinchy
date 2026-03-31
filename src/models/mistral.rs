//! Mistral AI provider implementation.
//!
//! Provides native support for Mistral AI's API, which is OpenAI-compatible
//! but with Mistral-specific defaults and model discovery.
//!
//! Config example:
//! ```yaml
//! models:
//!   - id: mistral-large
//!     provider: mistral
//!     model: mistral-large-latest
//!     api_key: $MISTRAL_API_KEY
//! ```

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelInfo, ModelProvider, ProviderResponse, TokenUsage};

/// Default endpoint for Mistral AI API.
pub const DEFAULT_ENDPOINT: &str = "https://api.mistral.ai/v1";

/// Default chat completions path.
const CHAT_COMPLETIONS_PATH: &str = "/chat/completions";

/// Provider that talks to the Mistral AI API.
pub struct MistralProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: Client,
}

impl MistralProvider {
    /// Create a new provider with the given API key and model.
    ///
    /// Uses the default Mistral endpoint (`https://api.mistral.ai/v1`).
    pub fn new(api_key: String, model: String) -> Self {
        Self::with_config(api_key, DEFAULT_ENDPOINT.to_string(), model)
    }

    /// Create a provider with explicit configuration.
    ///
    /// `base_url` should be the base API URL (e.g., `https://api.mistral.ai/v1`).
    pub fn with_config(api_key: String, base_url: String, model: String) -> Self {
        tracing::debug!(
            base_url = %base_url,
            model = %model,
            "MistralProvider: constructed"
        );
        Self {
            api_key,
            base_url: base_url.trim_end_matches('/').to_string(),
            client: super::get_shared_http_client(),
            model,
        }
    }

    /// Get the full chat completions endpoint URL.
    fn chat_endpoint(&self) -> String {
        format!("{}{}", self.base_url, CHAT_COMPLETIONS_PATH)
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

            let endpoint = self.chat_endpoint();
            let resp = self
                .client
                .post(&endpoint)
                .bearer_auth(&self.api_key)
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!(
                    "Mistral API returned {status}: {text}"
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
}

#[async_trait]
impl ModelProvider for MistralProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

        let body = json!({
            "model": self.model,
            "messages": api_messages,
        });

        let endpoint = self.chat_endpoint();
        let resp = self
            .client
            .post(&endpoint)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Mistral API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok(content)
    }

    async fn send_chat_with_functions(
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

        let endpoint = self.chat_endpoint();
        let resp = self
            .client
            .post(&endpoint)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Mistral API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let usage = super::parse_token_usage(&json);

        if let Some(pr) = super::parse_tool_calls(&json) {
            return Ok((pr, usage));
        }

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok((ProviderResponse::Final(content), usage))
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_sse(messages)
    }

    async fn embed(&self, texts: &[&str]) -> Result<Option<Vec<Vec<f32>>>, anyhow::Error> {
        let url = format!("{}/embeddings", self.base_url);
        let body = json!({
            "model": "mistral-embed",
            "input": texts,
        });

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Mistral Embeddings API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let data = json["data"].as_array();

        match data {
            Some(arr) => {
                let vecs: Vec<Vec<f32>> = arr
                    .iter()
                    .filter_map(|item| {
                        item["embedding"].as_array().map(|e| {
                            e.iter()
                                .filter_map(|v| v.as_f64().map(|f| f as f32))
                                .collect()
                        })
                    })
                    .collect();
                Ok(Some(vecs))
            }
            None => Ok(None),
        }
    }

    async fn list_models(&self) -> Result<Option<Vec<ModelInfo>>, anyhow::Error> {
        let url = format!("{}/models", self.base_url);

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

        let models: Vec<ModelInfo> = data
            .iter()
            .filter_map(|m| {
                let id = m.get("id")?.as_str()?.to_string();
                let (input_price, output_price, description, max_tokens) = get_model_metadata(&id);
                Some(ModelInfo {
                    name: id.clone(),
                    id,
                    vendor: Some("Mistral AI".to_string()),
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

/// Get pricing and metadata for known Mistral models.
/// Returns (input_price, output_price, description, max_tokens) per 1K tokens.
fn get_model_metadata(model_id: &str) -> (Option<f64>, Option<f64>, Option<String>, Option<u32>) {
    // Normalize model ID (strip date suffixes and -latest suffix)
    let base_id = model_id
        .trim_end_matches("-latest")
        .trim_end_matches(|c: char| c.is_ascii_digit() || c == '-')
        .trim_end_matches('-');

    match base_id {
        "mistral-large" => (
            Some(0.002),
            Some(0.006),
            Some("Mistral Large - Flagship model for complex tasks".to_string()),
            Some(131_072),
        ),
        "mistral-small" => (
            Some(0.0002),
            Some(0.0006),
            Some("Mistral Small - Efficient model for simpler tasks".to_string()),
            Some(131_072),
        ),
        "codestral" => (
            Some(0.0002),
            Some(0.0006),
            Some("Codestral - Code-focused model optimized for programming tasks".to_string()),
            Some(256_000),
        ),
        "pixtral-large" => (
            Some(0.002),
            Some(0.006),
            Some("Pixtral Large - Vision-capable multimodal model".to_string()),
            Some(131_072),
        ),
        "pixtral" => (
            Some(0.0002),
            Some(0.0006),
            Some("Pixtral - Efficient vision-capable model".to_string()),
            Some(131_072),
        ),
        "ministral" => (
            Some(0.0001),
            Some(0.0003),
            Some("Ministral - Lightweight model for edge devices".to_string()),
            Some(131_072),
        ),
        "mistral-embed" => (
            Some(0.0001),
            Some(0.0001),
            Some("Mistral Embed - Text embedding model".to_string()),
            None,
        ),
        "mistral-moderation" => (
            Some(0.0001),
            Some(0.0001),
            Some("Mistral Moderation - Content moderation model".to_string()),
            None,
        ),
        _ => {
            // Unknown model - return None for pricing, but provide a generic description
            let desc = format!("Mistral model: {}", model_id);
            (None, None, Some(desc), None)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construct_with_new() {
        let p = MistralProvider::new("test-key".into(), "mistral-large-latest".into());
        assert_eq!(p.model, "mistral-large-latest");
        assert_eq!(p.api_key, "test-key");
        assert_eq!(p.base_url, "https://api.mistral.ai/v1");
    }

    #[test]
    fn construct_with_config() {
        let p = MistralProvider::with_config(
            "test-key".into(),
            "https://custom.mistral.ai/v1".into(),
            "mistral-small-latest".into(),
        );
        assert_eq!(p.model, "mistral-small-latest");
        assert_eq!(p.api_key, "test-key");
        assert_eq!(p.base_url, "https://custom.mistral.ai/v1");
    }

    #[test]
    fn chat_endpoint_format() {
        let p = MistralProvider::new("key".into(), "mistral-large".into());
        assert_eq!(
            p.chat_endpoint(),
            "https://api.mistral.ai/v1/chat/completions"
        );
    }

    #[test]
    fn chat_endpoint_with_trailing_slash() {
        let p = MistralProvider::with_config(
            "key".into(),
            "https://api.mistral.ai/v1/".into(),
            "mistral-small".into(),
        );
        assert_eq!(
            p.chat_endpoint(),
            "https://api.mistral.ai/v1/chat/completions"
        );
    }

    #[test]
    fn as_any_downcast() {
        let p = MistralProvider::new("key".into(), "mistral-large".into());
        let provider: &dyn ModelProvider = &p;
        assert!(provider
            .as_any()
            .downcast_ref::<MistralProvider>()
            .is_some());
    }

    #[tokio::test]
    async fn send_chat_fails_without_server() {
        let p =
            MistralProvider::with_config("key".into(), "http://127.0.0.1:1".into(), "test".into());
        let msgs = vec![ChatMessage::new("user", "hi")];
        let result = p.send_chat(&msgs).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn send_chat_with_functions_fails_without_server() {
        let p =
            MistralProvider::with_config("key".into(), "http://127.0.0.1:1".into(), "test".into());
        let msgs = vec![ChatMessage::new("user", "hi")];
        let funcs = vec![serde_json::json!({
            "name": "test_fn",
            "parameters": { "type": "object", "properties": {} }
        })];
        let result = p.send_chat_with_functions(&msgs, &funcs).await;
        assert!(result.is_err());
    }

    #[test]
    fn model_metadata_mistral_large() {
        let (input, output, desc, max) = get_model_metadata("mistral-large-latest");
        assert_eq!(input, Some(0.002));
        assert_eq!(output, Some(0.006));
        assert!(desc.unwrap().contains("Flagship"));
        assert_eq!(max, Some(131_072));
    }

    #[test]
    fn model_metadata_mistral_small() {
        let (input, output, desc, max) = get_model_metadata("mistral-small-latest");
        assert_eq!(input, Some(0.0002));
        assert_eq!(output, Some(0.0006));
        assert!(desc.unwrap().contains("Efficient"));
        assert_eq!(max, Some(131_072));
    }

    #[test]
    fn model_metadata_codestral() {
        let (input, output, desc, max) = get_model_metadata("codestral-latest");
        assert_eq!(input, Some(0.0002));
        assert_eq!(output, Some(0.0006));
        assert!(desc.unwrap().contains("Code"));
        assert_eq!(max, Some(256_000));
    }

    #[test]
    fn model_metadata_pixtral_large() {
        let (input, output, desc, max) = get_model_metadata("pixtral-large-latest");
        assert_eq!(input, Some(0.002));
        assert_eq!(output, Some(0.006));
        assert!(desc.unwrap().contains("Vision"));
        assert_eq!(max, Some(131_072));
    }

    #[test]
    fn model_metadata_unknown() {
        let (input, output, desc, max) = get_model_metadata("custom-model");
        assert_eq!(input, None);
        assert_eq!(output, None);
        assert!(desc.unwrap().contains("custom-model"));
        assert_eq!(max, None);
    }
}
