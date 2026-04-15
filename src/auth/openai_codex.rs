//! OpenAI Codex authentication (Kilo-aligned).
//!
//! Implements Kilo-style OAuth flows for OpenAI / Codex:
//! - ChatGPT Pro/Plus (browser) - OAuth with PKCE + local callback
//! - ChatGPT Pro/Plus (headless/device) - Device authorization flow
//! - Manually enter API Key - Standard API key auth
//!
//! Based on:
//! - /packages/opencode/src/plugin/codex.ts
//! - /packages/plugin/src/index.ts

use crate::auth::provider_auth::{AuthFlowMethod, AuthMethod, Authorization};
use crate::auth::ProviderAuthInfo;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::digest;
use ring::rand::{SecureRandom, SystemRandom};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::{debug, error, info, warn};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// OpenAI OAuth client ID for Codex CLI.
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

/// OpenAI OAuth issuer.
const ISSUER: &str = "https://auth.openai.com";

/// Codex API endpoint.
const _CODEX_API_ENDPOINT: &str = "https://chatgpt.com/backend-api/codex/responses";

/// Local OAuth callback port.
const OAUTH_PORT: u16 = 1455;

/// OAuth polling safety margin (milliseconds).
const OAUTH_POLLING_SAFETY_MARGIN_MS: u64 = 3000;

/// Device auth polling interval base (seconds).
const DEVICE_POLL_INTERVAL_SECS: u64 = 5;

/// OAuth flow timeout (5 minutes).
const OAUTH_FLOW_TIMEOUT_SECS: u64 = 300;

// ---------------------------------------------------------------------------
// OAuth State Management
// ---------------------------------------------------------------------------

/// Pending OAuth state with expiry and tracking for browser flow completion.
#[derive(Debug, Clone)]
struct PendingOAuthState {
    pkce_verifier: String,
    _state: String,
    created_at: Instant,
    method: OpenAiAuthMethod,
    /// Track if the browser callback has completed
    status: OAuthStatus,
    /// Provider ID (openai or openai-codex)
    provider: String,
}

/// OAuth flow status for tracking browser completion.
#[derive(Debug, Clone)]
pub enum OAuthStatus {
    Pending,
    Success {
        access_token: String,
        refresh_token: String,
        expires_at: u64,
    },
    Failed {
        error: String,
    },
}

/// Which OpenAI auth method is pending.
#[derive(Debug, Clone, Copy)]
pub enum OpenAiAuthMethod {
    Browser,
    Headless,
}

/// OAuth state store for CSRF protection and flow tracking.
/// States expire after 10 minutes (600 seconds).
static OAUTH_STATE_STORE: Mutex<Option<HashMap<String, PendingOAuthState>>> = Mutex::new(None);

const STATE_EXPIRY_SECONDS: u64 = 600;

/// Store a new OAuth state.
pub fn store_oauth_state(
    state: &str,
    pkce_verifier: &str,
    method: OpenAiAuthMethod,
    provider: &str,
) -> anyhow::Result<()> {
    let mut guard = OAUTH_STATE_STORE
        .lock()
        .map_err(|e| anyhow::anyhow!("OAuth state store poisoned: {}", e))?;
    let store = guard.get_or_insert_with(HashMap::new);

    // Clean up expired states
    let now = Instant::now();
    store.retain(|_, v| {
        now.duration_since(v.created_at) < Duration::from_secs(STATE_EXPIRY_SECONDS)
    });

    store.insert(
        state.to_string(),
        PendingOAuthState {
            pkce_verifier: pkce_verifier.to_string(),
            _state: state.to_string(),
            created_at: now,
            method,
            status: OAuthStatus::Pending,
            provider: provider.to_string(),
        },
    );

    debug!(state = %state, provider = %provider, "Stored OpenAI OAuth state");
    Ok(())
}

/// Validate and consume an OAuth state, returning the associated data.
/// Returns None if the state is invalid or expired.
pub fn validate_oauth_state(state: &str) -> Option<(String, OpenAiAuthMethod, String)> {
    let mut guard = OAUTH_STATE_STORE.lock().ok()?;
    let store = guard.as_mut()?;

    // Clean up expired states
    let now = Instant::now();
    store.retain(|_, v| {
        now.duration_since(v.created_at) < Duration::from_secs(STATE_EXPIRY_SECONDS)
    });

    // Find and remove the matching state
    store.remove(state).map(|pending| {
        debug!(state = %state, "Validated and consumed OpenAI OAuth state");
        (pending.pkce_verifier, pending.method, pending.provider)
    })
}

/// Peek at an OAuth state without consuming it - for callback validation.
/// Returns None if the state is invalid or expired.
pub fn peek_oauth_state(state: &str) -> Option<(String, OpenAiAuthMethod, String)> {
    let guard = OAUTH_STATE_STORE.lock().ok()?;
    let store = guard.as_ref()?;

    // Clean up expired states in a copy (don't modify during peek)
    let now = Instant::now();
    store.get(state).and_then(|pending| {
        // Check expiry without modifying store
        if now.duration_since(pending.created_at) < Duration::from_secs(STATE_EXPIRY_SECONDS) {
            debug!(state = %state, "Peeked OpenAI OAuth state");
            Some((
                pending.pkce_verifier.clone(),
                pending.method,
                pending.provider.clone(),
            ))
        } else {
            None
        }
    })
}

/// Consume an OAuth state after successful validation - for use after peek.
/// Returns true if the state was found and removed.
pub fn consume_oauth_state(state: &str) -> bool {
    let mut guard = match OAUTH_STATE_STORE.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    let store = match guard.as_mut() {
        Some(s) => s,
        None => return false,
    };

    store.remove(state).is_some()
}

