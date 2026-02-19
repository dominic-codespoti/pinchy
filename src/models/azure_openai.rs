//! Azure OpenAI chat-completions provider.
//!
//! Communicates with the Azure OpenAI Service API, which uses
//! deployment-scoped endpoints and `api-key` header authentication
//! instead of `Authorization: Bearer`.

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Provider that talks to the Azure OpenAI Service API.
pub struct AzureOpenAIProvider {
    endpoint: String,
    api_key: String,
    deployment: String,
    api_version: String,
    client: Client,
    /// Optional embedding deployment name — when set, `embed()` is available.
    embedding_deployment: Option<String>,
}

impl AzureOpenAIProvider {
    /// Create a new Azure OpenAI provider with explicit configuration.
    pub fn new(
        endpoint: String,
        api_key: String,
        deployment: String,
        api_version: Option<String>,
        embedding_deployment: Option<String>,
    ) -> Self {
        let endpoint = endpoint.trim_end_matches('/').to_string();
        Self {
            endpoint,
            api_key,
            deployment,
            api_version: api_version.unwrap_or_else(|| "2024-10-21".to_string()),
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(90))
                .connect_timeout(std::time::Duration::from_secs(10))
                .build()
                .expect("failed to build HTTP client"),
            embedding_deployment,
        }
    }

    /// Build the chat completions URL for this deployment.
    fn chat_url(&self) -> String {
        format!(
            "{}/openai/deployments/{}/chat/completions?api-version={}",
            self.endpoint, self.deployment, self.api_version,
        )
    }

    /// Build the embeddings URL for the embedding deployment.
    fn embeddings_url(&self) -> Option<String> {
        self.embedding_deployment.as_ref().map(|dep| {
            format!(
                "{}/openai/deployments/{}/embeddings?api-version={}",
                self.endpoint, dep, self.api_version,
            )
        })
    }

    /// Generate an embedding vector for the given text.
    ///
    /// Returns `None` if no `embedding_deployment` is configured.
    pub async fn embed(&self, text: &str) -> anyhow::Result<Option<Vec<f32>>> {
        let url = match self.embeddings_url() {
            Some(u) => u,
            None => return Ok(None),
        };

        let body = json!({
            "input": text,
        });

        let resp = self
            .client
            .post(&url)
            .header("api-key", &self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Azure Embeddings API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let embedding = json["data"][0]["embedding"]
            .as_array()
            .map(|arr| {
                arr.iter()
                    .filter_map(|v| v.as_f64().map(|f| f as f32))
                    .collect::<Vec<f32>>()
            })
            .unwrap_or_default();

        Ok(Some(embedding))
    }

    /// Send chat messages with function definitions (Azure-style).
    pub async fn send_chat_with_functions_impl(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

        let mut body = json!({
            "messages": api_messages,
        });

        if !functions.is_empty() {
            body["functions"] = serde_json::Value::Array(functions.to_vec());
            body["function_call"] = json!("auto");
        }

        let resp = self
            .client
            .post(self.chat_url())
            .header("api-key", &self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Azure OpenAI API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let usage = super::parse_token_usage(&json);

        // Check for tool_calls / function_call in the response.
        if let Some(pr) = super::parse_tool_calls(&json) {
            return Ok((pr, usage));
        }

        let content = json["choices"][0]["message"]["content"]
            .as_str()
            .unwrap_or("")
            .to_string();

        Ok((ProviderResponse::Final(content), usage))
    }

    /// Send chat messages and return a stream of content deltas via SSE.
    pub fn send_chat_stream_sse<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

            let body = json!({
                "messages": api_messages,
                "stream": true,
            });

            let resp = self
                .client
                .post(self.chat_url())
                .header("api-key", &self.api_key)
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!("Azure OpenAI streaming returned {status}: {text}"))?;
                return;
            }

            use tokio_stream::StreamExt as _;
            let mut byte_stream = resp.bytes_stream();
            let mut buffer = String::new();

            while let Some(chunk) = byte_stream.next().await {
                let chunk = chunk?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim_end().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() || !line.starts_with("data: ") {
                        continue;
                    }
                    let data = &line[6..];
                    if data == "[DONE]" {
                        return;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                            if !content.is_empty() {
                                yield content.to_string();
                            }
                        }
                    }
                }
            }
        })
    }
}

