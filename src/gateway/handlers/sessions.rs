use axum::{extract::Path, http::StatusCode, response::IntoResponse, Json};

use crate::agent::types::{ModelCallTrace, TurnReceipt};
use crate::session::Exchange;

use super::super::auth::validate_path_segment;
use super::super::types::*;

/// `GET /api/agents/:id/sessions` — list session files for an agent.
pub(crate) async fn api_sessions_list(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // Prefer PinchyDb when available.
    if let Some(db) = crate::store::global_db() {
        let entries = match db.list_sessions_for_agent(&agent_id) {
            Ok(e) => e,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        };
        let sessions: Vec<SessionItem> = entries
            .into_iter()
            .map(|e| {
                // `created_at` is stored as epoch milliseconds; the frontend
                // sidebar expects `modified` as epoch seconds.
                let modified_secs = (e.created_at / 1000) as i64;
                // Get the exchange count for this session (best effort)
                let message_count = db.exchange_count(&e.session_id).unwrap_or(0);
                SessionItem {
                    file: format!("{}.jsonl", e.session_id),
                    session_id: e.session_id,
                    agent_id: e.agent_id,
                    created_at: e.created_at as i64,
                    modified: modified_secs,
                    title: e.title,
                    message_count,
                }
            })
            .collect();
        return Json(SessionsListResponse { sessions }).into_response();
    }

    tracing::warn!("no database available — skipping api_sessions_list");
    Json(SessionsListResponse { sessions: vec![] }).into_response()
}

/// `GET /api/sessions` — list recent sessions across all agents for dashboard.
pub(crate) async fn api_sessions_global() -> impl IntoResponse {
    // Prefer PinchyDb when available.
    if let Some(db) = crate::store::global_db() {
        let entries = match db.list_sessions() {
            Ok(e) => e,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        };
        // Take the 20 most recent sessions and transform them
        let sessions: Vec<crate::gateway::types::DashboardSessionItem> = entries
            .into_iter()
            .take(20)
            .map(|e| {
                // Get the exchange count for this session (best effort)
                let message_count = db.exchange_count(&e.session_id).unwrap_or(0);
                crate::gateway::types::DashboardSessionItem {
                    id: e.session_id.clone(),
                    agent_id: e.agent_id,
                    title: e.title,
                    message_count,
                    // `created_at` is stored as epoch milliseconds
                    updated_at: e.created_at as i64,
                }
            })
            .collect();
        return Json(crate::gateway::types::GlobalSessionsListResponse { sessions })
            .into_response();
    }

    tracing::warn!("no database available — skipping api_sessions_global");
    Json(crate::gateway::types::GlobalSessionsListResponse { sessions: vec![] }).into_response()
}

/// `GET /api/sessions/:session_id/diagnostics` — aggregate full session diagnostics.
pub(crate) async fn api_session_diagnostics(Path(session_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&session_id) {
        return e.into_response();
    }

    let Some(db) = crate::store::global_db() else {
        tracing::warn!("no database available — skipping api_session_diagnostics");
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "no database available".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };

    let sessions = match db.list_sessions() {
        Ok(entries) => entries,
        Err(e) => {
            return internal_error_response(e);
        }
    };

    let Some(session_entry) = sessions.into_iter().find(|s| s.session_id == session_id) else {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "session not found".to_string(),
                id: Some(session_id),
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };

    let history = match db.load_full_history(&session_entry.session_id) {
        Ok(history) => history,
        Err(e) => {
            return internal_error_response(e);
        }
    };

    let receipts = match db.list_receipts_for_session(&session_entry.session_id) {
        Ok(receipts) => receipts,
        Err(e) => {
            return internal_error_response(e);
        }
    };
    let receipt_model_calls =
        match db.list_receipt_model_calls_for_session(&session_entry.session_id) {
            Ok(model_calls) => model_calls,
            Err(e) => {
                return internal_error_response(e);
            }
        };

    let message_count = history.len();
    let updated_at = history
        .last()
        .map(|exchange| exchange.timestamp as i64)
        .unwrap_or(session_entry.created_at as i64);
    let summary = build_session_diagnostics_summary(&history, &receipts);
    let turns = build_session_diagnostics_turns(history, receipts, &receipt_model_calls);

    Json(SessionDiagnosticsResponse {
        session: SessionDiagnosticsSession {
            id: session_entry.session_id,
            agent_id: session_entry.agent_id,
            title: session_entry.title,
            message_count,
            updated_at,
        },
        summary,
        turns,
    })
    .into_response()
}

