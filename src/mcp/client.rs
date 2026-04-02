//! MCP client implementation using rust-mcp-sdk.

use crate::mcp::config::McpServerConfig;
use crate::mcp::sampling::SamplingHandler;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::{debug, error, info, warn};

/// Maximum size for JSON arguments (1MB).
const MAX_JSON_SIZE_BYTES: usize = 1_048_576;

/// Maximum length for MCP identifiers (tool names, server names).
const MAX_IDENTIFIER_LENGTH: usize = 100;

/// Validates an MCP identifier (tool name or server name).
/// Must be alphanumeric with underscores and dashes only.
/// No path separators, shell metacharacters, or other special characters.
fn validate_mcp_identifier(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("identifier cannot be empty".to_string());
    }

    if name.len() > MAX_IDENTIFIER_LENGTH {
        return Err(format!(
            "identifier exceeds maximum length of {} characters",
            MAX_IDENTIFIER_LENGTH
        ));
    }

    // Check for shell metacharacters and path separators
    let forbidden_chars = [
        '/', '\\', '$', ';', '|', '&', '`', '(', ')', '<', '>', '*', '?', '[', ']', '{', '}', '!',
        '#', '%', '@', '^', '~', '\'', '"', ' ', '\t', '\n', '\r',
    ];

    for ch in name.chars() {
        if forbidden_chars.contains(&ch) {
            return Err(format!("identifier contains forbidden character: '{}'", ch));
        }
    }

    // Ensure only alphanumeric, underscores, and dashes
    if !name
        .chars()
        .all(|ch| ch.is_alphanumeric() || ch == '_' || ch == '-')
    {
        return Err(
            "identifier must contain only alphanumeric characters, underscores, and dashes"
                .to_string(),
        );
    }

    Ok(())
}