/// Get the current status of an OAuth flow without consuming it.
pub fn get_oauth_status(state: &str) -> Option<OAuthStatus> {
    let guard = OAUTH_STATE_STORE.lock().ok()?;
    let store = guard.as_ref()?;
    store.get(state).map(|s| s.status.clone())
}

/// Update the status of a pending OAuth flow.
pub fn update_oauth_status(state: &str, status: OAuthStatus) -> anyhow::Result<()> {
    let mut guard = OAUTH_STATE_STORE
        .lock()
        .map_err(|e| anyhow::anyhow!("OAuth state store poisoned: {}", e))?;
    let store = guard
        .as_mut()
        .ok_or_else(|| anyhow::anyhow!("No state store"))?;

    if let Some(pending) = store.get_mut(state) {
        pending.status = status;
        Ok(())
    } else {
        Err(anyhow::anyhow!("OAuth state not found: {}", state))
    }
}

/// Check if an OAuth flow is complete (success or failed).
/// Returns Some(true) if complete, Some(false) if pending, or None if state not found.
pub fn is_oauth_complete(state: &str) -> Option<bool> {
    let guard = OAUTH_STATE_STORE.lock().ok()?;
    let store = guard.as_ref()?;
    let pending = store.get(state)?;
    Some(match pending.status {
        OAuthStatus::Pending => false,
        OAuthStatus::Success { .. } | OAuthStatus::Failed { .. } => true,
    })
}

/// Clear all pending OAuth states (useful for testing).
pub fn clear_oauth_states() {
    if let Ok(mut guard) = OAUTH_STATE_STORE.lock() {
        *guard = None;
    }
}

// ---------------------------------------------------------------------------
// PKCE Helpers
// ---------------------------------------------------------------------------

/// PKCE code verifier/challenge pair.
#[derive(Debug, Clone)]
pub struct PkceCodes {
    pub verifier: String,
    pub challenge: String,
}

/// Generate PKCE codes for OAuth.
pub fn generate_pkce() -> anyhow::Result<PkceCodes> {
    let verifier = generate_code_verifier()?;
    let challenge = code_challenge(&verifier);
    Ok(PkceCodes {
        verifier,
        challenge,
    })
}

/// Generate a PKCE code verifier (64 random bytes, base64url-encoded).
pub fn generate_code_verifier() -> anyhow::Result<String> {
    let rng = SystemRandom::new();
    let mut buf = [0u8; 64];
    rng.fill(&mut buf)
        .map_err(|_| anyhow::anyhow!("failed to generate random bytes for PKCE verifier"))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// Derive the S256 code challenge from a code verifier.
pub fn code_challenge(verifier: &str) -> String {
    let hash = digest::digest(&digest::SHA256, verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash.as_ref())
}

/// Generate a random state parameter for CSRF protection.
pub fn generate_state() -> anyhow::Result<String> {
    let rng = SystemRandom::new();
    let mut buf = [0u8; 32];
    rng.fill(&mut buf)
        .map_err(|_| anyhow::anyhow!("failed to generate random bytes for OAuth state"))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// Generate a random string of specified length.
pub fn generate_random_string(length: usize) -> anyhow::Result<String> {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let rng = SystemRandom::new();
    let mut buf = vec![0u8; length];
    rng.fill(&mut buf)
        .map_err(|_| anyhow::anyhow!("failed to generate random bytes"))?;

    let result: String = buf
        .iter()
        .map(|b| CHARS[(*b as usize) % CHARS.len()] as char)
        .collect();

    Ok(result)
}

// ---------------------------------------------------------------------------
// OAuth URL Building
// ---------------------------------------------------------------------------

/// Build the OpenAI OAuth authorization URL for browser flow.
pub fn build_authorize_url(
    redirect_uri: &str,
    pkce: &PkceCodes,
    state: &str,
    originator: &str,
) -> String {
    let params = [
        ("response_type", "code"),
        ("client_id", CLIENT_ID),
        ("redirect_uri", redirect_uri),
        ("scope", "openid profile email offline_access"),
        ("code_challenge", &pkce.challenge),
        ("code_challenge_method", "S256"),
        ("id_token_add_organizations", "true"),
        ("codex_cli_simplified_flow", "true"),
        ("state", state),
        ("originator", originator),
    ];

    let query: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", url_encode(k), url_encode(v)))
        .collect();

    format!("{}/oauth/authorize?{}", ISSUER, query.join("&"))
}

/// URL-encode a string for query parameters (RFC 3986).
fn url_encode(s: &str) -> String {
    let mut result = String::with_capacity(s.len() * 2);
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                result.push(byte as char);
            }
            _ => {
                result.push('%');
                result.push_str(&format!("{:02X}", byte));
            }
        }
    }
    result
}

// ---------------------------------------------------------------------------
// HTML Response Templates
// ---------------------------------------------------------------------------

/// HTML success page shown to the user after successful OAuth.
fn html_success(provider: &str) -> String {
    format!(
        r#"<!doctype html>
<html>
  <head>
    <title>Pinchy - {} Authorization Successful</title>
    <style>
      body {{
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #0f0f0f;
        color: #f1ecec;
      }}
      .container {{
        text-align: center;
        padding: 2rem;
      }}
      h1 {{
        color: #22c55e;
        margin-bottom: 1rem;
      }}
      p {{
        color: #b7b1b1;
      }}
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Successful</h1>
      <p>You can close this window and return to Pinchy.</p>
    </div>
    <script>
      setTimeout(() => window.close(), 3000);
    </script>
  </body>
</html>"#,
        provider
    )
}

