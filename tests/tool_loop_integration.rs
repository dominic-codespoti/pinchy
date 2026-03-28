//! Integration test: verify the tool-call loop end-to-end using a mock
//! provider that first returns a fenced tool-call and then a plain reply.

use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;
use mini_claw::agent::Agent;
use mini_claw::comm::IncomingMessage;
use mini_claw::models::{ChatMessage, ModelProvider, ProviderManager, ProviderResponse};
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
    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> std::pin::Pin<
        Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>,
    > {
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

fn ensure_test_db() -> &'static mini_claw::store::PinchyDb {
    use std::sync::Once;
    static INIT: Once = Once::new();
    INIT.call_once(|| {
        let tmp = std::env::temp_dir().join("pinchy_tool_loop_integration_test");
        let _ = std::fs::create_dir_all(&tmp);
        let db = mini_claw::store::PinchyDb::open(&tmp).expect("open test db");
        mini_claw::store::set_global_db(db);
    });
    mini_claw::store::global_db().expect("test DB should be set")
}

#[tokio::test]
async fn tool_loop_invokes_read_file_and_persists() {
    let db = ensure_test_db();

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
        images: Vec::new(),
    };

    let sid = agent.start_session().await;
    agent.current_session = Some(sid);

    let reply = agent
        .run_turn_with_provider(msg, &manager, None)
        .await
        .expect("run_turn_with_provider should succeed");

    // The final reply should be the second provider response.
    assert_eq!(reply, "Here is the content you asked for.");

    // The session should be created in the DB
    let current = db
        .current_session("test-agent")
        .unwrap()
        .expect("should have current session");

    // Check history length
    let history = db.load_full_history(&current).unwrap();
    let user_msgs = history
        .iter()
        .filter(|e| e.role == "user")
        .collect::<Vec<_>>();
    let assistant_msgs = history
        .iter()
        .filter(|e| e.role == "assistant")
        .collect::<Vec<_>>();

    // Fallback extraction creates two fake messages to inject into context, so the final counts are:
    // 1 user request, 1 assistant (fallback imitation), 1 user (tool result), 1 assistant (final text).
    // Or if native function calling: 1 user, 1 assistant (function), 1 tool, 1 assistant.
    assert!(user_msgs.len() >= 1);
    assert!(assistant_msgs.len() >= 1);

    // It depends on the internal extraction mechanics, but the last assistant msg must be the content:
    assert_eq!(
        assistant_msgs.last().unwrap().content,
        "Here is the content you asked for."
    );

    // And verify the tool calls were appended to receipts:
    let receipts = db.list_receipts_for_session(&current).unwrap();
    assert_eq!(receipts.len(), 1, "exactly one turn receipt expected");
    let rec = &receipts[0];
    assert_eq!(
        rec.tool_calls.len(),
        1,
        "should have one tool call recorded in receipt"
    );
    assert_eq!(rec.tool_calls[0].tool, "read_file");
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
        fn send_chat_stream<'a>(
            &'a self,
            messages: &'a [ChatMessage],
        ) -> std::pin::Pin<
            Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>,
        > {
            Box::pin(
                async_stream::try_stream! { let r = self.send_chat(messages).await?; yield r; },
            )
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
        images: Vec::new(),
    };

    let reply = agent
        .run_turn_with_provider(msg, &manager, None)
        .await
        .unwrap();
    assert_eq!(reply, "Just a simple answer.");
}
