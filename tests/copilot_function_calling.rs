//! Integration test: Copilot function-calling through ProviderManager.
//!
//! Starts a wiremock server simulating the Copilot proxy, builds a
//! `ProviderManager` with a `CopilotProvider` as primary, and verifies
//! that `send_chat_with_functions` delegates correctly and that the
//! agent enforcement-retry can parse a fenced TOOL_CALL returned by
//! the proxy.

use mini_claw::models::{ChatMessage, CopilotProvider, ProviderManager, ProviderResponse};
use serde_json::json;
use wiremock::{matchers, Mock, MockServer, ResponseTemplate};

/// Helper: standard test messages.
fn sample_messages() -> Vec<ChatMessage> {
    vec![
        ChatMessage::new("system", "You are a helpful assistant."),
        ChatMessage::new("user", "Run pwd"),
    ]
}

/// Helper: sample function definitions.
fn sample_functions() -> Vec<serde_json::Value> {
    vec![json!({
        "type": "function",
        "function": {
            "name": "exec_shell",
            "description": "Execute a shell command",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": { "type": "string" }
                },
                "required": ["command"]
            }
        }
    })]
}

#[tokio::test]
async fn manager_delegates_to_copilot_send_chat_with_functions() {
    // Prevent env leaks.
    let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
    std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

    let mock_server = MockServer::start().await;

    let fenced = "```json\n{\"name\":\"exec_shell\",\"args\":{\"command\":\"pwd\"}}\n```";

    Mock::given(matchers::method("POST"))
        .and(matchers::path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": fenced
                }
            }]
        })))
        .mount(&mock_server)
        .await;

    let copilot = CopilotProvider::with_test_token(&mock_server.uri(), "test-token");
    let manager = ProviderManager::new_with_functions(
        vec![Box::new(copilot)],
        1,
        true, // supports_functions
    );

    let result = manager
        .send_chat_with_functions(&sample_messages(), &sample_functions())
        .await;

    // Restore env
    if let Some(v) = old {
        std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
    }

    let (resp, _usage) = result.expect("send_chat_with_functions should succeed");
    match resp {
        ProviderResponse::Final(text) => {
            assert!(
                text.contains("exec_shell"),
                "response should contain tool name, got: {text}"
            );
            // Verify the fenced JSON is parseable by the same heuristic
            // the agent enforcement retry uses.
            let inner = text
                .trim()
                .strip_prefix("```json")
                .and_then(|s| s.strip_suffix("```"))
                .expect("should be fenced json");
            let parsed: serde_json::Value =
                serde_json::from_str(inner.trim()).expect("inner JSON should parse");
            assert_eq!(parsed["name"], "exec_shell");
            assert_eq!(parsed["args"]["command"], "pwd");
        }
        other => panic!("expected ProviderResponse::Final, got: {other:?}"),
    }
}

#[tokio::test]
async fn manager_copilot_fallback_to_plain_send_chat() {
    // When supports_functions is false, manager should NOT call
    // send_chat_with_functions and instead use plain send_chat.
    let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
    std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

    let mock_server = MockServer::start().await;

    Mock::given(matchers::method("POST"))
        .and(matchers::path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "choices": [{
                "message": {
                    "role": "assistant",
                    "content": "Plain reply, no tools."
                }
            }]
        })))
        .mount(&mock_server)
        .await;

    let copilot = CopilotProvider::with_test_token(&mock_server.uri(), "test-token");
    let manager = ProviderManager::new_with_functions(
        vec![Box::new(copilot)],
        1,
        false, // supports_functions OFF
    );

    let result = manager
        .send_chat_with_functions(&sample_messages(), &sample_functions())
        .await;

    if let Some(v) = old {
        std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
    }

    let (resp, _usage) = result.expect("should succeed");
    match resp {
        ProviderResponse::Final(text) => {
            assert!(
                text.contains("Plain reply"),
                "expected plain reply from fallback, got: {text}"
            );
        }
        other => panic!("expected Final, got: {other:?}"),
    }
}

/// When the Copilot proxy returns an OpenAI-style `tool_calls` response,
/// the provider should parse it and return `ProviderResponse::FunctionCall`.
#[tokio::test]
async fn copilot_proxy_returns_tool_calls_as_function_call() {
    let old = std::env::var("COPILOT_PROXY_ENDPOINTS").ok();
    std::env::remove_var("COPILOT_PROXY_ENDPOINTS");

    let mock_server = MockServer::start().await;

    // Simulate an OpenAI-style tool_calls response from the Copilot proxy.
    Mock::given(matchers::method("POST"))
        .and(matchers::path("/chat/completions"))
        .respond_with(ResponseTemplate::new(200).set_body_json(json!({
            "choices": [{
                "index": 0,
                "message": {
                    "role": "assistant",
                    "content": null,
                    "tool_calls": [{
                        "id": "call_abc123",
                        "type": "function",
                        "function": {
                            "name": "exec_shell",
                            "arguments": "{\"command\":\"pwd\"}"
                        }
                    }]
                },
                "finish_reason": "tool_calls"
            }]
        })))
        .mount(&mock_server)
        .await;

    let copilot = CopilotProvider::with_test_token(&mock_server.uri(), "test-token");
    let manager = ProviderManager::new_with_functions(vec![Box::new(copilot)], 1, true);

    let result = manager
        .send_chat_with_functions(&sample_messages(), &sample_functions())
        .await;

    if let Some(v) = old {
        std::env::set_var("COPILOT_PROXY_ENDPOINTS", v);
    }

    let (resp, _usage) = result.expect("send_chat_with_functions should succeed");
    match resp {
        ProviderResponse::FunctionCall { name, arguments, .. } => {
            assert_eq!(name, "exec_shell");
            let args: serde_json::Value =
                serde_json::from_str(&arguments).expect("arguments should be valid JSON");
            assert_eq!(args["command"], "pwd");
        }
        other => panic!("expected ProviderResponse::FunctionCall, got: {other:?}"),
    }
}
