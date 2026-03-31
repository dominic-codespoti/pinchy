//! Amazon Bedrock chat-completions provider.
//!
//! Communicates with the Amazon Bedrock Runtime API using the Converse API.
//! Uses AWS Signature Version 4 for request signing.

use std::any::Any;
use std::pin::Pin;
use std::time::SystemTime;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::{
    header::{self, HeaderMap},
    Client,
};
use serde_json::json;

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Encode bytes as hex string
fn hex_encode(data: &[u8]) -> String {
    const HEX_CHARS: &[u8] = b"0123456789abcdef";
    let mut result = String::with_capacity(data.len() * 2);
    for byte in data {
        result.push(HEX_CHARS[(byte >> 4) as usize] as char);
        result.push(HEX_CHARS[(byte & 0xf) as usize] as char);
    }
    result
}

/// Base URL for Bedrock Runtime API (region interpolated).
pub const BEDROCK_RUNTIME_BASE: &str = "https://bedrock-runtime.{region}.amazonaws.com";

/// Cross-region inference prefixes.
pub const CROSS_REGION_PREFIXES: &[&str] = &["us.", "eu.", "global.", "jp.", "apac.", "au."];

/// AWS credential types for Bedrock authentication.
#[derive(Debug, Clone)]
pub enum AwsCredentials {
    /// Direct access key credentials.
    AccessKey {
        access_key: String,
        secret_key: String,
        session_token: Option<String>,
    },
    /// Bearer token for temporary access.
    BearerToken(String),
    /// AWS CLI profile name.
    Profile(String),
}

impl AwsCredentials {
    /// Create credentials from environment variables.
    ///
    /// Checks in order:
    /// 1. `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` (+ optional `AWS_SESSION_TOKEN`)
    /// 2. `AWS_BEARER_TOKEN_BEDROCK`
    /// 3. `AWS_PROFILE` (defaults to "default")
    pub fn from_env() -> anyhow::Result<Self> {
        // Check for access key credentials
        if let (Ok(access_key), Ok(secret_key)) = (
            std::env::var("AWS_ACCESS_KEY_ID"),
            std::env::var("AWS_SECRET_ACCESS_KEY"),
        ) {
            let session_token = std::env::var("AWS_SESSION_TOKEN").ok();
            return Ok(Self::AccessKey {
                access_key,
                secret_key,
                session_token,
            });
        }

        // Check for bearer token
        if let Ok(token) = std::env::var("AWS_BEARER_TOKEN_BEDROCK") {
            return Ok(Self::BearerToken(token));
        }

        // Fall back to profile
        let profile = std::env::var("AWS_PROFILE").unwrap_or_else(|_| "default".to_string());
        Ok(Self::Profile(profile))
    }

    /// Get the access key ID if available.
    fn access_key_id(&self) -> Option<&str> {
        match self {
            Self::AccessKey { access_key, .. } => Some(access_key),
            _ => None,
        }
    }

    /// Get the secret access key if available.
    fn secret_access_key(&self) -> Option<&str> {
        match self {
            Self::AccessKey { secret_key, .. } => Some(secret_key),
            _ => None,
        }
    }

    /// Get the session token if available.
    fn session_token(&self) -> Option<&str> {
        match self {
            Self::AccessKey { session_token, .. } => session_token.as_deref(),
            _ => None,
        }
    }
}

/// Amazon Bedrock model provider.
pub struct BedrockProvider {
    region: String,
    model_id: String,
    credentials: AwsCredentials,
    endpoint: String,
    client: Client,
}

impl BedrockProvider {
    /// Create a new Bedrock provider with explicit configuration.
    pub fn new(region: String, model_id: String, credentials: AwsCredentials) -> Self {
        let endpoint = format!(
            "{}/model/{}/converse",
            Self::build_base_url(&region),
            model_id
        );
        Self {
            region,
            model_id,
            credentials,
            endpoint,
            client: super::get_shared_http_client(),
        }
    }

