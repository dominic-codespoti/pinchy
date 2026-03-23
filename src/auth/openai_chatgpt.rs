//! OpenAI ChatGPT OAuth (PKCE Authorization Code flow).
//!
//! Authenticates users via the ChatGPT browser-based OAuth flow, similar to
//! how Codex CLI handles "Sign in with ChatGPT".  Users with ChatGPT
//! Plus/Pro/Team/Enterprise subscriptions can use OpenAI models without a
//! separate API key.
//!
//! ## Flow
//!
//! 1. Generate PKCE `code_verifier` + `code_challenge` (S256).
//! 2. Open the user's browser to `https://auth.openai.com/oauth/authorize`.
//! 3. Spin up a tiny local HTTP server on port 1456 to receive the callback.
//! 4. Exchange the auth code for tokens (id_token, access_token, refresh_token).
//! 5. Persist tokens to `~/.config/pinchy/openai-chatgpt-auth.json` (0o600).

use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use chrono::{DateTime, Utc};
use ring::digest;
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// OpenAI OAuth issuer base URL.
const ISSUER: &str = "https://auth.openai.com";

/// Public OAuth client ID (same as Codex CLI — public client, no secret).
const CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";

/// Scopes requested during authorization (must match what the client ID allows).
const SCOPES: &str = "openid profile email offline_access";

/// Local callback port for the OAuth redirect.
/// This mirrors Codex CLI's documented default localhost callback port.
const CALLBACK_PORT: u16 = 1455;

/// Local redirect URI.
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";

/// How often to refresh (8 days, matching Codex CLI).
const REFRESH_INTERVAL_DAYS: i64 = 8;

// ---------------------------------------------------------------------------
// Stored auth state
// ---------------------------------------------------------------------------

/// Persisted authentication state for OpenAI ChatGPT OAuth.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatGptAuth {
    /// Deprecated legacy field retained for backwards compatibility.
    /// Pinchy now uses the OAuth access token directly for ChatGPT/Codex auth.
    pub api_key: String,
    /// OAuth access token (JWT).
    pub access_token: String,
    /// OAuth refresh token (for renewing the session).
    pub refresh_token: String,
    /// OAuth id_token (used for the API key exchange).
    pub id_token: String,
    /// When the tokens were last refreshed.
    pub last_refresh: DateTime<Utc>,
    /// ChatGPT account ID extracted from the JWT claims.
    /// Used as the `ChatGPT-Account-Id` header for Codex API calls.
    #[serde(default)]
    pub account_id: Option<String>,
    /// Token expiry timestamp (epoch millis).  When set, the Codex provider
    /// checks this instead of the 8-day heuristic.
    #[serde(default)]
    pub expires: Option<i64>,
}

impl ChatGptAuth {
    /// Returns `true` if the tokens should be refreshed (older than 8 days).
    pub fn needs_refresh(&self) -> bool {
        Utc::now() > self.last_refresh + chrono::Duration::days(REFRESH_INTERVAL_DAYS)
    }

    /// Returns `true` if the OAuth access token has expired based on the
    /// stored `expires` timestamp.
    pub fn access_token_expired(&self) -> bool {
        match self.expires {
            Some(exp) => {
                let now_ms = Utc::now().timestamp_millis();
                now_ms >= exp
            }
            // No expiry stored — fall back to the 8-day heuristic.
            None => self.needs_refresh(),
        }
    }
}

// ---------------------------------------------------------------------------
// JWT claim parsing (for account ID extraction)
// ---------------------------------------------------------------------------