/// `GET /api/sessions/:session_id/diagnostics/receipts/:receipt_id/model-calls`
/// — lazy-load exact normalized request traces for one turn receipt.
pub(crate) async fn api_session_diagnostics_receipt_model_calls(
    Path((session_id, receipt_id)): Path<(String, i64)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&session_id) {
        return e.into_response();
    }

    let Some(db) = crate::store::global_db() else {
        return (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(ErrorResponse {
                error: "no database available".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    };

    let model_calls = match db.get_receipt_model_calls(&session_id, receipt_id) {
        Ok(model_calls) => model_calls,
        Err(e) => {
            return internal_error_response(e);
        }
    };

    Json(SessionDiagnosticsReceiptModelCallsResponse {
        session_id,
        receipt_id,
        model_calls: model_calls
            .into_iter()
            .map(session_diagnostics_model_call_trace_from_trace)
            .collect(),
    })
    .into_response()
}

/// `GET /api/agents/:id/sessions/:file` — read session content.
pub(crate) async fn api_session_get(
    Path((agent_id, session_file)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    let session_id = session_file.trim_end_matches(".jsonl").to_string();
    let filename = if session_file.ends_with(".jsonl") {
        session_file.clone()
    } else {
        format!("{session_file}.jsonl")
    };

    // Prefer PinchyDb.
    if let Some(db) = crate::store::global_db() {
        let exchanges = match db.load_full_history(&session_id) {
            Ok(ex) => ex,
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        };
        if exchanges.is_empty() {
            // Check if session exists at all.
            let sessions = db.list_sessions_for_agent(&agent_id).unwrap_or_default();
            if !sessions.iter().any(|s| s.session_id == session_id) {
                return (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: "session not found".to_string(),
                        id: None,
                        agent_id: None,
                        filename: Some(filename),
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
        let messages: Vec<serde_json::Value> = exchanges
            .into_iter()
            .filter_map(|ex| serde_json::to_value(&ex).ok())
            .collect();
        return (
            StatusCode::OK,
            Json(SessionGetResponse {
                file: filename,
                messages,
            }),
        )
            .into_response();
    }

    tracing::warn!("no database available — skipping api_session_get");
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

/// Request body for PUT session
#[derive(serde::Deserialize)]
pub(crate) struct UpdateSessionRequest {
    messages: Vec<serde_json::Value>,
}

/// `PUT /api/agents/:id/sessions/:file` — overwrite session content.
pub(crate) async fn api_session_update(
    Path((agent_id, session_file)): Path<(String, String)>,
    Json(body): Json<UpdateSessionRequest>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    let session_id = session_file.trim_end_matches(".jsonl").to_string();

    // Try to parse messages into Exchange structs for PinchyDb.
    if let Some(db) = crate::store::global_db() {
        let exchanges: Vec<crate::session::Exchange> = body
            .messages
            .iter()
            .filter_map(|m| serde_json::from_value(m.clone()).ok())
            .collect();
        match db.replace_exchanges(&session_id, &exchanges) {
            Ok(()) => {
                return (
                    StatusCode::OK,
                    Json(SessionUpdateResponse {
                        session_id,
                        saved: true,
                        count: exchanges.len(),
                    }),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
    }

    tracing::warn!("no database available — skipping api_session_update");
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

/// `GET /api/agents/:id/session/current` — return the current active session id.
///
/// Prefers the explicit `CURRENT_SESSION` file; falls back to the most
/// recently modified session so the UI always lands on the right one.
pub(crate) async fn api_session_current(Path(agent_id): Path<String>) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }

    // Prefer PinchyDb.
    let sid = if let Some(db) = crate::store::global_db() {
        db.current_session(&agent_id).ok().flatten()
    } else {
        tracing::warn!("no database available — skipping api_session_current");
        None
    };

    Json(SessionCurrentResponse { session_id: sid }).into_response()
}

/// `DELETE /api/agents/:id/sessions/:file` — delete a session.
pub(crate) async fn api_session_delete(
    Path((agent_id, session_file)): Path<(String, String)>,
) -> impl IntoResponse {
    if let Err(e) = validate_path_segment(&agent_id) {
        return e.into_response();
    }
    if let Err(e) = validate_path_segment(&session_file) {
        return e.into_response();
    }
    let session_id = session_file.trim_end_matches(".jsonl").to_string();

    // Delete from PinchyDb.
    if let Some(db) = crate::store::global_db() {
        // Clear current-session pointer if it matches.
        if let Ok(Some(ref cur)) = db.current_session(&agent_id) {
            if *cur == session_id {
                let _ = db.clear_current_session(&agent_id);
            }
        }
        match db.delete_session(&session_id) {
            Ok(true) => {
                return (
                    StatusCode::OK,
                    Json(SessionDeleteResponse {
                        session_id,
                        deleted: true,
                    }),
                )
                    .into_response();
            }
            Ok(false) => {
                return (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        error: "session not found".to_string(),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
            Err(e) => {
                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("{e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
    }

    tracing::warn!("no database available — skipping api_session_delete");
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

fn internal_error_response(error: anyhow::Error) -> axum::response::Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(ErrorResponse {
            error: format!("{error}"),
            id: None,
            agent_id: None,
            filename: None,
            allowed: None,
        }),
    )
        .into_response()
}

fn build_session_diagnostics_summary(
    history: &[Exchange],
    receipts: &[TurnReceipt],
) -> SessionDiagnosticsSummary {
    let assistant_turns = history
        .iter()
        .filter(|exchange| exchange.role == "assistant")
        .count();
    let tool_call_count = history
        .iter()
        .map(|exchange| exchange.tool_calls.as_ref().map_or(0, Vec::len))
        .sum();
    let total_tokens = receipts
        .iter()
        .map(|receipt| receipt.tokens.total_tokens)
        .sum();
    let reasoning_tokens = receipts
        .iter()
        .map(|receipt| receipt.tokens.reasoning_tokens)
        .sum();
    let estimated_cost_usd = receipts
        .iter()
        .filter_map(|receipt| receipt.estimated_cost_usd)
        .sum();

    SessionDiagnosticsSummary {
        total_turns: history.len(),
        assistant_turns,
        tool_call_count,
        total_tokens,
        reasoning_tokens,
        estimated_cost_usd,
    }
}

fn build_session_diagnostics_turns(
    history: Vec<Exchange>,
    receipts: Vec<TurnReceipt>,
    receipt_model_calls: &std::collections::HashMap<i64, Vec<ModelCallTrace>>,
) -> Vec<SessionDiagnosticsTurn> {
    let matched_receipts = match_receipts_to_turns(&history, receipts);

    history
        .into_iter()
        .enumerate()
        .map(|(index, exchange)| {
            let exchange_id = exchange.exchange_id;
            let turn_receipt = matched_receipts[index].as_ref().map(|receipt| {
                session_diagnostics_receipt_from_receipt(
                    receipt,
                    receipt
                        .receipt_id
                        .is_some_and(|receipt_id| receipt_model_calls.contains_key(&receipt_id)),
                )
            });

            SessionDiagnosticsTurn {
                id: exchange_id
                    .map(|id| format!("{id}-{}", exchange.role))
                    .unwrap_or_else(|| format!("{}-{index}-{}", exchange.timestamp, exchange.role)),
                exchange_id,
                timestamp: exchange.timestamp,
                role: exchange.role,
                content: exchange.content,
                tool_calls: exchange.tool_calls,
                tool_call_id: exchange.tool_call_id,
                turn_receipt,
            }
        })
        .collect()
}

fn match_receipts_to_turns(
    history: &[Exchange],
    mut receipts: Vec<TurnReceipt>,
) -> Vec<Option<TurnReceipt>> {
    receipts.sort_by_key(|receipt| {
        (
            receipt.assistant_exchange_id.unwrap_or(i64::MAX),
            receipt.started_at,
        )
    });

    let mut matched = vec![None; history.len()];
    for receipt in receipts {
        if let Some(assistant_exchange_id) = receipt.assistant_exchange_id {
            if let Some(index) = history.iter().position(|exchange| {
                exchange.exchange_id == Some(assistant_exchange_id) && exchange.role == "assistant"
            }) {
                if matched[index].is_none() {
                    matched[index] = Some(receipt);
                    continue;
                }
            }
        }

        let turn_start = history
            .iter()
            .enumerate()
            .rfind(|(_, exchange)| {
                exchange.role == "user" && exchange.timestamp <= receipt.started_at
            })
            .map(|(index, _)| index + 1)
            .unwrap_or(0);

        let turn_end = history
            .iter()
            .enumerate()
            .skip(turn_start)
            .find(|(_, exchange)| exchange.role == "user")
            .map(|(index, _)| index)
            .unwrap_or(history.len());

        let assistant_index = (turn_start..turn_end)
            .rev()
            .find(|&index| history[index].role == "assistant" && matched[index].is_none())
            .or_else(|| {
                (turn_start..turn_end)
                    .find(|&index| history[index].role == "assistant" && matched[index].is_none())
            });

        if let Some(index) = assistant_index {
            matched[index] = Some(receipt);
        }
    }

    matched
}

fn session_diagnostics_receipt_from_receipt(
    receipt: &TurnReceipt,
    has_model_call_traces: bool,
) -> SessionDiagnosticsTurnReceipt {
    SessionDiagnosticsTurnReceipt {
        receipt_id: receipt.receipt_id.unwrap_or_default(),
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
        has_model_call_traces,
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

fn session_diagnostics_model_call_trace_from_trace(
    trace: ModelCallTrace,
) -> SessionDiagnosticsModelCallTrace {
    SessionDiagnosticsModelCallTrace {
        call_index: trace.call_index,
        provider: trace.provider,
        model_id: trace.model_id,
        api_surface: trace.api_surface,
        request_kind: trace.request_kind,
        started_at: trace.started_at,
        latency_ms: trace.latency_ms,
        normalized_messages: trace.normalized_messages,
        normalized_tools: trace.normalized_tools,
        reasoning_effort: trace.reasoning_effort,
        function_call_mode: trace.function_call_mode,
        prompt_tokens: trace.prompt_tokens,
        completion_tokens: trace.completion_tokens,
        cached_tokens: trace.cached_tokens,
        reasoning_tokens: trace.reasoning_tokens,
        cost_usd: trace.cost_usd,
        reasoning_text: trace.reasoning_text,
        reasoning_text_status: match trace.reasoning_text_status {
            crate::models::ReasoningTextStatus::Captured => {
                SessionDiagnosticsReasoningTextStatus::Captured
            }
            crate::models::ReasoningTextStatus::ProviderDidNotExpose => {
                SessionDiagnosticsReasoningTextStatus::ProviderDidNotExpose
            }
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::types::{
        ModelCallTrace, PromptSnapshot, PromptSnapshotSection, PromptSnapshotTool,
        TokenUsageSummary, TurnReceipt,
    };
    use crate::models::ReasoningTextStatus;

    fn assistant_exchange(timestamp: u64) -> Exchange {
        Exchange {
            exchange_id: None,
            timestamp,
            role: "assistant".to_string(),
            content: format!("assistant-{timestamp}"),
            metadata: None,
            tool_calls: None,
            tool_call_id: None,
            images: Vec::new(),
        }
    }

    fn user_exchange(timestamp: u64) -> Exchange {
        Exchange {
            exchange_id: None,
            timestamp,
            role: "user".to_string(),
            content: format!("user-{timestamp}"),
            metadata: None,
            tool_calls: None,
            tool_call_id: None,
            images: Vec::new(),
        }
    }

    fn receipt(started_at: u64, total_tokens: u64, estimated_cost_usd: Option<f64>) -> TurnReceipt {
        TurnReceipt {
            receipt_id: Some(started_at as i64),
            agent: "agent-1".to_string(),
            session: Some("session-1".to_string()),
            assistant_exchange_id: None,
            started_at,
            duration_ms: 25,
            user_prompt: "hello".to_string(),
            tool_calls: Vec::new(),
            tokens: TokenUsageSummary {
                prompt_tokens: total_tokens / 2,
                completion_tokens: total_tokens / 2,
                total_tokens,
                cached_tokens: 0,
                reasoning_tokens: 7,
            },
            model_calls: 1,
            reply_summary: "reply".to_string(),
            model_id: "model".to_string(),
            estimated_cost_usd,
            call_details: vec![crate::agent::types::ModelCallDetail {
                call_index: 1,
                model: "model".to_string(),
                prompt_tokens: total_tokens / 2,
                completion_tokens: total_tokens / 2,
                cached_tokens: 0,
                reasoning_tokens: 7,
                provider: "openai".to_string(),
                api_surface: Some("chat_completions".to_string()),
                request_kind: Some("chat_with_tools".to_string()),
                cost_usd: estimated_cost_usd,
                latency_ms: 25,
            }],
            prompt_snapshot: Some(PromptSnapshot {
                sections: vec![PromptSnapshotSection {
                    key: "bootstrap".to_string(),
                    title: "Bootstrap / System Prompt".to_string(),
                    content: "system prompt".to_string(),
                    truncated: false,
                    original_char_count: None,
                    note: None,
                }],
                available_tools: vec![PromptSnapshotTool {
                    name: "read_file".to_string(),
                    description: Some("Read a file".to_string()),
                }],
            }),
            reasoning_text: None,
            reasoning_text_status: None,
        }
    }

    #[test]
    fn diagnostics_summary_sums_receipts_and_turns() {
        let history = vec![
            user_exchange(100),
            Exchange {
                exchange_id: None,
                timestamp: 150,
                role: "assistant".to_string(),
                content: "reply".to_string(),
                metadata: None,
                tool_calls: Some(vec![serde_json::json!({ "id": "call-1" })]),
                tool_call_id: None,
                images: Vec::new(),
            },
        ];
        let receipts = vec![receipt(120, 42, Some(0.12))];

        let summary = build_session_diagnostics_summary(&history, &receipts);

        assert_eq!(summary.total_turns, 2);
        assert_eq!(summary.assistant_turns, 1);
        assert_eq!(summary.tool_call_count, 1);
        assert_eq!(summary.total_tokens, 42);
        assert_eq!(summary.reasoning_tokens, 7);
        assert!((summary.estimated_cost_usd - 0.12).abs() < f64::EPSILON);
    }

    #[test]
    fn match_receipts_to_assistant_turns_in_order() {
        let history = vec![
            user_exchange(100),
            assistant_exchange(200),
            user_exchange(300),
            assistant_exchange(400),
        ];
        let receipts = vec![receipt(110, 10, None), receipt(350, 20, None)];

        let matched = match_receipts_to_turns(&history, receipts);

        assert!(matched[0].is_none());
        assert_eq!(matched[1].as_ref().map(|r| r.started_at), Some(110));
        assert!(matched[2].is_none());
        assert_eq!(matched[3].as_ref().map(|r| r.started_at), Some(350));
    }

    #[test]
    fn match_receipts_to_final_assistant_after_tool_calls() {
        let history = vec![
            user_exchange(100),
            Exchange {
                exchange_id: None,
                timestamp: 200,
                role: "assistant".to_string(),
                content: "tool stub".to_string(),
                metadata: None,
                tool_calls: Some(vec![serde_json::json!({ "id": "call-1" })]),
                tool_call_id: None,
                images: Vec::new(),
            },
            Exchange {
                exchange_id: None,
                timestamp: 250,
                role: "tool".to_string(),
                content: "tool output".to_string(),
                metadata: None,
                tool_calls: None,
                tool_call_id: Some("call-1".to_string()),
                images: Vec::new(),
            },
            assistant_exchange(300),
        ];
        let receipts = vec![receipt(110, 42, Some(0.12))];

        let matched = match_receipts_to_turns(&history, receipts);

        assert!(matched[0].is_none());
        assert!(matched[1].is_none());
        assert!(matched[2].is_none());
        assert_eq!(matched[3].as_ref().map(|r| r.started_at), Some(110));
    }

    #[test]
    fn diagnostics_turns_attach_receipt_to_final_assistant_after_tool_calls() {
        let history = vec![
            user_exchange(100),
            Exchange {
                exchange_id: Some(2),
                timestamp: 200,
                role: "assistant".to_string(),
                content: "tool stub".to_string(),
                metadata: None,
                tool_calls: Some(vec![serde_json::json!({ "id": "call-1" })]),
                tool_call_id: None,
                images: Vec::new(),
            },
            Exchange {
                exchange_id: Some(3),
                timestamp: 250,
                role: "tool".to_string(),
                content: "tool output".to_string(),
                metadata: None,
                tool_calls: None,
                tool_call_id: Some("call-1".to_string()),
                images: Vec::new(),
            },
            assistant_exchange(300),
        ];
        let mut history = history;
        history[0].exchange_id = Some(1);
        history[3].exchange_id = Some(4);
        let mut traces = std::collections::HashMap::new();
        traces.insert(
            110,
            vec![ModelCallTrace {
                call_index: 1,
                provider: "openai".to_string(),
                model_id: "model".to_string(),
                api_surface: Some("chat_completions".to_string()),
                request_kind: Some("chat_with_tools".to_string()),
                started_at: 110,
                latency_ms: 25,
                normalized_messages: vec![serde_json::json!({"role": "user", "content": "hello"})],
                normalized_tools: vec![serde_json::json!({"name": "read_file"})],
                reasoning_effort: Some("medium".to_string()),
                function_call_mode: Some("auto".to_string()),
                prompt_tokens: 21,
                completion_tokens: 21,
                cached_tokens: 0,
                reasoning_tokens: 7,
                cost_usd: Some(0.12),
                reasoning_text: None,
                reasoning_text_status: ReasoningTextStatus::ProviderDidNotExpose,
            }],
        );
        let turns =
            build_session_diagnostics_turns(history, vec![receipt(110, 42, Some(0.12))], &traces);

        assert!(turns[1].turn_receipt.is_none());
        assert!(turns[2].turn_receipt.is_none());

        let receipt = turns[3]
            .turn_receipt
            .as_ref()
            .expect("final assistant reply should have the receipt");
        assert_eq!(receipt.started_at, 110);
        assert_eq!(receipt.receipt_id, 110);
        assert!(receipt.prompt_snapshot.is_some());
        assert!(receipt.has_model_call_traces);
        assert_eq!(turns[3].exchange_id, Some(4));
        assert_eq!(turns[3].id, "4-assistant");
    }

    #[test]
    fn match_receipts_prefers_stable_assistant_exchange_id() {
        let history = vec![
            user_exchange(100),
            Exchange {
                exchange_id: Some(2),
                timestamp: 200,
                role: "assistant".to_string(),
                content: "tool stub".to_string(),
                metadata: None,
                tool_calls: Some(vec![serde_json::json!({ "id": "call-1" })]),
                tool_call_id: None,
                images: Vec::new(),
            },
            Exchange {
                exchange_id: Some(3),
                timestamp: 250,
                role: "tool".to_string(),
                content: "tool output".to_string(),
                metadata: None,
                tool_calls: None,
                tool_call_id: Some("call-1".to_string()),
                images: Vec::new(),
            },
            assistant_exchange(300),
        ];
        let mut history = history;
        history[0].exchange_id = Some(1);
        history[3].exchange_id = Some(4);
        let mut linked_receipt = receipt(110, 42, Some(0.12));
        linked_receipt.assistant_exchange_id = Some(4);

        let matched = match_receipts_to_turns(&history, vec![linked_receipt]);

        assert!(matched[1].is_none());
        assert_eq!(
            matched[3].as_ref().and_then(|r| r.assistant_exchange_id),
            Some(4)
        );
    }

    #[test]
    fn match_receipts_stable_id_does_not_assume_contiguous_row_ids() {
        let history = vec![
            Exchange {
                exchange_id: Some(10),
                ..user_exchange(100)
            },
            Exchange {
                exchange_id: Some(42),
                timestamp: 200,
                role: "assistant".to_string(),
                content: "tool stub".to_string(),
                metadata: None,
                tool_calls: Some(vec![serde_json::json!({ "id": "call-1" })]),
                tool_call_id: None,
                images: Vec::new(),
            },
            Exchange {
                exchange_id: Some(77),
                timestamp: 250,
                role: "tool".to_string(),
                content: "tool output".to_string(),
                metadata: None,
                tool_calls: None,
                tool_call_id: Some("call-1".to_string()),
                images: Vec::new(),
            },
            Exchange {
                exchange_id: Some(99),
                ..assistant_exchange(300)
            },
        ];
        let mut linked_receipt = receipt(110, 42, Some(0.12));
        linked_receipt.assistant_exchange_id = Some(99);

        let matched = match_receipts_to_turns(&history, vec![linked_receipt]);

        assert!(matched[1].is_none());
        assert_eq!(
            matched[3].as_ref().and_then(|r| r.assistant_exchange_id),
            Some(99)
        );
    }

    #[test]
    fn diagnostics_turns_attach_receipt_with_sparse_exchange_ids() {
        let history = vec![
            Exchange {
                exchange_id: Some(10),
                ..user_exchange(100)
            },
            Exchange {
                exchange_id: Some(42),
                timestamp: 200,
                role: "assistant".to_string(),
                content: "tool stub".to_string(),
                metadata: None,
                tool_calls: Some(vec![serde_json::json!({ "id": "call-1" })]),
                tool_call_id: None,
                images: Vec::new(),
            },
            Exchange {
                exchange_id: Some(77),
                timestamp: 250,
                role: "tool".to_string(),
                content: "tool output".to_string(),
                metadata: None,
                tool_calls: None,
                tool_call_id: Some("call-1".to_string()),
                images: Vec::new(),
            },
            Exchange {
                exchange_id: Some(99),
                ..assistant_exchange(300)
            },
        ];
        let mut linked_receipt = receipt(110, 42, Some(0.12));
        linked_receipt.assistant_exchange_id = Some(99);

        let turns = build_session_diagnostics_turns(
            history,
            vec![linked_receipt],
            &std::collections::HashMap::new(),
        );

        assert!(turns[1].turn_receipt.is_none());
        assert!(turns[2].turn_receipt.is_none());
        assert_eq!(turns[3].exchange_id, Some(99));
        assert_eq!(
            turns[3]
                .turn_receipt
                .as_ref()
                .and_then(|receipt| receipt.assistant_exchange_id),
            Some(99)
        );
    }

    #[test]
    fn diagnostics_receipt_includes_prompt_snapshot() {
        let receipt = receipt(120, 42, Some(0.12));

        let diagnostics_receipt = session_diagnostics_receipt_from_receipt(&receipt, false);

        let prompt_snapshot = diagnostics_receipt
            .prompt_snapshot
            .expect("prompt snapshot should be present");
        assert_eq!(prompt_snapshot.sections.len(), 1);
        assert_eq!(prompt_snapshot.available_tools.len(), 1);
        assert_eq!(prompt_snapshot.available_tools[0].name, "read_file");
        assert_eq!(diagnostics_receipt.call_details[0].provider, "openai");
        assert_eq!(diagnostics_receipt.call_details[0].call_index, 1);
        assert!(!diagnostics_receipt.has_model_call_traces);
    }
}
