//! MCP server configuration.

use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// MCP server configuration from config.yaml.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
pub struct McpServerConfig {
    /// Human-readable name (used in logs).
    #[serde(default)]
    pub name: Option<String>,

    /// Transport type: "stdio" or "http".
    #[serde(default)]
    pub transport: Option<McpTransport>,

    /// For stdio transport: the command to run.
    #[serde(default)]
    pub command: Option<String>,

    /// For stdio transport: command arguments.
    #[serde(default)]
    pub args: Option<Vec<String>>,

    /// For stdio transport: environment variables to pass.
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,

    /// For HTTP transport: the server URL.
    #[serde(default)]
    pub url: Option<String>,

    /// For HTTP transport: authentication config.
    #[serde(default)]
    pub auth: Option<McpAuthConfig>,

    /// Connection timeout in seconds.
    #[serde(default = "default_timeout")]
    pub timeout: u64,

    /// Maximum concurrent requests.
    #[serde(default = "default_max_concurrent")]
    pub max_concurrent: Option<usize>,
}

fn default_timeout() -> u64 {
    30
}

fn default_max_concurrent() -> Option<usize> {
    Some(5)
}

impl McpServerConfig {
    /// Returns true if this is a stdio-based server.
    pub fn is_stdio(&self) -> bool {
        self.transport
            .as_ref()
            .map(|t| t.is_stdio())
            .unwrap_or(true)
    }

    /// Returns true if this is an HTTP-based server.
    pub fn is_http(&self) -> bool {
        self.transport
            .as_ref()
            .map(|t| t.is_http())
            .unwrap_or(false)
    }

    /// Get the effective command for stdio servers.
    pub fn command(&self) -> Option<&str> {
        self.command.as_deref()
    }

    /// Get the effective args for stdio servers.
    pub fn args(&self) -> Vec<String> {
        self.args.clone().unwrap_or_default()
    }

    /// Get the URL for HTTP servers.
    pub fn url(&self) -> Option<&str> {
        self.url.as_deref()
    }
}

/// MCP transport type.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, JsonSchema)]
#[serde(rename_all = "lowercase")]
pub enum McpTransport {
    #[default]
    Stdio,
    #[serde(rename = "streamablehttp")]
    StreamableHttp,
    Sse,
}

impl McpTransport {
    pub fn is_stdio(&self) -> bool {
        matches!(self, McpTransport::Stdio)
    }

    pub fn is_http(&self) -> bool {
        matches!(self, McpTransport::StreamableHttp | McpTransport::Sse)
    }
}

/// MCP authentication configuration.
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum McpAuthConfig {
    /// No authentication.
    None,

    /// Bearer token authentication.
    Bearer { token: String },

    /// OAuth 2.1 PKCE authentication.
    OAuth {
        client_id: String,
        auth_url: String,
        token_url: String,
        scopes: Option<String>,
    },
}

impl Default for McpServerConfig {
    fn default() -> Self {
        Self {
            name: None,
            transport: Some(McpTransport::Stdio),
            command: None,
            args: None,
            env: None,
            url: None,
            auth: None,
            timeout: default_timeout(),
            max_concurrent: default_max_concurrent(),
        }
    }
}
