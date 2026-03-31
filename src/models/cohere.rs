//! Cohere API provider with chat completions and tool calling.
//!
//! API Docs: https://docs.cohere.com/reference/chat
//!
//! Config example:
//! ```yaml
//! models:
//!   - id: cohere-command-r-plus
//!     provider: cohere
//!     model: command-r-plus
//!     api_key: $COHERE_API_KEY
//! ```

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Default endpoint for Cohere API.
pub const DEFAULT_ENDPOINT: &str = "https://api.cohere.com/v1";

/// Provider that talks to the Cohere chat API.
pub struct CohereProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: Client,
}

impl Default for CohereProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl CohereProvider {
    /// Create a new provider with API key from environment.
    ///
    /// Reads `COHERE_API_KEY` from the environment. Panics if not set.
    pub fn new() -> Self {
        let api_key = std::env::var("COHERE_API_KEY").expect("COHERE_API_KEY must be set");
        Self {
            api_key,
            base_url: DEFAULT_ENDPOINT.to_string(),
            model: "command-r-plus".to_string(),
            client: super::get_shared_http_client(),
        }
    }

    /// Create a provider with explicit configuration.
    pub fn with_config(api_key: String, base_url: String, model: String) -> Self {
        Self {
            api_key,
            base_url,
            model,
            client: super::get_shared_http_client(),
        }
    }

    /// Convert ChatMessage roles to Cohere format.
    ///
    /// Cohere uses: "USER", "CHATBOT", "SYSTEM" (in chat_history)
    /// The final message goes in the "message" field as USER.
    fn convert_messages(
        &self,
        messages: &[ChatMessage],
    ) -> (Option<String>, Vec<serde_json::Value>) {
        let mut chat_history: Vec<serde_json::Value> = Vec::new();

        // Process all but the last message into chat_history
        let msgs_for_history = if messages.len() > 1 {
            &messages[..messages.len() - 1]
        } else {
            &[]
        };

        for msg in msgs_for_history {
            let role = match msg.role.as_str() {
                "user" => "USER",
                "assistant" => "CHATBOT",
                "system" => "SYSTEM",
                "tool" => continue, // Skip tool messages - Cohere handles differently
                _ => "USER",
            };
            chat_history.push(json!({
                "role": role,
                "message": msg.content,
            }));
        }

        // Last message goes in the "message" field
        let last_message = messages.last().map(|m| m.content.clone());

        (last_message, chat_history)
    }

    /// Convert function definitions to Cohere tool format.
    fn convert_tools(&self, functions: &[serde_json::Value]) -> Vec<serde_json::Value> {
        functions
            .iter()
            .map(|f| {
                let name = f.get("name").and_then(|n| n.as_str()).unwrap_or("unknown");
                let description = f.get("description").and_then(|d| d.as_str()).unwrap_or("");

                // Convert OpenAI-style parameters to Cohere parameter_definitions
                let mut param_definitions = serde_json::Map::new();
                if let Some(params) = f.get("parameters").and_then(|p| p.as_object()) {
                    if let Some(props) = params.get("properties").and_then(|p| p.as_object()) {
                        let required: Vec<&str> = params
                            .get("required")
                            .and_then(|r| r.as_array())
                            .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
                            .unwrap_or_default();

                        for (prop_name, prop_schema) in props {
                            let mut param_def = serde_json::Map::new();
                            param_def.insert(
                                "type".to_string(),
                                json!(prop_schema
                                    .get("type")
                                    .and_then(|t| t.as_str())
                                    .unwrap_or("string")),
                            );
                            if let Some(desc) =
                                prop_schema.get("description").and_then(|d| d.as_str())
                            {
                                param_def.insert("description".to_string(), json!(desc));
                            }
                            param_def.insert(
                                "required".to_string(),
                                json!(required.contains(&prop_name.as_str())),
                            );
                            param_definitions
                                .insert(prop_name.clone(), serde_json::Value::Object(param_def));
                        }
                    }
                }

                json!({
                    "name": name,
                    "description": description,
                    "parameter_definitions": param_definitions,
                })
            })
            .collect()
    }

