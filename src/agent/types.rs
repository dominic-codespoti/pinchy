use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::config::Config;
use crate::models::{ReasoningTextStatus, TokenUsage};
use crate::store::PinchyDb;

// ---------------------------------------------------------------------------
// Constants & tiny helpers
// ---------------------------------------------------------------------------

pub const DEFAULT_PROVIDER: &str = "openai";
pub const DEFAULT_MODEL_ID: &str = "openai-default";
pub const MAX_TOOL_RESULT_BYTES: usize = 16_000;

/// Sentinel prefix returned by the `session_yield` tool to signal early
/// termination of the tool loop.
pub const YIELD_SENTINEL: &str = "__SESSION_YIELD__";

pub fn epoch_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

pub fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn uuid_like_id() -> String {
    format!("{:016x}", epoch_nanos())
}

pub fn truncate_tool_result(s: String) -> String {
    if s.len() <= MAX_TOOL_RESULT_BYTES {
        return s;
    }

    // Keep both head and tail of large outputs. This preserves error
    // messages / compiler errors that typically appear at the end of
    // build logs while still showing the beginning for context.
    //
    // Split: 60% head, 40% tail (errors cluster at the end).
    let head_budget = MAX_TOOL_RESULT_BYTES * 60 / 100;
    let tail_budget = MAX_TOOL_RESULT_BYTES - head_budget;

    let mut head_end = head_budget;
    while !s.is_char_boundary(head_end) && head_end > 0 {
        head_end -= 1;
    }

    let mut tail_start = s.len().saturating_sub(tail_budget);
    while !s.is_char_boundary(tail_start) && tail_start < s.len() {
        tail_start += 1;
    }

    // If head and tail overlap (shouldn't happen given the size check, but
    // be defensive), just do a simple head truncation.
    if head_end >= tail_start {
        return format!(
            "{}\n\n[… result truncated — {} bytes total, showing first {}. Use more specific args to narrow output.]",
            &s[..head_end],
            s.len(),
            head_end,
        );
    }

    let omitted = tail_start - head_end;
    format!(
        "{}\n\n[… {} bytes omitted — {} bytes total, showing head + tail …]\n\n{}",
        &s[..head_end],
        omitted,
        s.len(),
        &s[tail_start..],
    )
}

pub fn extract_reasoning_preview(text: &str) -> Option<String> {
    const MAX_PREVIEW_CHARS: usize = 180;

    let latest_line = text.lines().rev().map(str::trim).find(|line| {
        !line.is_empty() && !line.chars().all(|ch| matches!(ch, '-' | '=' | '_' | '~'))
    });

    let candidate = latest_line.unwrap_or(text);
    let collapsed = candidate.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return None;
    }

    Some(truncate_inline_preview(&collapsed, MAX_PREVIEW_CHARS))
}

fn truncate_inline_preview(text: &str, limit: usize) -> String {
    let mut chars = text.chars();
    let truncated: String = chars.by_ref().take(limit).collect();
    if chars.next().is_none() {
        return truncated;
    }

    format!("{}...", truncated.trim_end())
}

