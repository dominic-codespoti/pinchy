//! MCP (Model Context Protocol) tool implementations.
//!
//! Provides native tools for interacting with MCP servers configured
//! in Pinchy's config.yaml under the `mcp_servers` key.
//!
//! ## Configuration
//!
//! Add MCP servers to your config.yaml:
//!
//! ```yaml
//! mcp_servers:
//!   filesystem:
//!     transport: stdio
//!     command: "npx"
//!     args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
//!   github:
//!     transport: http
//!     url: "https://api.github.com/mcp"
//!     auth:
//!       type: "bearer"
//!       token: "${GITHUB_TOKEN}"
//! ```

use crate::mcp;
use crate::tools::{register_tool_deferred, ToolMeta};
use serde_json::Value;
use tracing::{debug, error};

/// Register MCP tool metadata in the global registry.
pub fn register() {
    register_tool_deferred(ToolMeta {
        name: "mcp_list_servers".into(),
        description: "List all configured MCP servers and their status.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {},
            "additionalProperties": false
        }),
    });

    register_tool_deferred(ToolMeta {
        name: "mcp_list_tools".into(),
        description: "List tools available on an MCP server.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "server": {
                    "type": "string",
                    "description": "The name of the MCP server (as configured in config.yaml)."
                }
            },
            "required": ["server"],
            "additionalProperties": false
        }),
    });

    register_tool_deferred(ToolMeta {
        name: "mcp_call_tool".into(),
        description: "Call a tool on an MCP server.".into(),
        args_schema: serde_json::json!({
            "type": "object",
            "properties": {
                "server": {
                    "type": "string",
                    "description": "The name of the MCP server (as configured in config.yaml)."
                },
                "tool": {
                    "type": "string",
                    "description": "The name of the tool to call."
                },
                "arguments": {
                    "type": "object",
                    "description": "The tool arguments as a JSON object."
                }
            },
            "required": ["server", "tool"],
            "additionalProperties": false
        }),
    });
}

/// List all configured MCP servers.
pub async fn mcp_list_servers(args: Value) -> anyhow::Result<Value> {
    debug!("mcp_list_servers called");
    let _ = args;
    let servers = mcp::list_servers().await;
    Ok(serde_json::json!({
        "servers": servers,
        "count": servers.len()
    }))
}

/// List tools available on an MCP server.
pub async fn mcp_list_tools(args: Value) -> anyhow::Result<Value> {
    let server = args
        .get("server")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing required argument: server"))?;

    debug!(server = %server, "mcp_list_tools called");

    match mcp::list_tools(server).await {
        Ok(tools) => {
            let tool_summaries: Vec<Value> = tools
                .into_iter()
                .map(|t| {
                    serde_json::json!({
                        "name": t.name,
                        "description": t.description,
                        "input_schema": t.input_schema
                    })
                })
                .collect();

            Ok(serde_json::json!({
                "server": server,
                "tools": tool_summaries,
                "count": tool_summaries.len()
            }))
        }
        Err(e) => {
            error!(server = %server, error = %e, "mcp_list_tools failed");
            Err(anyhow::anyhow!("failed to list MCP tools: {}", e))
        }
    }
}

/// Call a tool on an MCP server.
pub async fn mcp_call_tool(args: Value) -> anyhow::Result<Value> {
    let server = args
        .get("server")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing required argument: server"))?;
    let tool = args
        .get("tool")
        .and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing required argument: tool"))?;
    let arguments = args
        .get("arguments")
        .cloned()
        .unwrap_or(serde_json::json!({}));

    debug!(server = %server, tool = %tool, "mcp_call_tool called");

    match mcp::call_tool(server, tool, arguments).await {
        Ok(result) => Ok(serde_json::json!({
            "server": server,
            "tool": tool,
            "result": result
        })),
        Err(e) => {
            error!(server = %server, tool = %tool, error = %e, "mcp_call_tool failed");
            Err(anyhow::anyhow!("MCP tool call failed: {}", e))
        }
    }
}
