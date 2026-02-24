//! Built-in `mcp` tool — Model Context Protocol client.
//!
//! Uses the official `rmcp` SDK (Streamable HTTP transport) to connect
//! to MCP servers.  Supports:
//! - `list_servers`  — enumerate configured MCP servers
//! - `list_tools`    — list tools offered by a specific server
//! - `call_tool`     — invoke a tool on a server
//! - `add_server`    — add or update an MCP server in the config
//! - `remove_server` — remove an MCP server from the config
//!
//! Server configurations are read from `config/mcp.json` (or
//! `config/mcporter.json`, `.mcp.json`) in the agent workspace.

use http::{HeaderName, HeaderValue};
use rmcp::{
    model::CallToolRequestParams,
    service::RunningService,
    transport::{
        streamable_http_client::StreamableHttpClientTransportConfig, StreamableHttpClientTransport,
    },
    RoleClient, ServiceExt,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::Path;

use crate::tools::{register_tool, ToolMeta};

// ── Config types ─────────────────────────────────────────────

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct McpConfig {
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    servers: HashMap<String, McpServerConfig>,
    #[serde(default, rename = "mcpServers")]
    mcp_servers: HashMap<String, McpServerConfig>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct McpServerConfig {
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    transport: Option<String>,
    #[serde(default)]
    #[allow(dead_code)] // reserved for future stdio transport
    command: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    args: Option<Vec<String>>,
    #[serde(default)]
    headers: Option<HashMap<String, String>>,
    #[serde(default)]
    #[allow(dead_code)]
    env: Option<HashMap<String, String>>,
}

impl McpServerConfig {
    fn effective_url(&self) -> Option<&str> {
        self.url.as_deref()
    }
}

// ── Config loading ──────────────────────────────────────────

/// Default config path — always `config/mcp.json` for writes.
fn default_config_path(workspace: &Path) -> std::path::PathBuf {
    workspace.join("config/mcp.json")
}

fn find_config(workspace: &Path) -> Option<std::path::PathBuf> {
    let candidates = [
        workspace.join("config/mcporter.json"),
        workspace.join("config/mcp.json"),
        workspace.join("mcporter.json"),
        workspace.join("mcp.json"),
        workspace.join(".mcp.json"),
    ];
    candidates.into_iter().find(|p| p.is_file())
}

fn load_servers(workspace: &Path) -> anyhow::Result<HashMap<String, McpServerConfig>> {
    let config_path = find_config(workspace)
        .ok_or_else(|| anyhow::anyhow!(
            "No MCP server config found. Create config/mcp.json in your workspace with server definitions. \
             Example:\n{{\n  \"mcpServers\": {{\n    \"my-server\": {{\n      \"url\": \"https://example.com/mcp\",\n      \"headers\": {{ \"Authorization\": \"Bearer xxx\" }}\n    }}\n  }}\n}}"
        ))?;

    let raw = std::fs::read_to_string(&config_path)
        .map_err(|e| anyhow::anyhow!("Failed to read {}: {e}", config_path.display()))?;

    let config: McpConfig = serde_json::from_str(&raw)
        .map_err(|e| anyhow::anyhow!("Failed to parse {}: {e}", config_path.display()))?;

    let mut servers = config.servers;
    for (k, v) in config.mcp_servers {
        servers.entry(k).or_insert(v);
    }

    if servers.is_empty() {
        anyhow::bail!(
            "MCP config at {} contains no server definitions",
            config_path.display()
        );
    }

    Ok(servers)
}

/// Load the raw config (preserving structure) or return an empty one.
fn load_config_or_default(workspace: &Path) -> (std::path::PathBuf, McpConfig) {
    if let Some(path) = find_config(workspace) {
        if let Ok(raw) = std::fs::read_to_string(&path) {
            if let Ok(cfg) = serde_json::from_str::<McpConfig>(&raw) {
                return (path, cfg);
            }
        }
    }
    (
        default_config_path(workspace),
        McpConfig {
            servers: HashMap::new(),
            mcp_servers: HashMap::new(),
        },
    )
}

/// Write the config back to disk, creating parent directories if needed.
fn save_config(path: &Path, config: &McpConfig) -> anyhow::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(config)?;
    std::fs::write(path, json)?;
    Ok(())
}

// ── rmcp SDK client helpers ─────────────────────────────────

async fn connect_mcp(cfg: &McpServerConfig) -> anyhow::Result<RunningService<RoleClient, ()>> {
    let url = cfg
        .effective_url()
        .ok_or_else(|| anyhow::anyhow!("MCP server has no URL configured"))?;

    let raw_headers = cfg.headers.clone().unwrap_or_default();

    let transport = if raw_headers.is_empty() {
        StreamableHttpClientTransport::from_uri(url.to_string())
    } else {
        let mut custom = HashMap::new();
        for (k, v) in &raw_headers {
            let name = HeaderName::try_from(k.as_str())
                .map_err(|e| anyhow::anyhow!("Invalid header name '{k}': {e}"))?;
            let value = HeaderValue::try_from(v.as_str())
                .map_err(|e| anyhow::anyhow!("Invalid header value for '{k}': {e}"))?;
            custom.insert(name, value);
        }
        let config =
            StreamableHttpClientTransportConfig::with_uri(url.to_string()).custom_headers(custom);
        StreamableHttpClientTransport::from_config(config)
    };

    let client: RunningService<RoleClient, ()> = ().serve(transport).await?;
    Ok(client)
}

// ── Tool actions ────────────────────────────────────────────

async fn action_list_servers(workspace: &Path) -> anyhow::Result<Value> {
    let servers = load_servers(workspace)?;
    let mut entries = Vec::new();
    for (name, cfg) in &servers {
        entries.push(json!({
            "name": name,
            "url": cfg.effective_url(),
            "transport": cfg.transport.as_deref().unwrap_or("http"),
            "has_headers": cfg.headers.as_ref().map(|h| !h.is_empty()).unwrap_or(false),
        }));
    }
    Ok(json!({ "servers": entries }))
}

async fn action_list_tools(workspace: &Path, server_name: &str) -> anyhow::Result<Value> {
    let servers = load_servers(workspace)?;
    let cfg = servers.get(server_name).ok_or_else(|| {
        let available: Vec<&str> = servers.keys().map(|s| s.as_str()).collect();
        anyhow::anyhow!(
            "MCP server '{}' not found. Available servers: [{}]",
            server_name,
            available.join(", ")
        )
    })?;

    let client = connect_mcp(cfg)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to connect to MCP server '{}': {e}", server_name))?;

    let tools_resp = client
        .list_all_tools()
        .await
        .map_err(|e| anyhow::anyhow!("Failed to list tools from '{}': {e}", server_name))?;

    let _ = client.cancel().await;

    let tools: Vec<Value> = tools_resp
        .iter()
        .map(|t| {
            json!({
                "name": t.name,
                "description": t.description,
                "inputSchema": t.input_schema,
            })
        })
        .collect();

    Ok(json!({
        "server": server_name,
        "tools": tools,
    }))
}

async fn action_call_tool(
    workspace: &Path,
    server_name: &str,
    tool_name: &str,
    arguments: Value,
) -> anyhow::Result<Value> {
    let servers = load_servers(workspace)?;
    let cfg = servers.get(server_name).ok_or_else(|| {
        let available: Vec<&str> = servers.keys().map(|s| s.as_str()).collect();
        anyhow::anyhow!(
            "MCP server '{}' not found. Available servers: [{}]",
            server_name,
            available.join(", ")
        )
    })?;

    let client = connect_mcp(cfg)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to connect to MCP server '{}': {e}", server_name))?;

    let args_map = match arguments {
        Value::Object(map) => Some(map),
        _ => None,
    };

    let result = client
        .call_tool(CallToolRequestParams {
            name: tool_name.to_string().into(),
            arguments: args_map,
            meta: None,
            task: None,
        })
        .await
        .map_err(|e| {
            anyhow::anyhow!(
                "Failed to call tool '{}' on '{}': {e}",
                tool_name,
                server_name
            )
        })?;

    let _ = client.cancel().await;

    let content: Vec<Value> = result
        .content
        .iter()
        .map(|c| {
            if let Some(text) = c.as_text() {
                json!({ "type": "text", "text": text.text })
            } else {
                serde_json::to_value(c).unwrap_or(Value::Null)
            }
        })
        .collect();

    Ok(json!({
        "server": server_name,
        "tool": tool_name,
        "isError": result.is_error.unwrap_or(false),
        "content": content,
    }))
}

async fn action_add_server(workspace: &Path, args: &Value) -> anyhow::Result<Value> {
    let name = args["server"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("add_server requires a 'server' name"))?;
    let url = args["url"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("add_server requires a 'url'"))?;

    // Validate URL looks reasonable
    if !url.starts_with("http://") && !url.starts_with("https://") {
        anyhow::bail!("URL must start with http:// or https://");
    }

    // Validate name: alphanumeric, hyphens, underscores
    if name.is_empty()
        || name.len() > 64
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        anyhow::bail!("Server name must be 1-64 chars, alphanumeric/hyphens/underscores only");
    }

    let headers: HashMap<String, String> = args
        .get("headers")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let (config_path, mut config) = load_config_or_default(workspace);

    let is_update = config.mcp_servers.contains_key(name);

    config.mcp_servers.insert(
        name.to_string(),
        McpServerConfig {
            url: Some(url.to_string()),
            transport: Some("http".to_string()),
            command: None,
            args: None,
            headers: if headers.is_empty() {
                None
            } else {
                Some(headers)
            },
            env: None,
        },
    );

    save_config(&config_path, &config)?;

    Ok(json!({
        "status": if is_update { "updated" } else { "added" },
        "server": name,
        "config_path": config_path.display().to_string(),
    }))
}