    /// Create a provider from environment variables.
    ///
    /// Uses `AWS_REGION` or `AWS_DEFAULT_REGION` for the region if not specified.
    pub fn from_env(model_id: String) -> anyhow::Result<Self> {
        let region = std::env::var("AWS_REGION")
            .or_else(|_| std::env::var("AWS_DEFAULT_REGION"))
            .map_err(|_| anyhow::anyhow!("AWS_REGION or AWS_DEFAULT_REGION must be set"))?;
        let credentials = AwsCredentials::from_env()?;
        Ok(Self::new(region, model_id, credentials))
    }

    /// Create a provider with a custom endpoint.
    pub fn with_endpoint(
        region: String,
        model_id: String,
        credentials: AwsCredentials,
        endpoint: String,
    ) -> Self {
        let converse_url = format!(
            "{}/model/{}/converse",
            endpoint.trim_end_matches('/'),
            model_id
        );
        Self {
            region,
            model_id,
            credentials,
            endpoint: converse_url,
            client: super::get_shared_http_client(),
        }
    }

    /// Build the base URL for the Bedrock Runtime API.
    fn build_base_url(region: &str) -> String {
        BEDROCK_RUNTIME_BASE.replace("{region}", region)
    }

    /// Check if a model ID uses cross-region inference.
    pub fn is_cross_region_model(model_id: &str) -> bool {
        CROSS_REGION_PREFIXES
            .iter()
            .any(|prefix| model_id.starts_with(prefix))
    }

    /// Strip cross-region prefix from model ID for API calls.
    pub fn strip_cross_region_prefix(model_id: &str) -> &str {
        for prefix in CROSS_REGION_PREFIXES {
            if let Some(stripped) = model_id.strip_prefix(prefix) {
                return stripped;
            }
        }
        model_id
    }

    /// Sign a request using AWS Signature Version 4.
    ///
    /// This is a simplified SigV4 implementation. For production use,
    /// consider using the official `aws-sigv4` crate.
    fn sign_request(
        &self,
        method: &str,
        uri: &str,
        headers: &mut HeaderMap,
        payload: &[u8],
    ) -> anyhow::Result<()> {
        let access_key = self
            .credentials
            .access_key_id()
            .ok_or_else(|| anyhow::anyhow!("Access key ID not available for signing"))?;
        let secret_key = self
            .credentials
            .secret_access_key()
            .ok_or_else(|| anyhow::anyhow!("Secret access key not available for signing"))?;

        let now = SystemTime::now();
        let datetime = chrono::DateTime::<chrono::Utc>::from(now);
        let date_stamp = datetime.format("%Y%m%d").to_string();
        let amz_date = datetime.format("%Y%m%dT%H%M%SZ").to_string();

        // Service and region
        let service = "bedrock";
        let region = &self.region;

        // Add required headers
        headers.insert("host", uri.parse()?);
        headers.insert("x-amz-date", amz_date.parse()?);

        if let Some(token) = self.credentials.session_token() {
            headers.insert("x-amz-security-token", token.parse()?);
        }

        // Compute payload hash
        let payload_hash = sha256_hash(payload);
        headers.insert("x-amz-content-sha256", payload_hash.parse()?);

        // Create canonical request
        let canonical_headers = Self::build_canonical_headers(headers);
        let signed_headers = Self::build_signed_headers(headers);

        let canonical_request = format!(
            "{method}\n{uri}\n\n{canonical_headers}\n{signed_headers}\n{payload_hash}",
            method = method,
            uri = uri
                .trim_start_matches("https://")
                .find('/')
                .map(|i| &uri[i..])
                .unwrap_or("/"),
            canonical_headers = canonical_headers,
            signed_headers = signed_headers,
            payload_hash = payload_hash
        );

        // Create string to sign
        let credential_scope = format!("{}/{}/{}/aws4_request", date_stamp, region, service);
        let canonical_request_hash = sha256_hash(canonical_request.as_bytes());
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{}\n{}\n{}",
            amz_date, credential_scope, canonical_request_hash
        );

