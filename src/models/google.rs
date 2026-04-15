//! Google Gemini provider implementation.
//!
//! Uses the Gemini API directly via HTTP requests to the Google Generative Language API.
//! Auth is via API key in the `key` query parameter (not header).

use std::any::Any;
use std::pin::Pin;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::json;

use super::{ChatMessage, ModelInfo, ModelProvider, ProviderResponse, TokenUsage};

/// Default base URL for the Google Generative Language API.
pub const DEFAULT_BASE_URL: &str = "https://generativelanguage.googleapis.com/v1beta";

/// Default embedding model for Google Gemini.
const DEFAULT_EMBEDDING_MODEL: &str = "text-embedding-004";

/// Google Gemini model provider.
pub struct GoogleProvider {
    api_key: String,
    base_url: String,
    model: String,
    client: Client,
}

/// Gemini API request structure.
#[derive(Debug, Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    generation_config: Option<GeminiGenerationConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tools: Option<Vec<GeminiTool>>,
}

/// Gemini content structure (message with role and parts).
#[derive(Debug, Serialize, Deserialize)]
struct GeminiContent {
    role: String,
    parts: Vec<GeminiPart>,
}

/// Gemini part structure (text or inline data).
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GeminiPart {
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    inline_data: Option<GeminiInlineData>,
}

/// Gemini inline data for images.
#[derive(Debug, Serialize, Deserialize)]
struct GeminiInlineData {
    mime_type: String,
    data: String,
}

/// Gemini generation config.
#[derive(Debug, Serialize)]
struct GeminiGenerationConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    max_output_tokens: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_p: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    top_k: Option<u32>,
}

/// Gemini tool structure for function calling.
#[derive(Debug, Serialize)]
struct GeminiTool {
    function_declarations: Vec<serde_json::Value>,
}

/// Gemini API response structure.
#[derive(Debug, Deserialize)]
struct GeminiResponse {
    candidates: Vec<GeminiCandidate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage_metadata: Option<GeminiUsageMetadata>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _prompt_feedback: Option<serde_json::Value>,
}

/// Gemini candidate (choice) structure.
#[derive(Debug, Deserialize)]
struct GeminiCandidate {
    content: GeminiContent,
    #[serde(skip_serializing_if = "Option::is_none")]
    _finish_reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    _safety_ratings: Option<Vec<serde_json::Value>>,
}

/// Gemini usage metadata.
#[derive(Debug, Deserialize)]
struct GeminiUsageMetadata {
    prompt_token_count: Option<u32>,
    candidates_token_count: Option<u32>,
    total_token_count: Option<u32>,
}

/// Gemini function call structure.
#[derive(Debug, Deserialize)]
struct GeminiFunctionCall {
    name: String,
    args: serde_json::Value,
}

/// Gemini streaming chunk response.
#[derive(Debug, Deserialize)]
struct GeminiStreamChunk {
    candidates: Vec<GeminiCandidate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    usage_metadata: Option<GeminiUsageMetadata>,
}

/// Gemini embedding request.
#[derive(Debug, Serialize)]
struct GeminiEmbeddingRequest {
    model: String,
    content: GeminiContent,
}

/// Gemini embedding response.
#[derive(Debug, Deserialize)]
struct GeminiEmbeddingResponse {
    embedding: GeminiEmbedding,
}

/// Gemini embedding value.
#[derive(Debug, Deserialize)]
struct GeminiEmbedding {
    values: Vec<f32>,
}

impl Default for GoogleProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl GoogleProvider {
    /// Create a new provider using the `GOOGLE_API_KEY` environment variable.
    pub fn new() -> Self {
        let api_key = std::env::var("GOOGLE_API_KEY").expect("GOOGLE_API_KEY must be set");
        Self {
            api_key,
            base_url: DEFAULT_BASE_URL.to_string(),
            client: super::get_shared_http_client(),
            model: "gemini-2.0-flash-latest".to_string(),
        }
    }

    /// Create a provider with explicit configuration.
    pub fn with_config(api_key: String, base_url: String, model: String) -> Self {
        Self {
            api_key,
            base_url,
            client: super::get_shared_http_client(),
            model,
        }
    }

    /// Build the API URL with the API key in the query parameter.
    fn build_api_url(&self, endpoint: &str) -> String {
        format!("{}/{}?key={}", self.base_url, endpoint, self.api_key)
    }

