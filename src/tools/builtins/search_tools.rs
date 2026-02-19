//! search_tools — On-demand tool discovery.
//!
//! Instead of injecting all 25+ tool schemas into the prompt (burning tokens),
//! the agent gets a small set of core tools plus this `search_tools` tool.
//! When the agent needs a capability it doesn't see in its core set, it calls
//! `search_tools` with a query and gets back matching tool definitions it can
//! then invoke.
//!
//! Inspired by https://www.anthropic.com/engineering/advanced-tool-use

use serde_json::{json, Value};
use std::path::Path;

use crate::tools::{register_tool, search_tools_registry, ToolMeta};

/// Execute a search_tools invocation.
///
/// Args:
///   - query (string, required): keyword/phrase describing the capability needed
///   - limit (integer, optional): max results to return (default 5, max 20)
pub async fn search_tools(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let query = args
        .get("query")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim();

    if query.is_empty() {
        return Ok(json!({
            "error": "query is required",
            "hint": "Describe the capability you need, e.g. 'schedule a job' or 'manage agents'"
        }));
    }

    let limit = args
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(5)
        .min(20) as usize;

    let results = search_tools_registry(query, limit);

    if results.is_empty() {
        return Ok(json!({
            "matches": [],
            "hint": "No tools matched your query. Try broader keywords."
        }));
    }

    let matches: Vec<Value> = results
        .into_iter()
        .map(|meta| {
            json!({
                "name": meta.name,
                "description": meta.description,
                "args_schema": meta.args_schema,
            })
        })
        .collect();

    Ok(json!({
        "matches": matches,
        "hint": "You can now call any of these tools by name."
    }))
}

/// Register the search_tools metadata. This tool is always core (never deferred).
pub fn register() {
    register_tool(ToolMeta {
        name: "search_tools".into(),
        description: "Search for additional tools by keyword. CALL THIS FIRST when you need capabilities not in your core tool set. Discoverable tools include: cron/scheduling (create, list, run, delete cron jobs), agent management (create, list agents), session control (list, spawn, send to sessions), skill authoring (create, edit, delete skills), and more. Example queries: 'cron', 'schedule', 'agent', 'session', 'skill'.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Keyword or phrase describing the capability you need (e.g. 'cron', 'run cron job', 'create agent', 'sessions', 'schedule')"
                },
                "limit": {
                    "type": "integer",
                    "description": "Max number of results (default: 5, max: 20)"
                }
            },
            "required": ["query"]
        }),
    });
}
