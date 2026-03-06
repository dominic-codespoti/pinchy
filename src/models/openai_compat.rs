//! Generic OpenAI-compatible provider.
//!
//! Works with any API that implements the OpenAI chat completions
//! interface: OpenRouter, Ollama, Groq, Together, Fireworks, Mistral,
//! LM Studio, vLLM, text-generation-webui, etc.
//!
//! Config example:
//! ```yaml
//! models:
//!   - id: local-llama
//!     provider: openai-compat
//!     model: llama3
//!     endpoint: http://localhost:11434/v1/chat/completions
//!     api_key: $OLLAMA_KEY   # optional — some local servers need none
//! ```

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Provider that talks to any OpenAI-compatible chat completions API.
pub struct OpenAICompatProvider {
    api_key: String,
    endpoint: String,
    model: String,
    client: Client,
    /// Optional header overrides from config.
    header_overrides: Option<std::collections::HashMap<String, String>>,
}

impl OpenAICompatProvider {
    /// Create a provider with explicit configuration.
    ///
    /// `api_key` may be empty for local servers that don't require auth.
    pub fn new(endpoint: String, api_key: String, model: String) -> Self {
        Self::with_headers(endpoint, api_key, model, None)
    }

    /// Create a provider with explicit configuration and optional header overrides.
    pub fn with_headers(
        endpoint: String,
        api_key: String,
        model: String,
        header_overrides: Option<std::collections::HashMap<String, String>>,
    ) -> Self {
        tracing::debug!(
            endpoint = %endpoint,
            model = %model,
            header_overrides = ?header_overrides,
            "OpenAICompatProvider: constructed"
        );
        Self {
            api_key,
            endpoint,
            model,
            client: super::get_shared_http_client(),
            header_overrides,
        }
    }

    /// Apply header overrides to a request builder.
    fn apply_headers(&self, mut req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
        if let Some(ref overrides) = self.header_overrides {
            for (key, value) in overrides {
                req = req.header(key.as_str(), value.as_str());
            }
        }
        req
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

            let mut req = self.client.post(&self.endpoint).json(&body);
            if !self.api_key.is_empty() {
                req = req.bearer_auth(&self.api_key);
            }
            req = self.apply_headers(req);
            let resp = req.send().await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!(
                    "OpenAI-compat API returned {status}: {text}"
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
impl ModelProvider for OpenAICompatProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

        let body = json!({
            "model": self.model,
            "messages": api_messages,
        });

        let mut req = self.client.post(&self.endpoint).json(&body);
        if !self.api_key.is_empty() {
            req = req.bearer_auth(&self.api_key);
        }
        let resp = req.send().await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("OpenAI-compat API returned {status}: {text}");
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
            body["functions"] = serde_json::Value::Array(functions.to_vec());
            body["function_call"] = json!("auto");
        }

        let mut req = self.client.post(&self.endpoint).json(&body);
        if !self.api_key.is_empty() {
            req = req.bearer_auth(&self.api_key);
        }
        let resp = req.send().await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("OpenAI-compat API returned {status}: {text}");
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

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        let base = self
            .endpoint
            .trim_end_matches('/')
            .trim_end_matches("/chat/completions")
            .trim_end_matches('/');
        let url = format!("{base}/models");

        let mut req = self.client.get(&url);
        if !self.api_key.is_empty() {
            req = req.header("Authorization", format!("Bearer {}", self.api_key));
        }
        if let Some(ref overrides) = self.header_overrides {
            for (k, v) in overrides {
                req = req.header(k.as_str(), v.as_str());
            }
        }

        let resp = match req.send().await {
            Ok(r) => r,
            Err(_) => return Ok(None),
        };

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
                Some(super::ModelInfo {
                    name: id.clone(),
                    id,
                    vendor: m
                        .get("owned_by")
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string()),
                    supported_endpoints: vec!["chat".to_string()],
                    is_default: false,
                })
            })
            .collect();

        Ok(Some(models))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construct_with_empty_key() {
        let p = OpenAICompatProvider::new(
            "http://localhost:11434/v1/chat/completions".into(),
            String::new(),
            "llama3".into(),
        );
        assert_eq!(p.model, "llama3");
        assert!(p.api_key.is_empty());
    }

    #[test]
    fn construct_with_key() {
        let p = OpenAICompatProvider::new(
            "https://openrouter.ai/api/v1/chat/completions".into(),
            "sk-or-test".into(),
            "anthropic/claude-sonnet-4-20250514".into(),
        );
        assert_eq!(p.endpoint, "https://openrouter.ai/api/v1/chat/completions");
        assert!(!p.api_key.is_empty());
    }

    #[test]
    fn model_stored_correctly() {
        let p = OpenAICompatProvider::new(
            "http://localhost:8080/v1/chat/completions".into(),
            String::new(),
            "mixtral-8x7b".into(),
        );
        assert_eq!(p.model, "mixtral-8x7b");
        assert_eq!(p.endpoint, "http://localhost:8080/v1/chat/completions");
    }

    #[tokio::test]
    async fn send_chat_fails_without_server() {
        let p = OpenAICompatProvider::new(
            "http://127.0.0.1:1/v1/chat/completions".into(),
            String::new(),
            "test".into(),
        );
        let msgs = vec![ChatMessage::new("user", "hi")];
        let result = p.send_chat(&msgs).await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn send_chat_with_functions_fails_without_server() {
        let p = OpenAICompatProvider::new(
            "http://127.0.0.1:1/v1/chat/completions".into(),
            String::new(),
            "test".into(),
        );
        let msgs = vec![ChatMessage::new("user", "hi")];
        let funcs = vec![serde_json::json!({
            "name": "test_fn",
            "parameters": { "type": "object", "properties": {} }
        })];
        let result = p.send_chat_with_functions(&msgs, &funcs).await;
        assert!(result.is_err());
    }

    #[test]
    fn as_any_downcast() {
        let p = OpenAICompatProvider::new(
            "http://localhost:11434/v1/chat/completions".into(),
            String::new(),
            "llama3".into(),
        );
        let provider: &dyn ModelProvider = &p;
        assert!(provider
            .as_any()
            .downcast_ref::<OpenAICompatProvider>()
            .is_some());
    }
}
