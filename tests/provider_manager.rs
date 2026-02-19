//! Tests for ProviderManager retry/fallback and OpenAI streaming.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use mini_claw::models::{ChatMessage, ModelProvider, ProviderManager};

// ---------------------------------------------------------------------------
// Mock providers
// ---------------------------------------------------------------------------

/// A provider that fails `fail_count` times then succeeds.
struct FailNProvider {
    fail_count: usize,
    calls: AtomicUsize,
    reply: String,
}

impl FailNProvider {
    fn new(fail_count: usize, reply: &str) -> Self {
        Self {
            fail_count,
            calls: AtomicUsize::new(0),
            reply: reply.to_string(),
        }
    }
}

#[async_trait]
impl ModelProvider for FailNProvider {
    async fn send_chat(&self, _messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let n = self.calls.fetch_add(1, Ordering::SeqCst);
        if n < self.fail_count {
            Err(anyhow::anyhow!("intentional failure #{}", n + 1))
        } else {
            Ok(self.reply.clone())
        }
    }
    fn send_chat_stream<'a>(&'a self, messages: &'a [ChatMessage]) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! { let r = self.send_chat(messages).await?; yield r; })
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

/// A provider that always fails, with a shared call counter.
struct CountingFailProvider {
    calls: Arc<AtomicUsize>,
}

#[async_trait]
impl ModelProvider for CountingFailProvider {
    async fn send_chat(&self, _messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        self.calls.fetch_add(1, Ordering::SeqCst);
        Err(anyhow::anyhow!("always fails"))
    }
    fn send_chat_stream<'a>(&'a self, messages: &'a [ChatMessage]) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! { let r = self.send_chat(messages).await?; yield r; })
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

/// A provider that always fails (no counter).
struct AlwaysFailProvider;

#[async_trait]
impl ModelProvider for AlwaysFailProvider {
    async fn send_chat(&self, _messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        Err(anyhow::anyhow!("always fails"))
    }
    fn send_chat_stream<'a>(&'a self, messages: &'a [ChatMessage]) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! { let r = self.send_chat(messages).await?; yield r; })
    }
    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

// ---------------------------------------------------------------------------
// ProviderManager – retry tests
// ---------------------------------------------------------------------------

#[tokio::test]
async fn retry_succeeds_after_transient_failures() {
    // Fails twice, then succeeds on the 3rd attempt.
    let provider = FailNProvider::new(2, "success after retries");
    let manager = ProviderManager::new(vec![Box::new(provider)], 3);

    let messages = vec![ChatMessage::new("user", "hello")];

    let result = manager.send_chat_with_retry(&messages, 3).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "success after retries");
}

#[tokio::test]
async fn fallback_to_next_provider_on_exhausted_retries() {
    let failing = AlwaysFailProvider;
    let working = FailNProvider::new(0, "fallback reply");
    let manager = ProviderManager::new(vec![Box::new(failing), Box::new(working)], 2);

    let messages = vec![ChatMessage::new("user", "hello")];

    let result = manager.send_chat_with_retry(&messages, 2).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "fallback reply");
}

#[tokio::test]
async fn all_providers_fail_returns_error() {
    let manager = ProviderManager::new(
        vec![Box::new(AlwaysFailProvider), Box::new(AlwaysFailProvider)],
        2,
    );

    let messages = vec![ChatMessage::new("user", "hello")];

    let result = manager.send_chat_with_retry(&messages, 2).await;
    assert!(result.is_err());
    let err_msg = format!("{:#}", result.unwrap_err());
    assert!(
        err_msg.contains("all providers exhausted"),
        "expected 'all providers exhausted' in: {err_msg}"
    );
}

#[tokio::test]
async fn provider_manager_implements_model_provider_trait() {
    let provider = FailNProvider::new(0, "trait reply");
    let manager = ProviderManager::new(vec![Box::new(provider)], 1);

    let messages = vec![ChatMessage::new("user", "hello")];

    // Use the ModelProvider trait method directly.
    let result = manager.send_chat(&messages).await;
    assert!(result.is_ok());
    assert_eq!(result.unwrap(), "trait reply");
}

#[tokio::test]
async fn retry_count_respected() {
    // Provider never succeeds; manager should retry exactly max_attempts
    // times per provider.
    let calls = Arc::new(AtomicUsize::new(0));
    let provider = CountingFailProvider {
        calls: Arc::clone(&calls),
    };
    let manager = ProviderManager::new(vec![Box::new(provider)], 3);

    let messages = vec![ChatMessage::new("user", "hello")];

    let _result = manager.send_chat_with_retry(&messages, 3).await;

    let total = calls.load(Ordering::SeqCst);
    assert_eq!(total, 3, "expected exactly 3 attempts");
}

// ---------------------------------------------------------------------------
// Streaming – SSE parsing via wiremock
// ---------------------------------------------------------------------------

#[tokio::test]
async fn streaming_parses_sse_events() {
    use tokio_stream::StreamExt;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    // Spin up a local mock server that returns an SSE-style body.
    let server = MockServer::start().await;

    let sse_body = [
        r#"data: {"choices":[{"delta":{"content":"Hello"}}]}"#,
        "",
        r#"data: {"choices":[{"delta":{"content":" world"}}]}"#,
        "",
        "data: [DONE]",
        "",
    ]
    .join("\n");

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(
            ResponseTemplate::new(200)
                .set_body_string(sse_body)
                .insert_header("content-type", "text/event-stream"),
        )
        .mount(&server)
        .await;

    let provider = mini_claw::models::OpenAIProvider::with_config(
        "sk-test".into(),
        format!("{}/v1/chat/completions", server.uri()),
        "gpt-4o-mini".into(),
    );

    let messages = vec![ChatMessage::new("user", "hi")];

    // Use explicit streaming mode to avoid env-var races.
    let stream = provider.send_chat_stream_mode(&messages, true);
    let chunks: Vec<String> = stream
        .collect::<Vec<Result<String, _>>>()
        .await
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(chunks, vec!["Hello", " world"]);
}

#[tokio::test]
async fn streaming_fallback_returns_full_reply() {
    use tokio_stream::StreamExt;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    let server = MockServer::start().await;

    // Non-streaming response (standard chat completion JSON).
    let body = serde_json::json!({
        "choices": [{
            "message": { "role": "assistant", "content": "full reply" },
            "finish_reason": "stop"
        }]
    });

    Mock::given(method("POST"))
        .and(path("/v1/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(&body))
        .mount(&server)
        .await;

    let provider = mini_claw::models::OpenAIProvider::with_config(
        "sk-test".into(),
        format!("{}/v1/chat/completions", server.uri()),
        "gpt-4o-mini".into(),
    );

    let messages = vec![ChatMessage::new("user", "hi")];

    // Use explicit non-streaming mode.
    let stream = provider.send_chat_stream_mode(&messages, false);
    let chunks: Vec<String> = stream
        .collect::<Vec<Result<String, _>>>()
        .await
        .into_iter()
        .filter_map(|r| r.ok())
        .collect();

    assert_eq!(chunks, vec!["full reply"]);
}
