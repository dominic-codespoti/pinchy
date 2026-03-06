//! Context window management: turn-based compaction and pruning.
//!
//! Keeps the conversation history within a configurable budget so sessions
//! never silently hit provider limits.
//!
//! Key design decisions:
//! - **System messages are pinned** — they are NEVER pruned, compacted,
//!   or truncated.  SOUL.md / TOOLS.md behavioural rules survive the
//!   entire session.
//! - **Turn-based compaction** — compaction triggers after a turn count
//!   threshold, not a token count.  This is more predictable and avoids
//!   the need for client-side token counting (e.g. tiktoken-rs).
//! - Token counts for cost/receipts come from API responses (`TokenUsage`
//!   via `parse_token_usage()`).  A cheap character-based heuristic is
//!   available for debug logging only.
//!
//! Two layers (applied in order):
//! 1. **Pruning** — strips large tool-result payloads from older
//!    non-system messages (triggers by message count, not tokens).
//! 2. **Turn-based compaction** — when conversation turns exceed a
//!    threshold, the oldest non-system turns are summarised into a single
//!    system message via the LLM.

use crate::models::{ChatMessage, ModelProvider};
use tracing::debug;

// ---------------------------------------------------------------------------
// Token estimation (cheap character heuristic — for debug logging only)
// ---------------------------------------------------------------------------

/// Cheap character-based token estimate (~3.5 chars per token for English).
///
/// This is used **only** for diagnostic logging.  All real token tracking
/// comes from API response `usage` fields.
pub fn estimate_tokens(text: &str) -> usize {
    // ≈ len/3.5, integer math
    text.len() * 2 / 7
}

/// Total estimated tokens for a slice of messages (character heuristic).
///
/// Used **only** for debug logging — not for context management decisions.
pub fn estimate_total(messages: &[ChatMessage]) -> usize {
    messages
        .iter()
        .map(|m| estimate_tokens(&m.content) + 4) // +4 per-message overhead
        .sum()
}

// ---------------------------------------------------------------------------
// Context window config
// ---------------------------------------------------------------------------

/// Budget / threshold configuration for context window management.
///
/// All triggers are count-based (turns or messages) — no client-side token
/// counting is involved.
#[derive(Debug, Clone)]
pub struct ContextBudget {
    /// Maximum number of non-system conversation turns before compaction
    /// kicks in.  A "turn" is a user message + the assistant reply +
    /// any tool messages in between.  System messages are never counted.
    pub max_turns: usize,
    /// Number of recent turns to keep intact during compaction.
    pub compact_keep_recent_turns: usize,
    /// Number of messages (including system) beyond which tool-result
    /// pruning kicks in.
    pub prune_message_threshold: usize,
}