    /// Convert ChatMessages to Gemini contents format.
    fn messages_to_contents(&self, messages: &[ChatMessage]) -> Vec<GeminiContent> {
        messages
            .iter()
            .map(|msg| {
                let role = match msg.role.as_str() {
                    "system" => "user", // Gemini doesn't have a system role, treat as user
                    "assistant" => "model",
                    "tool" => "user", // Tool results are user messages
                    _ => "user",
                };

                let mut parts = Vec::new();

                // Add text content
                if !msg.content.is_empty() {
                    parts.push(GeminiPart {
                        text: Some(msg.content.clone()),
                        inline_data: None,
                    });
                }

                // Add images as inline data
                for img in &msg.images {
                    // Parse data URI: data:<mime>;base64,<data>
                    if let Some((mime, data)) = parse_data_uri(img) {
                        parts.push(GeminiPart {
                            text: None,
                            inline_data: Some(GeminiInlineData {
                                mime_type: mime,
                                data,
                            }),
                        });
                    }
                }

                GeminiContent {
                    role: role.to_string(),
                    parts,
                }
            })
            .collect()
    }

    /// Extract text from a Gemini content.
    fn extract_text(&self, content: &GeminiContent) -> String {
        content
            .parts
            .iter()
            .filter_map(|part| part.text.clone())
            .collect::<Vec<_>>()
            .join("")
    }

    /// Check if a content contains a function call.
    fn extract_function_calls(&self, content: &GeminiContent) -> Vec<GeminiFunctionCall> {
        // Gemini returns function calls in a "functionCall" field within parts
        // We need to parse this from the JSON representation
        let json_str = match serde_json::to_string(content) {
            Ok(s) => s,
            Err(_) => return Vec::new(),
        };

        let json_val: serde_json::Value = match serde_json::from_str(&json_str) {
            Ok(v) => v,
            Err(_) => return Vec::new(),
        };

        let mut calls = Vec::new();

        if let Some(parts) = json_val.get("parts").and_then(|p| p.as_array()) {
            for part in parts {
                if let Some(fc) = part.get("functionCall") {
                    if let Some(name) = fc.get("name").and_then(|n| n.as_str()) {
                        let args = fc.get("args").cloned().unwrap_or_else(|| json!({}));
                        calls.push(GeminiFunctionCall {
                            name: name.to_string(),
                            args,
                        });
                    }
                }
            }
        }

        calls
    }

    /// Send chat messages to the Gemini API.
    async fn send_gemini_chat(
        &self,
        messages: &[ChatMessage],
        streaming: bool,
    ) -> Result<GeminiResponse, anyhow::Error> {
        let contents = self.messages_to_contents(messages);

        let request = GeminiRequest {
            contents,
            generation_config: Some(GeminiGenerationConfig {
                max_output_tokens: Some(8192),
                temperature: Some(0.7),
                top_p: None,
                top_k: None,
            }),
            tools: None,
        };

        let url = if streaming {
            self.build_api_url(&format!("models/{}:streamGenerateContent", self.model))
        } else {
            self.build_api_url(&format!("models/{}:generateContent", self.model))
        };

        let resp = self.client.post(&url).json(&request).send().await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Google Gemini API returned {status}: {text}");
        }