/// HTML error page shown to the user after failed OAuth.
fn html_error(error: &str, _provider: &str) -> String {
    format!(
        r#"<!doctype html>
<html>
  <head>
    <title>Pinchy - Authorization Failed</title>
    <style>
      body {{
        font-family: system-ui, -apple-system, sans-serif;
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        margin: 0;
        background: #0f0f0f;
        color: #f1ecec;
      }}
      .container {{
        text-align: center;
        padding: 2rem;
      }}
      h1 {{
        color: #fc533a;
        margin-bottom: 1rem;
      }}
      p {{
        color: #b7b1b1;
      }}
      .error {{
        color: #ff917b;
        font-family: monospace;
        margin-top: 1rem;
        padding: 1rem;
        background: #3c140d;
        border-radius: 0.5rem;
        max-width: 600px;
        word-break: break-word;
      }}
    </style>
  </head>
  <body>
    <div class="container">
      <h1>Authorization Failed</h1>
      <p>An error occurred during authorization.</p>
      <div class="error">{}</div>
    </div>
  </body>
</html>"#,
        html_escape(error)
    )
}

/// Escape HTML special characters.
fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

// ---------------------------------------------------------------------------
// Token Exchange
// ---------------------------------------------------------------------------

/// Token response from OpenAI OAuth.
#[derive(Debug, Clone, Deserialize)]
pub struct TokenResponse {
    pub id_token: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: Option<u64>,
}

/// Exchange authorization code for tokens.
pub async fn exchange_code_for_tokens(
    code: &str,
    redirect_uri: &str,
    pkce_verifier: &str,
) -> anyhow::Result<TokenResponse> {
    let http = crate::models::get_shared_http_client();

    let form = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", redirect_uri),
        ("client_id", CLIENT_ID),
        ("code_verifier", pkce_verifier),
    ];

    let resp = http
        .post(format!("{}/oauth/token", ISSUER))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Token exchange failed: HTTP {} - {}", status, body);
    }

    let token_resp: TokenResponse = resp.json().await?;
    Ok(token_resp)
}

/// Refresh an access token using a refresh token.
pub async fn refresh_access_token(refresh_token: &str) -> anyhow::Result<TokenResponse> {
    let http = crate::models::get_shared_http_client();

    let form = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", CLIENT_ID),
    ];

    let resp = http
        .post(format!("{}/oauth/token", ISSUER))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Token refresh failed: HTTP {} - {}", status, body);
    }

    let token_resp: TokenResponse = resp.json().await?;
    Ok(token_resp)
}

// ---------------------------------------------------------------------------
// Device Authorization Flow
// ---------------------------------------------------------------------------

/// Device authorization initiation response.
#[derive(Debug, Clone, Deserialize)]
pub struct DeviceAuthResponse {
    pub device_auth_id: String,
    pub user_code: String,
    pub interval: String,
    pub verification_url: Option<String>,
}

/// Initiate device authorization flow.
pub async fn initiate_device_auth() -> anyhow::Result<DeviceAuthResponse> {
    let http = crate::models::get_shared_http_client();

    let resp = http
        .post(format!("{}/api/accounts/deviceauth/usercode", ISSUER))
        .header("Content-Type", "application/json")
        .header(
            "User-Agent",
            format!("pinchy/{} (OpenAI Device Auth)", env!("CARGO_PKG_VERSION")),
        )
        .json(&serde_json::json!({
            "client_id": CLIENT_ID
        }))
        .send()
        .await?;

    if resp.status() == 429 {
        anyhow::bail!("Too many pending authorization requests. Please try again later.")
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!(
            "Failed to initiate device authorization: HTTP {} - {}",
            status,
            body
        );
    }

    let device_data: DeviceAuthResponse = resp.json().await?;
    Ok(device_data)
}

/// Poll device authorization status.
pub async fn poll_device_auth(device_auth_id: &str, user_code: &str) -> anyhow::Result<PollResult> {
    let http = crate::models::get_shared_http_client();

    let resp = http
        .post(format!("{}/api/accounts/deviceauth/token", ISSUER))
        .header("Content-Type", "application/json")
        .header(
            "User-Agent",
            format!("pinchy/{} (OpenAI Device Auth)", env!("CARGO_PKG_VERSION")),
        )
        .json(&serde_json::json!({
            "device_auth_id": device_auth_id,
            "user_code": user_code
        }))
        .send()
        .await?;

    if resp.status().is_success() {
        let data: DeviceTokenResponse = resp.json().await?;
        return Ok(PollResult::Success(data));
    }

    match resp.status().as_u16() {
        403 => Ok(PollResult::Pending), // Still waiting
        404 => Ok(PollResult::Pending), // Not found yet
        _ => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            warn!(
                status = %status,
                body = %body,
                "Unexpected device auth poll response"
            );
            Ok(PollResult::Failed)
        }
    }
}

/// Device token response.
#[derive(Debug, Clone, Deserialize)]
pub struct DeviceTokenResponse {
    pub authorization_code: String,
    pub code_verifier: String,
}

/// Device poll result.
#[derive(Debug, Clone)]
pub enum PollResult {
    Success(DeviceTokenResponse),
    Pending,
    Failed,
}

