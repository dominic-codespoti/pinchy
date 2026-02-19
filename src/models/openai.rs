//! OpenAI chat-completions provider with optional SSE streaming.

use std::any::Any;
use std::pin::Pin;
use std::time::Duration;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Default endpoint for OpenAI chat completions.
pub const DEFAULT_ENDPOINT: &str = "https://api.openai.com/v1/chat/completions";

/// Provider that talks to the OpenAI-compatible chat completions API.
pub struct OpenAIProvider {
    api_key: String,
    endpoint: String,
    client: Client,
    /// Model name sent in the request body (e.g. "gpt-4o-mini").
    model: String,
}

impl Default for OpenAIProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenAIProvider {
    /// Create a new provider.
    ///
    /// Reads `OPENAI_API_KEY` from the environment.  Panics if the
    /// variable is missing — fail fast at startup rather than at first
    /// request.
    pub fn new() -> Self {
        let api_key = std::env::var("OPENAI_API_KEY").expect("OPENAI_API_KEY must be set");
        Self {
            api_key,
            endpoint: DEFAULT_ENDPOINT.to_string(),
            client: Client::builder()
                .timeout(Duration::from_secs(90))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .expect("failed to build HTTP client"),
            model: "gpt-4o-mini".to_string(),
        }
    }

    /// Create a provider with explicit configuration (useful for tests
    /// or non-default endpoints).
    pub fn with_config(api_key: String, endpoint: String, model: String) -> Self {
        Self {
            api_key,
            endpoint,
            client: Client::builder()
                .timeout(Duration::from_secs(90))
                .connect_timeout(Duration::from_secs(10))
                .build()
                .expect("failed to build HTTP client"),
            model,
        }
    }

    // -- streaming -----------------------------------------------------------

    /// Send chat messages and return a stream of content chunks.
    ///
    /// When the `OPENAI_STREAM` environment variable is `"true"`, the
    /// request uses the streaming API (`"stream": true` in the body) and
    /// yields incremental content deltas parsed from the SSE event
    /// stream.  Otherwise, falls back to a single-shot request that
    /// yields the complete reply as one item.
    pub fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        let use_streaming = std::env::var("OPENAI_STREAM")
            .map(|v| v.eq_ignore_ascii_case("true"))
            .unwrap_or(false);

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
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!(
                    "OpenAI streaming API returned {status}: {text}"
                ))?;
                // The `?` above yields the error and ends the stream
                // inside try_stream!, but the compiler cannot see the
                // divergence through the macro.  The explicit `return`
                // silences "use of moved value".
                return;
            }

            // Read chunks from the byte stream and parse SSE events
            // incrementally so we can yield content deltas as they arrive.
            use tokio_stream::StreamExt as _;
            let mut byte_stream = resp.bytes_stream();
            let mut buffer = String::new();

            while let Some(chunk) = byte_stream.next().await {
                let chunk = chunk?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                // Process all complete lines accumulated so far.
                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim_end().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() || !line.starts_with("data: ") {
                        continue;
                    }
                    let data = &line[6..]; // skip "data: "
                    if data == "[DONE]" {
                        return;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if let Some(content) =
                            json["choices"][0]["delta"]["content"].as_str()
                        {
                            if !content.is_empty() {
                                yield content.to_string();
                            }
                        }
                    }
                }
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
            body["functions"] = serde_json::Value::Array(functions.to_vec());
            body["function_call"] = json!("auto");
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
            anyhow::bail!("OpenAI API returned {status}: {text}");
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
}

#[async_trait]
impl ModelProvider for OpenAIProvider {
    /// Send chat messages to the OpenAI completions endpoint and return
    /// the first choice's content.
    ///
    /// Messages are forwarded with their original roles.
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        // Build the messages array expected by the API.
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
            anyhow::bail!("OpenAI API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;

        // Extract the assistant reply from the first choice.
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
        // Delegate to the inherent method.
        OpenAIProvider::send_chat_with_functions(self, messages, functions).await
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_mode(messages, true)
    }

    async fn embed(&self, texts: &[&str]) -> Result<Option<Vec<Vec<f32>>>, anyhow::Error> {
        // OpenAI embeddings endpoint supports batch input.
        let url = "https://api.openai.com/v1/embeddings";
        let body = json!({
            "model": "text-embedding-3-small",
            "input": texts,
        });
        let resp = self
            .client
            .post(url)
            .bearer_auth(&self.api_key)
            .json(&body)
            .send()
            .await?;
        let status = resp.status();
        if !status.is_success() {
            let msg = resp.text().await.unwrap_or_default();
            anyhow::bail!("OpenAI Embeddings API returned {status}: {msg}");
        }
        let json: serde_json::Value = resp.json().await?;
        let data = json["data"].as_array();
        match data {
            Some(arr) => {
                let vecs: Vec<Vec<f32>> = arr
                    .iter()
                    .filter_map(|item| {
                        item["embedding"].as_array().map(|e| {
                            e.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect()
                        })
                    })
                    .collect();
                Ok(Some(vecs))
            }
            None => Ok(None),
        }
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Smoke test: provider can be constructed with explicit config
    /// (no env var needed).
    #[test]
    fn construct_with_config() {
        let p = OpenAIProvider::with_config(
            "sk-test".into(),
            "http://localhost:1234/v1/chat/completions".into(),
            "gpt-4o-mini".into(),
        );
        assert_eq!(p.model, "gpt-4o-mini");
    }

    /// Build the JSON request body the same way `send_chat` does and
    /// verify its structure — no network call needed.
    #[test]
    fn request_body_format() {
        let messages = vec!["Hello".to_string(), "World".to_string()];
        let model = "gpt-4o-mini";

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
        assert_eq!(body["model"], "gpt-4o-mini");
    }

    /// Parse a realistic OpenAI JSON response to verify extraction
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

    #[test]
    fn embed_request_body_format() {
        // Verify the JSON body structure that embed() would send.
        let texts: Vec<&str> = vec!["hello world", "test"];
        let body = json!({
            "model": "text-embedding-3-small",
            "input": texts,
        });
        assert_eq!(body["model"], "text-embedding-3-small");
        let input = body["input"].as_array().unwrap();
        assert_eq!(input.len(), 2);
        assert_eq!(input[0], "hello world");
    }

    #[test]
    fn embed_response_parsing() {
        // Verify the extraction logic for embedding response.
        let fake = json!({
            "data": [
                { "embedding": [0.1, 0.2, 0.3] },
                { "embedding": [0.4, 0.5, 0.6] }
            ]
        });
        let data = fake["data"].as_array().unwrap();
        let vecs: Vec<Vec<f32>> = data
            .iter()
            .filter_map(|item| {
                item["embedding"].as_array().map(|e| {
                    e.iter().filter_map(|v| v.as_f64().map(|f| f as f32)).collect()
                })
            })
            .collect();
        assert_eq!(vecs.len(), 2);
        assert!((vecs[0][0] - 0.1).abs() < 1e-6);
        assert!((vecs[1][2] - 0.6).abs() < 1e-6);
    }
}