/// Extract the ChatGPT account ID from a JWT token's claims.
///
/// Looks for (in order):
/// 1. `chatgpt_account_id`
/// 2. `https://api.openai.com/auth.chatgpt_account_id`
/// 3. `organizations[0].id`
pub fn extract_account_id_from_jwt(token: &str) -> Option<String> {
    // JWT format: header.payload.signature
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        warn!("JWT token has fewer than 2 parts, cannot extract claims");
        return None;
    }

    // Decode the payload (second part) with base64url
    let payload_b64 = parts[1];
    let payload_bytes = URL_SAFE_NO_PAD.decode(payload_b64).ok().or_else(|| {
        // Try with padding
        let padded = match payload_b64.len() % 4 {
            2 => format!("{payload_b64}=="),
            3 => format!("{payload_b64}="),
            _ => payload_b64.to_string(),
        };
        base64::engine::general_purpose::URL_SAFE
            .decode(padded)
            .ok()
    })?;

    let claims: serde_json::Value = serde_json::from_slice(&payload_bytes).ok()?;

    // Try chatgpt_account_id first
    if let Some(id) = claims
        .get("chatgpt_account_id")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return Some(id.to_string());
    }

    // Try https://api.openai.com/auth.chatgpt_account_id
    if let Some(id) = claims
        .get("https://api.openai.com/auth")
        .and_then(|v| v.get("chatgpt_account_id"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return Some(id.to_string());
    }

    // Try organizations[0].id
    if let Some(id) = claims
        .get("organizations")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|org| org.get("id"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
    {
        return Some(id.to_string());
    }

    warn!("could not find account ID in JWT claims");
    None
}

/// Extract the `exp` claim from a JWT and return it as epoch milliseconds.
pub fn extract_expiry_from_jwt(token: &str) -> Option<i64> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() < 2 {
        return None;
    }

    let payload_b64 = parts[1];
    let payload_bytes = URL_SAFE_NO_PAD.decode(payload_b64).ok().or_else(|| {
        let padded = match payload_b64.len() % 4 {
            2 => format!("{payload_b64}=="),
            3 => format!("{payload_b64}="),
            _ => payload_b64.to_string(),
        };
        base64::engine::general_purpose::URL_SAFE
            .decode(padded)
            .ok()
    })?;

    let claims: serde_json::Value = serde_json::from_slice(&payload_bytes).ok()?;

    // `exp` is typically in seconds since epoch
    claims
        .get("exp")
        .and_then(|v| v.as_i64())
        .map(|secs| secs * 1000) // convert to milliseconds
}

// ---------------------------------------------------------------------------
// PKCE helpers
// ---------------------------------------------------------------------------

/// Generate a PKCE code verifier (64 random bytes, base64url-encoded).
pub fn generate_code_verifier() -> anyhow::Result<String> {
    let rng = SystemRandom::new();
    let mut buf = [0u8; 64];
    rng.fill(&mut buf)
        .map_err(|_| anyhow::anyhow!("failed to generate random bytes for PKCE verifier"))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// Derive the S256 code challenge from a code verifier.
fn code_challenge(verifier: &str) -> String {
    let hash = digest::digest(&digest::SHA256, verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash.as_ref())
}

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

/// Generate a random state parameter for CSRF protection (32 random bytes,
/// base64url-encoded).
pub fn generate_state() -> anyhow::Result<String> {
    let rng = SystemRandom::new();
    let mut buf = [0u8; 32];
    rng.fill(&mut buf)
        .map_err(|_| anyhow::anyhow!("failed to generate random bytes for OAuth state"))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// Build the full authorization URL that the user's browser should open.
///
/// Parameters match those used by OpenCode / Codex CLI for the same public
/// client ID.  The `state` value should be kept and validated when the
/// callback arrives.
pub fn build_auth_url(code_verifier: &str, state: &str) -> String {
    let challenge = code_challenge(code_verifier);

    // Use the same query-parameter set as OpenCode's `buildAuthorizeUrl`.
    // `URLSearchParams`-style encoding: spaces → `+`, etc.
    let params: Vec<(&str, &str)> = vec![
        ("response_type", "code"),
        ("client_id", CLIENT_ID),
        ("redirect_uri", REDIRECT_URI),
        ("scope", SCOPES),
        ("code_challenge", &challenge),
        ("code_challenge_method", "S256"),
        ("id_token_add_organizations", "true"),
        ("codex_cli_simplified_flow", "true"),
        ("state", state),
        ("originator", "codex_cli"),
    ];

    let query = params
        .iter()
        .map(|(k, v)| format!("{}={}", pct_encode(k), pct_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    format!("{ISSUER}/oauth/authorize?{query}")
}

/// Percent-encode a string for use as a URL query-parameter key or value
/// (RFC 3986 unreserved characters are kept as-is).
fn pct_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 2);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => {
                out.push('%');
                out.push_str(&format!("{b:02X}"));
            }
        }
    }
    out
}

