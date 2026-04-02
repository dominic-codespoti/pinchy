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
#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, JsonSchema, PartialEq)]
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_mcp_server_config_default() {
        let config = McpServerConfig::default();
        assert_eq!(config.timeout, 30);
        assert_eq!(config.max_concurrent, Some(5));
        assert!(config.is_stdio());
        assert!(!config.is_http());
    }

    #[test]
    fn test_mcp_server_config_parse_valid_yaml_stdio() {
        let yaml = r#"
name: "Filesystem Server"
transport: stdio
command: npx
args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
timeout: 60
max_concurrent: 10
"#;
        let config: McpServerConfig =
            serde_yaml_ng::from_str(yaml).expect("should parse valid yaml");
        assert_eq!(config.name, Some("Filesystem Server".to_string()));
        assert_eq!(config.transport, Some(McpTransport::Stdio));
        assert_eq!(config.command, Some("npx".to_string()));
        assert_eq!(
            config.args,
            Some(vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                "/tmp".to_string()
            ])
        );
        assert_eq!(config.timeout, 60);
        assert_eq!(config.max_concurrent, Some(10));
        assert!(config.is_stdio());
        assert!(!config.is_http());
    }

    #[test]
    fn test_mcp_server_config_parse_valid_yaml_http() {
        let yaml = r#"
name: "GitHub Server"
transport: streamablehttp
url: "https://api.github.com/mcp"
timeout: 45
"#;
        let config: McpServerConfig =
            serde_yaml_ng::from_str(yaml).expect("should parse valid yaml");
        assert_eq!(config.name, Some("GitHub Server".to_string()));
        assert_eq!(config.transport, Some(McpTransport::StreamableHttp));
        assert_eq!(config.url, Some("https://api.github.com/mcp".to_string()));
        assert_eq!(config.timeout, 45);
        assert!(!config.is_stdio());
        assert!(config.is_http());
    }

    #[test]
    fn test_mcp_server_config_parse_valid_json() {
        let json = r#"{"name":"Test Server","transport":"stdio","command":"echo","timeout":15}"#;
        let config: McpServerConfig = serde_json::from_str(json).expect("should parse valid json");
        assert_eq!(config.name, Some("Test Server".to_string()));
        assert_eq!(config.command, Some("echo".to_string()));
        assert_eq!(config.timeout, 15);
    }

    #[test]
    fn test_mcp_server_config_parse_sse_transport() {
        let yaml = "transport: sse\nurl: \"http://localhost:3000\"";
        let config: McpServerConfig =
            serde_yaml_ng::from_str(yaml).expect("should parse sse transport");
        assert_eq!(config.transport, Some(McpTransport::Sse));
        assert!(config.is_http());
    }

    #[test]
    fn test_mcp_server_config_with_env() {
        let yaml = r#"
command: node
env:
  NODE_ENV: production
  API_KEY: secret123
"#;
        let config: McpServerConfig = serde_yaml_ng::from_str(yaml).expect("should parse env vars");
        let env = config.env.expect("env should be present");
        assert_eq!(env.get("NODE_ENV"), Some(&"production".to_string()));
        assert_eq!(env.get("API_KEY"), Some(&"secret123".to_string()));
    }

    #[test]
    fn test_mcp_auth_config_bearer() {
        let json = r#"{"type":"bearer","token":"my-secret-token"}"#;
        let auth: McpAuthConfig = serde_json::from_str(json).expect("should parse bearer auth");
        match auth {
            McpAuthConfig::Bearer { token } => assert_eq!(token, "my-secret-token"),
            _ => panic!("expected Bearer auth"),
        }
    }

    #[test]
    fn test_mcp_auth_config_oauth() {
        let json = r#"{"type":"oauth","client_id":"client123","auth_url":"https://example.com/auth","token_url":"https://example.com/token","scopes":"read write"}"#;
        let auth: McpAuthConfig = serde_json::from_str(json).expect("should parse oauth auth");
        match auth {
            McpAuthConfig::OAuth {
                client_id,
                auth_url,
                token_url,
                scopes,
            } => {
                assert_eq!(client_id, "client123");
                assert_eq!(auth_url, "https://example.com/auth");
                assert_eq!(token_url, "https://example.com/token");
                assert_eq!(scopes, Some("read write".to_string()));
            }
            _ => panic!("expected OAuth auth"),
        }
    }

    #[test]
    fn test_mcp_auth_config_none() {
        let json = r#"{"type":"none"}"#;
        let auth: McpAuthConfig = serde_json::from_str(json).expect("should parse none auth");
        match auth {
            McpAuthConfig::None => (),
            _ => panic!("expected None auth"),
        }
    }

    #[test]
    fn test_mcp_transport_is_stdio() {
        assert!(McpTransport::Stdio.is_stdio());
        assert!(!McpTransport::StreamableHttp.is_stdio());
        assert!(!McpTransport::Sse.is_stdio());
    }

    #[test]
    fn test_mcp_transport_is_http() {
        assert!(!McpTransport::Stdio.is_http());
        assert!(McpTransport::StreamableHttp.is_http());
        assert!(McpTransport::Sse.is_http());
    }

    #[test]
    fn test_mcp_server_config_helpers() {
        let yaml_stdio = "command: echo\nargs: [\"hello\"]";
        let config_stdio: McpServerConfig = serde_yaml_ng::from_str(yaml_stdio).unwrap();
        assert_eq!(config_stdio.command(), Some("echo"));
        assert_eq!(config_stdio.args(), vec!["hello"]);

        let yaml_http = "transport: streamablehttp\nurl: \"https://example.com\"";
        let config_http: McpServerConfig = serde_yaml_ng::from_str(yaml_http).unwrap();
        assert_eq!(config_http.url(), Some("https://example.com"));
        assert_eq!(config_http.args(), Vec::<String>::new());
    }

    #[test]
    fn test_mcp_server_config_invalid_transport() {
        let yaml = "transport: invalid_transport";
        let result: Result<McpServerConfig, _> = serde_yaml_ng::from_str(yaml);
        assert!(result.is_err());
    }
}
