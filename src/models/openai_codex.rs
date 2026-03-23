//! OpenAI Codex backend provider.
//!
//! Uses the ChatGPT OAuth access_token (not an `sk-...` API key) against the
//! `chatgpt.com/backend-api/codex/responses` endpoint.  This gives ChatGPT
//! Plus/Pro subscribers access to Codex models (e.g. `gpt-5.1-codex`) that
//! are not available through the standard OpenAI API.
//!
//! ## Differences from [`OpenAIProvider`]
//!
//! | Aspect | `OpenAIProvider` | `OpenAICodexProvider` |
//! |---|---|---|
//! | Auth | `sk-...` API key | OAuth access_token |
//! | Endpoint | `api.openai.com/v1/chat/completions` | `chatgpt.com/backend-api/codex/responses` |
//! | Headers | `Authorization: Bearer <api_key>` | `Authorization: Bearer <access_token>` + `ChatGPT-Account-Id` |
//! | Token refresh | N/A (key doesn't expire) | Automatic refresh via OAuth refresh_token |

use std::any::Any;
use std::pin::Pin;
use std::sync::Arc;

use async_trait::async_trait;
use futures_core::Stream;
use reqwest::Client;
use serde_json::json;
use tokio::sync::RwLock;
use tracing::{debug, info, warn};

use super::{ChatMessage, ModelProvider, ProviderResponse, TokenUsage};

/// Codex backend API endpoint (same as OpenCode uses).
const CODEX_API_ENDPOINT: &str = "https://chatgpt.com/backend-api/codex/responses";

/// Provider that talks to the ChatGPT Codex backend API using OAuth tokens.
pub struct OpenAICodexProvider {
    /// Mutable auth state — refreshed automatically when the access token
    /// expires.
    auth: Arc<RwLock<CodexAuth>>,
    client: Client,
    /// Model name sent in the request body (e.g. "gpt-5.1-codex").
    model: String,
}

/// Internal auth state for the Codex provider.
struct CodexAuth {
    /// OAuth access token (used as Bearer token).
    access_token: String,
    /// ChatGPT account ID (sent as header).
    account_id: String,
    /// OAuth refresh token (for renewing the session).
    refresh_token: String,
    /// OAuth id_token (used for API key exchange on refresh).
    id_token: String,
    /// Token expiry as epoch milliseconds.
    expires: Option<i64>,
}

impl CodexAuth {
    /// Returns `true` if the access token has expired (or will expire within
    /// the next 60 seconds — a safety margin to avoid mid-request expiry).
    fn is_expired(&self) -> bool {
        match self.expires {
            Some(exp) => {
                let now_ms = chrono::Utc::now().timestamp_millis();
                now_ms >= (exp - 60_000) // 60s safety margin
            }
            None => false,
        }
    }
}

impl OpenAICodexProvider {
    /// Create a Codex provider from stored [`ChatGptAuth`] credentials.
    ///
    /// Returns an error if the auth doesn't contain an account ID.
    pub fn from_auth(
        auth: &crate::auth::openai_chatgpt::ChatGptAuth,
        model: String,
    ) -> anyhow::Result<Self> {
        let account_id = auth
            .account_id
            .clone()
            .or_else(|| {
                // Try extracting from the stored tokens as a fallback
                crate::auth::openai_chatgpt::extract_account_id_from_jwt(&auth.id_token).or_else(
                    || crate::auth::openai_chatgpt::extract_account_id_from_jwt(&auth.access_token),
                )
            })
            .ok_or_else(|| {
                anyhow::anyhow!(
                    "ChatGPT account ID not found — re-run the ChatGPT login flow \
                     so the account ID can be extracted from the JWT"
                )
            })?;

        debug!(
            account_id = %account_id,
            model = %model,
            "creating Codex provider"
        );

        Ok(Self {
            auth: Arc::new(RwLock::new(CodexAuth {
                access_token: auth.access_token.clone(),
                account_id,
                refresh_token: auth.refresh_token.clone(),
                id_token: auth.id_token.clone(),
                expires: auth.expires,
            })),
            client: super::get_shared_http_client(),
            model,
        })
    }

    /// Ensure the access token is valid, refreshing if needed.
    ///
    /// Returns `(access_token, account_id)`.
    async fn ensure_valid_token(&self) -> anyhow::Result<(String, String)> {
        {
            let auth = self.auth.read().await;
            if !auth.is_expired() {
                return Ok((auth.access_token.clone(), auth.account_id.clone()));
            }
        }

        // Token expired — refresh.
        let mut auth = self.auth.write().await;
        // Double-check after acquiring write lock (another task may have
        // refreshed while we were waiting).
        if !auth.is_expired() {
            return Ok((auth.access_token.clone(), auth.account_id.clone()));
        }

        info!("Codex access token expired — refreshing");
        let (new_id_token, new_access_token, new_refresh_token) =
            crate::auth::openai_chatgpt::refresh_tokens(&auth.refresh_token).await?;

        let new_account_id =
            crate::auth::openai_chatgpt::extract_account_id_from_jwt(&new_id_token)
                .or_else(|| {
                    crate::auth::openai_chatgpt::extract_account_id_from_jwt(&new_access_token)
                })
                .unwrap_or_else(|| auth.account_id.clone());

        let new_expires = crate::auth::openai_chatgpt::extract_expiry_from_jwt(&new_access_token);

        // Also update the persisted auth file so other processes / restarts
        // pick up the refreshed tokens. The Codex provider uses the OAuth
        // access token directly, so no API-key exchange is required here.
        let persisted = crate::auth::openai_chatgpt::ChatGptAuth {
            api_key: String::new(),
            access_token: new_access_token.clone(),
            refresh_token: new_refresh_token.clone(),
            id_token: new_id_token.clone(),
            last_refresh: chrono::Utc::now(),
            account_id: Some(new_account_id.clone()),
            expires: new_expires,
        };
        if let Err(e) = crate::auth::openai_chatgpt::store_auth(&persisted) {
            warn!("failed to persist refreshed Codex auth: {e}");
        }

        auth.access_token = new_access_token;
        auth.account_id = new_account_id.clone();
        auth.refresh_token = new_refresh_token;
        auth.id_token = new_id_token;
        auth.expires = new_expires;

        debug!("Codex access token refreshed successfully");
        Ok((auth.access_token.clone(), new_account_id))
    }