/// Exchange device authorization code for tokens.
pub async fn exchange_device_code(
    device_data: &DeviceTokenResponse,
) -> anyhow::Result<TokenResponse> {
    let http = crate::models::get_shared_http_client();

    let form = [
        ("grant_type", "authorization_code"),
        ("code", &device_data.authorization_code),
        ("redirect_uri", &format!("{}/deviceauth/callback", ISSUER)),
        ("client_id", CLIENT_ID),
        ("code_verifier", &device_data.code_verifier),
    ];

    let resp = http
        .post(format!("{}/oauth/token", ISSUER))
        .header("Content-Type", "application/x-www-form-urlencoded")
        .form(&form)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Token exchange failed: HTTP {} - {}", status, body);
    }

    let token_resp: TokenResponse = resp.json().await?;
    Ok(token_resp)
}

// ---------------------------------------------------------------------------
// JWT Claims Parsing
// ---------------------------------------------------------------------------

/// JWT ID token claims.
#[derive(Debug, Clone, Deserialize)]
pub struct IdTokenClaims {
    pub chatgpt_account_id: Option<String>,
    pub organizations: Option<Vec<Organization>>,
    pub email: Option<String>,
    #[serde(rename = "https://api.openai.com/auth")]
    pub openai_auth: Option<OpenAiAuthClaims>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Organization {
    pub id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct OpenAiAuthClaims {
    pub chatgpt_account_id: Option<String>,
}

/// Parse JWT claims from a token.
pub fn parse_jwt_claims(token: &str) -> Option<IdTokenClaims> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        return None;
    }

    // Decode base64url payload
    let payload = parts.get(1)?;
    let decoded = URL_SAFE_NO_PAD.decode(payload).ok()?;
    let json_str = String::from_utf8(decoded).ok()?;

    serde_json::from_str(&json_str).ok()
}

/// Extract account ID from token claims.
pub fn extract_account_id(tokens: &TokenResponse) -> Option<String> {
    // Try id_token first
    if let Some(claims) = parse_jwt_claims(&tokens.id_token) {
        if let Some(account_id) = extract_account_id_from_claims(&claims) {
            return Some(account_id);
        }
    }

    // Fall back to access_token
    if let Some(claims) = parse_jwt_claims(&tokens.access_token) {
        return extract_account_id_from_claims(&claims);
    }

    None
}

fn extract_account_id_from_claims(claims: &IdTokenClaims) -> Option<String> {
    claims
        .chatgpt_account_id
        .clone()
        .or_else(|| {
            claims
                .openai_auth
                .as_ref()
                .and_then(|auth| auth.chatgpt_account_id.clone())
        })
        .or_else(|| {
            claims
                .organizations
                .as_ref()
                .and_then(|orgs| orgs.first().map(|o| o.id.clone()))
        })
}

// ---------------------------------------------------------------------------
// Callback Server
// ---------------------------------------------------------------------------

use axum::{extract::Query, http::StatusCode, response::Html, routing::get, Router};
use std::net::SocketAddr;
use tokio::sync::oneshot;