/// Validates that the JSON value size does not exceed the maximum allowed size.
fn validate_json_size(json: &Value) -> Result<(), String> {
    let json_string = json.to_string();
    let size = json_string.len();

    if size > MAX_JSON_SIZE_BYTES {
        return Err(format!(
            "JSON arguments exceed maximum size of {} bytes (got {} bytes)",
            MAX_JSON_SIZE_BYTES, size
        ));
    }

    Ok(())
}

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

        // Validate inputs to prevent command injection
        validate_mcp_identifier(tool).map_err(|e| anyhow::anyhow!("invalid tool name: {}", e))?;
        validate_mcp_identifier(&self.name)
            .map_err(|e| anyhow::anyhow!("invalid server name: {}", e))?;
        validate_json_size(&arguments).map_err(|e| anyhow::anyhow!("invalid arguments: {}", e))?;

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

        // Validate server name to prevent command injection
        validate_mcp_identifier(&self.name)
            .map_err(|e| anyhow::anyhow!("invalid server name: {}", e))?;

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

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_config_stdio() -> McpServerConfig {
        McpServerConfig {
            name: Some("Test Server".to_string()),
            transport: Some(crate::mcp::config::McpTransport::Stdio),
            command: Some("echo".to_string()),
            args: Some(vec!["hello".to_string()]),
            env: None,
            url: None,
            auth: None,
            timeout: 30,
            max_concurrent: Some(5),
        }
    }

    fn create_test_config_http() -> McpServerConfig {
        McpServerConfig {
            name: Some("HTTP Test Server".to_string()),
            transport: Some(crate::mcp::config::McpTransport::StreamableHttp),
            command: None,
            args: None,
            env: None,
            url: Some("https://api.example.com/mcp".to_string()),
            auth: None,
            timeout: 45,
            max_concurrent: Some(10),
        }
    }

    // ============== Validation Tests ==============

    #[test]
    fn test_validate_mcp_identifier_valid() {
        assert!(validate_mcp_identifier("valid_tool_name").is_ok());
        assert!(validate_mcp_identifier("tool-123").is_ok());
        assert!(validate_mcp_identifier("filesystem").is_ok());
        assert!(validate_mcp_identifier("my_server_1").is_ok());
        assert!(validate_mcp_identifier("server-with-dashes").is_ok());
        assert!(validate_mcp_identifier("AlphaNumeric123").is_ok());
        assert!(validate_mcp_identifier("a").is_ok()); // Single character
    }

    #[test]
    fn test_validate_mcp_identifier_invalid_with_path_separators() {
        assert!(validate_mcp_identifier("tool/name").is_err());
        assert!(validate_mcp_identifier("path\\to\\tool").is_err());
        assert!(validate_mcp_identifier("../etc/passwd").is_err());
    }

    #[test]
    fn test_validate_mcp_identifier_invalid_with_shell_chars() {
        assert!(validate_mcp_identifier("tool;cmd").is_err());
        assert!(validate_mcp_identifier("tool|cat").is_err());
        assert!(validate_mcp_identifier("tool`whoami`").is_err());
        assert!(validate_mcp_identifier("tool$(cmd)").is_err());
        assert!(validate_mcp_identifier("tool&").is_err());
    }

    #[test]
    fn test_validate_mcp_identifier_invalid_with_special_chars() {
        assert!(validate_mcp_identifier("tool*").is_err());
        assert!(validate_mcp_identifier("tool?").is_err());
        assert!(validate_mcp_identifier("tool[1]").is_err());
        assert!(validate_mcp_identifier("tool{name}").is_err());
        assert!(validate_mcp_identifier("tool!").is_err());
        assert!(validate_mcp_identifier("tool#").is_err());
        assert!(validate_mcp_identifier("tool@domain").is_err());
        assert!(validate_mcp_identifier("tool^").is_err());
    }

    #[test]
    fn test_validate_mcp_identifier_invalid_whitespace() {
        assert!(validate_mcp_identifier("tool name").is_err());
        assert!(validate_mcp_identifier(" tool").is_err());
        assert!(validate_mcp_identifier("tool\t").is_err());
        assert!(validate_mcp_identifier("tool\n").is_err());
        assert!(validate_mcp_identifier("tool\r").is_err());
    }

    #[test]
    fn test_validate_mcp_identifier_invalid_quotes() {
        assert!(validate_mcp_identifier("tool\"").is_err());
        assert!(validate_mcp_identifier("tool'").is_err());
    }

    #[test]
    fn test_validate_mcp_identifier_empty() {
        let result = validate_mcp_identifier("");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("cannot be empty"));
    }

    #[test]
    fn test_validate_mcp_identifier_too_long() {
        let long_name = "a".repeat(101);
        let result = validate_mcp_identifier(&long_name);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("exceeds maximum length"));
    }

    #[test]
    fn test_validate_mcp_identifier_max_length_valid() {
        let max_name = "a".repeat(100);
        assert!(validate_mcp_identifier(&max_name).is_ok());
    }

    #[test]
    fn test_validate_json_size_valid() {
        let small_json = serde_json::json!({"key": "value"});
        assert!(validate_json_size(&small_json).is_ok());
    }

    #[test]
    fn test_validate_json_size_empty() {
        let empty = serde_json::json!({});
        assert!(validate_json_size(&empty).is_ok());
    }

    #[test]
    fn test_validate_json_size_oversized() {
        // Create a JSON value that exceeds 1MB when serialized
        let large_string = "x".repeat(1_100_000);
        let large_json = serde_json::json!({"data": large_string});
        let result = validate_json_size(&large_json);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("exceed maximum size"));
    }

    #[test]
    fn test_validate_json_size_exactly_at_limit() {
        // This is hard to test exactly, but we can test a large but valid JSON
        let medium_string = "x".repeat(500_000);
        let json = serde_json::json!({"data": medium_string});
        assert!(validate_json_size(&json).is_ok());
    }

    // ============== Data Structure Tests ==============

    #[test]
    fn test_tool_info_serialization() {
        let tool = ToolInfo {
            name: "read_file".to_string(),
            description: Some("Read a file".to_string()),
            input_schema: serde_json::json!({"type": "object", "properties": {}}),
        };
        let json = serde_json::to_string(&tool).expect("should serialize");
        assert!(json.contains("read_file"));
        assert!(json.contains("Read a file"));
    }

    #[test]
    fn test_tool_info_deserialization() {
        let json = r#"{"name":"write_file","description":"Write to a file","input_schema":{"type":"object"}}"#;
        let tool: ToolInfo = serde_json::from_str(json).expect("should deserialize");
        assert_eq!(tool.name, "write_file");
        assert_eq!(tool.description, Some("Write to a file".to_string()));
    }

    #[test]
    fn test_call_tool_result_serialization() {
        let result = CallToolResult {
            content: vec![
                ToolContent::Text {
                    text: "Hello".to_string(),
                },
                ToolContent::Image {
                    data: "base64data".to_string(),
                    mime_type: Some("image/png".to_string()),
                },
            ],
            is_error: Some(false),
        };
        let json = serde_json::to_string(&result).expect("should serialize");
        assert!(json.contains("Hello"));
        assert!(json.contains("base64data"));
    }

    #[test]
    fn test_tool_content_text_deserialization() {
        let json = r#"{"type":"text","text":"Hello world"}"#;
        let content: ToolContent = serde_json::from_str(json).expect("should deserialize");
        match content {
            ToolContent::Text { text } => assert_eq!(text, "Hello world"),
            _ => panic!("expected Text content"),
        }
    }

    #[test]
    fn test_tool_content_image_deserialization() {
        let json = r#"{"type":"image","data":"iVBORw0KGgo=","mime_type":"image/png"}"#;
        let content: ToolContent = serde_json::from_str(json).expect("should deserialize");
        match content {
            ToolContent::Image { data, mime_type } => {
                assert_eq!(data, "iVBORw0KGgo=");
                assert_eq!(mime_type, Some("image/png".to_string()));
            }
            _ => panic!("expected Image content"),
        }
    }

    #[test]
    fn test_tool_content_image_without_mime_type() {
        let json = r#"{"type":"image","data":"iVBORw0KGgo="}"#;
        let content: ToolContent = serde_json::from_str(json).expect("should deserialize");
        match content {
            ToolContent::Image { data, mime_type } => {
                assert_eq!(data, "iVBORw0KGgo=");
                assert_eq!(mime_type, None);
            }
            _ => panic!("expected Image content"),
        }
    }

    #[test]
    fn test_tool_content_resource_deserialization() {
        let json = r#"{"type":"resource","uri":"file:///tmp/test.txt","mime_type":"text/plain","text":"file contents"}"#;
        let content: ToolContent = serde_json::from_str(json).expect("should deserialize");
        match content {
            ToolContent::Resource {
                uri,
                mime_type,
                text,
            } => {
                assert_eq!(uri, "file:///tmp/test.txt");
                assert_eq!(mime_type, Some("text/plain".to_string()));
                assert_eq!(text, Some("file contents".to_string()));
            }
            _ => panic!("expected Resource content"),
        }
    }

    #[test]
    fn test_tool_content_resource_without_optional_fields() {
        let json = r#"{"type":"resource","uri":"file:///tmp/test.txt"}"#;
        let content: ToolContent = serde_json::from_str(json).expect("should deserialize");
        match content {
            ToolContent::Resource {
                uri,
                mime_type,
                text,
            } => {
                assert_eq!(uri, "file:///tmp/test.txt");
                assert_eq!(mime_type, None);
                assert_eq!(text, None);
            }
            _ => panic!("expected Resource content"),
        }
    }

    #[test]
    fn test_call_tool_result_error_flag() {
        let result = CallToolResult {
            content: vec![ToolContent::Text {
                text: "Error occurred".to_string(),
            }],
            is_error: Some(true),
        };
        assert_eq!(result.is_error, Some(true));
    }

    #[test]
    fn test_call_tool_result_no_error_flag() {
        let result = CallToolResult {
            content: vec![ToolContent::Text {
                text: "Success".to_string(),
            }],
            is_error: None,
        };
        assert_eq!(result.is_error, None);
    }

    // ============== Config Helper Tests ==============

    #[test]
    fn test_mcp_server_config_is_stdio() {
        let config = create_test_config_stdio();
        assert!(config.is_stdio());
        assert!(!config.is_http());
    }

    #[test]
    fn test_mcp_server_config_is_http() {
        let config = create_test_config_http();
        assert!(!config.is_stdio());
        assert!(config.is_http());
    }

    #[test]
    fn test_mcp_server_config_command_accessors() {
        let config = create_test_config_stdio();
        assert_eq!(config.command(), Some("echo"));
        assert_eq!(config.args(), vec!["hello"]);
        assert!(config.url().is_none());
    }

    #[test]
    fn test_mcp_server_config_url_accessors() {
        let config = create_test_config_http();
        assert!(config.command().is_none());
        assert!(config.args().is_empty());
        assert_eq!(config.url(), Some("https://api.example.com/mcp"));
    }

    #[test]
    fn test_mcp_server_config_default_args() {
        let config = McpServerConfig {
            name: None,
            transport: None,
            command: None,
            args: None,
            env: None,
            url: None,
            auth: None,
            timeout: 30,
            max_concurrent: None,
        };
        assert!(config.args().is_empty());
    }
}
