//! Context window management: token estimation, pruning, and compaction.
//!
//! Keeps the conversation history within a configurable token budget so
//! sessions never silently hit provider limits.
//!
//! Three layers (applied in order):
//! 1. **Token estimation** — real BPE tokenisation via `tiktoken-rs`.
//! 2. **Pruning** — strips large `TOOL_RESULT` blocks from older messages,
//!    replacing them with a one-line summary.
//! 3. **Compaction** — when the window is still over budget after pruning,
//!    the oldest *N* messages are summarised into a single `system` message
//!    by calling the LLM itself.

use crate::models::{ChatMessage, ModelProvider};
use tiktoken_rs::o200k_base;
use tiktoken_rs::CoreBPE;
use tracing::debug;

// ---------------------------------------------------------------------------
// Token estimation
// ---------------------------------------------------------------------------

/// Cached BPE tokenizer — created once, reused on every call.
fn bpe() -> &'static CoreBPE {
    use std::sync::OnceLock;
    static BPE: OnceLock<CoreBPE> = OnceLock::new();
    BPE.get_or_init(|| o200k_base().expect("failed to load o200k_base tokeniser"))
}

/// Accurate token count for a single string using the o200k_base BPE
/// encoding (GPT-4o / GPT-4.1 / o1 / o3 / o4-mini family).
pub fn estimate_tokens(text: &str) -> usize {
    bpe().encode_with_special_tokens(text).len()
}

/// Total estimated tokens for a slice of messages.
pub fn estimate_total(messages: &[ChatMessage]) -> usize {
    let enc = bpe();
    messages
        .iter()
        .map(|m| {
            enc.encode_with_special_tokens(&m.content).len()
                + enc.encode_with_special_tokens(&m.role).len()
                + 4 // per-message overhead
        })
        .sum()
}

// ---------------------------------------------------------------------------
// Context window config
// ---------------------------------------------------------------------------

/// Budget / threshold configuration for context window management.
#[derive(Debug, Clone)]
pub struct ContextBudget {
    /// Maximum tokens we ever want to send (hard limit).
    pub max_tokens: usize,
    /// When estimated tokens exceed this, pruning kicks in.
    pub prune_threshold: usize,
    /// When estimated tokens still exceed this after pruning, compaction
    /// kicks in.
    pub compact_threshold: usize,
}

impl Default for ContextBudget {
    fn default() -> Self {
        Self {
            max_tokens: 120_000,      // ~128k context models
            prune_threshold: 80_000,  // start pruning at ~60 %
            compact_threshold: 100_000, // compact at ~75 %
        }
    }
}

// ---------------------------------------------------------------------------
// Pruning — strip old tool results
// ---------------------------------------------------------------------------