        if streaming {
            // For streaming, we need to collect and parse the response differently
            // Gemini streaming returns a series of JSON objects separated by newlines
            let text = resp.text().await?;
            let mut full_content = String::new();
            let mut total_prompt_tokens = 0u32;
            let mut total_candidates_tokens = 0u32;

            for line in text.lines() {
                if line.trim().is_empty() {
                    continue;
                }

                if let Ok(chunk) = serde_json::from_str::<GeminiStreamChunk>(line) {
                    for candidate in chunk.candidates {
                        full_content.push_str(&self.extract_text(&candidate.content));
                    }
                    if let Some(usage) = chunk.usage_metadata {
                        total_prompt_tokens = usage.prompt_token_count.unwrap_or(0);
                        total_candidates_tokens = usage.candidates_token_count.unwrap_or(0);
                    }
                }
            }

            // Construct a synthetic response
            let synthetic_response = GeminiResponse {
                candidates: vec![GeminiCandidate {
                    content: GeminiContent {
                        role: "model".to_string(),
                        parts: vec![GeminiPart {
                            text: Some(full_content),
                            inline_data: None,
                        }],
                    },
                    _finish_reason: Some("STOP".to_string()),
                    _safety_ratings: None,
                }],
                usage_metadata: Some(GeminiUsageMetadata {
                    prompt_token_count: Some(total_prompt_tokens),
                    candidates_token_count: Some(total_candidates_tokens),
                    total_token_count: Some(total_prompt_tokens + total_candidates_tokens),
                }),
                _prompt_feedback: None,
            };

            Ok(synthetic_response)
        } else {
            let response: GeminiResponse = resp.json().await?;
            Ok(response)
        }
    }

    /// Send chat with function calling support.
    async fn send_gemini_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<GeminiResponse, anyhow::Error> {
        let contents = self.messages_to_contents(messages);

        // Convert functions to Gemini function declarations
        let function_declarations: Vec<serde_json::Value> = functions
            .iter()
            .map(|f| {
                // Extract function info from the JSON
                let name = f
                    .get("name")
                    .and_then(|n| n.as_str())
                    .unwrap_or("unknown")
                    .to_string();
                let description = f
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("")
                    .to_string();
                let parameters = f.get("parameters").cloned().unwrap_or_else(|| json!({}));

                json!({
                    "name": name,
                    "description": description,
                    "parameters": parameters,
                })
            })
            .collect();

        let tools = if function_declarations.is_empty() {
            None
        } else {
            Some(vec![GeminiTool {
                function_declarations,
            }])
        };

        let request = GeminiRequest {
            contents,
            generation_config: Some(GeminiGenerationConfig {
                max_output_tokens: Some(8192),
                temperature: Some(0.7),
                top_p: None,
                top_k: None,
            }),
            tools,
        };

        let url = self.build_api_url(&format!("models/{}:generateContent", self.model));

        let resp = self.client.post(&url).json(&request).send().await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Google Gemini API returned {status}: {text}");
        }

        let response: GeminiResponse = resp.json().await?;
        Ok(response)
    }

    /// SSE streaming implementation for Gemini.
    fn send_chat_stream_sse<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let contents = self.messages_to_contents(messages);

            let request = GeminiRequest {
                contents,
                generation_config: Some(GeminiGenerationConfig {
                    max_output_tokens: Some(8192),
                    temperature: Some(0.7),
                    top_p: None,
                    top_k: None,
                }),
                tools: None,
            };

            let url = self.build_api_url(&format!("models/{}:streamGenerateContent", self.model));

            let resp = self
                .client
                .post(&url)
                .json(&request)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!("Google Gemini streaming API returned {status}: {text}"))?;
                return;
            }

            let text = resp.text().await?;

            for line in text.lines() {
                if line.trim().is_empty() {
                    continue;
                }

                if let Ok(chunk) = serde_json::from_str::<GeminiStreamChunk>(line) {
                    for candidate in chunk.candidates {
                        let text = self.extract_text(&candidate.content);
                        if !text.is_empty() {
                            yield text;
                        }
                    }
                }
            }
        })
    }
}

/// Parse a data URI into (mime_type, base64_data).
fn parse_data_uri(uri: &str) -> Option<(String, String)> {
    // Format: data:<mime>;base64,<data>
    let prefix = "data:";
    if !uri.starts_with(prefix) {
        return None;
    }

    let rest = &uri[prefix.len()..];
    let parts: Vec<&str> = rest.splitn(2, ',').collect();
    if parts.len() != 2 {
        return None;
    }

    let mime_info = parts[0];
    let data = parts[1].to_string();

    // Check for base64 encoding marker
    let mime = if mime_info.ends_with(";base64") {
        mime_info.trim_end_matches(";base64").to_string()
    } else {
        mime_info.to_string()
    };

    Some((mime, data))
}

