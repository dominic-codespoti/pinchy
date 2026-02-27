use tracing::warn;

use crate::models::{ChatMessage, ProviderManager, ProviderResponse, TokenUsage};
use crate::tools;

use super::debug::emit_model_request_debug;
use super::types::{truncate_tool_result, uuid_like_id, TokenUsageSummary, ToolCallRecord};

// ---------------------------------------------------------------------------
// Tool invocation / result types
// ---------------------------------------------------------------------------

pub struct ToolInvocation {
    pub call_id: String,
    pub name: String,
    pub args_str: String,
}

pub struct ToolResult {
    pub call_id: String,
    pub name: String,
    pub result_json: String,
    pub failed: bool,
    pub record: ToolCallRecord,
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

pub async fn execute_tool(
    inv: &ToolInvocation,
    workspace: &std::path::Path,
    agent_id: &str,
    session_id: &Option<String>,
) -> ToolResult {
    let args: serde_json::Value =
        serde_json::from_str(&inv.args_str).unwrap_or(serde_json::json!({}));
    let args_summary = crate::utils::truncate_str(&inv.args_str, 200);

    crate::gateway::publish_event_json(&serde_json::json!({
        "type": "tool_start",
        "agent": agent_id,
        "session": session_id,
        "tool": inv.name,
    }));

    let timer = std::time::Instant::now();
    let result = tools::call_skill(&inv.name, args, workspace).await;
    let elapsed = timer.elapsed().as_millis() as u64;

    let (result_json, failed, error) = match result {
        Ok(v) => (serde_json::to_string(&v).unwrap_or_default(), false, None),
        Err(e) => {
            let err_msg = format!("{e}");
            crate::gateway::publish_event_json(&serde_json::json!({
                "type": "tool_error",
                "agent": agent_id,
                "session": session_id,
                "tool": inv.name,
                "error": err_msg,
            }));
            (
                serde_json::to_string(&serde_json::json!({"error": &err_msg})).unwrap_or_default(),
                true,
                Some(err_msg),
            )
        }
    };

    crate::gateway::publish_event_json(&serde_json::json!({
        "type": "tool_end",
        "agent": agent_id,
        "session": session_id,
        "tool": inv.name,
    }));

    ToolResult {
        call_id: inv.call_id.clone(),
        name: inv.name.clone(),
        result_json,
        failed,
        record: ToolCallRecord {
            tool: inv.name.clone(),
            args_summary,
            success: !failed,
            duration_ms: elapsed,
            error,
        },
    }
}

// ---------------------------------------------------------------------------
// Shared helpers used by the tool loop
// ---------------------------------------------------------------------------

pub fn unknown_tool_corrective(bad_name: &str, function_defs: &[serde_json::Value]) -> String {
    let valid_names: Vec<&str> = function_defs
        .iter()
        .filter_map(|fd| fd.get("name").and_then(|n| n.as_str()))
        .collect();
    format!(
        "CORRECTIVE: The tool `{bad_name}` does not exist. It is NOT a valid tool. \
         Do NOT claim it worked. You MUST use only tools from this list: [{}]. \
         If none of these tools can do what you need, use `exec_shell` to run \
         a CLI command, or use the `browser` tool/skill to look up documentation. \
         Diagnose the failure and try a different approach.",
        valid_names.join(", ")
    )
}

pub fn emit_and_accumulate_usage(
    usage: &Option<TokenUsage>,
    agent_id: &str,
    receipt_tokens: &mut TokenUsageSummary,
) {
    if let Some(ref u) = usage {
        receipt_tokens.accumulate(u);
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "token_usage",
            "agent": agent_id,
            "prompt_tokens": u.prompt_tokens,
            "completion_tokens": u.completion_tokens,
            "total_tokens": u.total_tokens,
        }));
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn requery_provider(
    manager: &ProviderManager,
    messages: &[ChatMessage],
    function_defs: &[serde_json::Value],
    agent_id: &str,
    session_id: Option<&str>,
    receipt_tokens: &mut TokenUsageSummary,
    receipt_model_calls: &mut u32,
    provider: &str,
    model: &str,
) -> anyhow::Result<ProviderResponse> {
    emit_model_request_debug(
        agent_id,
        session_id,
        messages,
        function_defs,
        provider,
        model,
    );
    let (new_resp, loop_usage) = manager
        .send_chat_with_functions(messages, function_defs)
        .await
        .context("model call failed (tool loop)")?;
    *receipt_model_calls += 1;
    emit_and_accumulate_usage(&loop_usage, agent_id, receipt_tokens);
    Ok(new_resp)
}

use anyhow::Context as _;

pub fn handle_unknown_tool(
    result: &ToolResult,
    consecutive_unknown_tool: &mut u32,
    messages: &mut Vec<ChatMessage>,
    function_defs: &[serde_json::Value],
) -> bool {
    if result.failed
        && result
            .record
            .error
            .as_deref()
            .is_some_and(|e| e.contains("unknown tool"))
    {
        *consecutive_unknown_tool += 1;
        messages.push(ChatMessage::system(unknown_tool_corrective(
            &result.name,
            function_defs,
        )));
        if *consecutive_unknown_tool >= 3 {
            warn!("3 consecutive unknown-tool calls — breaking loop");
            return true;
        }
    } else {
        *consecutive_unknown_tool = 0;
    }
    false
}

/// Build a ToolInvocation, filling in a synthetic call_id if blank.
pub fn make_invocation(call_id: &str, name: &str, args_str: &str) -> ToolInvocation {
    ToolInvocation {
        call_id: if call_id.is_empty() {
            format!("call_{}", uuid_like_id())
        } else {
            call_id.to_string()
        },
        name: name.to_string(),
        args_str: args_str.to_string(),
    }
}

/// Push the standard tool-result message for a single function-call.
pub fn push_fc_messages(
    messages: &mut Vec<ChatMessage>,
    inv: &ToolInvocation,
    name: &str,
    arguments: &str,
    result: &ToolResult,
) {
    messages.push(ChatMessage {
        role: "assistant".into(),
        content: String::new(),
        tool_calls: Some(vec![serde_json::json!({
            "id": inv.call_id,
            "type": "function",
            "function": {
                "name": name,
                "arguments": arguments,
            }
        })]),
        tool_call_id: None,
    });
    messages.push(ChatMessage {
        role: "tool".into(),
        content: truncate_tool_result(result.result_json.clone()),
        tool_calls: None,
        tool_call_id: Some(inv.call_id.clone()),
    });
}
