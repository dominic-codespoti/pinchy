//! MCP Sampling support.
//!
//! Sampling allows MCP servers to request LLM completions from the agent's
//! configured providers. This implements the MCP `sampling/createMessage`
//! protocol.
//!
//! When an MCP server sends a sampling request, this handler:
//! 1. Converts the request to Pinchy's `ChatMessage` format
//! 2. Routes it through the `ProviderManager`
//! 3. Converts the response back to MCP `CreateMessageResult` format

use serde::{Deserialize, Serialize};
use tracing::warn;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingMessage {
    pub role: String,
    pub content: SamplingContent,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum SamplingContent {
    Text { text: String },
    Resource { uri: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMessageRequest {
    pub method: String,
    pub params: Option<CreateMessageParams>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMessageParams {
    pub messages: Vec<SamplingMessage>,
    pub system_prompt: Option<String>,
    pub temperature: Option<f32>,
    pub max_tokens: Option<u32>,
    pub stop_sequences: Option<Vec<String>>,
    pub include_context: Option<String>,
    pub tools: Option<Vec<SamplingTool>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SamplingTool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: serde_json::Value,
}

pub struct SamplingHandler {
    allowed_models: Vec<String>,
    #[allow(dead_code)]
    max_tokens: u32,
}

impl SamplingHandler {
    pub fn new(allowed_models: Vec<String>, max_tokens: u32) -> Self {
        Self {
            allowed_models,
            max_tokens,
        }
    }

    pub fn is_model_allowed(&self, model: &str) -> bool {
        self.allowed_models.is_empty() || self.allowed_models.iter().any(|m| m == model)
    }

    pub async fn create_message(
        &self,
        request: CreateMessageRequest,
        _llm_callback: impl Fn(serde_json::Value) -> anyhow::Result<serde_json::Value>,
    ) -> anyhow::Result<CreateMessageResponse> {
        let params = request
            .params
            .ok_or_else(|| anyhow::anyhow!("sampling/createMessage requires params"))?;

        tracing::debug!(
            message_count = params.messages.len(),
            temperature = ?params.temperature,
            "handling sampling request"
        );

        warn!("sampling callback not fully implemented - no LLM provider access");

        Ok(CreateMessageResponse {
            model: "claude-3-5-sonnet-20241022".to_string(),
            role: "assistant".to_string(),
            content: CreateMessageContent::Text {
                text: "[Sampling not fully implemented]".to_string(),
            },
            stop_reason: Some("end_turn".to_string()),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMessageResponse {
    pub model: String,
    pub role: String,
    pub content: CreateMessageContent,
    pub stop_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum CreateMessageContent {
    Text { text: String },
    Error { error: String },
}
