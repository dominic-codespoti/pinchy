use anyhow::Context as _;
use tracing::{debug, warn};

use crate::models::{ChatMessage, ProviderManager, ProviderResponse};

use super::tool_exec::*;
use super::types::*;

#[allow(clippy::too_many_arguments)]
pub async fn run_tool_loop(
    response: &mut ProviderResponse,
    messages: &mut Vec<ChatMessage>,
    function_defs: &[serde_json::Value],
    manager: &ProviderManager,
    workspace: &std::path::Path,
    agent_id: &str,
    session_id: &Option<String>,
    max_iters: usize,
    receipt_tokens: &mut TokenUsageSummary,
    receipt_model_calls: &mut u32,
    provider: &str,
    model: &str,
) -> Vec<ToolCallRecord> {
    match run_tool_loop_inner(
        response,
        messages,
        function_defs,
        manager,
        workspace,
        agent_id,
        session_id,
        max_iters,
        receipt_tokens,
        receipt_model_calls,
        provider,
        model,
    )
    .await
    {
        Ok(records) => records,
        Err(e) => {
            warn!(error = %e, "tool loop terminated with error");
            Vec::new()
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn run_tool_loop_inner(
    response: &mut ProviderResponse,
    messages: &mut Vec<ChatMessage>,
    function_defs: &[serde_json::Value],
    manager: &ProviderManager,
    workspace: &std::path::Path,
    agent_id: &str,
    session_id: &Option<String>,
    max_iters: usize,
    receipt_tokens: &mut TokenUsageSummary,
    receipt_model_calls: &mut u32,
    provider: &str,
    model: &str,
) -> anyhow::Result<Vec<ToolCallRecord>> {
    let mut tool_calls = Vec::new();
    let mut consecutive_unknown_tool: u32 = 0;

    for _iter in 0..max_iters {
        match response {
            ProviderResponse::Final(_) => {
                break;
            }
            ProviderResponse::FunctionCall {
                ref id,
                ref name,
                ref arguments,
            } => {
                debug!(tool = %name, "invoking tool (function-call)");

                let inv = make_invocation(id, name, arguments);
                let tr = execute_tool(&inv, workspace, agent_id, session_id).await;

                push_fc_messages(messages, &inv, name, arguments, &tr);

                let should_break = handle_unknown_tool(
                    &tr,
                    &mut consecutive_unknown_tool,
                    messages,
                    function_defs,
                );
                tool_calls.push(tr.record);
                if should_break {
                    break;
                }
            }
            ProviderResponse::MultiFunctionCall(ref calls) => {
                let invocations: Vec<ToolInvocation> = calls
                    .iter()
                    .map(|c| make_invocation(&c.id, &c.name, &c.arguments))
                    .collect();

                let tc_json: Vec<serde_json::Value> = invocations
                    .iter()
                    .map(|inv| {
                        serde_json::json!({
                            "id": inv.call_id,
                            "type": "function",
                            "function": {
                                "name": inv.name,
                                "arguments": inv.args_str,
                            }
                        })
                    })
                    .collect();
                messages.push(ChatMessage {
                    role: "assistant".into(),
                    content: String::new(),
                    tool_calls: Some(tc_json),
                    tool_call_id: None,
                });

                let mut handles = Vec::new();
                for inv in invocations {
                    let ws = workspace.to_path_buf();
                    let aid = agent_id.to_string();
                    let sid = session_id.clone();
                    handles.push(tokio::spawn(async move {
                        execute_tool(&inv, &ws, &aid, &sid).await
                    }));
                }

                for handle in handles {
                    match handle.await {
                        Ok(tr) => {
                            messages.push(ChatMessage {
                                role: "tool".into(),
                                content: truncate_tool_result(tr.result_json),
                                tool_calls: None,
                                tool_call_id: Some(tr.call_id),
                            });
                            tool_calls.push(tr.record);
                        }
                        Err(join_err) => {
                            warn!("tool task panicked: {join_err}");
                            messages.push(ChatMessage {
                                role: "tool".into(),
                                content: format!(
                                    "{{\"error\": \"tool task panicked: {join_err}\"}}"
                                ),
                                tool_calls: None,
                                tool_call_id: None,
                            });
                        }
                    }
                }
            }
        }

        *response = requery_provider(
            manager,
            messages,
            function_defs,
            agent_id,
            session_id.as_deref(),
            receipt_tokens,
            receipt_model_calls,
            provider,
            model,
        )
        .await
        .context("model call failed in tool loop")?;
    }

    Ok(tool_calls)
}