        // Calculate signature
        let signing_key = Self::get_signature_key(secret_key, &date_stamp, region, service);
        let signature = hmac_sha256_hex(&signing_key, string_to_sign.as_bytes());

        // Add authorization header
        let auth_header = format!(
            "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
            access_key, credential_scope, signed_headers, signature
        );
        headers.insert(header::AUTHORIZATION, auth_header.parse()?);

        Ok(())
    }

    /// Build canonical headers string for SigV4.
    fn build_canonical_headers(headers: &HeaderMap) -> String {
        let mut canonical = String::new();
        let mut header_names: Vec<_> = headers.keys().map(|k| k.as_str().to_lowercase()).collect();
        header_names.sort_unstable();

        for name in header_names {
            if let Some(values) = headers.get_all(&name).iter().next() {
                let value = values.to_str().unwrap_or("").trim();
                canonical.push_str(&format!("{}:{}\n", name, value));
            }
        }
        canonical
    }

    /// Build signed headers list for SigV4.
    fn build_signed_headers(headers: &HeaderMap) -> String {
        let mut names: Vec<_> = headers.keys().map(|k| k.as_str().to_lowercase()).collect();
        names.sort_unstable();
        names.join(";")
    }

    /// Derive the signature key for SigV4.
    fn get_signature_key(secret: &str, date: &str, region: &str, service: &str) -> Vec<u8> {
        let k_date = hmac_sha256(format!("AWS4{}", secret).as_bytes(), date.as_bytes());
        let k_region = hmac_sha256(&k_date, region.as_bytes());
        let k_service = hmac_sha256(&k_region, service.as_bytes());
        hmac_sha256(&k_service, b"aws4_request")
    }

    /// Convert ChatMessage to Bedrock Converse API format.
    fn convert_messages(messages: &[ChatMessage]) -> Vec<serde_json::Value> {
        messages
            .iter()
            .map(|m| {
                let role = match m.role.as_str() {
                    "system" => "system",
                    "user" => "user",
                    "assistant" => "assistant",
                    "tool" => "user", // Bedrock doesn't have tool role, use user
                    _ => "user",
                };

                let content = if m.role == "tool" {
                    // Tool results are formatted as text
                    json!([{"text": format!("Tool {} result: {}", 
                        m.tool_call_id.as_deref().unwrap_or("unknown"), 
                        m.content)}])
                } else if !m.images.is_empty() {
                    // Multi-modal content with images
                    let mut parts = vec![json!({"text": m.content})];
                    for img_url in &m.images {
                        if img_url.starts_with("data:") {
                            // Parse data URI
                            if let Some((mime_type, base64_data)) = Self::parse_data_uri(img_url) {
                                let format = match mime_type.as_str() {
                                    "image/jpeg" => "jpeg",
                                    "image/png" => "png",
                                    "image/gif" => "gif",
                                    "image/webp" => "webp",
                                    _ => "png",
                                };
                                parts.push(json!({
                                    "image": {
                                        "format": format,
                                        "source": {
                                            "bytes": base64_data
                                        }
                                    }
                                }));
                            }
                        }
                    }
                    json!(parts)
                } else {
                    json!([{"text": m.content}])
                };

                json!({
                    "role": role,
                    "content": content
                })
            })
            .collect()
    }

    /// Parse a data URI into (mime_type, base64_data).
    fn parse_data_uri(uri: &str) -> Option<(String, String)> {
        let without_prefix = uri.strip_prefix("data:")?;
        let (mime_type, rest) = without_prefix.split_once(";base64,")?;
        Some((mime_type.to_string(), rest.to_string()))
    }

    /// Build the request body for the Converse API.
    fn build_request_body(
        &self,
        messages: &[ChatMessage],
        system_prompt: Option<&str>,
        max_tokens: Option<u32>,
        temperature: Option<f32>,
        tools: Option<&[serde_json::Value]>,
    ) -> serde_json::Value {
        let mut body = json!({
            "messages": Self::convert_messages(messages)
        });

        if let Some(system) = system_prompt {
            body["system"] = json!([{"text": system}]);
        }

        let mut inference_config = serde_json::Map::new();
        if let Some(max) = max_tokens {
            inference_config.insert("maxTokens".to_string(), json!(max));
        }
        if let Some(temp) = temperature {
            inference_config.insert("temperature".to_string(), json!(temp));
        }
        if !inference_config.is_empty() {
            body["inferenceConfig"] = serde_json::Value::Object(inference_config);
        }

        if let Some(tool_list) = tools {
            if !tool_list.is_empty() {
                let tool_specs: Vec<serde_json::Value> = tool_list
                    .iter()
                    .map(|tool| {
                        // Convert from OpenAI format to Bedrock tool format
                        if tool.get("type").and_then(|t| t.as_str()) == Some("function") {
                            let func = tool.get("function").cloned().unwrap_or_else(|| json!({}));
                            json!({
                                "toolSpec": {
                                    "name": func.get("name").cloned().unwrap_or(json!("")),
                                    "description": func.get("description").cloned().unwrap_or(json!("")),
                                    "inputSchema": {
                                        "json": func.get("parameters").cloned().unwrap_or(json!({}))
                                    }
                                }
                            })
                        } else {
                            // Assume it's already in a compatible format
                            json!({"toolSpec": tool})
                        }
                    })
                    .collect();
                body["toolConfig"] = json!({
                    "tools": tool_specs,
                    "toolChoice": {"auto": {}}
                });
            }
        }

        body
    }

    /// Parse the response from the Converse API.
    fn parse_response(&self, json: &serde_json::Value) -> anyhow::Result<ProviderResponse> {
        if let Some(error) = json.get("message").and_then(|m| m.as_str()) {
            anyhow::bail!("Bedrock API error: {}", error);
        }

        if let Some(stop_reason) = json.get("stopReason").and_then(|s| s.as_str()) {
            if stop_reason == "tool_use" {
                // Parse tool calls
                if let Some(output) = json.get("output").and_then(|o| o.get("message")) {
                    if let Some(content) = output.get("content").and_then(|c| c.as_array()) {
                        let tool_uses: Vec<_> = content
                            .iter()
                            .filter(|c| c.get("toolUse").is_some())
                            .filter_map(|c| c.get("toolUse"))
                            .collect();

                        if tool_uses.len() == 1 {
                            let tool = &tool_uses[0];
                            let name = tool
                                .get("name")
                                .and_then(|n| n.as_str())
                                .unwrap_or("")
                                .to_string();
                            let tool_use_id = tool
                                .get("toolUseId")
                                .and_then(|id| id.as_str())
                                .unwrap_or("")
                                .to_string();
                            let input = tool.get("input").cloned().unwrap_or_else(|| json!({}));
                            return Ok(ProviderResponse::FunctionCall {
                                id: tool_use_id,
                                name,
                                arguments: input.to_string(),
                            });
                        } else if tool_uses.len() > 1 {
                            let items: Vec<super::FunctionCallItem> = tool_uses
                                .iter()
                                .filter_map(|tool| {
                                    let name = tool.get("name").and_then(|n| n.as_str())?;
                                    let id = tool
                                        .get("toolUseId")
                                        .and_then(|i| i.as_str())
                                        .unwrap_or("");
                                    let input = tool.get("input").cloned()?;
                                    Some(super::FunctionCallItem {
                                        id: id.to_string(),
                                        name: name.to_string(),
                                        arguments: input.to_string(),
                                    })
                                })
                                .collect();
                            return Ok(ProviderResponse::MultiFunctionCall(items));
                        }
                    }
                }
            }
        }

        // Extract text content
        if let Some(output) = json.get("output").and_then(|o| o.get("message")) {
            if let Some(content) = output.get("content").and_then(|c| c.as_array()) {
                let texts: Vec<String> = content
                    .iter()
                    .filter_map(|c| c.get("text").and_then(|t| t.as_str()))
                    .map(|s| s.to_string())
                    .collect();
                if !texts.is_empty() {
                    return Ok(ProviderResponse::Final(texts.join("")));
                }
            }
        }

        Ok(ProviderResponse::Final(String::new()))
    }

    /// Parse token usage from the response.
    fn parse_usage(&self, json: &serde_json::Value) -> Option<TokenUsage> {
        let usage = json.get("usage")?;
        Some(TokenUsage {
            prompt_tokens: usage
                .get("inputTokens")
                .and_then(|t| t.as_u64())
                .unwrap_or(0),
            completion_tokens: usage
                .get("outputTokens")
                .and_then(|t| t.as_u64())
                .unwrap_or(0),
            total_tokens: usage
                .get("totalTokens")
                .and_then(|t| t.as_u64())
                .unwrap_or(0),
            cached_tokens: 0,    // Bedrock doesn't expose cached tokens
            reasoning_tokens: 0, // Bedrock doesn't expose reasoning tokens
            model: self.model_id.clone(),
        })
    }

    /// Internal: Send chat with optional tools.
    pub async fn send_chat_with_functions_impl(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        // Extract system prompt from messages
        let system_prompt = messages
            .iter()
            .find(|m| m.is_system())
            .map(|m| m.content.as_str());
        let non_system: Vec<_> = messages
            .iter()
            .filter(|m| !m.is_system())
            .cloned()
            .collect();

        let body = self.build_request_body(
            &non_system,
            system_prompt,
            Some(4096),
            Some(0.7),
            Some(functions),
        );

        let payload = serde_json::to_vec(&body)?;
        let host = self
            .endpoint
            .trim_start_matches("https://")
            .split('/')
            .next()
            .unwrap_or("");
        let uri = format!("https://{}", host);

        let mut headers = HeaderMap::new();
        headers.insert(header::CONTENT_TYPE, "application/json".parse()?);
        headers.insert("host", host.parse()?);

        self.sign_request("POST", &uri, &mut headers, &payload)?;

        let resp = self
            .client
            .post(&self.endpoint)
            .headers(headers)
            .body(payload)
            .send()
            .await?;

        let status = resp.status();
        let response_text = resp.text().await?;

        if !status.is_success() {
            anyhow::bail!("Bedrock API returned {}: {}", status, response_text);
        }

        let json: serde_json::Value = serde_json::from_str(&response_text)?;
        let usage = self.parse_usage(&json);
        let response = self.parse_response(&json)?;

        Ok((response, usage))
    }
}

