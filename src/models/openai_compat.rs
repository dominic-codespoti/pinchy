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
}

impl OpenAICompatProvider {
    /// Create a provider with explicit configuration.
    ///
    /// `api_key` may be empty for local servers that don't require auth.
    pub fn new(endpoint: String, api_key: String, model: String) -> Self {
        Self {
            api_key,
            endpoint,
            model,
            client: super::get_shared_http_client(),
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

            let mut req = self.client.post(&self.endpoint).json(&body);
            if !self.api_key.is_empty() {
                req = req.bearer_auth(&self.api_key);
            }
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

        Ok(super::extract_content(&json))
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

        Ok((
            ProviderResponse::Final(super::extract_content(&json)),
            usage,
        ))
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_sse(messages)
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
