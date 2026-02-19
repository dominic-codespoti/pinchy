//! Test: enforcement retry coaxes the provider into making a tool call
//! when the initial response is plain text.

use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;
use mini_claw::agent::Agent;
use mini_claw::comm::IncomingMessage;
use mini_claw::models::{ChatMessage, ModelProvider, ProviderManager, ProviderResponse, TokenUsage};
use tempfile::TempDir;

/// Mock provider that:
///  (a) First call: returns a plain assistant reply (no tool call).
///  (b) Second call (after the corrective system message): returns a
///      fenced JSON TOOL_CALL for `write_file`.
///  (c) Third call: returns a final summary.
struct EnforcementMockProvider {
    calls: AtomicUsize,
}

impl EnforcementMockProvider {
    fn new() -> Self {
        Self {
            calls: AtomicUsize::new(0),
        }
    }
}

#[async_trait]
impl ModelProvider for EnforcementMockProvider {
    fn send_chat_stream<'a>(&'a self, messages: &'a [ChatMessage]) -> std::pin::Pin<Box<dyn futures_core::Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! { let r = self.send_chat(messages).await?; yield r; })
    }
    async fn send_chat(&self, _messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let n = self.calls.fetch_add(1, Ordering::SeqCst);

        match n {
            0 => {
                // First call: plain text reply — no tool call.
                Ok("Sure, I can help with that!".to_string())
            }
            1 => {
                // Second call (after corrective message): return a fenced
                // TOOL_CALL for write_file.
                Ok(
                    "```json\n{\
                        \"name\": \"write_file\", \
                        \"args\": {\
                            \"path\": \"output.txt\", \
                            \"content\": \"enforcement retry worked\"\
                        }\
                    }\n```"
                    .to_string(),
                )
            }
            _ => {
                // Third+ call: final reply after tool execution.
                Ok("Done! The file has been written.".to_string())
            }
        }
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        _functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        let reply = self.send_chat(messages).await?;
        Ok((ProviderResponse::Final(reply), None))
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
async fn enforcement_retry_coaxes_provider_and_processes_tool_call() {
    // Register built-in tools so function_defs is non-empty.
    mini_claw::tools::init();

    let (dir, mut agent) = temp_agent();

    let mock = EnforcementMockProvider::new();
    // supports_functions = false so the enforcement retry triggers on the
    // fenced-JSON path (no native function-calling; the corrective
    // message still causes the mock to return a fenced tool call).
    //
    // NOTE: We set supports_functions = true so the enforcement-retry
    // condition (`manager.supports_functions`) is satisfied.
    let manager = ProviderManager::new_with_functions(vec![Box::new(mock)], 1, true);

    let msg = IncomingMessage {
        agent_id: Some("test-agent".into()),
        author: "tester".into(),
        content: "please write output.txt with the text: enforcement retry worked".into(),
        channel: "test".into(),
        timestamp: 0,
        session_id: None,
    };

    let reply = agent
        .run_turn_with_provider(msg, &manager)
        .await
        .expect("run_turn_with_provider should succeed");

    // The final reply should be the third provider response (after tool execution).
    assert_eq!(reply, "Done! The file has been written.");

    // Verify the file was written by the tool with the expected content.
    let output_path = dir.path().join("workspace").join("output.txt");
    assert!(
        output_path.exists(),
        "output.txt should have been created by the write_file tool"
    );
    let content = std::fs::read_to_string(&output_path).unwrap();
    assert_eq!(content, "enforcement retry worked");
}