    /// Parse tool calls from Cohere response.
    fn parse_tool_calls(&self, json: &serde_json::Value) -> Option<ProviderResponse> {
        // Cohere returns tool_calls in the response
        if let Some(tool_calls) = json.get("tool_calls").and_then(|v| v.as_array()) {
            let items: Vec<super::FunctionCallItem> = tool_calls
                .iter()
                .filter_map(|tc| {
                    let name = tc.get("name")?.as_str()?.to_string();
                    let parameters = tc.get("parameters").cloned().unwrap_or(json!({}));
                    let id = format!("cohere_{}", uuid::Uuid::new_v4());
                    Some(super::FunctionCallItem {
                        id,
                        name,
                        arguments: parameters.to_string(),
                    })
                })
                .collect();

            if items.len() == 1 {
                let item = items.into_iter().next().unwrap();
                return Some(ProviderResponse::FunctionCall {
                    id: item.id,
                    name: item.name,
                    arguments: item.arguments,
                });
            } else if items.len() > 1 {
                return Some(ProviderResponse::MultiFunctionCall(items));
            }
        }
        None
    }

    /// Extract text content from Cohere response.
    fn extract_content(&self, json: &serde_json::Value) -> String {
        json.get("text")
            .and_then(|t| t.as_str())
            .unwrap_or("")
            .to_string()
    }

    /// Parse token usage from Cohere response.
    fn parse_token_usage(&self, json: &serde_json::Value) -> Option<TokenUsage> {
        let meta = json.get("meta")?;
        let billed = meta.get("billed_units")?;
        let tokens = meta.get("tokens")?;

        Some(TokenUsage {
            prompt_tokens: billed
                .get("input_tokens")
                .and_then(|t| t.as_u64())
                .unwrap_or(0),
            completion_tokens: billed
                .get("output_tokens")
                .and_then(|t| t.as_u64())
                .unwrap_or(0),
            total_tokens: tokens
                .get("input_tokens")
                .and_then(|t| t.as_u64())
                .unwrap_or(0)
                + tokens
                    .get("output_tokens")
                    .and_then(|t| t.as_u64())
                    .unwrap_or(0),
            cached_tokens: 0,    // Cohere doesn't expose cached tokens
            reasoning_tokens: 0, // Cohere doesn't expose reasoning tokens
            model: self.model.clone(),
        })
    }
}