    /// Build a request with Codex-specific headers.
    fn build_request(
        &self,
        body: &serde_json::Value,
        access_token: &str,
        account_id: &str,
    ) -> reqwest::RequestBuilder {
        self.client
            .post(CODEX_API_ENDPOINT)
            .bearer_auth(access_token)
            .header("ChatGPT-Account-Id", account_id)
            .header("originator", "pinchy")
            .json(body)
    }
}

#[async_trait]
impl ModelProvider for OpenAICodexProvider {
    async fn send_chat(&self, messages: &[ChatMessage]) -> Result<String, anyhow::Error> {
        let (token, account_id) = self.ensure_valid_token().await?;

        let api_messages = super::serialize_messages(messages);
        let body = json!({
            "model": self.model,
            "messages": api_messages,
        });

        let resp = self
            .build_request(&body, &token, &account_id)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Codex API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        Ok(super::extract_content(&json))
    }

    async fn send_chat_with_functions(
        &self,
        messages: &[ChatMessage],
        functions: &[serde_json::Value],
    ) -> Result<(ProviderResponse, Option<TokenUsage>), anyhow::Error> {
        let (token, account_id) = self.ensure_valid_token().await?;

        let api_messages = super::serialize_messages(messages);
        let mut body = json!({
            "model": self.model,
            "messages": api_messages,
        });

        if !functions.is_empty() {
            let tools = super::wrap_in_function_tools(functions);
            body["tools"] = serde_json::Value::Array(tools);
            body["tool_choice"] = json!("auto");
        }

        let resp = self
            .build_request(&body, &token, &account_id)
            .send()
            .await?;

        let status = resp.status();
        if !status.is_success() {
            let text = resp.text().await.unwrap_or_default();
            anyhow::bail!("Codex API returned {status}: {text}");
        }

        let json: serde_json::Value = resp.json().await?;
        let usage = super::parse_token_usage(&json);

        if let Some(pr) = super::parse_tool_calls(&json) {
            return Ok((pr, usage));
        }

        Ok((
            ProviderResponse::Final(super::extract_content(&json)),
            usage,
        ))
    }

    fn send_chat_stream<'a>(
        &'a self,
        messages: &'a [ChatMessage],
    ) -> Pin<Box<dyn Stream<Item = Result<String, anyhow::Error>> + Send + 'a>> {
        Box::pin(async_stream::try_stream! {
            let (token, account_id) = self.ensure_valid_token().await?;

            let api_messages = super::serialize_messages(messages);
            let body = json!({
                "model": self.model,
                "messages": api_messages,
                "stream": true,
            });

            let resp = self
                .build_request(&body, &token, &account_id)
                .send()
                .await?;

            let status = resp.status();
            if !status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                Err(anyhow::anyhow!(
                    "Codex streaming API returned {status}: {text}"
                ))?;
                return;
            }

            let mut delta_stream = super::stream_sse_deltas(resp);
            use tokio_stream::StreamExt as _;
            while let Some(chunk) = delta_stream.next().await {
                yield chunk?;
            }
        })
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codex_auth_expiry_future() {
        let auth = CodexAuth {
            access_token: "at".into(),
            account_id: "acc".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            expires: Some(chrono::Utc::now().timestamp_millis() + 3_600_000),
        };
        assert!(!auth.is_expired());
    }

    #[test]
    fn codex_auth_expiry_past() {
        let auth = CodexAuth {
            access_token: "at".into(),
            account_id: "acc".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            expires: Some(chrono::Utc::now().timestamp_millis() - 1000),
        };
        assert!(auth.is_expired());
    }

    #[test]
    fn codex_auth_no_expiry() {
        let auth = CodexAuth {
            access_token: "at".into(),
            account_id: "acc".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            expires: None,
        };
        // No expiry means we assume the token is valid.
        assert!(!auth.is_expired());
    }

    #[test]
    fn codex_auth_safety_margin() {
        // Token expires in 30 seconds — within the 60s safety margin.
        let auth = CodexAuth {
            access_token: "at".into(),
            account_id: "acc".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            expires: Some(chrono::Utc::now().timestamp_millis() + 30_000),
        };
        assert!(auth.is_expired());
    }

    #[test]
    fn codex_endpoint_is_correct() {
        assert_eq!(
            CODEX_API_ENDPOINT,
            "https://chatgpt.com/backend-api/codex/responses"
        );
    }
}