/// Callback query parameters.
#[derive(Debug, serde::Deserialize)]
struct CallbackParams {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

/// Start the OAuth callback server on port 1455.
/// This server handles the browser redirect from OpenAI and completes the OAuth flow.
pub async fn start_oauth_callback_server(
    state_param: String,
    provider: String,
) -> anyhow::Result<SocketAddr> {
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let state_clone = state_param.clone();

    let app = Router::new().route(
        "/auth/callback",
        get(move |Query(params): Query<CallbackParams>| async move {
            handle_oauth_callback(params, &state_clone, &provider).await
        }),
    );

    let addr: SocketAddr = ([127, 0, 0, 1], OAUTH_PORT).into();

    // Try to bind, return error if port is in use
    let listener = tokio::net::TcpListener::bind(addr).await.map_err(|e| {
        anyhow::anyhow!(
            "Failed to bind OAuth callback server to port {}: {}. Is another instance running?",
            OAUTH_PORT,
            e
        )
    })?;

    let bound_addr = listener.local_addr()?;

    info!(port = OAUTH_PORT, "Starting OpenAI OAuth callback server");

    // Create the server with graceful shutdown support
    let server = axum::serve(listener, app).with_graceful_shutdown(async move {
        // Race between shutdown signal and timeout
        tokio::select! {
            _ = shutdown_rx => {
                debug!("OAuth callback server received shutdown signal");
            }
            _ = tokio::time::sleep(Duration::from_secs(OAUTH_FLOW_TIMEOUT_SECS)) => {
                warn!("OAuth callback server timed out after {} seconds", OAUTH_FLOW_TIMEOUT_SECS);
            }
        }
    });

    // Spawn the server task and log errors
    tokio::spawn(async move {
        if let Err(e) = server.await {
            error!(error = %e, "OAuth callback server error");
        }
    });

    // Store the shutdown sender so we can stop the server later
    if let Ok(mut guard) = crate::auth::openai_codex::OAUTH_SHUTDOWN_TX.lock() {
        *guard = Some(shutdown_tx);
    }

    Ok(bound_addr)
}

/// Shutdown channel for stopping the callback server.
static OAUTH_SHUTDOWN_TX: Mutex<Option<oneshot::Sender<()>>> = Mutex::new(None);

/// Stop the OAuth callback server if it's running.
pub fn stop_oauth_callback_server() {
    if let Ok(mut guard) = OAUTH_SHUTDOWN_TX.lock() {
        if let Some(tx) = guard.take() {
            let _ = tx.send(());
            info!("Stopped OpenAI OAuth callback server");
        }
    }
}

/// Handle the OAuth callback request.
async fn handle_oauth_callback(
    params: CallbackParams,
    expected_state: &str,
    provider: &str,
) -> (StatusCode, Html<String>) {
    // Check for OAuth error from provider
    if let Some(error) = params.error {
        let error_msg = params.error_description.unwrap_or_else(|| error.clone());
        warn!(error = %error, description = %error_msg, "OAuth callback error from provider");

        // Update state to failed
        let _ = update_oauth_status(
            expected_state,
            OAuthStatus::Failed {
                error: error_msg.clone(),
            },
        );

        return (
            StatusCode::BAD_REQUEST,
            Html(html_error(&error_msg, provider)),
        );
    }

    // Get the authorization code
    let code = match params.code {
        Some(c) => c,
        None => {
            let error_msg = "Missing authorization code";
            warn!(error = %error_msg, "OAuth callback missing code");

            let _ = update_oauth_status(
                expected_state,
                OAuthStatus::Failed {
                    error: error_msg.to_string(),
                },
            );

            return (
                StatusCode::BAD_REQUEST,
                Html(html_error(error_msg, provider)),
            );
        }
    };

    // Validate state parameter
    let state = match params.state {
        Some(s) => s,
        None => {
            let error_msg = "Missing state parameter - potential CSRF attack";
            warn!(error = %error_msg, "OAuth callback missing state");

            let _ = update_oauth_status(
                expected_state,
                OAuthStatus::Failed {
                    error: error_msg.to_string(),
                },
            );

            return (
                StatusCode::BAD_REQUEST,
                Html(html_error(error_msg, provider)),
            );
        }
    };

    // Validate state parameter matches expected
    if state != expected_state {
        let error_msg = "Invalid state parameter - potential CSRF attack";
        warn!(
            expected = %expected_state,
            received = %state,
            "OAuth callback state mismatch"
        );

        let _ = update_oauth_status(
            expected_state,
            OAuthStatus::Failed {
                error: error_msg.to_string(),
            },
        );

        return (
            StatusCode::BAD_REQUEST,
            Html(html_error(error_msg, provider)),
        );
    }

    // Peek at the OAuth state for validation (don't consume yet - callback may retry)
    let (pkce_verifier, _, actual_provider) = match peek_oauth_state(&state) {
        Some(data) => data,
        None => {
            let error_msg = "Invalid or expired OAuth state";
            warn!(state = %state, "OAuth state validation failed");

            return (
                StatusCode::BAD_REQUEST,
                Html(html_error(error_msg, provider)),
            );
        }
    };

    // Exchange code for tokens
    let redirect_uri = format!("http://localhost:{}/auth/callback", OAUTH_PORT);
    match exchange_code_for_tokens(&code, &redirect_uri, &pkce_verifier).await {
        Ok(tokens) => {
            let account_id = extract_account_id(&tokens);
            let expires_at = tokens.expires_in.map(|secs| {
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
                    + secs
            });

            // Create auth info
            let auth = ProviderAuthInfo::oauth_with_account(
                tokens.access_token.clone(),
                tokens.refresh_token.clone(),
                expires_at.unwrap_or(0),
                account_id,
            );

            // Store tokens with the correct provider ID
            if let Err(e) = store_oauth_tokens_for_provider(&auth, &actual_provider) {
                let error_msg = format!("Failed to store tokens: {}", e);
                error!(error = %e, "Failed to store OAuth tokens");

                let _ = update_oauth_status(
                    &state,
                    OAuthStatus::Failed {
                        error: error_msg.clone(),
                    },
                );

                return (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Html(html_error(&error_msg, provider)),
                );
            }

            // CRITICAL: Update status BEFORE consuming state so polling can see success.
            // The frontend polls via get_oauth_status() which looks up the state in the store.
            // If we consume first, polling will only see None forever.
            if let Err(e) = update_oauth_status(
                &state,
                OAuthStatus::Success {
                    access_token: tokens.access_token.clone(),
                    refresh_token: tokens.refresh_token.clone(),
                    expires_at: expires_at.unwrap_or(0),
                },
            ) {
                // Log but don't fail - tokens are stored, user can close browser
                warn!(error = %e, "Failed to update OAuth status for polling, but tokens are stored");
            }

            // Schedule delayed state cleanup so frontend has time to poll success.
            // The check_browser_oauth_status polling endpoint will also attempt cleanup.
            let state_clone = state.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_secs(5)).await;
                consume_oauth_state(&state_clone);
                debug!(state = %state_clone, "Delayed cleanup of OAuth state completed");
            });

            info!(provider = %actual_provider, "OAuth authorization completed successfully");

            // Stop the server after handling the callback
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(500)).await;
                stop_oauth_callback_server();
            });

            (StatusCode::OK, Html(html_success(&actual_provider)))
        }
        Err(e) => {
            let error_msg = format!("Token exchange failed: {}", e);
            error!(error = %e, "OAuth token exchange failed");

            // Update status to failed so frontend polling can see the error
            if let Err(e) = update_oauth_status(
                &state,
                OAuthStatus::Failed {
                    error: error_msg.clone(),
                },
            ) {
                warn!(error = %e, "Failed to update OAuth failure status for polling");
            }

            // Schedule delayed cleanup for failed state too
            let state_clone = state.clone();
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_secs(5)).await;
                consume_oauth_state(&state_clone);
                debug!(state = %state_clone, "Delayed cleanup of failed OAuth state completed");
            });

            // Stop the server after handling the callback
            tokio::spawn(async move {
                tokio::time::sleep(Duration::from_millis(500)).await;
                stop_oauth_callback_server();
            });

            (
                StatusCode::BAD_GATEWAY,
                Html(html_error(&error_msg, provider)),
            )
        }
    }
}

