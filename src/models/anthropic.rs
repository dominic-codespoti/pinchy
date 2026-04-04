//! Anthropic Claude provider.
//!
//! Routes chat through the Anthropic Messages API using direct HTTP requests.
//! When no API key is configured the provider returns a clearly-labelled
//! stub response so the rest of the system keeps working.
//!
//! Supports both `ANTHROPIC_API_KEY` env var and `CLAUDE_CODE_OAUTH_TOKEN`
//! (long-lived OAuth token from `claude setup-token`).

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;
use tracing::{debug, warn};

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Default Anthropic API endpoint for messages.
pub const DEFAULT_ANTHROPIC_ENDPOINT: &str = "https://api.anthropic.com/v1/messages";

/// Default model for Anthropic.
pub const DEFAULT_MODEL: &str = "claude-sonnet-4-20250514";

/// Maximum tokens to generate by default.
const DEFAULT_MAX_TOKENS: u32 = 8192;

// ---------------------------------------------------------------------------
// AnthropicProvider
// ---------------------------------------------------------------------------

/// Provider that talks to Anthropic's Messages API.
pub struct AnthropicProvider {
    api_key: String,
    endpoint: String,
    model: String,
    client: Client,
    max_tokens: u32,
}

impl Default for AnthropicProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AnthropicProvider {
    /// Create a new provider.
    ///
    /// Reads `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN` from the
    /// environment.  If neither is set, operates in stub mode.
    pub fn new() -> Self {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .or_else(|_| std::env::var("CLAUDE_CODE_OAUTH_TOKEN"))
            .unwrap_or_default();

        Self::with_config(
            api_key,
            DEFAULT_ANTHROPIC_ENDPOINT.to_string(),
            DEFAULT_MODEL.to_string(),
        )
    }

    /// Create a provider with explicit configuration.
    pub fn with_config(api_key: String, endpoint: String, model: String) -> Self {
        Self {
            api_key,
            endpoint,
            model,
            client: super::get_shared_http_client(),
            max_tokens: DEFAULT_MAX_TOKENS,
        }
    }

    /// Create with model and optional headers override.
    pub fn with_model_and_headers(
        model: &str,
        _header_overrides: Option<std::collections::HashMap<String, String>>,
    ) -> Self {
        let api_key = std::env::var("ANTHROPIC_API_KEY")
            .or_else(|_| std::env::var("CLAUDE_CODE_OAUTH_TOKEN"))
            .unwrap_or_default();

        Self {
            api_key,
            endpoint: DEFAULT_ANTHROPIC_ENDPOINT.to_string(),
            model: model.to_string(),
            client: super::get_shared_http_client(),
            max_tokens: DEFAULT_MAX_TOKENS,
        }
    }

    fn is_configured(&self) -> bool {
        !self.api_key.is_empty()
    }

    async fn send_chat_impl(
        &self,
        messages: &[ChatMessage],
        _stream: bool,
    ) -> Result<String, anyhow::Error> {
        if !self.is_configured() {
            anyhow::bail!(
                "Anthropic API key not configured — set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"
            );
        }

        let anthropic_messages: Vec<serde_json::Value> = messages
            .iter()
            .map(|m| {
                let mut msg = serde_json::json!({
                    "role": m.role.as_str(),
                    "content": m.content.as_str(),
                });
                if m.role == "assistant" {
                    if let Some(ref _tc) = m.tool_calls {
                        let content_parts: Vec<serde_json::Value> = vec![serde_json::json!({
                            "type": "text",
                            "text": m.content,
                        })];
                        msg["content"] = serde_json::json!(content_parts);
                    }
                }
                msg
            })
            .collect();

        let body = json!({
            "model": self.model,
            "messages": anthropic_messages,
            "max_tokens": self.max_tokens,
        });

        debug!(endpoint = %self.endpoint, model = %self.model, "Anthropic API request");

        let resp = self
            .client
            .post(&self.endpoint)
            .header("x-api-key", &self.api_key)
            .header("anthropic-version", "2023-06-01")
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Anthropic API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let content = json["content"]
            .as_array()
            .and_then(|arr| arr.first())
            .and_then(|first| first.get("text"))
            .and_then(|t| t.as_str())
            .unwrap_or_default()
            .to_string();

        Ok(content)
    }

