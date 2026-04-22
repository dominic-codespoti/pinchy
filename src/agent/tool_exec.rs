use tracing::warn;

use crate::models::{ChatMessage, ProviderCallResult, ProviderManager, ProviderResponse};
use crate::tools;

use super::debug::emit_model_request_debug;
use super::types::{
    extract_reasoning_preview, truncate_tool_result, uuid_like_id, ModelCallDetail, ModelCallTrace,
    TokenUsageSummary, ToolCallRecord,
};

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

#[allow(clippy::too_many_arguments)]
pub fn emit_and_accumulate_usage(
    agent_id: &str,
    session_id: Option<&str>,
    receipt_tokens: &mut TokenUsageSummary,
    call_details: &mut Vec<ModelCallDetail>,
    model_call_traces: &mut Vec<ModelCallTrace>,
    call_result: ProviderCallResult,
    provider: &str,
    model_id: &str,
    messages: &[ChatMessage],
    function_defs: &[serde_json::Value],
    reasoning_effort: Option<&str>,
    latency_ms: u64,
) -> ProviderResponse {
    let ProviderCallResult {
        response,
        usage,
        reasoning_text,
        reasoning_text_status,
    } = call_result;

    let call_index = (model_call_traces.len() as u32) + 1;
    let started_at = crate::agent::types::epoch_millis().saturating_sub(latency_ms);

    let function_call_mode = if function_defs.is_empty() {
        None
    } else {
        Some("auto".to_string())
    };

    let api_surface = Some(
        if provider == "copilot" {
            if model_id.starts_with('o') {
                "responses"
            } else {
                "chat_completions"
            }
        } else if provider == "anthropic" {
            "messages"
        } else {
            "chat_completions"
        }
        .to_string(),
    );

    let request_kind = Some(
        if function_defs.is_empty() {
            "chat"
        } else {
            "chat_with_tools"
        }
        .to_string(),
    );

    let cost = usage
        .as_ref()
        .and_then(crate::models::pricing::estimate_cost);

    if let Some(ref u) = usage {
        receipt_tokens.accumulate(u);
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "token_usage",
            "agent": agent_id,
            "session": session_id,
            "model": u.model,
            "prompt_tokens": u.prompt_tokens,
            "completion_tokens": u.completion_tokens,
            "total_tokens": u.total_tokens,
            "cached_tokens": u.cached_tokens,
            "reasoning_tokens": u.reasoning_tokens,
            "cost_usd": cost,
        }));
        call_details.push(ModelCallDetail {
            call_index,
            model: u.model.clone(),
            prompt_tokens: u.prompt_tokens,
            completion_tokens: u.completion_tokens,
            cached_tokens: u.cached_tokens,
            reasoning_tokens: u.reasoning_tokens,
            provider: provider.to_string(),
            api_surface: api_surface.clone(),
            request_kind: request_kind.clone(),
            cost_usd: cost,
            latency_ms,
        });
    }

    if let Some(preview) = reasoning_text
        .as_deref()
        .and_then(extract_reasoning_preview)
    {
        crate::gateway::publish_event_json(&serde_json::json!({
            "type": "reasoning_delta",
            "agent": agent_id,
            "session": session_id,
            "text": preview,
            "call_index": call_index,
        }));
    }

    model_call_traces.push(ModelCallTrace {
        call_index,
        provider: provider.to_string(),
        model_id: model_id.to_string(),
        api_surface,
        request_kind,
        started_at,
        latency_ms,
        normalized_messages: crate::models::serialize_messages(messages),
        normalized_tools: function_defs.to_vec(),
        reasoning_effort: reasoning_effort.map(ToOwned::to_owned),
        function_call_mode,
        prompt_tokens: usage.as_ref().map_or(0, |u| u.prompt_tokens),
        completion_tokens: usage.as_ref().map_or(0, |u| u.completion_tokens),
        cached_tokens: usage.as_ref().map_or(0, |u| u.cached_tokens),
        reasoning_tokens: usage.as_ref().map_or(0, |u| u.reasoning_tokens),
        cost_usd: cost,
        reasoning_text,
        reasoning_text_status,
    });

    response
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
    call_details: &mut Vec<ModelCallDetail>,
    model_call_traces: &mut Vec<ModelCallTrace>,
    provider: &str,
    model: &str,
    reasoning_effort: Option<&str>,
) -> anyhow::Result<ProviderResponse> {
    emit_model_request_debug(
        agent_id,
        session_id,
        messages,
        function_defs,
        provider,
        model,
    );
    let timer = std::time::Instant::now();
    let call_result = crate::models::scope_live_reasoning_context(
        crate::models::LiveReasoningContext {
            agent_id: agent_id.to_string(),
            session_id: session_id.map(ToOwned::to_owned),
        },
        manager.send_chat_with_functions_detailed(messages, function_defs),
    )
    .await
    .context("model call failed (tool loop)")?;
    let latency_ms = timer.elapsed().as_millis() as u64;
    *receipt_model_calls += 1;
    let response = emit_and_accumulate_usage(
        agent_id,
        session_id,
        receipt_tokens,
        call_details,
        model_call_traces,
        call_result,
        provider,
        model,
        messages,
        function_defs,
        reasoning_effort,
        latency_ms,
    );
    Ok(response)
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
        images: Vec::new(),
    });
    messages.push(ChatMessage {
        role: "tool".into(),
        content: truncate_tool_result(result.result_json.clone()),
        tool_calls: None,
        tool_call_id: Some(inv.call_id.clone()),
        images: Vec::new(),
    });
}