/// Try to open a URL in the user's default browser.
///
/// Returns `true` if the browser was (likely) launched successfully.
fn open_browser(url: &str) -> bool {
    #[cfg(target_os = "macos")]
    let result = std::process::Command::new("open").arg(url).spawn();

    #[cfg(target_os = "windows")]
    let result = std::process::Command::new("cmd")
        .args(["/C", "start", "", url])
        .spawn();

    #[cfg(target_os = "linux")]
    let result = std::process::Command::new("xdg-open").arg(url).spawn();

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    let result: Result<std::process::Child, std::io::Error> = Err(std::io::Error::new(
        std::io::ErrorKind::Unsupported,
        "unsupported OS",
    ));

    match result {
        Ok(_) => true,
        Err(e) => {
            warn!("failed to open browser: {e}");
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Local callback server
// ---------------------------------------------------------------------------

/// Start a one-shot HTTP server on `CALLBACK_PORT` that waits for the OAuth
/// callback and returns the authorization code.
///
/// The `expected_state` is validated against the `state` query parameter
/// to prevent CSRF attacks.
pub async fn wait_for_callback(expected_state: &str) -> anyhow::Result<String> {
    use tokio::net::TcpListener;

    let addr = format!("127.0.0.1:{CALLBACK_PORT}");
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| anyhow::anyhow!("failed to bind callback server on {addr}: {e}"))?;

    info!("ChatGPT OAuth callback server listening on {addr}");

    let (mut stream, _peer) = listener.accept().await?;

    // Read the HTTP request (we only need the first line for the query string).
    let mut buf = vec![0u8; 4096];
    let n = {
        stream.readable().await?;
        // Use try_read for the initial data
        match stream.try_read(&mut buf) {
            Ok(n) => n,
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                // Wait and retry
                stream.readable().await?;
                stream.try_read(&mut buf)?
            }
            Err(e) => return Err(e.into()),
        }
    };
    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse the GET request line to extract the `code` query parameter.
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");

    let code = extract_query_param(path, "code")
        .ok_or_else(|| anyhow::anyhow!("no `code` parameter in OAuth callback"))?;

    // Check for error.
    if let Some(err) = extract_query_param(path, "error") {
        let desc = extract_query_param(path, "error_description").unwrap_or_default();
        // Send error response before returning
        let error_body = format!(
            "<html><body><h2>Authentication failed</h2><p>{err}: {desc}</p>\
             <p>You can close this tab.</p></body></html>"
        );
        let response = format!(
            "HTTP/1.1 400 Bad Request\r\n\
             Content-Type: text/html\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n{}",
            error_body.len(),
            error_body
        );
        use tokio::io::AsyncWriteExt;
        let _ = stream.try_write(response.as_bytes());
        let _ = stream.shutdown().await;

        return Err(anyhow::anyhow!("OAuth error: {err} — {desc}"));
    }

    // Validate state parameter (CSRF protection).
    let callback_state = extract_query_param(path, "state").unwrap_or_default();
    if callback_state != expected_state {
        let error_body =
            "<html><body><h2>Authentication failed</h2><p>Invalid state — potential CSRF attack.</p>\
             <p>You can close this tab.</p></body></html>";
        let response = format!(
            "HTTP/1.1 400 Bad Request\r\n\
             Content-Type: text/html\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n{}",
            error_body.len(),
            error_body
        );
        use tokio::io::AsyncWriteExt;
        let _ = stream.try_write(response.as_bytes());
        let _ = stream.shutdown().await;

        return Err(anyhow::anyhow!(
            "OAuth state mismatch — expected {expected_state}, got {callback_state}"
        ));
    }

    // Send a success response to the browser.
    let success_body = "<html><body><h2>Signed in to Pinchy!</h2>\
         <p>You can close this tab and return to Pinchy.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n{}",
        success_body.len(),
        success_body
    );
    {
        use tokio::io::AsyncWriteExt;
        let _ = stream.try_write(response.as_bytes());
        let _ = stream.shutdown().await;
    }

    Ok(code)
}