// ---------------------------------------------------------------------------
// Turn receipt types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolCallRecord {
    pub tool: String,
    pub args_summary: String,
    pub success: bool,
    pub duration_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TurnReceipt {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub receipt_id: Option<i64>,
    pub agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub assistant_exchange_id: Option<i64>,
    pub started_at: u64,
    pub duration_ms: u64,
    pub user_prompt: String,
    pub tool_calls: Vec<ToolCallRecord>,
    pub tokens: TokenUsageSummary,
    pub model_calls: u32,
    pub reply_summary: String,
    /// Model used for this turn.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub model_id: String,
    /// Estimated cost in USD (None when pricing data unavailable).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub estimated_cost_usd: Option<f64>,
    /// Per model-call usage breakdown.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub call_details: Vec<ModelCallDetail>,
    /// Structured snapshot of the assembled prompt context for this turn.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub prompt_snapshot: Option<PromptSnapshot>,
    /// Provider-exposed reasoning text, aggregated across model calls when available.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_text: Option<String>,
    /// Whether provider reasoning text was captured for this turn.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_text_status: Option<ReasoningTextStatus>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct PromptSnapshot {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub sections: Vec<PromptSnapshotSection>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub available_tools: Vec<PromptSnapshotTool>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PromptSnapshotSection {
    pub key: String,
    pub title: String,
    pub content: String,
    #[serde(default)]
    pub truncated: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub original_char_count: Option<usize>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PromptSnapshotTool {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct ModelCallDetail {
    #[serde(default)]
    pub call_index: u32,
    pub model: String,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub provider: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_surface: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_kind: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    pub latency_ms: u64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ModelCallTrace {
    pub call_index: u32,
    pub provider: String,
    pub model_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_surface: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub request_kind: Option<String>,
    pub started_at: u64,
    pub latency_ms: u64,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub normalized_messages: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub normalized_tools: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub function_call_mode: Option<String>,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost_usd: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reasoning_text: Option<String>,
    pub reasoning_text_status: ReasoningTextStatus,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct TokenUsageSummary {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
    #[serde(default)]
    pub cached_tokens: u64,
    #[serde(default)]
    pub reasoning_tokens: u64,
}

impl TokenUsageSummary {
    pub fn accumulate(&mut self, usage: &TokenUsage) {
        self.prompt_tokens += usage.prompt_tokens;
        self.completion_tokens += usage.completion_tokens;
        self.total_tokens += usage.total_tokens;
        self.cached_tokens += usage.cached_tokens;
        self.reasoning_tokens += usage.reasoning_tokens;
    }
}

pub fn summarize_reasoning_from_model_calls(
    model_call_traces: &[ModelCallTrace],
) -> (Option<String>, Option<ReasoningTextStatus>) {
    let captured_texts: Vec<String> = model_call_traces
        .iter()
        .filter_map(|trace| trace.reasoning_text.as_deref())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .map(ToOwned::to_owned)
        .collect();

    if !captured_texts.is_empty() {
        return (
            Some(captured_texts.join("\n\n---\n\n")),
            Some(ReasoningTextStatus::Captured),
        );
    }

    if model_call_traces
        .iter()
        .any(|trace| trace.reasoning_tokens > 0)
    {
        return (None, Some(ReasoningTextStatus::ProviderDidNotExpose));
    }

    (None, None)
}

#[cfg(test)]
mod tests {
    use super::extract_reasoning_preview;

    #[test]
    fn reasoning_preview_uses_latest_meaningful_line() {
        let preview =
            extract_reasoning_preview("First thought\n\nSecond thought\nFinal useful line");
        assert_eq!(preview.as_deref(), Some("Final useful line"));
    }

    #[test]
    fn reasoning_preview_skips_separator_lines() {
        let preview = extract_reasoning_preview("Earlier\n---\nLatest useful line");
        assert_eq!(preview.as_deref(), Some("Latest useful line"));
    }
}

// ---------------------------------------------------------------------------
// Agent struct
// ---------------------------------------------------------------------------

pub struct Agent {
    pub id: String,
    pub agent_root: PathBuf,
    pub workspace: PathBuf,
    pub provider: String,
    pub model_id: String,
    pub current_session: Option<String>,
    pub max_tool_iterations: usize,
    pub enabled_skills: Option<Vec<String>>,
    pub fallback_models: Vec<String>,
    pub model_config_ref: Option<String>,
    pub reasoning_effort: Option<String>,
    pub db: Option<PinchyDb>,
}

impl Agent {
    pub fn new(id: impl Into<String>, agent_root: impl Into<PathBuf>) -> Self {
        let id = id.into();
        let agent_root = agent_root.into();
        let workspace = agent_root.join("workspace");
        let db = crate::store::global_db().cloned();
        let current_session = db
            .as_ref()
            .and_then(|d| d.current_session(&id).ok().flatten());
        Self {
            id,
            agent_root,
            workspace,
            provider: DEFAULT_PROVIDER.to_string(),
            model_id: DEFAULT_MODEL_ID.to_string(),
            current_session,
            max_tool_iterations: 25,
            enabled_skills: None,
            fallback_models: Vec::new(),
            model_config_ref: None,
            reasoning_effort: None,
            db,
        }
    }

    pub fn new_from_config(agent_cfg: &crate::config::AgentConfig, cfg: &Config) -> Self {
        let agent_root = PathBuf::from(&agent_cfg.root);
        let workspace = agent_root.join("workspace");
        let (provider, model_id) = if let (Some(provider), Some(model)) =
            (agent_cfg.provider.as_ref(), agent_cfg.model.as_ref())
        {
            (provider.clone(), model.clone())
        } else {
            cfg.resolve_agent_model_pair(agent_cfg)
                .unwrap_or_else(|| (DEFAULT_PROVIDER.to_string(), DEFAULT_MODEL_ID.to_string()))
        };
        let db = crate::store::global_db().cloned();
        let current_session = db
            .as_ref()
            .and_then(|d| d.current_session(&agent_cfg.id).ok().flatten());
        Self {
            id: agent_cfg.id.clone(),
            agent_root,
            workspace,
            provider,
            model_id,
            current_session,
            max_tool_iterations: agent_cfg.max_tool_iterations.unwrap_or(25),
            enabled_skills: agent_cfg.enabled_skills.clone(),
            fallback_models: agent_cfg.fallback_models.clone(),
            model_config_ref: agent_cfg.model.clone(),
            reasoning_effort: agent_cfg.reasoning_effort.clone(),
            db,
        }
    }

    pub async fn start_session(&mut self) -> String {
        let id = crate::session::index::new_session_id();
        let _ = tokio::fs::create_dir_all(&self.workspace).await;
        self.current_session = Some(id.clone());

        // Persist to PinchyDb if available; fall back to files.
        if let Some(ref db) = self.db {
            let entry = crate::session::index::IndexEntry {
                session_id: id.clone(),
                agent_id: self.id.clone(),
                created_at: epoch_millis(),
                title: None,
            };
            if let Err(e) = db.insert_session(&entry) {
                tracing::warn!(error = %e, "failed to insert session into db");
            }
            if let Err(e) = db.set_current_session(&self.id, &id) {
                tracing::warn!(error = %e, "failed to set current session in db");
            }
        } else {
            tracing::warn!("no database available — skipping operation");
        }

        id
    }
}