/// Prune large `TOOL_RESULT` / `FUNCTION_CALL` content from earlier
/// messages, keeping only recent ones intact.
///
/// `keep_recent` is the number of messages from the end that are left
/// untouched.
pub fn prune_tool_results(messages: &mut [ChatMessage], keep_recent: usize) {
    if messages.len() <= keep_recent {
        return;
    }
    let cutoff = messages.len() - keep_recent;
    let mut pruned_count = 0usize;

    for msg in messages[..cutoff].iter_mut() {
        if msg.role != "assistant" {
            continue;
        }
        // Prune TOOL_RESULT blocks
        if let Some(pos) = msg.content.find("TOOL_RESULT\n```") {
            let original_len = msg.content.len();
            // Find the closing ``` after the opening
            if let Some(end) = msg.content[pos..].find("\n```\n").or_else(|| {
                // might be at the very end
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
            // Keep just the function name
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
// Compaction — summarise old messages via LLM
// ---------------------------------------------------------------------------

/// The number of messages in the compaction summary window (how many
/// oldest messages get replaced by one summary).  We leave at least the
/// most recent `keep_tail` messages untouched.
const COMPACT_KEEP_TAIL: usize = 10;

/// Compact the message list if it exceeds `budget.compact_threshold`
/// tokens.
///
/// The oldest messages (everything except the last `COMPACT_KEEP_TAIL`)
/// are summarised into a single `system` message by asking the provider.
/// System messages at the very beginning are always preserved (they
/// contain the bootstrap / skills / nonce).
///
/// Returns `true` if compaction occurred.
pub async fn compact_if_needed(
    messages: &mut Vec<ChatMessage>,
    budget: &ContextBudget,
    provider: &dyn ModelProvider,
) -> bool {
    let total = estimate_total(messages);
    if total <= budget.compact_threshold {
        return false;
    }

    debug!(
        tokens = total,
        threshold = budget.compact_threshold,
        "context exceeds compact threshold, compacting"
    );

    // Identify the split point: preserve leading system messages and the
    // last COMPACT_KEEP_TAIL messages.
    let leading_system = messages
        .iter()
        .take_while(|m| m.role == "system")
        .count();

    let tail_start = messages.len().saturating_sub(COMPACT_KEEP_TAIL).max(leading_system);
    if tail_start <= leading_system {
        // Nothing to compact (all system or too short).
        return false;
    }

    // Slice to summarise: everything between leading system and the tail.
    let to_summarise: Vec<String> = messages[leading_system..tail_start]
        .iter()
        .map(|m| format!("[{}]: {}", m.role, truncate_for_summary(&m.content, 500)))
        .collect();

    if to_summarise.is_empty() {
        return false;
    }

    let summary_prompt = format!(
        "Summarise the following conversation history into a concise paragraph. \
         Preserve key facts, decisions, file paths mentioned, and tool results. \
         Omit greetings and filler.\n\n{}",
        to_summarise.join("\n")
    );

    let summary_messages = vec![ChatMessage::new("user", summary_prompt)];

    let summary = match provider.send_chat(&summary_messages).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!(error = %e, "compaction LLM call failed, skipping");
            return false;
        }
    };

    // Build the compacted message list:
    //   [leading system...] + [compaction summary] + [tail messages...]
    let mut compacted: Vec<ChatMessage> = messages[..leading_system].to_vec();
    compacted.push(ChatMessage::new(
        "system",
        format!("<compacted_history>\n{summary}\n</compacted_history>"),
    ));
    compacted.extend_from_slice(&messages[tail_start..]);

    let old_len = messages.len();
    let new_len = compacted.len();
    let new_tokens = estimate_total(&compacted);
    *messages = compacted;

    debug!(
        old_messages = old_len,
        new_messages = new_len,
        old_tokens = total,
        new_tokens,
        "compaction complete"
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
/// 1. If over `prune_threshold` → prune old tool results.
/// 2. If still over `compact_threshold` → summarise old messages via LLM.
/// 3. If still over `max_tokens` → hard-truncate from the front.
pub async fn manage_context(
    messages: &mut Vec<ChatMessage>,
    budget: &ContextBudget,
    provider: &dyn ModelProvider,
) {
    let total = estimate_total(messages);

    // Step 1: prune tool results if over prune threshold.
    if total > budget.prune_threshold {
        prune_tool_results(messages, COMPACT_KEEP_TAIL);
        debug!(
            before = total,
            after = estimate_total(messages),
            "post-prune token estimate"
        );
    }

    // Step 2: compact via LLM if still over compact threshold.
    let post_prune = estimate_total(messages);
    if post_prune > budget.compact_threshold {
        compact_if_needed(messages, budget, provider).await;
    }

    // Step 3: hard truncate as last resort.
    let post_compact = estimate_total(messages);
    if post_compact > budget.max_tokens {
        hard_truncate(messages, budget.max_tokens);
    }
}

/// Last-resort truncation: drop oldest non-system messages until within
/// budget.  Pre-computes per-message token costs so the total work is O(n)
/// instead of re-tokenizing every remaining message after each removal.
fn hard_truncate(messages: &mut Vec<ChatMessage>, max_tokens: usize) {
    let leading_system = messages
        .iter()
        .take_while(|m| m.role == "system")
        .count();

    // Pre-compute per-message token costs.
    let enc = bpe();
    let costs: Vec<usize> = messages
        .iter()
        .map(|m| {
            enc.encode_with_special_tokens(&m.content).len()
                + enc.encode_with_special_tokens(&m.role).len()
                + 4
        })
        .collect();

    let mut total: usize = costs.iter().sum();

    // Walk forward from the first non-system message, removing until
    // we're under budget (keep at least 2 non-system messages).
    let mut remove_up_to = leading_system; // exclusive upper bound
    while total > max_tokens && remove_up_to < messages.len().saturating_sub(2) {
        total -= costs[remove_up_to];
        remove_up_to += 1;
    }

    if remove_up_to > leading_system {
        messages.drain(leading_system..remove_up_to);
    }

    debug!(
        remaining = messages.len(),
        tokens = total,
        "hard-truncated context"
    );
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
        // Real BPE tokenisation — "hello" is a single token.
        let t = estimate_tokens("hello");
        assert!(t >= 1 && t <= 3, "expected 1–3 tokens for 'hello', got {t}");
        // Empty string → 0 tokens (no special tokens added by encode_with_special_tokens for "")
        let t0 = estimate_tokens("");
        assert!(t0 <= 1, "expected 0–1 tokens for empty string, got {t0}");
    }

    #[test]
    fn estimate_total_counts_overhead() {
        let msgs = vec![msg("user", "hi"), msg("assistant", "hello")];
        let total = estimate_total(&msgs);
        // Each message has: content tokens + role tokens + 4 overhead
        assert!(total > 0);
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

        // The old tool result should be pruned
        assert!(msgs[2].content.contains("[tool result pruned"));
        // Recent messages untouched
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

        // Small result should NOT be pruned (under 200 chars threshold)
        assert!(msgs[1].content.contains("ok"));
    }

    #[test]
    fn prune_function_calls() {
        let big_call = format!("FUNCTION_CALL: some_tool({})", "a".repeat(500));
        let mut msgs = vec![
            msg("assistant", &big_call),
            msg("user", "recent"),
        ];

        prune_tool_results(&mut msgs, 1);
        assert!(msgs[0].content.contains("[args pruned]"));
    }

    #[test]
    fn hard_truncate_preserves_system() {
        let mut msgs = vec![
            msg("system", "bootstrap"),
            msg("system", "tools"),
            msg("user", "old question"),
            msg("assistant", "old answer"),
            msg("user", "new question"),
        ];

        hard_truncate(&mut msgs, 1); // impossibly small budget

        // System messages must survive
        assert!(msgs[0].role == "system");
        assert!(msgs[1].role == "system");
        // Should have been truncated to system + 2
        assert!(msgs.len() <= 4);
    }

    #[test]
    fn default_budget_values() {
        let b = ContextBudget::default();
        assert!(b.prune_threshold < b.compact_threshold);
        assert!(b.compact_threshold < b.max_tokens);
    }
}