/// Extract a query parameter value from a URL path string.
fn extract_query_param(path: &str, key: &str) -> Option<String> {
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let k = kv.next()?;
        let v = kv.next().unwrap_or("");
        if k == key {
            // Basic URL decoding.
            return Some(v.replace("%20", " ").replace('+', " "));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/// Exchange an authorization code for tokens (step 1 of the 2-step exchange).
///
/// Returns `(id_token, access_token, refresh_token)`.
pub async fn exchange_code_for_tokens(
    code: &str,
    code_verifier: &str,
) -> anyhow::Result<(String, String, String)> {
    let http = crate::models::get_shared_http_client();

    let resp: serde_json::Value = http
        .post(format!("{ISSUER}/oauth/token"))
        .form(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", REDIRECT_URI),
            ("client_id", CLIENT_ID),
            ("code_verifier", code_verifier),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let id_token = resp["id_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing id_token in token response"))?
        .to_string();
    let access_token = resp["access_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing access_token in token response"))?
        .to_string();
    let refresh_token = resp["refresh_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing refresh_token in token response"))?
        .to_string();

    debug!("ChatGPT OAuth code exchange succeeded");
    Ok((id_token, access_token, refresh_token))
}

/// Exchange an id_token for an OpenAI API key (legacy flow).
///
/// Newer Codex-style ChatGPT auth uses the OAuth access token directly, so
/// callers should avoid relying on this exchange for login success.
pub async fn exchange_id_token_for_api_key(id_token: &str) -> anyhow::Result<String> {
    let http = crate::models::get_shared_http_client();

    let resp: serde_json::Value = http
        .post(format!("{ISSUER}/oauth/token"))
        .form(&[
            (
                "grant_type",
                "urn:ietf:params:oauth:grant-type:token-exchange",
            ),
            ("client_id", CLIENT_ID),
            ("requested_token", "openai-api-key"),
            ("subject_token", id_token),
            (
                "subject_token_type",
                "urn:ietf:params:oauth:token-type:id_token",
            ),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let api_key = resp["access_token"]
        .as_str()
        .ok_or_else(|| {
            anyhow::anyhow!("missing access_token (API key) in token exchange response")
        })?
        .to_string();

    debug!("ChatGPT id_token → API key exchange succeeded");
    Ok(api_key)
}

/// Refresh tokens using a refresh_token.
///
/// Returns new `(id_token, access_token, refresh_token)`.
pub async fn refresh_tokens(refresh_token: &str) -> anyhow::Result<(String, String, String)> {
    let http = crate::models::get_shared_http_client();

    let resp: serde_json::Value = http
        .post(format!("{ISSUER}/oauth/token"))
        .form(&[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token),
        ])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let id_token = resp["id_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing id_token in refresh response"))?
        .to_string();
    let access_token = resp["access_token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing access_token in refresh response"))?
        .to_string();
    // The refresh response may or may not include a new refresh_token.
    let new_refresh = resp["refresh_token"]
        .as_str()
        .unwrap_or(refresh_token)
        .to_string();

    debug!("ChatGPT token refresh succeeded");
    Ok((id_token, access_token, new_refresh))
}