async fn action_remove_server(workspace: &Path, args: &Value) -> anyhow::Result<Value> {
    let name = args["server"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("remove_server requires a 'server' name"))?;

    let (config_path, mut config) = load_config_or_default(workspace);

    let removed =
        config.mcp_servers.remove(name).is_some() || config.servers.remove(name).is_some();

    if !removed {
        let available: Vec<&str> = config
            .mcp_servers
            .keys()
            .chain(config.servers.keys())
            .map(|s| s.as_str())
            .collect();
        anyhow::bail!(
            "MCP server '{}' not found. Available: [{}]",
            name,
            available.join(", ")
        );
    }

    save_config(&config_path, &config)?;

    Ok(json!({
        "status": "removed",
        "server": name,
    }))
}

// ── Main dispatcher ─────────────────────────────────────────

pub async fn mcp_tool(workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let action = args["action"].as_str().unwrap_or("list_servers");

    match action {
        "list_servers" => action_list_servers(workspace).await,

        "list_tools" => {
            let server = args["server"].as_str()
                .ok_or_else(|| anyhow::anyhow!(
                    "mcp list_tools requires a 'server' name. Use action: 'list_servers' first to see available servers."
                ))?;
            action_list_tools(workspace, server).await
        }

        "call_tool" => {
            let server = args["server"].as_str()
                .ok_or_else(|| anyhow::anyhow!("mcp call_tool requires a 'server' name"))?;
            let tool = args["tool"].as_str()
                .ok_or_else(|| anyhow::anyhow!(
                    "mcp call_tool requires a 'tool' name. Use action: 'list_tools' first to see available tools."
                ))?;
            let arguments = args.get("arguments").cloned().unwrap_or(json!({}));
            action_call_tool(workspace, server, tool, arguments).await
        }

        "add_server" => action_add_server(workspace, &args).await,

        "remove_server" => action_remove_server(workspace, &args).await,

        other => anyhow::bail!(
            "Unknown mcp action '{}'. Available: list_servers, list_tools, call_tool, add_server, remove_server",
            other
        ),
    }
}

//── Registration ────────────────────────────────────────────

pub fn register() {
    register_tool(ToolMeta {
        name: "mcp".into(),
        description: "Connect to MCP (Model Context Protocol) servers to list and call their tools. \
                      Actions: 'list_servers' to see configured servers, 'list_tools' to enumerate \
                      a server's tools, 'call_tool' to invoke them, 'add_server' to configure a new \
                      server, 'remove_server' to remove one.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["list_servers", "list_tools", "call_tool", "add_server", "remove_server"],
                    "description": "The MCP action to perform"
                },
                "server": {
                    "type": "string",
                    "description": "Name of the MCP server (from config, or name to assign for add_server)"
                },
                "url": {
                    "type": "string",
                    "description": "URL of the MCP server (for add_server)"
                },
                "headers": {
                    "type": "object",
                    "description": "HTTP headers to send with requests, e.g. {\"Authorization\": \"Bearer xxx\"} (for add_server)"
                },
                "tool": {
                    "type": "string",
                    "description": "Name of the tool to call (for call_tool)"
                },
                "arguments": {
                    "type": "object",
                    "description": "Arguments to pass to the tool (for call_tool)"
                }
            },
            "required": ["action"]
        }),
    });
}