// ---------------------------------------------------------------------------
// Kilo-Style Auth Methods
// ---------------------------------------------------------------------------

/// Get OpenAI auth methods (Kilo-aligned).
///
/// Returns the three Kilo-style methods:
/// 1. ChatGPT Pro/Plus (browser) - OAuth with PKCE
/// 2. ChatGPT Pro/Plus (headless) - Device flow
/// 3. Manually enter API Key - Standard API key
pub fn get_openai_auth_methods() -> Vec<AuthMethod> {
    vec![
        AuthMethod::oauth("ChatGPT Pro/Plus (browser)").with_index(0),
        AuthMethod::oauth("ChatGPT Pro/Plus (headless)").with_index(1),
        AuthMethod::api("Manually enter API Key").with_index(2),
    ]
}

/// Initiate browser OAuth authorization.
/// This starts the callback server and returns the authorization URL.
pub async fn initiate_browser_oauth(
    originator: &str,
    provider: &str,
) -> anyhow::Result<Authorization> {
    let pkce = generate_pkce()?;
    let state = generate_state()?;
    let redirect_uri = format!("http://localhost:{}/auth/callback", OAUTH_PORT);

    // Start the callback server first
    let _ = start_oauth_callback_server(state.clone(), provider.to_string()).await;

    let auth_url = build_authorize_url(&redirect_uri, &pkce, &state, originator);

    // Store state for callback validation
    store_oauth_state(&state, &pkce.verifier, OpenAiAuthMethod::Browser, provider)?;

    Ok(Authorization {
        url: auth_url,
        method: AuthFlowMethod::Auto,
        instructions:
            "Complete authorization in your browser. This window will close automatically."
                .to_string(),
        state: Some(state),
        code_verifier: Some(pkce.verifier),
        device_code: None,
        user_code: None,
        interval: None,
        expires_at: None,
        verification_uri: None,
    })
}

/// Initiate headless/device OAuth authorization.
pub async fn initiate_headless_oauth() -> anyhow::Result<Authorization> {
    let device_data = initiate_device_auth().await?;

    let interval = device_data.interval.parse::<u64>().unwrap_or(5);
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs()
        + 600; // 10 minutes

    Ok(Authorization {
        url: device_data
            .verification_url
            .clone()
            .unwrap_or_else(|| format!("{}/codex/device", ISSUER)),
        method: AuthFlowMethod::Auto,
        instructions: format!("Enter code: {}", device_data.user_code),
        state: None,
        code_verifier: None,
        device_code: Some(device_data.device_auth_id),
        user_code: Some(device_data.user_code),
        interval: Some(interval),
        expires_at: Some(expires_at),
        verification_uri: device_data.verification_url,
    })
}

/// Complete browser OAuth callback with explicit code and state.
/// This is used when the frontend directly provides the code/state.
pub async fn complete_browser_oauth(
    code: &str,
    state: &str,
    provider: &str,
) -> anyhow::Result<ProviderAuthInfo> {
    // Validate state and get PKCE verifier
    let (pkce_verifier, _, actual_provider) = validate_oauth_state(state)
        .ok_or_else(|| anyhow::anyhow!("Invalid or expired OAuth state"))?;

    // Use the provider from state storage, or fall back to the provided one
    let target_provider = if actual_provider.is_empty() {
        provider.to_string()
    } else {
        actual_provider
    };

    let redirect_uri = format!("http://localhost:{}/auth/callback", OAUTH_PORT);
    let tokens = exchange_code_for_tokens(code, &redirect_uri, &pkce_verifier).await?;

    let account_id = extract_account_id(&tokens);
    let expires_at = tokens.expires_in.map(|secs| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + secs
    });

    let auth = ProviderAuthInfo::oauth_with_account(
        tokens.access_token,
        tokens.refresh_token,
        expires_at.unwrap_or(0),
        account_id,
    );

    // Store tokens for the correct provider
    store_oauth_tokens_for_provider(&auth, &target_provider)?;

    Ok(auth)
}

/// Check browser OAuth status for polling-based flow completion.
/// Returns the auth info if complete, or None if still pending.
pub async fn check_browser_oauth_status(state: &str) -> anyhow::Result<Option<ProviderAuthInfo>> {
    match get_oauth_status(state) {
        Some(OAuthStatus::Success {
            access_token,
            refresh_token,
            expires_at,
        }) => {
            // Get the provider from the state store
            let guard = OAUTH_STATE_STORE
                .lock()
                .map_err(|e| anyhow::anyhow!("State store poisoned: {}", e))?;
            let _provider = guard
                .as_ref()
                .and_then(|s| s.get(state))
                .map(|p| p.provider.clone())
                .unwrap_or_else(|| "openai".to_string());

            // Clean up the state since we're done
            drop(guard);
            if let Ok(mut guard) = OAUTH_STATE_STORE.lock() {
                if let Some(store) = guard.as_mut() {
                    store.remove(state);
                }
            }

            Ok(Some(ProviderAuthInfo::oauth(
                access_token,
                refresh_token,
                expires_at,
            )))
        }
        Some(OAuthStatus::Failed { error }) => Err(anyhow::anyhow!("OAuth failed: {}", error)),
        Some(OAuthStatus::Pending) | None => Ok(None),
    }
}