/// Compute SHA-256 hash and return as hex string.
fn sha256_hash(data: &[u8]) -> String {
    use ring::digest::{self, SHA256};
    let digest = digest::digest(&SHA256, data);
    hex_encode(digest.as_ref())
}

/// Compute HMAC-SHA256.
fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    use ring::hmac;
    let key = hmac::Key::new(hmac::HMAC_SHA256, key);
    let tag = hmac::sign(&key, data);
    tag.as_ref().to_vec()
}

/// Compute HMAC-SHA256 and return as hex string.
fn hmac_sha256_hex(key: &[u8], data: &[u8]) -> String {
    hex_encode(&hmac_sha256(key, data))
}

#[async_trait]
impl ModelProvider for BedrockProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let (response, _) = self.send_chat_with_functions_impl(messages, &[]).await?;
        match response {
            ProviderResponse::Final(text) => Ok(text),
            _ => Err(anyhow::anyhow!("Unexpected response type from Bedrock")),
        }
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        self.send_chat_with_functions_impl(messages, functions)
            .await
    }

    fn send_chat_stream<'a>(
        &'a self,
        _messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        // Bedrock supports streaming via the converse-stream endpoint
        // For now, fall back to non-streaming
        Box::pin(async_stream::try_stream! {
            let reply = Self::send_chat(self, _messages).await?;
            yield reply;
        })
    }

    async fn list_models(&self) -> Result<Option<Vec<super::ModelInfo>>, anyhow::Error> {
        let models = vec![
            super::ModelInfo {
                id: "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
                name: "Claude 3.5 Sonnet v2".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["chat".to_string()],
                is_default: true,
                ..Default::default()
            },
            super::ModelInfo {
                id: "anthropic.claude-3-5-haiku-20241022-v1:0".to_string(),
                name: "Claude 3.5 Haiku".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["chat".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "anthropic.claude-3-opus-20240229-v1:0".to_string(),
                name: "Claude 3 Opus".to_string(),
                vendor: Some("Anthropic".to_string()),
                supported_endpoints: vec!["chat".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "amazon.nova-pro-v1:0".to_string(),
                name: "Amazon Nova Pro".to_string(),
                vendor: Some("Amazon".to_string()),
                supported_endpoints: vec!["chat".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "amazon.nova-lite-v1:0".to_string(),
                name: "Amazon Nova Lite".to_string(),
                vendor: Some("Amazon".to_string()),
                supported_endpoints: vec!["chat".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "meta.llama3-1-405b-instruct-v1:0".to_string(),
                name: "Llama 3.1 405B Instruct".to_string(),
                vendor: Some("Meta".to_string()),
                supported_endpoints: vec!["chat".to_string()],
                is_default: false,
                ..Default::default()
            },
            super::ModelInfo {
                id: "mistral.mistral-large-2407-v1:0".to_string(),
                name: "Mistral Large 2".to_string(),
                vendor: Some("Mistral AI".to_string()),
                supported_endpoints: vec!["chat".to_string()],
                is_default: false,
                ..Default::default()
            },
        ];
        Ok(Some(models))
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_from_env_access_key() {
        // Clean up any conflicting env vars first to avoid test pollution
        std::env::remove_var("AWS_BEARER_TOKEN_BEDROCK");

        std::env::set_var("AWS_ACCESS_KEY_ID", "AKIAIOSFODNN7EXAMPLE");
        std::env::set_var(
            "AWS_SECRET_ACCESS_KEY",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        );

        let creds = AwsCredentials::from_env().unwrap();
        match creds {
            AwsCredentials::AccessKey {
                access_key,
                secret_key,
                session_token,
            } => {
                assert_eq!(access_key, "AKIAIOSFODNN7EXAMPLE");
                assert_eq!(secret_key, "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
                assert!(session_token.is_none());
            }
            _ => panic!("Expected AccessKey credentials"),
        }

        std::env::remove_var("AWS_ACCESS_KEY_ID");
        std::env::remove_var("AWS_SECRET_ACCESS_KEY");
    }

    #[test]
    fn credentials_from_env_bearer_token() {
        std::env::set_var("AWS_BEARER_TOKEN_BEDROCK", "test-bearer-token");
        std::env::remove_var("AWS_ACCESS_KEY_ID");
        std::env::remove_var("AWS_SECRET_ACCESS_KEY");

        let creds = AwsCredentials::from_env().unwrap();
        match creds {
            AwsCredentials::BearerToken(token) => {
                assert_eq!(token, "test-bearer-token");
            }
            _ => panic!("Expected BearerToken credentials"),
        }

        std::env::remove_var("AWS_BEARER_TOKEN_BEDROCK");
    }

    #[test]
    fn credentials_from_env_profile() {
        std::env::remove_var("AWS_ACCESS_KEY_ID");
        std::env::remove_var("AWS_SECRET_ACCESS_KEY");
        std::env::remove_var("AWS_BEARER_TOKEN_BEDROCK");
        std::env::set_var("AWS_PROFILE", "my-profile");

        let creds = AwsCredentials::from_env().unwrap();
        match creds {
            AwsCredentials::Profile(profile) => {
                assert_eq!(profile, "my-profile");
            }
            _ => panic!("Expected Profile credentials"),
        }

        std::env::remove_var("AWS_PROFILE");
    }

    #[test]
    fn credentials_default_profile() {
        std::env::remove_var("AWS_ACCESS_KEY_ID");
        std::env::remove_var("AWS_SECRET_ACCESS_KEY");
        std::env::remove_var("AWS_BEARER_TOKEN_BEDROCK");
        std::env::remove_var("AWS_PROFILE");

        let creds = AwsCredentials::from_env().unwrap();
        match creds {
            AwsCredentials::Profile(profile) => {
                assert_eq!(profile, "default");
            }
            _ => panic!("Expected Profile credentials with default"),
        }
    }

    #[test]
    fn provider_new() {
        let creds = AwsCredentials::AccessKey {
            access_key: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            session_token: None,
        };
        let provider = BedrockProvider::new(
            "us-east-1".to_string(),
            "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            creds,
        );

        assert_eq!(provider.region, "us-east-1");
        assert_eq!(
            provider.model_id,
            "anthropic.claude-3-5-sonnet-20241022-v2:0"
        );
        assert!(provider
            .endpoint
            .contains("bedrock-runtime.us-east-1.amazonaws.com"));
    }

    #[test]
    fn is_cross_region_model_detection() {
        assert!(BedrockProvider::is_cross_region_model(
            "us.anthropic.claude-3-sonnet"
        ));
        assert!(BedrockProvider::is_cross_region_model(
            "eu.anthropic.claude-3-sonnet"
        ));
        assert!(BedrockProvider::is_cross_region_model(
            "global.anthropic.claude-3-sonnet"
        ));
        assert!(BedrockProvider::is_cross_region_model(
            "jp.anthropic.claude-3-sonnet"
        ));
        assert!(BedrockProvider::is_cross_region_model(
            "apac.anthropic.claude-3-sonnet"
        ));
        assert!(BedrockProvider::is_cross_region_model(
            "au.anthropic.claude-3-sonnet"
        ));
        assert!(!BedrockProvider::is_cross_region_model(
            "anthropic.claude-3-sonnet"
        ));
    }

    #[test]
    fn strip_cross_region_prefix() {
        assert_eq!(
            BedrockProvider::strip_cross_region_prefix("us.anthropic.claude-3-sonnet"),
            "anthropic.claude-3-sonnet"
        );
        assert_eq!(
            BedrockProvider::strip_cross_region_prefix("eu.meta.llama3-1-405b"),
            "meta.llama3-1-405b"
        );
        assert_eq!(
            BedrockProvider::strip_cross_region_prefix("anthropic.claude-3-sonnet"),
            "anthropic.claude-3-sonnet"
        );
    }

    #[test]
    fn convert_messages_simple() {
        let messages = vec![
            ChatMessage::system("You are a helpful assistant."),
            ChatMessage::user("Hello!"),
            ChatMessage::assistant("Hi there!"),
        ];

        let converted = BedrockProvider::convert_messages(&messages);
        assert_eq!(converted.len(), 3);
        assert_eq!(converted[0]["role"], "system");
        assert_eq!(
            converted[0]["content"][0]["text"],
            "You are a helpful assistant."
        );
        assert_eq!(converted[1]["role"], "user");
        assert_eq!(converted[2]["role"], "assistant");
    }

    #[test]
    fn convert_messages_tool_role() {
        let message = ChatMessage {
            role: "tool".to_string(),
            content: "The weather is sunny".to_string(),
            tool_calls: None,
            tool_call_id: Some("tool_123".to_string()),
            images: Vec::new(),
        };

        let converted = BedrockProvider::convert_messages(&[message]);
        assert_eq!(converted[0]["role"], "user");
        assert!(converted[0]["content"][0]["text"]
            .as_str()
            .unwrap()
            .contains("tool_123"));
    }

    #[test]
    fn build_request_body_basic() {
        let creds = AwsCredentials::AccessKey {
            access_key: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            session_token: None,
        };
        let provider = BedrockProvider::new(
            "us-east-1".to_string(),
            "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            creds,
        );

        let messages = vec![ChatMessage::user("Hello!")];

        let body = provider.build_request_body(&messages, None, Some(1000), Some(0.5), None);

        assert!(body.get("messages").is_some());
        assert_eq!(body["inferenceConfig"]["maxTokens"], 1000);
        assert_eq!(body["inferenceConfig"]["temperature"], 0.5);
    }

    #[test]
    fn build_request_body_with_system() {
        let creds = AwsCredentials::AccessKey {
            access_key: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            session_token: None,
        };
        let provider = BedrockProvider::new(
            "us-east-1".to_string(),
            "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            creds,
        );

        let messages = vec![ChatMessage::user("Hello!")];
        let body = provider.build_request_body(&messages, Some("Be helpful"), None, None, None);

        assert!(body.get("system").is_some());
        assert_eq!(body["system"][0]["text"], "Be helpful");
    }

    #[test]
    fn parse_response_final() {
        let creds = AwsCredentials::AccessKey {
            access_key: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            session_token: None,
        };
        let provider = BedrockProvider::new(
            "us-east-1".to_string(),
            "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            creds,
        );

        let response = serde_json::json!({
            "output": {
                "message": {
                    "role": "assistant",
                    "content": [{"text": "Hello, how can I help you?"}]
                }
            },
            "stopReason": "end_turn",
            "usage": {
                "inputTokens": 10,
                "outputTokens": 20,
                "totalTokens": 30
            }
        });

        let result = provider.parse_response(&response).unwrap();
        match result {
            ProviderResponse::Final(text) => {
                assert_eq!(text, "Hello, how can I help you?");
            }
            _ => panic!("Expected Final response"),
        }
    }

    #[test]
    fn parse_response_tool_use() {
        let creds = AwsCredentials::AccessKey {
            access_key: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            session_token: None,
        };
        let provider = BedrockProvider::new(
            "us-east-1".to_string(),
            "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            creds,
        );

        let response = serde_json::json!({
            "output": {
                "message": {
                    "role": "assistant",
                    "content": [
                        {"toolUse": {
                            "toolUseId": "toolu_123",
                            "name": "get_weather",
                            "input": {"location": "Seattle"}
                        }}
                    ]
                }
            },
            "stopReason": "tool_use"
        });

        let result = provider.parse_response(&response).unwrap();
        match result {
            ProviderResponse::FunctionCall {
                id,
                name,
                arguments,
            } => {
                assert_eq!(id, "toolu_123");
                assert_eq!(name, "get_weather");
                assert!(arguments.contains("Seattle"));
            }
            _ => panic!("Expected FunctionCall response"),
        }
    }

    #[test]
    fn parse_usage() {
        let creds = AwsCredentials::AccessKey {
            access_key: "AKIAIOSFODNN7EXAMPLE".to_string(),
            secret_key: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY".to_string(),
            session_token: None,
        };
        let provider = BedrockProvider::new(
            "us-east-1".to_string(),
            "anthropic.claude-3-5-sonnet-20241022-v2:0".to_string(),
            creds,
        );

        let response = serde_json::json!({
            "usage": {
                "inputTokens": 100,
                "outputTokens": 50,
                "totalTokens": 150
            }
        });

        let usage = provider.parse_usage(&response).unwrap();
        assert_eq!(usage.prompt_tokens, 100);
        assert_eq!(usage.completion_tokens, 50);
        assert_eq!(usage.total_tokens, 150);
    }

    #[test]
    fn parse_data_uri() {
        let uri = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
        let (mime, data) = BedrockProvider::parse_data_uri(uri).unwrap();
        assert_eq!(mime, "image/png");
        assert!(!data.is_empty());
    }
}