#[async_trait]
impl ModelProvider for CohereProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let (last_message, chat_history) = self.convert_messages(messages);

        let mut body = json!({
            "model": self.model,
            "chat_history": chat_history,
        });

        if let Some(msg) = last_message {
            body["message"] = json!(msg);
        }

        let url = format!("{}/chat", self.base_url);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Cohere API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        Ok(self.extract_content(&json))
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        let (last_message, chat_history) = self.convert_messages(messages);

        let mut body = json!({
            "model": self.model,
            "chat_history": chat_history,
        });

        if let Some(msg) = last_message {
            body["message"] = json!(msg);
        }

        if !functions.is_empty() {
            body["tools"] = json!(self.convert_tools(functions));
            body["tool_choice"] = json!("auto");
        }

        let url = format!("{}/chat", self.base_url);
        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Cohere API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let usage = self.parse_token_usage(&json);

        if let Some(pr) = self.parse_tool_calls(&json) {
            return Ok((pr, usage));
        }

        Ok((ProviderResponse::Final(self.extract_content(&json)), usage))
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            // Cohere supports streaming via "stream": true
            let (last_message, chat_history) = self.convert_messages(messages);

            let mut body = json!({
                "model": self.model,
                "chat_history": chat_history,
                "stream": true,
            });

            if let Some(msg) = last_message {
                body["message"] = json!(msg);
            }

            let url = format!("{}/chat", self.base_url);
            let resp = self
                .client
                .post(&url)
                .header("Authorization", format!("Bearer {}", self.api_key))
                .json(&body)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!("Cohere streaming API returned {status}: {text}"))?;
                return;
            }

            // Cohere streaming uses SSE format with text deltas
            let mut byte_stream = resp.bytes_stream();
            let mut buffer = String::new();

            use tokio_stream::StreamExt as _;
            while let Some(chunk) = byte_stream.next().await {
                let chunk = chunk?;
                buffer.push_str(&String::from_utf8_lossy(&chunk));

                while let Some(newline_pos) = buffer.find('\n') {
                    let line = buffer[..newline_pos].trim_end().to_string();
                    buffer = buffer[newline_pos + 1..].to_string();

                    if line.is_empty() || !line.starts_with("data: ") {
                        continue;
                    }
                    let data = &line[6..];
                    if data == "[DONE]" {
                        return;
                    }
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        // Cohere streaming sends text deltas in different event types
                        if let Some(text) = json.get("text").and_then(|t| t.as_str()) {
                            if !text.is_empty() {
                                yield text.to_string();
                            }
                        }
                    }
                }
            }
        })
    }

    async fn embed(&self, texts: &[&str]) -> Result<Option<Vec<Vec<f32>>>, anyhow::Error> {
        // Use embed-english-v3 by default for embeddings
        let url = format!("{}/embed", self.base_url);
        let body = json!({
            "model": "embed-english-v3",
            "texts": texts,
            "input_type": "search_document",
        });

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let msg = resp.text().await.unwrap_or_default();
            anyhow::bail!("Cohere Embeddings API returned {status}: {msg}");
        }

        let json: serde_json::Value = resp.json().await?;
        let embeddings = json.get("embeddings").and_then(|e| e.as_array());

        match embeddings {
            Some(arr) => {
                let vecs: Vec<Vec<f32>> = arr
                    .iter()
                    .filter_map(|item| {
                        item.as_array().map(|e| {
                            e.iter()
                                .filter_map(|v| v.as_f64().map(|f| f as f32))
                                .collect()
                        })
                    })
                    .collect();
                Ok(Some(vecs))
            }
            None => Ok(None),
        }
    }

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        let url = format!("{}/models", self.base_url);

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await?;

        if !resp.status().is_success() {
            // Return known models if API listing fails
            return Ok(Some(get_known_cohere_models()));
        }

        let payload: serde_json::Value = resp.json().await?;
        let models = payload
            .get("models")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();

        let model_infos: Vec<super::ModelInfo> = models
            .iter()
            .filter_map(|m| {
                let id = m.get("name")?.as_str()?.to_string();
                let (input_price, output_price, description, max_tokens) = get_model_metadata(&id);
                Some(super::ModelInfo {
                    name: id.clone(),
                    id,
                    vendor: Some("Cohere".to_string()),
                    supported_endpoints: vec!["chat".to_string()],
                    is_default: false,
                    input_price,
                    output_price,
                    description,
                    max_tokens,
                })
            })
            .collect();

        if model_infos.is_empty() {
            Ok(Some(get_known_cohere_models()))
        } else {
            Ok(Some(model_infos))
        }
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// Get pricing and metadata for known Cohere models.
/// Returns (input_price, output_price, description, max_tokens) per 1K tokens.
fn get_model_metadata(model_id: &str) -> (Option<f64>, Option<f64>, Option<String>, Option<u32>) {
    match model_id {
        "command-r-plus" | "command-r-plus-08-2024" => (
            Some(0.003),
            Some(0.015),
            Some(
                "Command R+ - Cohere's most capable model with advanced reasoning and tool use"
                    .to_string(),
            ),
            Some(128_000),
        ),
        "command-r" | "command-r-08-2024" => (
            Some(0.0005),
            Some(0.0015),
            Some("Command R - Strong performance model with 128k context window".to_string()),
            Some(128_000),
        ),
        "command" | "command-nightly" => (
            Some(0.001),
            Some(0.002),
            Some("Command - General purpose model for a wide range of tasks".to_string()),
            Some(4_096),
        ),
        "command-light" | "command-light-nightly" => (
            Some(0.0003),
            Some(0.0006),
            Some("Command Light - Fast and efficient model for simpler tasks".to_string()),
            Some(4_096),
        ),
        "embed-english-v3" => (
            Some(0.0001),
            None,
            Some("Embed English v3 - High-quality English text embeddings".to_string()),
            None,
        ),
        "embed-multilingual-v3" => (
            Some(0.0001),
            None,
            Some(
                "Embed Multilingual v3 - Multilingual text embeddings supporting 100+ languages"
                    .to_string(),
            ),
            None,
        ),
        _ => {
            let desc = format!("Cohere model: {}", model_id);
            (None, None, Some(desc), None)
        }
    }
}