#[async_trait]
impl ModelProvider for AzureOpenAIProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let api_messages: Vec<serde_json::Value> = super::serialize_messages(messages);

        let body = json!({
            "messages": api_messages,
        });

        let resp = self
            .client
            .post(self.chat_url())
            .header("api-key", &self.api_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Azure OpenAI API returned {status}: {text}");
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
        self.send_chat_with_functions_impl(messages, functions).await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_sse(messages)
    }

    async fn embed(&self, texts: &[&str]) -> Result<Option<Vec<Vec<f32>>>, anyhow::Error> {
        let url = match self.embeddings_url() {
            Some(u) => u,
            None => return Ok(None),
        };
        let mut all = Vec::with_capacity(texts.len());
        for text in texts {
            let body = serde_json::json!({ "input": text });
            let resp = self
                .client
                .post(&url)
                .header("api-key", &self.api_key)
                .json(&body)
                .send()
                .await?;
            let status = resp.status();
            if !status.is_success() {
                let msg = resp.text().await.unwrap_or_default();
                anyhow::bail!("Azure Embeddings API returned {status}: {msg}");
            }
            let json: serde_json::Value = resp.json().await?;
            let vec = json["data"][0]["embedding"]
                .as_array()
                .map(|arr| arr.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect())
                .unwrap_or_default();
            all.push(vec);
        }
        Ok(Some(all))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chat_url_format() {
        let p = AzureOpenAIProvider::new(
            "https://myresource.openai.azure.com".into(),
            "test-key".into(),
            "gpt-4o".into(),
            Some("2024-10-21".into()),
            None,
        );
        assert_eq!(
            p.chat_url(),
            "https://myresource.openai.azure.com/openai/deployments/gpt-4o/chat/completions?api-version=2024-10-21"
        );
    }

    #[test]
    fn embeddings_url_none_when_no_deployment() {
        let p = AzureOpenAIProvider::new(
            "https://myresource.openai.azure.com".into(),
            "test-key".into(),
            "gpt-4o".into(),
            None,
            None,
        );
        assert!(p.embeddings_url().is_none());
    }

    #[test]
    fn embeddings_url_set() {
        let p = AzureOpenAIProvider::new(
            "https://myresource.openai.azure.com/".into(),
            "test-key".into(),
            "gpt-4o".into(),
            Some("2024-10-21".into()),
            Some("text-embedding-ada-002".into()),
        );
        assert_eq!(
            p.embeddings_url().unwrap(),
            "https://myresource.openai.azure.com/openai/deployments/text-embedding-ada-002/embeddings?api-version=2024-10-21"
        );
    }

    #[test]
    fn trailing_slash_stripped() {
        let p = AzureOpenAIProvider::new(
            "https://myresource.openai.azure.com/".into(),
            "k".into(),
            "d".into(),
            None,
            None,
        );
        assert!(!p.endpoint.ends_with('/'));
    }

    #[test]
    fn embed_response_parsing() {
        // Verify the extraction logic for Azure embedding response.
        let fake = serde_json::json!({
            "data": [
                { "embedding": [0.1, 0.2, 0.3] }
            ]
        });
        let vec: Vec<f32> = fake["data"][0]["embedding"]
            .as_array()
            .map(|arr| arr.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect())
            .unwrap_or_default();
        assert_eq!(vec.len(), 3);
        assert!((vec[0] - 0.1).abs() < 1e-6);
    }

    #[tokio::test]
    async fn embed_returns_none_without_deployment() {
        let p = AzureOpenAIProvider::new(
            "https://myresource.openai.azure.com".into(),
            "test-key".into(),
            "gpt-4o".into(),
            None,
            None, // no embedding_deployment
        );
        // Call the trait method (not the inherent single-text one).
        let result = <AzureOpenAIProvider as crate::models::ModelProvider>::embed(&p, &["test"]).await.unwrap();
        assert!(result.is_none(), "should return None when no embedding deployment configured");
    }
}
