//! MCP client implementation using rust-mcp-sdk.

use crate::mcp::config::McpServerConfig;
use crate::mcp::sampling::SamplingHandler;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Tool information from an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolInfo {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Value,
}

/// Call tool result from an MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallToolResult {
    pub content: Vec<ToolContent>,
    pub is_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum ToolContent {
    Text {
        text: String,
    },
    Image {
        data: String,
        mime_type: Option<String>,
    },
    Resource {
        uri: String,
        mime_type: Option<String>,
        text: Option<String>,
    },
}

/// MCP client for communicating with an MCP server.
pub struct McpClient {
    name: String,
    config: McpServerConfig,
    session: Arc<RwLock<Option<ClientSession>>>,
}

struct ClientSession {
    #[allow(dead_code)]
    handler: SamplingHandler,
}

impl McpClient {
    /// Create a new MCP client and connect to the server.
    pub async fn new(name: String, config: McpServerConfig) -> anyhow::Result<Self> {
        info!(server = %name, transport = ?config.transport, "connecting to MCP server");

        let client = Self {
            name,
            config,
            session: Arc::new(RwLock::new(None)),
        };

        client.connect().await?;
        Ok(client)
    }

    /// Connect to the MCP server.
    async fn connect(&self) -> anyhow::Result<()> {
        if self.config.is_stdio() {
            self.connect_stdio().await
        } else {
            self.connect_http().await
        }
    }

    /// Connect via stdio (subprocess).
    async fn connect_stdio(&self) -> anyhow::Result<()> {
        let command = self
            .config
            .command()
            .ok_or_else(|| anyhow::anyhow!("stdio transport requires 'command' to be specified"))?;

        let args = self.config.args();
        let _env = self.config.env.clone().unwrap_or_default();

        info!(
            server = %self.name,
            command = %command,
            args = ?args,
            "connecting via stdio"
        );

        // For now, we'll use the mcptools CLI approach as a fallback
        // since rust-mcp-sdk stdio integration requires more setup.
        // TODO: Implement native stdio client using rust-mcp-sdk
        warn!(
            server = %self.name,
            "native stdio transport not yet implemented, using mcptools fallback"
        );

        let session = ClientSession {
            handler: SamplingHandler::new(vec![], 4096),
        };

        let mut guard = self.session.write().await;
        *guard = Some(session);

        Ok(())
    }

    /// Connect via HTTP/StreamableHTTP.
    async fn connect_http(&self) -> anyhow::Result<()> {
        let url = self
            .config
            .url()
            .ok_or_else(|| anyhow::anyhow!("HTTP transport requires 'url' to be specified"))?;

        info!(server = %self.name, url = %url, "connecting via HTTP");

        // TODO: Implement native HTTP client using rust-mcp-sdk
        warn!(
            server = %self.name,
            "native HTTP transport not yet implemented, using mcptools fallback"
        );

        let session = ClientSession {
            handler: SamplingHandler::new(vec![], 4096),
        };

        let mut guard = self.session.write().await;
        *guard = Some(session);

        Ok(())
    }

    /// Call a tool on the MCP server.
    pub async fn call_tool(&self, tool: &str, arguments: Value) -> anyhow::Result<Value> {
        debug!(server = %self.name, tool = %tool, ?arguments, "calling MCP tool");

        // Use mcptools CLI as the actual implementation for now
        let server_name = &self.name;
        let result = tokio::process::Command::new("mcp")
            .args([
                "call",
                tool,
                "--params",
                &arguments.to_string(),
                "--format",
                "json",
                "stdio",
                "--",
            ])
            .arg(format!("{}:{}", server_name, tool))
            .output()
            .await?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            error!(server = %self.name, tool = %tool, error = %stderr, "MCP tool call failed");
            return Err(anyhow::anyhow!("MCP tool call failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&result.stdout);
        let parsed: Value = serde_json::from_str(&stdout)
            .map_err(|e| anyhow::anyhow!("failed to parse MCP response: {}", e))?;

        Ok(parsed)
    }

    /// List tools available on the MCP server.
    pub async fn list_tools(&self) -> anyhow::Result<Vec<ToolInfo>> {
        debug!(server = %self.name, "listing MCP tools");

        // Use mcptools CLI as the actual implementation
        let result = tokio::process::Command::new("mcp")
            .args(["tools", "--format", "json", "stdio", "--", &self.name])
            .output()
            .await?;

        if !result.status.success() {
            let stderr = String::from_utf8_lossy(&result.stderr);
            error!(server = %self.name, error = %stderr, "MCP list tools failed");
            return Err(anyhow::anyhow!("MCP list tools failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&result.stdout);
        let parsed: Vec<ToolInfo> = serde_json::from_str(&stdout)
            .map_err(|e| anyhow::anyhow!("failed to parse MCP tools response: {}", e))?;

        Ok(parsed)
    }

    /// Shutdown the MCP connection.
    pub async fn shutdown(&self) {
        info!(server = %self.name, "shutting down MCP client");
        let mut guard = self.session.write().await;
        *guard = None;
    }
}

impl Drop for McpClient {
    fn drop(&mut self) {
        // Note: actual shutdown is handled by the async shutdown() method
        debug!(server = %self.name, "MCP client dropped");
    }
}
