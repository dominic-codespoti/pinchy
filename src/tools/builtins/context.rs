//! Conversation context tool — lets agents access scope metadata.
//!
//! This tool allows the Pinchy agent to access the conversation context
//! (agent scope or group scope) that was provided with the incoming message.

use serde_json::{json, Value};
use std::path::Path;

use crate::tools::{register_tool, ToolMeta};

/// `get_conversation_context` — returns the conversation scope context.
///
/// This tool provides access to the agent/group scope metadata that was
/// passed with the incoming message. It returns None if no context was set.
pub async fn get_conversation_context(_workspace: &Path, _args: Value) -> anyhow::Result<Value> {
    // The agent's conversation_context is stored in the AGENT_CONTEXT thread-local
    // by the turn execution before calling tools.
    let ctx = crate::tools::builtins::context::get_current_context();

    match ctx {
        Some(context) => Ok(json!({
            "scope_type": context.scope_type,
            "agent_id": context.agent_id,
            "group_id": context.group_id,
            "group_name": context.group_name,
            "group_agent_ids": context.group_agent_ids,
        })),
        None => Ok(json!({ "context": null })),
    }
}

/// Register the context tool.
pub fn register() {
    register_tool(ToolMeta {
        name: "get_conversation_context".into(),
        description: "Get the conversation scope context (agent or group) for this conversation. Returns scope_type, agent_id, group_id, group_name, and group_agent_ids if available.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {}
        }),
    });
}

// ---------------------------------------------------------------------------
// Thread-local storage for the current conversation context.
// This is set by the tool loop before executing tools and cleared after.
// ---------------------------------------------------------------------------

use std::cell::RefCell;
use std::sync::Arc;

thread_local! {
    static AGENT_CONTEXT: RefCell<Option<Arc<crate::comm::ConversationContext>>> = const { RefCell::new(None) };
}

/// Set the conversation context for the current tool execution.
pub fn set_current_context(ctx: Option<Arc<crate::comm::ConversationContext>>) {
    AGENT_CONTEXT.with(|c| {
        *c.borrow_mut() = ctx;
    });
}

/// Get the current conversation context (if any).
pub fn get_current_context() -> Option<Arc<crate::comm::ConversationContext>> {
    AGENT_CONTEXT.with(|c| c.borrow().clone())
}

/// Clear the conversation context after tool execution.
pub fn clear_current_context() {
    AGENT_CONTEXT.with(|c| {
        *c.borrow_mut() = None;
    });
}
