//! MCP (Model Context Protocol) client module.
//!
//! Provides native Rust MCP client functionality with support for:
//! - stdio transport (subprocess-based servers)
//! - Streamable HTTP transport
//! - OAuth 2.1 PKCE authentication
//! - Server-initiated sampling callbacks
//!
//! Configuration is read from `config.yaml` under the `mcp_servers` key.
//!
//! ## Example config.yaml
//!
//! ```yaml
//! mcp_servers:
//!   filesystem:
//!     command: "npx"
//!     args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
//!   github:
//!     url: "https://api.github.com/mcp"
//!     auth:
//!       type: "bearer"
//!       token: "${GITHUB_TOKEN}"
//! ```

pub mod client;
pub mod config;
pub mod sampling;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info};

pub use client::McpClient;
pub use config::{McpServerConfig, McpTransport};
pub use sampling::SamplingHandler;

type ClientMap = HashMap<String, Arc<RwLock<Option<McpClient>>>>;

/// Global MCP client registry.
/// Each server has an optional client that is initialized on first use.
static MCP_CLIENTS: std::sync::LazyLock<RwLock<ClientMap>> =
    std::sync::LazyLock::new(|| RwLock::new(HashMap::new()));

/// Initialize MCP clients from configuration.
/// Call this at startup to pre-connect to configured servers.
pub async fn init_clients(configs: HashMap<String, McpServerConfig>) {
    for (name, config) in configs {
        info!(server = %name, "initializing MCP server");
        match McpClient::new(name.clone(), config).await {
            Ok(client) => {
                let mut clients = MCP_CLIENTS.write().await;
                clients.insert(name, Arc::new(RwLock::new(Some(client))));
            }
            Err(e) => {
                error!(server = %name, error = %e, "failed to initialize MCP server");
                let mut clients = MCP_CLIENTS.write().await;
                clients.insert(name, Arc::new(RwLock::new(None)));
            }
        }
    }
}

/// Get an MCP client by name.
/// Returns None if the server is not configured or failed to connect.
pub async fn get_client(name: &str) -> Option<Arc<RwLock<Option<McpClient>>>> {
    let clients = MCP_CLIENTS.read().await;
    clients.get(name).cloned()
}

/// List all configured MCP server names.
pub async fn list_servers() -> Vec<String> {
    let clients = MCP_CLIENTS.read().await;
    clients.keys().cloned().collect()
}

/// Call an MCP tool on a specific server.
pub async fn call_tool(
    server: &str,
    tool: &str,
    arguments: serde_json::Value,
) -> anyhow::Result<serde_json::Value> {
    let client_guard = get_client(server).await;
    let client_guard = client_guard
        .ok_or_else(|| anyhow::anyhow!("MCP server '{}' not found in configuration", server))?;

    let client_guard = client_guard.read().await;
    let client = client_guard
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("MCP server '{}' failed to initialize", server))?;

    client.call_tool(tool, arguments).await
}

/// List tools available on an MCP server.
pub async fn list_tools(server: &str) -> anyhow::Result<Vec<client::ToolInfo>> {
    let client_guard = get_client(server).await;
    let client_guard = client_guard
        .ok_or_else(|| anyhow::anyhow!("MCP server '{}' not found in configuration", server))?;

    let client_guard = client_guard.read().await;
    let client = client_guard
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("MCP server '{}' failed to initialize", server))?;

    client.list_tools().await
}

/// Shutdown all MCP connections.
pub async fn shutdown() {
    let mut clients = MCP_CLIENTS.write().await;
    for (name, client_guard) in clients.iter_mut() {
        let mut guard = client_guard.write().await;
        if let Some(client) = guard.take() {
            debug!(server = %name, "shutting down MCP server");
            client.shutdown().await;
        }
    }
    clients.clear();
}