#[async_trait]
impl ModelProvider for GoogleProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let response = self.send_gemini_chat(messages, false).await?;

        if let Some(candidate) = response.candidates.first() {
            Ok(self.extract_text(&candidate.content))
        } else {
            Ok(String::new())
        }
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        let response = self
            .send_gemini_chat_with_functions(messages, functions)
            .await?;

        // Extract usage metadata
        let usage = response.usage_metadata.as_ref().map(|u| TokenUsage {
            prompt_tokens: u.prompt_token_count.unwrap_or(0) as u64,
            completion_tokens: u.candidates_token_count.unwrap_or(0) as u64,
            total_tokens: u.total_token_count.unwrap_or(0) as u64,
            cached_tokens: 0,
            reasoning_tokens: 0,
            model: self.model.clone(),
        });

        // Check for function calls
        if let Some(candidate) = response.candidates.first() {
            let function_calls = self.extract_function_calls(&candidate.content);

            if function_calls.len() == 1 {
                let fc = &function_calls[0];
                return Ok((
                    ProviderResponse::FunctionCall {
                        id: format!("call_{}", uuid::Uuid::new_v4()),
                        name: fc.name.clone(),
                        arguments: fc.args.to_string(),
                    },
                    usage,
                ));
            } else if function_calls.len() > 1 {
                let items: Vec<super::FunctionCallItem> = function_calls
                    .iter()
                    .map(|fc| super::FunctionCallItem {
                        id: format!("call_{}", uuid::Uuid::new_v4()),
                        name: fc.name.clone(),
                        arguments: fc.args.to_string(),
                    })
                    .collect();
                return Ok((ProviderResponse::MultiFunctionCall(items), usage));
            }

            // No function calls, return text response
            let text = self.extract_text(&candidate.content);
            return Ok((ProviderResponse::Final(text), usage));
        }

        Ok((ProviderResponse::Final(String::new()), usage))
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        self.send_chat_stream_sse(messages)
    }

    async fn embed(&self, texts: &[&str]) -> Result<Option<Vec<Vec<f32>>>, anyhow::Error> {
        let mut embeddings = Vec::with_capacity(texts.len());

        for text in texts {
            let request = GeminiEmbeddingRequest {
                model: format!("models/{}", DEFAULT_EMBEDDING_MODEL),
                content: GeminiContent {
                    role: "user".to_string(),
                    parts: vec![GeminiPart {
                        text: Some(text.to_string()),
                        inline_data: None,
                    }],
                },
            };

            let url =
                self.build_api_url(&format!("models/{}:embedContent", DEFAULT_EMBEDDING_MODEL));

            let resp = self.client.post(&url).json(&request).send().await?;

            let status = resp.status();
            if !status.is_success() {
                let msg = resp.text().await.unwrap_or_default();
                anyhow::bail!("Google Gemini Embeddings API returned {status}: {msg}");
            }

            let response: GeminiEmbeddingResponse = resp.json().await?;
            embeddings.push(response.embedding.values);
        }

        Ok(Some(embeddings))
    }

    async fn list_models(&self) -> Result<Option<Vec<ModelInfo>>, anyhow::Error> {
        // Try to fetch from Google API first
        let url = format!(
            "{}/models?key={}",
            self.base_url.trim_end_matches('/'),
            self.api_key
        );

        let resp = self.client.get(&url).send().await;

        match resp {
            Ok(response) if response.status().is_success() => {
                let payload: serde_json::Value = response.json().await?;
                let models_data = payload
                    .get("models")
                    .and_then(|v| v.as_array())
                    .cloned()
                    .unwrap_or_default();

                if !models_data.is_empty() {
                    let models: Vec<ModelInfo> = models_data
                        .iter()
                        .filter_map(|m| {
                            let id = m.get("name")?.as_str()?;
                            // Extract model ID from "models/model-id" format
                            let model_id = id.strip_prefix("models/").unwrap_or(id);
                            let display_name = m.get("displayName").and_then(|v| v.as_str())?;
                            let supported = get_model_endpoints(model_id);

                            Some(ModelInfo {
                                id: model_id.to_string(),
                                name: display_name.to_string(),
                                vendor: Some("Google".to_string()),
                                supported_endpoints: supported,
                                is_default: model_id == "gemini-2.0-flash-latest",
                                ..Default::default()
                            })
                        })
                        .collect();

                    if !models.is_empty() {
                        return Ok(Some(models));
                    }
                }
            }
            Ok(response) => {
                tracing::debug!(status = %response.status(), "Google models API returned non-success status");
            }
            Err(e) => {
                tracing::debug!(error = %e, "Failed to fetch Google models from API");
            }
        }

        // Fallback to static list if API fails or returns empty
        Ok(Some(get_fallback_google_models()))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

/// Return fallback list of known Google Gemini models.
///
/// This is used when the Google API model listing fails or returns no models.
/// The list includes common Gemini models with their supported endpoints.
///
/// Note: This list may not include the very latest models. For the most
/// up-to-date list, ensure API connectivity to Google Generative Language API.
fn get_fallback_google_models() -> Vec<ModelInfo> {
    vec![
        ModelInfo {
            id: "gemini-2.0-flash-latest".to_string(),
            name: "Gemini 2.0 Flash".to_string(),
            vendor: Some("Google".to_string()),
            supported_endpoints: vec!["chat".to_string(), "embeddings".to_string()],
            is_default: true,
            ..Default::default()
        },
        ModelInfo {
            id: "gemini-2.0-flash-thinking-exp".to_string(),
            name: "Gemini 2.0 Flash Thinking".to_string(),
            vendor: Some("Google".to_string()),
            supported_endpoints: vec!["chat".to_string()],
            is_default: false,
            ..Default::default()
        },
        ModelInfo {
            id: "gemini-1.5-pro-latest".to_string(),
            name: "Gemini 1.5 Pro".to_string(),
            vendor: Some("Google".to_string()),
            supported_endpoints: vec!["chat".to_string()],
            is_default: false,
            ..Default::default()
        },
        ModelInfo {
            id: "gemini-1.5-flash-latest".to_string(),
            name: "Gemini 1.5 Flash".to_string(),
            vendor: Some("Google".to_string()),
            supported_endpoints: vec!["chat".to_string()],
            is_default: false,
            ..Default::default()
        },
        ModelInfo {
            id: "text-embedding-004".to_string(),
            name: "Text Embedding 004".to_string(),
            vendor: Some("Google".to_string()),
            supported_endpoints: vec!["embeddings".to_string()],
            is_default: false,
            ..Default::default()
        },
    ]
}

/// Get supported endpoints for a Google model based on its ID.
fn get_model_endpoints(model_id: &str) -> Vec<String> {
    if model_id.contains("embedding") {
        vec!["embeddings".to_string()]
    } else {
        vec!["chat".to_string()]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn construct_with_config() {
        let p = GoogleProvider::with_config(
            "test-api-key".into(),
            "https://generativelanguage.googleapis.com/v1beta".into(),
            "gemini-2.0-flash-latest".into(),
        );
        assert_eq!(p.model, "gemini-2.0-flash-latest");
    }

    #[test]
    fn parse_data_uri_valid() {
        let uri = "data:image/png;base64,iVBORw0KGgo=";
        let result = parse_data_uri(uri);
        assert!(result.is_some());
        let (mime, data) = result.unwrap();
        assert_eq!(mime, "image/png");
        assert_eq!(data, "iVBORw0KGgo=");
    }

    #[test]
    fn parse_data_uri_no_base64() {
        let uri = "data:text/plain,hello";
        let result = parse_data_uri(uri);
        assert!(result.is_some());
        let (mime, data) = result.unwrap();
        assert_eq!(mime, "text/plain");
        assert_eq!(data, "hello");
    }

    #[test]
    fn parse_data_uri_invalid() {
        let uri = "not-a-data-uri";
        let result = parse_data_uri(uri);
        assert!(result.is_none());
    }

    #[test]
    fn messages_to_contents_conversion() {
        let p = GoogleProvider::with_config(
            "test".into(),
            "https://example.com".into(),
            "gemini-2.0-flash-latest".into(),
        );

        let messages = vec![
            ChatMessage::system("You are helpful"),
            ChatMessage::user("Hello"),
            ChatMessage::assistant("Hi there"),
        ];

        let contents = p.messages_to_contents(&messages);
        assert_eq!(contents.len(), 3);
        assert_eq!(contents[0].role, "user"); // system -> user
        assert_eq!(contents[1].role, "user");
        assert_eq!(contents[2].role, "model"); // assistant -> model
    }

    #[test]
    fn extract_text_from_content() {
        let p = GoogleProvider::with_config(
            "test".into(),
            "https://example.com".into(),
            "gemini-2.0-flash-latest".into(),
        );

        let content = GeminiContent {
            role: "model".to_string(),
            parts: vec![
                GeminiPart {
                    text: Some("Hello ".to_string()),
                    inline_data: None,
                },
                GeminiPart {
                    text: Some("world".to_string()),
                    inline_data: None,
                },
            ],
        };

        let text = p.extract_text(&content);
        assert_eq!(text, "Hello world");
    }

    #[test]
    fn extract_text_empty_content() {
        let p = GoogleProvider::with_config(
            "test".into(),
            "https://example.com".into(),
            "gemini-2.0-flash-latest".into(),
        );

        let content = GeminiContent {
            role: "model".to_string(),
            parts: vec![],
        };

        let text = p.extract_text(&content);
        assert_eq!(text, "");
    }
}