impl Default for ContextBudget {
    fn default() -> Self {
        Self {
            max_turns: 20,
            compact_keep_recent_turns: 8,
            prune_message_threshold: 30,
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers — identify system (pinned) vs conversation messages
// ---------------------------------------------------------------------------

/// Count leading system messages (these are pinned and never touched).
fn leading_system_count(messages: &[ChatMessage]) -> usize {
    messages.iter().take_while(|m| m.is_system()).count()
}

/// Count conversation turns (each user message starts a new turn).
/// Only counts non-system messages.
fn count_turns(messages: &[ChatMessage]) -> usize {
    messages.iter().filter(|m| m.is_user()).count()
}

// ---------------------------------------------------------------------------
// Pruning — strip old tool results (system messages exempt)
// ---------------------------------------------------------------------------

/// Prune large tool-result / function-call content from older non-system
/// messages, keeping the most recent `keep_recent` messages untouched.
///
/// **System messages are never pruned** regardless of position.
pub fn prune_tool_results(messages: &mut [ChatMessage], keep_recent: usize) {
    if messages.len() <= keep_recent {
        return;
    }
    let cutoff = messages.len() - keep_recent;
    let mut pruned_count = 0usize;

    for msg in messages[..cutoff].iter_mut() {
        // PINNED: never touch system messages.
        if msg.is_system() {
            continue;
        }

        // Prune role:"tool" messages (function-calling path).
        if msg.is_tool() && msg.content.len() > 300 {
            msg.content = format!("[tool result pruned — {} chars]", msg.content.len());
            pruned_count += 1;
            continue;
        }

        // Prune [Tool Result for ...] in role:"user" messages (fenced path).
        if msg.is_user() {
            if let Some(pos) = msg.content.find("[Tool Result for ") {
                let after = pos + "[Tool Result for ".len();
                let payload_start = msg.content[after..].find("]: ").map(|i| after + i + 3);
                if let Some(start) = payload_start {
                    let payload_len = msg.content.len() - start;
                    if payload_len > 300 {
                        let tool_name_end = msg.content[after..]
                            .find(']')
                            .map(|i| after + i)
                            .unwrap_or(after);
                        let tool_name = &msg.content[after..tool_name_end];
                        msg.content = format!(
                            "[Tool Result for {tool_name}]: [pruned — {payload_len} chars]"
                        );
                        pruned_count += 1;
                        continue;
                    }
                }
            }
        }

        if msg.role != "assistant" {
            continue;
        }
        // Prune TOOL_RESULT blocks
        if let Some(pos) = msg.content.find("TOOL_RESULT\n```") {
            let original_len = msg.content.len();
            if let Some(end) = msg.content[pos..].find("\n```\n").or_else(|| {
                if msg.content.ends_with("\n```") {
                    Some(msg.content.len() - pos - 3)
                } else {
                    None
                }
            }) {
                let trimmed_len = end.min(original_len - pos);
                if trimmed_len > 200 {
                    msg.content = format!(
                        "{}[tool result pruned — {} chars]",
                        &msg.content[..pos],
                        trimmed_len
                    );
                    pruned_count += 1;
                }
            }
        }
        // Prune FUNCTION_CALL argument blobs
        if msg.content.starts_with("FUNCTION_CALL:") && msg.content.len() > 300 {
            let name_end = msg.content.find('(').unwrap_or(msg.content.len());
            msg.content = format!("{}(…) [args pruned]", &msg.content[..name_end]);
            pruned_count += 1;
        }
    }

    if pruned_count > 0 {
        debug!(pruned = pruned_count, "pruned old tool results");
    }
}

// ---------------------------------------------------------------------------
// Turn-based compaction — summarise old turns via LLM
// ---------------------------------------------------------------------------

/// Compact the message list when the conversation turn count exceeds
/// `budget.max_turns`.
///
/// The oldest non-system turns (everything except the last
/// `compact_keep_recent_turns` turns worth of messages) are summarised
/// into a single `<compacted_history>` system message.
///
/// **System messages are always preserved in full** — they are never
/// included in the compaction window and never removed.
///
/// Returns `true` if compaction occurred.
pub async fn compact_if_needed(
    messages: &mut Vec<ChatMessage>,
    budget: &ContextBudget,
    provider: &dyn ModelProvider,
) -> bool {
    let turns = count_turns(messages);
    if turns <= budget.max_turns {
        return false;
    }

    debug!(
        turns,
        max_turns = budget.max_turns,
        "turn count exceeds threshold, compacting"
    );

    let pinned_count = leading_system_count(messages);

    // Find the split point: keep the last `compact_keep_recent_turns`
    // user-initiated turns (and all their associated tool/assistant msgs).
    // Walk backward from the end counting user messages.
    let mut keep_turns_seen = 0usize;
    let mut tail_start = messages.len();
    for (i, m) in messages.iter().enumerate().rev() {
        if m.is_system() {
            continue;
        }
        if m.is_user() {
            keep_turns_seen += 1;
            if keep_turns_seen >= budget.compact_keep_recent_turns {
                tail_start = i;
                break;
            }
        }
    }

    // Guarantee: the kept tail must contain at least one complete tool
    // interaction (assistant with tool_calls + tool result) so the LLM
    // retains "muscle memory" for JSON tool syntax.  If the current
    // tail doesn't have one, extend it backward until it does.
    let tail_has_tool_example = messages[tail_start..]
        .iter()
        .any(|m| (m.is_assistant() && m.tool_calls.is_some()) || m.is_tool());
    if !tail_has_tool_example {
        // Walk backward from tail_start to find the nearest tool
        // interaction and include it.
        for i in (pinned_count..tail_start).rev() {
            let m = &messages[i];
            if m.is_tool() || (m.is_assistant() && m.tool_calls.is_some()) {
                // Include from the user message that initiated this tool turn.
                let mut new_start = i;
                for j in (pinned_count..i).rev() {
                    if messages[j].is_user() {
                        new_start = j;
                        break;
                    }
                }
                tail_start = new_start;
                break;
            }
        }
    }

    // Ensure we don't try to compact pinned system messages.
    if tail_start <= pinned_count {
        return false;
    }

    // Collect non-system messages from the compaction window for summary.
    // System messages in this range (e.g. injected compaction summaries
    // from prior rounds, or mid-conversation system hints) are preserved
    // in-place rather than summarised.
    let mut to_summarise: Vec<String> = Vec::new();
    let mut mid_system_messages: Vec<ChatMessage> = Vec::new();

    for m in &messages[pinned_count..tail_start] {
        if m.is_system() {
            mid_system_messages.push(m.clone());
        } else {
            to_summarise.push(format!(
                "[{}]: {}",
                m.role,
                truncate_for_summary(&m.content, 500)
            ));
        }
    }

    if to_summarise.is_empty() {
        return false;
    }

    let summary_prompt = format!(
        "Summarise the following conversation history into a concise paragraph. \
         Preserve key facts, decisions, file paths mentioned, tool results, and \
         any user preferences or corrections. Omit greetings and filler.\n\n{}",
        to_summarise.join("\n")
    );

    let summary_messages = vec![ChatMessage::user(summary_prompt)];

    let summary = match provider.send_chat(&summary_messages).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "compaction LLM call failed, skipping");
            return false;
        }
    };