// ---------------------------------------------------------------------------
// Full login flow (browser-based)
// ---------------------------------------------------------------------------

/// Run the complete ChatGPT OAuth PKCE flow:
///
/// 1. Generate PKCE verifier/challenge.
/// 2. Open the browser to the auth URL.
/// 3. Wait for the callback on `localhost:1456`.
/// 4. Exchange code → tokens → API key.
/// 5. Persist the auth state.
///
/// Returns the [`ChatGptAuth`] on success.
pub async fn login() -> anyhow::Result<ChatGptAuth> {
    let code_verifier = generate_code_verifier()?;
    let state = generate_state()?;
    let auth_url = build_auth_url(&code_verifier, &state);

    info!("Opening browser for ChatGPT OAuth login...");

    // Try to open the browser.  On headless systems this may fail, so we
    // also print the URL.
    if !open_browser(&auth_url) {
        info!("Could not open browser automatically. Please visit:\n{auth_url}");
    }

    // Wait for the OAuth callback (validates state).
    let code = wait_for_callback(&state).await?;

    // Exchange code for tokens.
    let (id_token, access_token, refresh_token) =
        exchange_code_for_tokens(&code, &code_verifier).await?;

    // Extract account ID and expiry from the tokens.
    let account_id = extract_account_id_from_jwt(&id_token)
        .or_else(|| extract_account_id_from_jwt(&access_token));
    let expires = extract_expiry_from_jwt(&access_token);

    if account_id.is_some() {
        debug!("Extracted ChatGPT account ID from JWT");
    } else {
        warn!("Could not extract ChatGPT account ID — Codex API calls may fail");
    }

    let auth = ChatGptAuth {
        api_key: String::new(),
        access_token,
        refresh_token,
        id_token,
        last_refresh: Utc::now(),
        account_id,
        expires,
    };

    // Persist.
    store_auth(&auth)?;

    info!("ChatGPT OAuth login complete");
    Ok(auth)
}

/// Retrieve the stored auth, refreshing tokens if needed.
///
/// Returns `Ok(None)` if no auth is stored.
pub async fn get_or_refresh_auth() -> anyhow::Result<Option<ChatGptAuth>> {
    let auth = match retrieve_auth()? {
        Some(a) => a,
        None => return Ok(None),
    };

    if !auth.needs_refresh() {
        return Ok(Some(auth));
    }

    info!(
        "ChatGPT tokens need refresh (last refresh: {})",
        auth.last_refresh
    );

    match refresh_tokens(&auth.refresh_token).await {
        Ok((id_token, access_token, refresh_token)) => {
            // Re-extract account ID and expiry from fresh tokens.
            let account_id = extract_account_id_from_jwt(&id_token)
                .or_else(|| extract_account_id_from_jwt(&access_token))
                .or(auth.account_id.clone());
            let expires = extract_expiry_from_jwt(&access_token);
            let refreshed = ChatGptAuth {
                api_key: auth.api_key.clone(),
                access_token,
                refresh_token,
                id_token,
                last_refresh: Utc::now(),
                account_id,
                expires,
            };
            store_auth(&refreshed)?;
            Ok(Some(refreshed))
        }
        Err(e) => {
            warn!("ChatGPT token refresh failed: {e} — using existing tokens");
            // Return existing auth — the API key may still work even if
            // the refresh failed.
            Ok(Some(auth))
        }
    }
}