/// Complete headless OAuth with device data.
pub async fn complete_headless_oauth(
    device_auth_id: &str,
    user_code: &str,
) -> anyhow::Result<ProviderAuthInfo> {
    // Poll until we get the authorization code
    let max_attempts = 120; // 10 minutes at 5 second intervals
    let interval = Duration::from_secs(DEVICE_POLL_INTERVAL_SECS)
        + Duration::from_millis(OAUTH_POLLING_SAFETY_MARGIN_MS);

    for attempt in 0..max_attempts {
        match poll_device_auth(device_auth_id, user_code).await? {
            PollResult::Success(device_data) => {
                let tokens = exchange_device_code(&device_data).await?;
                let account_id = extract_account_id(&tokens);
                let expires_at = tokens.expires_in.map(|secs| {
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_secs()
                        + secs
                });

                return Ok(ProviderAuthInfo::oauth_with_account(
                    tokens.access_token,
                    tokens.refresh_token,
                    expires_at.unwrap_or(0),
                    account_id,
                ));
            }
            PollResult::Pending => {
                if attempt < max_attempts - 1 {
                    tokio::time::sleep(interval).await;
                }
            }
            PollResult::Failed => {
                anyhow::bail!("Device authorization failed");
            }
        }
    }

    anyhow::bail!("Device authorization timed out")
}

// ---------------------------------------------------------------------------
// Auth Store Integration
// ---------------------------------------------------------------------------

/// Store OpenAI OAuth tokens for a specific provider.
/// This ensures tokens are stored under the correct provider ID (openai or openai-codex).
pub fn store_oauth_tokens_for_provider(
    auth: &ProviderAuthInfo,
    provider: &str,
) -> anyhow::Result<()> {
    match auth {
        ProviderAuthInfo::Oauth(oauth) => {
            let entry = crate::auth::store::AuthEntry::new_oauth(
                provider,
                &oauth.access,
                Some(oauth.refresh.clone()),
                Some(oauth.expires),
            );
            crate::auth::store::set_auth(provider, entry)?;
            info!(provider = %provider, "Stored OpenAI OAuth tokens");
            Ok(())
        }
        _ => anyhow::bail!("Expected OAuth auth info"),
    }
}

/// Legacy: Store OpenAI OAuth tokens (defaults to "openai").
#[deprecated(
    since = "0.1.0",
    note = "Use store_oauth_tokens_for_provider with explicit provider ID"
)]
pub fn store_oauth_tokens(auth: &ProviderAuthInfo) -> anyhow::Result<()> {
    store_oauth_tokens_for_provider(auth, "openai")
}

/// Get stored OpenAI auth for a specific provider.
pub fn get_stored_auth_for_provider(provider: &str) -> Option<ProviderAuthInfo> {
    crate::auth::store::get_auth(provider).map(|entry| match entry.r#type.as_str() {
        "oauth" => ProviderAuthInfo::oauth_with_account(
            entry.access_token.unwrap_or_default(),
            entry.refresh_token.unwrap_or_default(),
            entry.expires_at.unwrap_or(0),
            entry.account_id,
        ),
        _ => ProviderAuthInfo::api_key(entry.api_key.unwrap_or_default()),
    })
}

/// Legacy: Get stored OpenAI auth (defaults to "openai").
#[deprecated(
    since = "0.1.0",
    note = "Use get_stored_auth_for_provider with explicit provider ID"
)]
pub fn get_stored_auth() -> Option<ProviderAuthInfo> {
    get_stored_auth_for_provider("openai")
}

/// Check if a specific provider is authenticated.
pub fn is_authenticated_for_provider(provider: &str) -> bool {
    get_stored_auth_for_provider(provider).is_some() || std::env::var("OPENAI_API_KEY").is_ok()
}

/// Legacy: Check if OpenAI is authenticated.
#[deprecated(
    since = "0.1.0",
    note = "Use is_authenticated_for_provider with explicit provider ID"
)]
pub fn is_authenticated() -> bool {
    is_authenticated_for_provider("openai")
}

/// Remove stored auth for a specific provider.
pub fn clear_auth_for_provider(provider: &str) -> anyhow::Result<()> {
    crate::auth::store::remove_auth(provider)?;
    info!(provider = %provider, "Cleared OpenAI auth");
    Ok(())
}