/// Return hardcoded list of known Cohere models.
fn get_known_cohere_models() -> Vec<super::ModelInfo> {
    let model_ids = [
        "command-r-plus",
        "command-r",
        "command",
        "command-light",
        "embed-english-v3",
        "embed-multilingual-v3",
    ];

    model_ids
        .iter()
        .map(|id| {
            let (input_price, output_price, description, max_tokens) = get_model_metadata(id);
            super::ModelInfo {
                name: id.to_string(),
                id: id.to_string(),
                vendor: Some("Cohere".to_string()),
                supported_endpoints: if id.starts_with("embed") {
                    vec!["embeddings".to_string()]
                } else {
                    vec!["chat".to_string()]
                },
                is_default: id == &"command-r-plus",
                input_price,
                output_price,
                description,
                max_tokens,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construct_with_config() {
        let p = CohereProvider::with_config(
            "test-key".into(),
            "https://api.cohere.com/v1".into(),
            "command-r-plus".into(),
        );
        assert_eq!(p.model, "command-r-plus");
        assert_eq!(p.api_key, "test-key");
    }

    #[test]
    fn convert_messages_to_cohere_format() {
        let p = CohereProvider::with_config(
            "test-key".into(),
            "https://api.cohere.com/v1".into(),
            "command-r".into(),
        );

        let messages = vec![
            ChatMessage::new("system", "You are helpful."),
            ChatMessage::new("user", "Hello"),
            ChatMessage::new("assistant", "Hi there!"),
            ChatMessage::new("user", "How are you?"),
        ];

        let (last_msg, history) = p.convert_messages(&messages);

        assert_eq!(last_msg, Some("How are you?".to_string()));
        assert_eq!(history.len(), 3);
        assert_eq!(history[0]["role"], "SYSTEM");
        assert_eq!(history[0]["message"], "You are helpful.");
        assert_eq!(history[1]["role"], "USER");
        assert_eq!(history[1]["message"], "Hello");
        assert_eq!(history[2]["role"], "CHATBOT");
        assert_eq!(history[2]["message"], "Hi there!");
    }

    #[test]
    fn convert_tools_to_cohere_format() {
        let p = CohereProvider::with_config(
            "test-key".into(),
            "https://api.cohere.com/v1".into(),
            "command-r".into(),
        );

        let functions = vec![json!({
            "name": "get_weather",
            "description": "Get weather information",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "City name"
                    },
                    "units": {
                        "type": "string",
                        "description": "Temperature units"
                    }
                },
                "required": ["location"]
            }
        })];

        let tools = p.convert_tools(&functions);

        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0]["name"], "get_weather");
        assert_eq!(tools[0]["description"], "Get weather information");

        let params = tools[0]["parameter_definitions"].as_object().unwrap();
        assert!(params.contains_key("location"));
        assert!(params.contains_key("units"));

        let location = &params["location"];
        assert_eq!(location["type"], "string");
        assert_eq!(location["required"], true);
        assert_eq!(location["description"], "City name");

        let units = &params["units"];
        assert_eq!(units["required"], false);
    }

    #[test]
    fn extract_content_from_response() {
        let p = CohereProvider::with_config(
            "test-key".into(),
            "https://api.cohere.com/v1".into(),
            "command-r".into(),
        );

        let response = json!({
            "text": "This is the response text",
            "generation_id": "gen-123",
        });

        let content = p.extract_content(&response);
        assert_eq!(content, "This is the response text");
    }

    #[test]
    fn parse_tool_calls_from_response() {
        let p = CohereProvider::with_config(
            "test-key".into(),
            "https://api.cohere.com/v1".into(),
            "command-r".into(),
        );

        let response = json!({
            "text": "",
            "tool_calls": [
                {
                    "name": "get_weather",
                    "parameters": {"location": "San Francisco"}
                }
            ],
        });

        let result = p.parse_tool_calls(&response);
        assert!(result.is_some());

        match result {
            Some(ProviderResponse::FunctionCall {
                name, arguments, ..
            }) => {
                assert_eq!(name, "get_weather");
                assert_eq!(arguments, r#"{"location":"San Francisco"}"#);
            }
            _ => panic!("Expected FunctionCall"),
        }
    }

    #[test]
    fn parse_multi_tool_calls_from_response() {
        let p = CohereProvider::with_config(
            "test-key".into(),
            "https://api.cohere.com/v1".into(),
            "command-r".into(),
        );

        let response = json!({
            "text": "",
            "tool_calls": [
                {
                    "name": "get_weather",
                    "parameters": {"location": "SF"}
                },
                {
                    "name": "get_time",
                    "parameters": {"timezone": "PST"}
                }
            ],
        });

        let result = p.parse_tool_calls(&response);
        assert!(result.is_some());

        match result {
            Some(ProviderResponse::MultiFunctionCall(items)) => {
                assert_eq!(items.len(), 2);
                assert_eq!(items[0].name, "get_weather");
                assert_eq!(items[1].name, "get_time");
            }
            _ => panic!("Expected MultiFunctionCall"),
        }
    }

    #[test]
    fn model_metadata_pricing() {
        let (input, output, desc, max) = get_model_metadata("command-r-plus");
        assert_eq!(input, Some(0.003));
        assert_eq!(output, Some(0.015));
        assert!(desc.unwrap().contains("Cohere"));
        assert_eq!(max, Some(128_000));
    }

    #[test]
    fn known_models_list() {
        let models = get_known_cohere_models();
        assert!(!models.is_empty());

        let cmd_r_plus = models.iter().find(|m| m.id == "command-r-plus");
        assert!(cmd_r_plus.is_some());
        assert_eq!(cmd_r_plus.unwrap().vendor, Some("Cohere".to_string()));
    }
}