/// Retrieve stored auth with Codex-aware token refresh.
///
/// Unlike [`get_or_refresh_auth`], this checks the access_token expiry
/// (not the 8-day API key heuristic) because the Codex backend uses
/// the access_token directly.
pub async fn get_or_refresh_auth_for_codex() -> anyhow::Result<Option<ChatGptAuth>> {
    let auth = match retrieve_auth()? {
        Some(a) => a,
        None => return Ok(None),
    };

    if !auth.access_token_expired() {
        return Ok(Some(auth));
    }

    info!(
        "ChatGPT access token expired — refreshing for Codex use (last refresh: {})",
        auth.last_refresh
    );

    match refresh_tokens(&auth.refresh_token).await {
        Ok((id_token, access_token, refresh_token)) => {
            let account_id = extract_account_id_from_jwt(&id_token)
                .or_else(|| extract_account_id_from_jwt(&access_token))
                .or(auth.account_id.clone());
            let expires = extract_expiry_from_jwt(&access_token);
            let refreshed = ChatGptAuth {
                api_key: auth.api_key.clone(),
                access_token,
                refresh_token,
                id_token,
                last_refresh: Utc::now(),
                account_id,
                expires,
            };
            store_auth(&refreshed)?;
            Ok(Some(refreshed))
        }
        Err(e) => {
            warn!("ChatGPT Codex token refresh failed: {e} — using existing tokens");
            Ok(Some(auth))
        }
    }
}

// ---------------------------------------------------------------------------
// Token storage (file-based, 0o600)
// ---------------------------------------------------------------------------

/// Return the auth file path: `$XDG_CONFIG_HOME/pinchy/openai-chatgpt-auth.json`.
fn auth_path() -> anyhow::Result<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| anyhow::anyhow!("cannot determine config directory"))?;
    Ok(config_dir.join("pinchy").join("openai-chatgpt-auth.json"))
}

/// Persist [`ChatGptAuth`] to disk with restrictive permissions.
pub fn store_auth(auth: &ChatGptAuth) -> anyhow::Result<()> {
    let path = auth_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(auth)?;
    fs::write(&path, &json)?;
    #[cfg(unix)]
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    debug!(path = %path.display(), "ChatGPT auth stored");
    Ok(())
}

/// Load stored [`ChatGptAuth`] from disk.
///
/// Returns `Ok(None)` if no auth file exists.
pub fn retrieve_auth() -> anyhow::Result<Option<ChatGptAuth>> {
    let path = auth_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path)?;
    match serde_json::from_str::<ChatGptAuth>(&data) {
        Ok(auth) => Ok(Some(auth)),
        Err(e) => {
            warn!(path = %path.display(), "failed to parse ChatGPT auth: {e}");
            Ok(None)
        }
    }
}

/// Remove stored ChatGPT auth from disk.
pub fn remove_auth() -> anyhow::Result<()> {
    let path = auth_path()?;
    if path.exists() {
        fs::remove_file(&path)?;
        debug!(path = %path.display(), "ChatGPT auth removed");
    }
    Ok(())
}