    fn send_chat_stream_impl<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        if !self.is_configured() {
            return Box::pin(tokio_stream::once(Err(anyhow::anyhow!(
                "Anthropic API key not configured — set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN"
            ))));
        }

        Box::pin(async_stream::try_stream! {
            let anthropic_messages: Vec<serde_json::Value> = messages
                .iter()
                .map(|m| {
                    serde_json::json!({
                        "role": m.role.as_str(),
                        "content": m.content.as_str(),
                    })
                })
                .collect();

            let body = json!({
                "model": self.model,
                "messages": anthropic_messages,
                "max_tokens": self.max_tokens,
                "stream": true,
            });

            let resp = self
                .client
                .post(&self.endpoint)
                .header("x-api-key", &self.api_key)
                .header("anthropic-version", "2023-06-01")
                .header("content-type", "application/json")
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!("Anthropic streaming API returned {status}: {text}"))?;
                return;
            }

            use tokio_stream::StreamExt as _;
            let mut byte_stream = resp.bytes_stream();

            while let Some(chunk) = byte_stream.next().await {
                let chunk = chunk?;
                let text = String::from_utf8_lossy(&chunk);
                for line in text.lines() {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data == "[DONE]" {
                            return;
                        }
                        if let Ok(event) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(delta) = event["delta"].as_str() {
                                if !delta.is_empty() {
                                    yield delta.to_string();
                                }
                            } else if let Some(content_block) = event["content_block"].as_object() {
                                if content_block.get("type").and_then(|t| t.as_str()) == Some("text") {
                                    if let Some(text) = content_block.get("text").and_then(|t| t.as_str()) {
                                        yield text.to_string();
                                    }
                                }
                            }
                        }
                    }
                }
            }
        })
    }
}

#[async_trait]
impl ModelProvider for AnthropicProvider {
    fn context_window(&self) -> usize {
        super::pricing::lookup_pricing(&self.model)
            .map(|p| p.context_window)
            .unwrap_or(200_000)
    }

    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        if !self.is_configured() {
            warn!("Anthropic provider called without API key configured");
            return Ok(
                "[Anthropic not configured: set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN]"
                    .to_string(),
            );
        }
        self.send_chat_impl(messages, false).await
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        _functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        if !self.is_configured() {
            warn!("Anthropic provider called without API key configured");
            return Ok((
                ProviderResponse::Final("[Anthropic not configured]".to_string()),
                None,
            ));
        }
        let reply = self.send_chat_impl(messages, false).await?;
        Ok((ProviderResponse::Final(reply), None))
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_impl(messages)
    }

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        // NOTE: Anthropic doesn't currently provide a public API endpoint for
        // listing available models. The Messages API doesn't include a /models endpoint.
        //
        // This static list includes currently available Claude models. For the
        // most up-to-date model information, see:
        // https://docs.anthropic.com/en/docs/about-claude/models
        Ok(Some(vec![
            super::ModelInfo {
                id: "claude-opus-4-20250514".to_string(),
                name: "Claude Opus 4".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["messages".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "claude-sonnet-4-20250514".to_string(),
                name: "Claude Sonnet 4".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["messages".to_string()],
                is_default: true,
                ..Default::default()
            },
            super::ModelInfo {
                id: "claude-3-5-sonnet-20241022".to_string(),
                name: "Claude 3.5 Sonnet".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["messages".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "claude-3-opus-20240229".to_string(),
                name: "Claude 3 Opus".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["messages".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "claude-3-sonnet-20240229".to_string(),
                name: "Claude 3 Sonnet".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["messages".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "claude-3-haiku-20240307".to_string(),
                name: "Claude 3 Haiku".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["messages".to_string()],
                is_default: false,
                ..Default::default()
            },
        ]))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construct_with_config() {
        use crate::ports::ANTHROPIC_COMPAT;

        let p = AnthropicProvider::with_config(
            "sk-ant-test".into(),
            format!("http://localhost:{}", ANTHROPIC_COMPAT),
            "claude-sonnet-4-20250514".into(),
        );
        assert_eq!(p.model, "claude-sonnet-4-20250514");
        assert!(p.is_configured());
    }

    #[test]
    fn construct_without_key() {
        let p = AnthropicProvider::new();
        assert!(!p.is_configured());
    }

    #[test]
    fn context_window() {
        let p = AnthropicProvider::default();
        assert_eq!(p.context_window(), 200_000);
    }
}
