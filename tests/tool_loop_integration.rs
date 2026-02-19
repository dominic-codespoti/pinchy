//! Integration test: verify the tool-call loop end-to-end using a mock
//! provider that first returns a fenced tool-call and then a plain reply.

use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;
use mini_claw::agent::Agent;
use mini_claw::comm::IncomingMessage;
use mini_claw::models::{ChatMessage, ModelProvider, ProviderManager};
use tempfile::TempDir;

/// A mock provider that returns a `read_file` tool call on the first
/// invocation and a plain text reply on the second.
struct MockProvider {
    calls: AtomicUsize,
}

impl MockProvider {
    fn new() -> Self {
        Self {
            calls: AtomicUsize::new(0),
        }
    }
}

#[async_trait]
impl ModelProvider for MockProvider {
    fn send_chat_stream<'a>(&'a self, messages: &'a [ChatMessage]) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! { let r = self.send_chat(messages).await?; yield r; })
    }
    async fn send_chat(&self, _messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let n = self.calls.fetch_add(1, Ordering::SeqCst);
        if n == 0 {
            // First call: return a fenced tool-call requesting read_file.
            Ok(
                "```json\n{\"name\": \"read_file\", \"args\": {\"path\": \"test.txt\"}}\n```"
                    .to_string(),
            )
        } else {
            // Second call: return a normal reply.
            Ok("Here is the content you asked for.".to_string())
        }
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }
}

fn temp_agent() -> (TempDir, Agent) {
    let dir = TempDir::new().unwrap();
    // Create the runtime workspace directory (Agent::new sets workspace = agent_root/workspace)
    std::fs::create_dir_all(dir.path().join("workspace")).unwrap();
    let agent = Agent::new("test-agent", dir.path().to_path_buf());
    (dir, agent)
}

#[tokio::test]
async fn tool_loop_invokes_read_file_and_persists() {
    let (dir, mut agent) = temp_agent();

    // Create a file in the runtime workspace that the tool call will read.
    let test_file = dir.path().join("workspace").join("test.txt");
    std::fs::write(&test_file, "hello from test").unwrap();

    let mock = MockProvider::new();
    let manager = ProviderManager::new(vec![Box::new(mock)], 1);

    let msg = IncomingMessage {
        agent_id: Some("test-agent".into()),
        author: "tester".into(),
        content: "please read test.txt".into(),
        channel: "test".into(),
        timestamp: 0,
        session_id: None,
    };

    let reply = agent
        .run_turn_with_provider(msg, &manager)
        .await
        .expect("run_turn_with_provider should succeed");

    // The final reply should be the second provider response.
    assert_eq!(reply, "Here is the content you asked for.");

    // A session file should have been persisted (plus a .receipts.jsonl).
    let sessions = dir.path().join("workspace").join("sessions");
    let all_entries: Vec<_> = std::fs::read_dir(&sessions)
        .expect("sessions dir should exist")
        .filter_map(|e| e.ok())
        .collect();
    let entries: Vec<_> = all_entries
        .into_iter()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.ends_with(".jsonl") && !name.contains("receipts")
        })
        .collect();
    assert_eq!(entries.len(), 1, "exactly one session file expected");

    let data = std::fs::read_to_string(entries[0].path()).unwrap();
    let lines: Vec<&str> = data.trim().lines().collect();
    assert_eq!(lines.len(), 2, "user + assistant lines");

    let user: serde_json::Value = serde_json::from_str(lines[0]).unwrap();
    assert_eq!(user["role"], "user");

    let assistant: serde_json::Value = serde_json::from_str(lines[1]).unwrap();
    assert_eq!(assistant["role"], "assistant");
    assert_eq!(assistant["content"], "Here is the content you asked for.");
}

#[tokio::test]
async fn tool_loop_stops_on_plain_reply() {
    let (_dir, mut agent) = temp_agent();

    // Provider always returns plain text — no tool loop should occur.
    struct PlainProvider;
    #[async_trait]
    impl ModelProvider for PlainProvider {
        async fn send_chat(&self, _messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
            Ok("Just a simple answer.".to_string())
        }
        fn send_chat_stream<'a>(&'a self, messages: &'a [ChatMessage]) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
            Box::pin(async_stream::try_stream! { let r = self.send_chat(messages).await?; yield r; })
        }
        fn as_any(&self) -> &dyn std::any::Any {
            self
        }
    }

    let manager = ProviderManager::new(vec![Box::new(PlainProvider)], 1);

    let msg = IncomingMessage {
        agent_id: Some("test-agent".into()),
        author: "tester".into(),
        content: "hi".into(),
        channel: "test".into(),
        timestamp: 0,
        session_id: None,
    };

    let reply = agent.run_turn_with_provider(msg, &manager).await.unwrap();
    assert_eq!(reply, "Just a simple answer.");
}