/// Legacy: Remove stored OpenAI auth.
#[deprecated(
    since = "0.1.0",
    note = "Use clear_auth_for_provider with explicit provider ID"
)]
pub fn clear_auth() -> anyhow::Result<()> {
    clear_auth_for_provider("openai")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use crate::auth::provider_auth::AuthMethodType;

    #[test]
    fn pkce_challenge_is_deterministic() {
        let verifier = "test_verifier_value";
        let c1 = code_challenge(verifier);
        let c2 = code_challenge(verifier);
        assert_eq!(c1, c2);
        // Base64url-encoded SHA256 = 43 chars for 32 bytes.
        assert_eq!(c1.len(), 43);
    }

    #[test]
    fn pkce_verifier_is_random() {
        let v1 = generate_code_verifier().unwrap();
        let v2 = generate_code_verifier().unwrap();
        assert_ne!(v1, v2);
        // 64 bytes base64url = 86 chars.
        assert_eq!(v1.len(), 86);
    }

    #[test]
    fn auth_url_contains_expected_params() {
        let pkce = PkceCodes {
            verifier: "test_verifier".to_string(),
            challenge: "test_challenge".to_string(),
        };
        let state = "test_state";
        let url = build_authorize_url("http://localhost:1455/auth/callback", &pkce, state, "test");
        assert!(url.contains("auth.openai.com/oauth/authorize"));
        assert!(url.contains("client_id=app_"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("response_type=code"));
    }

    #[test]
    fn parse_jwt_claims_valid() {
        // Create a mock JWT payload
        let payload = r#"{"chatgpt_account_id":"acct_123","email":"test@example.com"}"#;
        let encoded = URL_SAFE_NO_PAD.encode(payload.as_bytes());
        let token = format!("header.{}.signature", encoded);

        let claims = parse_jwt_claims(&token);
        assert!(claims.is_some());
        let claims = claims.unwrap();
        assert_eq!(claims.chatgpt_account_id, Some("acct_123".to_string()));
        assert_eq!(claims.email, Some("test@example.com".to_string()));
    }

    #[test]
    fn parse_jwt_claims_invalid() {
        let result = parse_jwt_claims("not.a.jwt");
        assert!(result.is_none());

        let result = parse_jwt_claims("invalid");
        assert!(result.is_none());
    }

    #[test]
    fn oauth_state_store_roundtrip() {
        store_oauth_state(
            "state123",
            "verifier456",
            OpenAiAuthMethod::Browser,
            "openai",
        )
        .unwrap();

        let result = validate_oauth_state("state123");
        assert!(result.is_some());

        let (verifier, method, provider) = result.unwrap();
        assert_eq!(verifier, "verifier456");
        assert!(matches!(method, OpenAiAuthMethod::Browser));
        assert_eq!(provider, "openai");

        // Second validation should fail (state consumed)
        let result = validate_oauth_state("state123");
        assert!(result.is_none());
    }

    #[test]
    fn get_openai_auth_methods_count() {
        let methods = get_openai_auth_methods();
        assert_eq!(methods.len(), 3);

        // Check indices are set
        assert_eq!(methods[0].method_index, Some(0));
        assert_eq!(methods[1].method_index, Some(1));
        assert_eq!(methods[2].method_index, Some(2));

        // Check types
        assert_eq!(methods[0].method_type, AuthMethodType::Oauth);
        assert_eq!(methods[1].method_type, AuthMethodType::Oauth);
        assert_eq!(methods[2].method_type, AuthMethodType::Api);
    }

    #[test]
    fn oauth_status_tracking() {
        store_oauth_state(
            "state789",
            "verifier",
            OpenAiAuthMethod::Browser,
            "openai-codex",
        )
        .unwrap();

        // Initially pending
        let status = get_oauth_status("state789");
        assert!(matches!(status, Some(OAuthStatus::Pending)));

        // Update to success
        update_oauth_status(
            "state789",
            OAuthStatus::Success {
                access_token: "token123".to_string(),
                refresh_token: "refresh456".to_string(),
                expires_at: 1234567890,
            },
        )
        .unwrap();

        let status = get_oauth_status("state789");
        assert!(
            matches!(status, Some(OAuthStatus::Success { access_token, .. }) if access_token == "token123")
        );

        // Check completion
        let is_complete = is_oauth_complete("state789");
        assert_eq!(is_complete, Some(true));

        clear_oauth_states();
    }

    #[test]
    fn html_escape_special_chars() {
        let input = "<script>alert('xss')</script>";
        let escaped = html_escape(input);
        assert_eq!(escaped, "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    }

    #[test]
    fn provider_specific_storage() {
        // Test that different providers get stored separately
        let auth = ProviderAuthInfo::oauth("access123", "refresh456", 1234567890);

        // Store for openai
        {
            let result = store_oauth_tokens_for_provider(&auth, "openai");
            assert!(result.is_ok());
        }

        // Store for openai-codex
        {
            let result = store_oauth_tokens_for_provider(&auth, "openai-codex");
            assert!(result.is_ok());
        }

        // Verify they're stored separately (we can't easily test this without
        // mocking the store, but the function structure allows it)
    }

    #[test]
    fn oauth_peek_does_not_consume() {
        store_oauth_state(
            "peek_state",
            "verifier789",
            OpenAiAuthMethod::Browser,
            "openai",
        )
        .unwrap();

        // First peek should succeed
        let result = peek_oauth_state("peek_state");
        assert!(result.is_some());
        let (verifier, method, provider) = result.unwrap();
        assert_eq!(verifier, "verifier789");
        assert!(matches!(method, OpenAiAuthMethod::Browser));
        assert_eq!(provider, "openai");

        // Second peek should still succeed (state not consumed)
        let result = peek_oauth_state("peek_state");
        assert!(result.is_some());

        // validate_oauth_state should still work (peek doesn't affect it)
        let result = validate_oauth_state("peek_state");
        assert!(result.is_some());

        // Now state should be consumed
        let result = validate_oauth_state("peek_state");
        assert!(result.is_none());
    }

    #[test]
    fn oauth_consume_explicit() {
        store_oauth_state(
            "consume_state",
            "verifier000",
            OpenAiAuthMethod::Headless,
            "openai-codex",
        )
        .unwrap();

        // Peek should work
        let result = peek_oauth_state("consume_state");
        assert!(result.is_some());

        // Explicit consume
        assert!(consume_oauth_state("consume_state"));

        // Second consume should fail
        assert!(!consume_oauth_state("consume_state"));

        // Peek should also fail now
        let result = peek_oauth_state("consume_state");
        assert!(result.is_none());
    }

    #[test]
    fn oauth_peek_expired_state() {
        // Store a state
        store_oauth_state(
            "expired_peek",
            "verifier",
            OpenAiAuthMethod::Browser,
            "openai",
        )
        .unwrap();

        // Peek should work immediately
        assert!(peek_oauth_state("expired_peek").is_some());

        // Non-existent peek should fail
        assert!(peek_oauth_state("non_existent").is_none());
    }
}
