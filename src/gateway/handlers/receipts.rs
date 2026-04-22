use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use crate::agent::types::TurnReceipt;

use super::super::auth::validate_path_segment;
use super::super::types::*;

/// `GET /api/agents/:id/receipts` — list all receipt files for an agent.
pub(crate) async fn api_receipts_list(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // When PinchyDb is available, return session ids that have receipts.
    if let Some(db) = crate::store::global_db() {
        let sessions = db.list_sessions_for_agent(&agent_id).unwrap_or_default();
        let receipts: Vec<ReceiptItem> = sessions
            .into_iter()
            .map(|s| ReceiptItem {
                file: format!("{}.receipts.jsonl", s.session_id),
            })
            .collect();
        return (StatusCode::OK, Json(ReceiptsListResponse { receipts })).into_response();
    }

    tracing::warn!("no database available — skipping api_receipts_list");
    (
        StatusCode::OK,
        Json(ReceiptsListResponse { receipts: vec![] }),
    )
        .into_response()
}

/// `GET /api/agents/:id/receipts/:session_id` — return parsed receipts
/// for a session (or `receipts` for the catch-all file).
pub(crate) async fn api_receipts_by_session(
    Path((agent_id, session_id)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_id) {
        return e.into_response();
    }
    let sid = session_id
        .trim_end_matches(".receipts.jsonl")
        .trim_end_matches(".jsonl")
        .to_string();
    let filename = if session_id.ends_with(".receipts.jsonl") {
        session_id.clone()
    } else {
        format!("{session_id}.receipts.jsonl")
    };

    // Prefer PinchyDb.
    if let Some(db) = crate::store::global_db() {
        let receipts = db.list_receipts_for_session(&sid).unwrap_or_default();
        return (
            StatusCode::OK,
            Json(ReceiptGetResponse {
                file: filename,
                receipts: receipts
                    .iter()
                    .map(turn_receipt_response_from_receipt)
                    .collect(),
            }),
        )
            .into_response();
    }

    tracing::warn!("no database available — skipping api_receipts_by_session");
    (
        StatusCode::SERVICE_UNAVAILABLE,
        Json(ErrorResponse {
            error: "no database available".to_string(),
            id: None,
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

fn turn_receipt_response_from_receipt(receipt: &TurnReceipt) -> TurnReceiptResponse {
    TurnReceiptResponse {
        receipt_id: receipt.receipt_id,
        agent: receipt.agent.clone(),
        session: receipt.session.clone(),
        assistant_exchange_id: receipt.assistant_exchange_id,
        started_at: receipt.started_at,
        duration_ms: receipt.duration_ms,
        user_prompt: receipt.user_prompt.clone(),
        tool_calls: receipt
            .tool_calls
            .iter()
            .map(|tool_call| SessionDiagnosticsToolCallRecord {
                tool: tool_call.tool.clone(),
                args_summary: tool_call.args_summary.clone(),
                success: tool_call.success,
                duration_ms: tool_call.duration_ms,
                error: tool_call.error.clone(),
            })
            .collect(),
        tokens: SessionDiagnosticsTokenUsageSummary {
            prompt_tokens: receipt.tokens.prompt_tokens,
            completion_tokens: receipt.tokens.completion_tokens,
            total_tokens: receipt.tokens.total_tokens,
            cached_tokens: receipt.tokens.cached_tokens,
            reasoning_tokens: receipt.tokens.reasoning_tokens,
        },
        model_calls: receipt.model_calls,
        reply_summary: receipt.reply_summary.clone(),
        model_id: receipt.model_id.clone(),
        estimated_cost_usd: receipt.estimated_cost_usd,
        call_details: receipt
            .call_details
            .iter()
            .map(|detail| SessionDiagnosticsModelCallDetail {
                call_index: detail.call_index,
                model: detail.model.clone(),
                provider: detail.provider.clone(),
                api_surface: detail.api_surface.clone(),
                request_kind: detail.request_kind.clone(),
                prompt_tokens: detail.prompt_tokens,
                completion_tokens: detail.completion_tokens,
                cached_tokens: detail.cached_tokens,
                reasoning_tokens: detail.reasoning_tokens,
                cost_usd: detail.cost_usd,
                latency_ms: detail.latency_ms,
            })
            .collect(),
        has_model_call_traces: receipt.receipt_id.is_some(),
        prompt_snapshot: receipt.prompt_snapshot.as_ref().map(|snapshot| {
            SessionDiagnosticsPromptSnapshot {
                sections: snapshot
                    .sections
                    .iter()
                    .map(|section| SessionDiagnosticsPromptSection {
                        key: section.key.clone(),
                        title: section.title.clone(),
                        content: section.content.clone(),
                        truncated: section.truncated,
                        original_char_count: section.original_char_count,
                        note: section.note.clone(),
                    })
                    .collect(),
                available_tools: snapshot
                    .available_tools
                    .iter()
                    .map(|tool| SessionDiagnosticsPromptTool {
                        name: tool.name.clone(),
                        description: tool.description.clone(),
                    })
                    .collect(),
            }
        }),
        reasoning_text: receipt.reasoning_text.clone(),
        reasoning_text_status: receipt
            .reasoning_text_status
            .as_ref()
            .map(|status| match status {
                crate::models::ReasoningTextStatus::Captured => {
                    TurnReceiptReasoningTextStatus::Captured
                }
                crate::models::ReasoningTextStatus::ProviderDidNotExpose => {
                    TurnReceiptReasoningTextStatus::ProviderDidNotExpose
                }
            }),
    }
}