/// Check whether ChatGPT OAuth credentials are stored (without loading them fully).
pub fn is_authenticated() -> bool {
    auth_path().ok().map(|p| p.exists()).unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pkce_challenge_is_deterministic() {
        let verifier = "test_verifier_value";
        let c1 = code_challenge(verifier);
        let c2 = code_challenge(verifier);
        assert_eq!(c1, c2);
        // Should be base64url-encoded SHA256 — 43 chars for 32 bytes.
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
        let verifier = generate_code_verifier().unwrap();
        let state = generate_state().unwrap();
        let url = build_auth_url(&verifier, &state);
        assert!(url.contains("auth.openai.com/oauth/authorize"));
        assert!(url.contains(CLIENT_ID));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("originator=pinchy"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("codex_cli_simplified_flow=true"));
        assert!(url.contains(&format!("state={state}")));
    }

    #[test]
    fn extract_query_param_works() {
        let path = "/auth/callback?code=abc123&state=xyz";
        assert_eq!(extract_query_param(path, "code"), Some("abc123".into()));
        assert_eq!(extract_query_param(path, "state"), Some("xyz".into()));
        assert_eq!(extract_query_param(path, "missing"), None);
    }

    #[test]
    fn auth_path_looks_reasonable() {
        let p = auth_path().unwrap();
        assert!(p.to_string_lossy().contains("pinchy"));
        assert!(p.to_string_lossy().ends_with("openai-chatgpt-auth.json"));
    }

    #[test]
    fn needs_refresh_logic() {
        let recent = ChatGptAuth {
            api_key: "sk-test".into(),
            access_token: "at".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            last_refresh: Utc::now(),
            account_id: None,
            expires: None,
        };
        assert!(!recent.needs_refresh());

        let old = ChatGptAuth {
            api_key: "sk-test".into(),
            access_token: "at".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            last_refresh: Utc::now() - chrono::Duration::days(10),
            account_id: None,
            expires: None,
        };
        assert!(old.needs_refresh());
    }

    #[test]
    fn round_trip_serde() {
        let auth = ChatGptAuth {
            api_key: "sk-test".into(),
            access_token: "at".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            last_refresh: Utc::now(),
            account_id: Some("acc-123".into()),
            expires: Some(9999999999000),
        };
        let json = serde_json::to_string(&auth).unwrap();
        let auth2: ChatGptAuth = serde_json::from_str(&json).unwrap();
        assert_eq!(auth.api_key, auth2.api_key);
        assert_eq!(auth.refresh_token, auth2.refresh_token);
        assert_eq!(auth.account_id, auth2.account_id);
        assert_eq!(auth.expires, auth2.expires);
    }

    #[test]
    fn access_token_expired_with_future_expiry() {
        let auth = ChatGptAuth {
            api_key: "sk-test".into(),
            access_token: "at".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            last_refresh: Utc::now(),
            account_id: None,
            expires: Some(Utc::now().timestamp_millis() + 3_600_000), // 1 hour from now
        };
        assert!(!auth.access_token_expired());
    }

    #[test]
    fn access_token_expired_with_past_expiry() {
        let auth = ChatGptAuth {
            api_key: "sk-test".into(),
            access_token: "at".into(),
            refresh_token: "rt".into(),
            id_token: "it".into(),
            last_refresh: Utc::now(),
            account_id: None,
            expires: Some(Utc::now().timestamp_millis() - 1000), // 1 second ago
        };
        assert!(auth.access_token_expired());
    }

    #[test]
    fn extract_account_id_from_jwt_basic() {
        // Build a fake JWT with chatgpt_account_id in claims
        let header = URL_SAFE_NO_PAD.encode(b"{\"alg\":\"none\"}");
        let claims =
            serde_json::json!({"chatgpt_account_id": "acc-test-123", "exp": 9_999_999_999_i64});
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        let token = format!("{header}.{payload}.sig");
        assert_eq!(
            extract_account_id_from_jwt(&token),
            Some("acc-test-123".to_string())
        );
    }

    #[test]
    fn extract_expiry_from_jwt_basic() {
        let header = URL_SAFE_NO_PAD.encode(b"{\"alg\":\"none\"}");
        let claims = serde_json::json!({"exp": 1700000000});
        let payload = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&claims).unwrap());
        let token = format!("{header}.{payload}.sig");
        assert_eq!(extract_expiry_from_jwt(&token), Some(1700000000_i64 * 1000));
    }

    #[test]
    fn serde_backwards_compat_no_account_id() {
        // Old auth JSON without account_id/expires fields should deserialize fine
        let json = r#"{
            "api_key": "sk-test",
            "access_token": "at",
            "refresh_token": "rt",
            "id_token": "it",
            "last_refresh": "2024-01-01T00:00:00Z"
        }"#;
        let auth: ChatGptAuth = serde_json::from_str(json).unwrap();
        assert_eq!(auth.api_key, "sk-test");
        assert!(auth.account_id.is_none());
        assert!(auth.expires.is_none());
    }
}