    // Build the compacted message list:
    //   [pinned system msgs] + [mid-range system msgs] +
    //   [compaction summary] + [tail messages]
    let mut compacted: Vec<ChatMessage> = messages[..pinned_count].to_vec();
    compacted.extend(mid_system_messages);
    compacted.push(ChatMessage::system(format!(
        "<compacted_history>\n{summary}\n</compacted_history>"
    )));
    compacted.extend_from_slice(&messages[tail_start..]);

    let old_len = messages.len();
    let old_turns = turns;
    let new_len = compacted.len();
    let new_turns = count_turns(&compacted);
    *messages = compacted;

    debug!(
        old_messages = old_len,
        new_messages = new_len,
        old_turns,
        new_turns,
        "turn-based compaction complete"
    );

    true
}

/// Truncate a string for inclusion in a compaction summary prompt.
fn truncate_for_summary(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let end = s.floor_char_boundary(max);
        format!("{}…[truncated]", &s[..end])
    }
}

// ---------------------------------------------------------------------------
// Top-level convenience: apply pruning + compaction pipeline
// ---------------------------------------------------------------------------

/// Apply the full context management pipeline to a message list:
///
/// 1. If message count exceeds `prune_message_threshold` → prune old
///    tool results (system messages exempt).
/// 2. If turn count exceeds `max_turns` → summarise old turns via LLM.
///
/// **System messages are pinned and never modified or removed.**
pub async fn manage_context(
    messages: &mut Vec<ChatMessage>,
    budget: &ContextBudget,
    provider: &dyn ModelProvider,
) {
    // Step 1: prune tool results if message count exceeds threshold.
    if messages.len() > budget.prune_message_threshold {
        let before = messages.len();
        prune_tool_results(messages, 10);
        debug!(
            before_msgs = before,
            after_msgs = messages.len(),
            "post-prune message count"
        );
    }

    // Step 2: turn-based compaction.
    compact_if_needed(messages, budget, provider).await;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage::new(role, content)
    }

    #[test]
    fn estimate_tokens_basic() {
        // "hello" = 5 chars → 5*2/7 = 1
        let t = estimate_tokens("hello");
        assert!(
            (1..=3).contains(&t),
            "expected 1–3 tokens for 'hello', got {t}"
        );
        let t0 = estimate_tokens("");
        assert_eq!(t0, 0);
    }

    #[test]
    fn estimate_total_counts_overhead() {
        let msgs = vec![msg("user", "hi"), msg("assistant", "hello")];
        let total = estimate_total(&msgs);
        assert!(total > 0);
    }

    #[test]
    fn prune_never_touches_system_messages() {
        let big_system = format!("system prompt with lots of text: {}", "x".repeat(2000));
        let mut msgs = vec![
            msg("system", &big_system),
            msg("system", "tools metadata with more text"),
            msg("user", "old question"),
            msg("assistant", "old answer"),
            msg("user", "recent question"),
        ];

        prune_tool_results(&mut msgs, 1);

        // System messages must be completely untouched.
        assert_eq!(msgs[0].content, big_system);
        assert_eq!(msgs[1].content, "tools metadata with more text");
    }

    #[test]
    fn prune_strips_old_tool_results() {
        let big_result = format!("TOOL_RESULT\n```json\n{}\n```", "x".repeat(1000));
        let mut msgs = vec![
            msg("system", "bootstrap"),
            msg("user", "do something"),
            msg("assistant", &big_result),
            msg("user", "recent question"),
            msg("assistant", "recent answer"),
        ];

        prune_tool_results(&mut msgs, 2);

        assert!(msgs[2].content.contains("[tool result pruned"));
        assert_eq!(msgs[3].content, "recent question");
        assert_eq!(msgs[4].content, "recent answer");
    }

    #[test]
    fn prune_leaves_small_results() {
        let small_result = "TOOL_RESULT\n```json\n{\"ok\":true}\n```";
        let mut msgs = vec![
            msg("user", "q"),
            msg("assistant", small_result),
            msg("user", "recent"),
        ];

        prune_tool_results(&mut msgs, 1);
        assert!(msgs[1].content.contains("ok"));
    }

    #[test]
    fn prune_function_calls() {
        let big_call = format!("FUNCTION_CALL: some_tool({})", "a".repeat(500));
        let mut msgs = vec![msg("assistant", &big_call), msg("user", "recent")];

        prune_tool_results(&mut msgs, 1);
        assert!(msgs[0].content.contains("[args pruned]"));
    }

    #[test]
    fn count_turns_works() {
        let msgs = vec![
            msg("system", "bootstrap"),
            msg("user", "q1"),
            msg("assistant", "a1"),
            msg("user", "q2"),
            msg("tool", "result"),
            msg("assistant", "a2"),
            msg("user", "q3"),
        ];
        assert_eq!(count_turns(&msgs), 3);
    }

    #[test]
    fn default_budget_values() {
        let b = ContextBudget::default();
        assert_eq!(b.max_turns, 20);
        assert_eq!(b.compact_keep_recent_turns, 8);
        assert_eq!(b.prune_message_threshold, 30);
    }
}
