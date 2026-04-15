//! GitLab OAuth authentication (PKCE Authorization Code flow + PAT support).
//!
//! Provides OAuth authentication for gitlab.com and Personal Access Token (PAT)
//! authentication for self-hosted GitLab instances.
//!
//! ## Auth Types
//!
//! - **OAuth Authorization Code + PKCE**: For gitlab.com, opens browser for user consent
//! - **Personal Access Token (PAT)**: For self-hosted GitLab instances
//!
//! ## Configuration
//!
//! Environment variables:
//! - `GITLAB_TOKEN` — PAT for self-hosted instances
//! - `GITLAB_CLIENT_ID` — OAuth app client ID
//! - `GITLAB_CLIENT_SECRET` — OAuth app client secret (optional for public apps)
//! - `GITLAB_INSTANCE_URL` — Self-hosted URL (defaults to https://gitlab.com)
//!
//! Config file (`config.yaml`):
//! ```yaml
//! gitlab:
//!   instance_url: "https://gitlab.company.com"
//!   oauth_client_id: "your-client-id"
//!   oauth_client_secret: "your-client-secret"  # optional
//! ```

use std::collections::HashMap;
use std::fs;
#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use ring::digest;
use ring::rand::{SecureRandom, SystemRandom};
use serde::{Deserialize, Serialize};
use tracing::{debug, info, warn};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default GitLab instance URL.
const DEFAULT_INSTANCE_URL: &str = "https://gitlab.com";

/// OAuth scopes requested.
const SCOPES: &str = "read_api read_user";

/// Local callback port (matches OpenCode).
const CALLBACK_PORT: u16 = 1455;

/// Local redirect URI.
const REDIRECT_URI: &str = "http://localhost:1455/auth/callback";

/// Auth file name.
const AUTH_FILE: &str = "gitlab-auth.json";

/// How often to refresh tokens before expiry (5 minutes).
const REFRESH_BUFFER_SECS: u64 = 300;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// Persisted authentication state for GitLab.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitLabAuth {
    /// OAuth access token or PAT.
    pub access_token: String,
    /// OAuth refresh token (only for OAuth flow).
    pub refresh_token: Option<String>,
    /// Token expiry timestamp (epoch seconds).
    pub expires_at: Option<u64>,
    /// GitLab instance URL (e.g., "https://gitlab.com").
    pub instance_url: String,
    /// Type of token stored.
    pub token_type: GitLabTokenType,
    /// OAuth client ID used (stored for refresh purposes).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_id: Option<String>,
    /// OAuth client secret used (stored for refresh purposes, if any).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub client_secret: Option<String>,
}

impl GitLabAuth {
    /// Returns `true` if the token is expired or about to expire.
    pub fn is_expired(&self) -> bool {
        match self.expires_at {
            Some(exp) => {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs();
                now + REFRESH_BUFFER_SECS >= exp
            }
            None => false, // PATs don't expire
        }
    }

    /// Returns `true` if this auth can be refreshed (has refresh_token).
    pub fn can_refresh(&self) -> bool {
        matches!(self.token_type, GitLabTokenType::OAuth) && self.refresh_token.is_some()
    }
}

/// Type of GitLab token.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GitLabTokenType {
    /// OAuth token obtained via authorization code flow.
    OAuth,
    /// Personal Access Token.
    Pat,
}

/// OAuth token response from GitLab.
#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    #[serde(rename = "token_type")]
    _token_type: String,
}

/// GitLab user info (for token validation).
#[derive(Debug, Deserialize)]
struct UserInfo {
    #[serde(rename = "id")]
    _id: u64,
    username: String,
}

/// GitLab configuration (from config.yaml or env).
#[derive(Debug, Clone, Default)]
pub struct GitLabConfig {
    pub instance_url: Option<String>,
    pub oauth_client_id: Option<String>,
    pub oauth_client_secret: Option<String>,
}

impl GitLabConfig {
    /// Load from environment variables and config.
    pub fn load() -> Self {
        Self {
            instance_url: std::env::var("GITLAB_INSTANCE_URL").ok(),
            oauth_client_id: std::env::var("GITLAB_CLIENT_ID").ok(),
            oauth_client_secret: std::env::var("GITLAB_CLIENT_SECRET").ok(),
        }
    }

    /// Get effective instance URL.
    pub fn instance_url(&self) -> &str {
        self.instance_url.as_deref().unwrap_or(DEFAULT_INSTANCE_URL)
    }
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

/// Generate a random state parameter for CSRF protection.
pub fn generate_state() -> anyhow::Result<String> {
    let rng = SystemRandom::new();
    let mut buf = [0u8; 32];
    rng.fill(&mut buf)
        .map_err(|_| anyhow::anyhow!("failed to generate random bytes for OAuth state"))?;
    Ok(URL_SAFE_NO_PAD.encode(buf))
}

/// Percent-encode a string for URL query parameters (RFC 3986).
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

// ---------------------------------------------------------------------------
// Authorization URL
// ---------------------------------------------------------------------------

/// Build the GitLab OAuth authorization URL.
///
/// GitLab OAuth docs: https://docs.gitlab.com/ce/api/oauth2.html
pub fn build_auth_url(
    client_id: &str,
    code_verifier: &str,
    state: &str,
    instance_url: &str,
) -> String {
    let challenge = code_challenge(code_verifier);

    let params: HashMap<&str, &str> = [
        ("client_id", client_id),
        ("redirect_uri", REDIRECT_URI),
        ("response_type", "code"),
        ("scope", SCOPES),
        ("code_challenge", &challenge),
        ("code_challenge_method", "S256"),
        ("state", state),
    ]
    .into_iter()
    .collect();

    let query = params
        .iter()
        .map(|(k, v)| format!("{}={}", pct_encode(k), pct_encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    format!("{instance_url}/oauth/authorize?{query}")
}

/// Try to open a URL in the user's default browser.
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

/// Wait for the OAuth callback on localhost:1455.
///
/// Returns the authorization code on success.
pub async fn wait_for_callback(expected_state: &str) -> anyhow::Result<String> {
    use tokio::io::AsyncWriteExt;
    use tokio::net::TcpListener;

    let addr = format!("127.0.0.1:{CALLBACK_PORT}");
    let listener = TcpListener::bind(&addr)
        .await
        .map_err(|e| anyhow::anyhow!("failed to bind callback server on {addr}: {e}"))?;

    info!("GitLab OAuth callback server listening on {addr}");

    let (mut stream, _peer) = listener.accept().await?;

    // Read the HTTP request.
    let mut buf = vec![0u8; 4096];
    let n = match stream.try_read(&mut buf) {
        Ok(n) => n,
        Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
            stream.readable().await?;
            stream.try_read(&mut buf)?
        }
        Err(e) => return Err(e.into()),
    };

    let request = String::from_utf8_lossy(&buf[..n]);

    // Parse the GET request line.
    let first_line = request.lines().next().unwrap_or("");
    let path = first_line.split_whitespace().nth(1).unwrap_or("");

    // Check for error.
    if let Some(err) = extract_query_param(path, "error") {
        let desc = extract_query_param(path, "error_description").unwrap_or_default();
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
        let _ = stream.try_write(response.as_bytes());
        let _ = stream.shutdown().await;

        return Err(anyhow::anyhow!("OAuth error: {err} — {desc}"));
    }

    // Extract code.
    let code = extract_query_param(path, "code")
        .ok_or_else(|| anyhow::anyhow!("no `code` parameter in OAuth callback"))?;

    // Validate state.
    let callback_state = extract_query_param(path, "state").unwrap_or_default();
    if callback_state != expected_state {
        let error_body = "<html><body><h2>Authentication failed</h2><p>Invalid state — potential CSRF attack.</p>\
             <p>You can close this tab.</p></body></html>";
        let response = format!(
            "HTTP/1.1 400 Bad Request\r\n\
             Content-Type: text/html\r\n\
             Content-Length: {}\r\n\
             Connection: close\r\n\r\n{}",
            error_body.len(),
            error_body
        );
        let _ = stream.try_write(response.as_bytes());
        let _ = stream.shutdown().await;

        return Err(anyhow::anyhow!(
            "OAuth state mismatch — expected {expected_state}, got {callback_state}"
        ));
    }

    // Send success response.
    let success_body = "<html><body><h2>Signed in to GitLab!</h2>\
         <p>You can close this tab and return to Pinchy.</p></body></html>";
    let response = format!(
        "HTTP/1.1 200 OK\r\n\
         Content-Type: text/html\r\n\
         Content-Length: {}\r\n\
         Connection: close\r\n\r\n{}",
        success_body.len(),
        success_body
    );
    let _ = stream.try_write(response.as_bytes());
    let _ = stream.shutdown().await;

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
            return Some(v.replace("%20", " ").replace('+', " ").replace("%2B", "+"));
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/// Exchange OAuth authorization code for tokens.
pub async fn exchange_code(
    client_id: &str,
    client_secret: Option<&str>,
    code: &str,
    code_verifier: &str,
    _redirect_uri: &str, // Included for API compatibility, but we use constant
    instance_url: &str,
) -> anyhow::Result<GitLabAuth> {
    let http = crate::models::get_shared_http_client();

    let mut form: HashMap<&str, &str> = [
        ("grant_type", "authorization_code"),
        ("code", code),
        ("redirect_uri", REDIRECT_URI),
        ("client_id", client_id),
        ("code_verifier", code_verifier),
    ]
    .into_iter()
    .collect();

    // Add client_secret if provided (confidential clients).
    let secret_owned;
    if let Some(secret) = client_secret {
        secret_owned = secret.to_string();
        form.insert("client_secret", &secret_owned);
    }

    let resp = http
        .post(format!("{instance_url}/oauth/token"))
        .form(&form)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("token exchange failed: HTTP {status} — {body}");
    }

    let token_resp: TokenResponse = resp.json().await?;

    // Calculate expiry time.
    let expires_at = token_resp.expires_in.map(|secs| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + secs
    });

    // Validate the token by fetching user info.
    validate_token(&token_resp.access_token, instance_url).await?;

    Ok(GitLabAuth {
        access_token: token_resp.access_token,
        refresh_token: token_resp.refresh_token,
        expires_at,
        instance_url: instance_url.to_string(),
        token_type: GitLabTokenType::OAuth,
        client_id: Some(client_id.to_string()),
        client_secret: client_secret.map(String::from),
    })
}

/// Refresh OAuth tokens using a refresh token.
pub async fn refresh_tokens(
    client_id: &str,
    client_secret: Option<&str>,
    refresh_token: &str,
    instance_url: &str,
) -> anyhow::Result<GitLabAuth> {
    let http = crate::models::get_shared_http_client();

    let mut form: HashMap<&str, &str> = [
        ("grant_type", "refresh_token"),
        ("refresh_token", refresh_token),
        ("client_id", client_id),
    ]
    .into_iter()
    .collect();

    // Add client_secret if provided.
    let secret_owned;
    if let Some(secret) = client_secret {
        secret_owned = secret.to_string();
        form.insert("client_secret", &secret_owned);
    }

    let resp = http
        .post(format!("{instance_url}/oauth/token"))
        .form(&form)
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("token refresh failed: HTTP {status} — {body}");
    }

    let token_resp: TokenResponse = resp.json().await?;

    let expires_at = token_resp.expires_in.map(|secs| {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            + secs
    });

    validate_token(&token_resp.access_token, instance_url).await?;

    // GitLab may return a new refresh token or keep the same one.
    let new_refresh_token = token_resp
        .refresh_token
        .unwrap_or_else(|| refresh_token.to_string());

    Ok(GitLabAuth {
        access_token: token_resp.access_token,
        refresh_token: Some(new_refresh_token),
        expires_at,
        instance_url: instance_url.to_string(),
        token_type: GitLabTokenType::OAuth,
        client_id: Some(client_id.to_string()),
        client_secret: client_secret.map(String::from),
    })
}

/// Validate a token by fetching user info from the GitLab API.
async fn validate_token(token: &str, instance_url: &str) -> anyhow::Result<UserInfo> {
    let http = crate::models::get_shared_http_client();

    let resp = http
        .get(format!("{instance_url}/api/v4/user"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("token validation failed: HTTP {status} — {body}");
    }

    let user: UserInfo = resp.json().await?;
    debug!("GitLab token validated for user: {}", user.username);
    Ok(user)
}

// ---------------------------------------------------------------------------
// Full OAuth flow
// ---------------------------------------------------------------------------

/// Run the complete GitLab OAuth PKCE flow.
///
/// 1. Generate PKCE verifier/challenge.
/// 2. Open browser to GitLab authorization URL.
/// 3. Wait for callback on localhost:1455.
/// 4. Exchange code for tokens.
/// 5. Persist auth state.
///
/// Returns the [`GitLabAuth`] on success.
pub async fn oauth_authorization_code_flow(
    client_id: &str,
    client_secret: Option<&str>,
    instance_url: &str,
) -> anyhow::Result<GitLabAuth> {
    let code_verifier = generate_code_verifier()?;
    let state = generate_state()?;
    let auth_url = build_auth_url(client_id, &code_verifier, &state, instance_url);

    info!("Opening browser for GitLab OAuth login...");

    if !open_browser(&auth_url) {
        info!("Could not open browser automatically. Please visit:\n{auth_url}");
    }

    // Wait for callback.
    let code = wait_for_callback(&state).await?;

    // Exchange code for tokens.
    let auth = exchange_code(
        client_id,
        client_secret,
        &code,
        &code_verifier,
        REDIRECT_URI,
        instance_url,
    )
    .await?;

    // Persist.
    store_auth(&auth)?;

    info!("GitLab OAuth login complete");
    Ok(auth)
}

/// PAT authentication (simple validation).
///
/// Validates the PAT by fetching user info from the GitLab API.
pub async fn pat_auth(token: &str, instance_url: &str) -> anyhow::Result<GitLabAuth> {
    // Validate the token.
    validate_token(token, instance_url).await?;

    Ok(GitLabAuth {
        access_token: token.to_string(),
        refresh_token: None,
        expires_at: None,
        instance_url: instance_url.to_string(),
        token_type: GitLabTokenType::Pat,
        client_id: None,
        client_secret: None,
    })
}

// ---------------------------------------------------------------------------
// Token storage
// ---------------------------------------------------------------------------

/// Return the auth file path: `$XDG_CONFIG_HOME/pinchy/gitlab-auth.json`.
fn auth_path() -> anyhow::Result<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| anyhow::anyhow!("cannot determine config directory"))?;
    Ok(config_dir.join("pinchy").join(AUTH_FILE))
}

/// Persist [`GitLabAuth`] to disk with restrictive permissions.
pub fn store_auth(auth: &GitLabAuth) -> anyhow::Result<()> {
    let path = auth_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(auth)?;
    fs::write(&path, &json)?;
    #[cfg(unix)]
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    debug!(path = %path.display(), "GitLab auth stored");
    Ok(())
}

/// Load stored [`GitLabAuth`] from disk.
///
/// Returns `Ok(None)` if no auth file exists.
pub fn retrieve_auth() -> anyhow::Result<Option<GitLabAuth>> {
    let path = auth_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path)?;
    match serde_json::from_str::<GitLabAuth>(&data) {
        Ok(auth) => Ok(Some(auth)),
        Err(e) => {
            warn!(path = %path.display(), "failed to parse GitLab auth: {e}");
            Ok(None)
        }
    }
}

/// Remove stored GitLab auth from disk.
pub fn clear_auth() -> anyhow::Result<()> {
    let path = auth_path()?;
    if path.exists() {
        fs::remove_file(&path)?;
        debug!(path = %path.display(), "GitLab auth removed");
    }
    Ok(())
}

/// Check whether GitLab credentials are stored.
pub fn is_authed() -> bool {
    auth_path().ok().map(|p| p.exists()).unwrap_or(false)
}

// ---------------------------------------------------------------------------
// High-level helpers
// ---------------------------------------------------------------------------

/// Get or refresh stored auth.
///
/// If auth is expired and has a refresh token, attempts to refresh.
/// Returns `Ok(None)` if no auth is stored.
pub async fn get_or_refresh_auth() -> anyhow::Result<Option<GitLabAuth>> {
    let auth = match retrieve_auth()? {
        Some(a) => a,
        None => return Ok(None),
    };

    // PATs don't expire.
    if matches!(auth.token_type, GitLabTokenType::Pat) {
        return Ok(Some(auth));
    }

    // Check if refresh is needed.
    if !auth.is_expired() {
        return Ok(Some(auth));
    }

    // Try to refresh.
    if let (Some(refresh_token), Some(client_id)) = (&auth.refresh_token, &auth.client_id) {
        info!("GitLab OAuth token expired, refreshing...");

        match refresh_tokens(
            client_id,
            auth.client_secret.as_deref(),
            refresh_token,
            &auth.instance_url,
        )
        .await
        {
            Ok(refreshed) => {
                store_auth(&refreshed)?;
                return Ok(Some(refreshed));
            }
            Err(e) => {
                warn!("GitLab token refresh failed: {e} — using existing token");
                // Return existing auth; it might still work.
                return Ok(Some(auth));
            }
        }
    }

    // Can't refresh, return existing (may fail on next API call).
    warn!("GitLab OAuth token expired but no refresh token available");
    Ok(Some(auth))
}

/// Get the stored auth without attempting refresh.
pub fn get_auth() -> anyhow::Result<Option<GitLabAuth>> {
    retrieve_auth()
}

/// Attempt initial authentication from environment or config.
///
/// Priority:
/// 1. `GITLAB_TOKEN` env var (PAT auth)
/// 2. Stored OAuth auth (with auto-refresh if expired)
/// 3. Configured OAuth client (if client_id available, starts OAuth flow)
pub async fn init_auth() -> anyhow::Result<Option<GitLabAuth>> {
    let config = GitLabConfig::load();

    // 1. Try PAT from environment.
    if let Ok(token) = std::env::var("GITLAB_TOKEN") {
        let instance_url = config.instance_url();
        info!("Authenticating with GitLab PAT from environment");
        let auth = pat_auth(&token, instance_url).await?;
        store_auth(&auth)?;
        return Ok(Some(auth));
    }

    // 2. Try stored auth.
    if let Some(auth) = get_or_refresh_auth().await? {
        return Ok(Some(auth));
    }

    // 3. No auth available.
    Ok(None)
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
        let verifier = generate_code_verifier().unwrap();
        let state = generate_state().unwrap();
        let url = build_auth_url("test-client", &verifier, &state, "https://gitlab.com");
        assert!(url.contains("gitlab.com/oauth/authorize"));
        assert!(url.contains("test-client"));
        assert!(url.contains("code_challenge_method=S256"));
        assert!(url.contains("response_type=code"));
        assert!(url.contains("scope=read_api"));
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
        assert!(p.to_string_lossy().ends_with(AUTH_FILE));
    }

    #[test]
    fn gitlab_auth_expired_check() {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs();

        let expired = GitLabAuth {
            access_token: "test".into(),
            refresh_token: None,
            expires_at: Some(now - 100), // expired 100 seconds ago
            instance_url: "https://gitlab.com".into(),
            token_type: GitLabTokenType::OAuth,
            client_id: None,
            client_secret: None,
        };
        assert!(expired.is_expired());

        let valid = GitLabAuth {
            access_token: "test".into(),
            refresh_token: None,
            expires_at: Some(now + 3600), // expires in 1 hour
            instance_url: "https://gitlab.com".into(),
            token_type: GitLabTokenType::OAuth,
            client_id: None,
            client_secret: None,
        };
        assert!(!valid.is_expired());

        let pat = GitLabAuth {
            access_token: "test".into(),
            refresh_token: None,
            expires_at: None,
            instance_url: "https://gitlab.com".into(),
            token_type: GitLabTokenType::Pat,
            client_id: None,
            client_secret: None,
        };
        assert!(!pat.is_expired()); // PATs don't expire
    }

    #[test]
    fn gitlab_config_defaults() {
        let config = GitLabConfig::default();
        assert_eq!(config.instance_url(), DEFAULT_INSTANCE_URL);

        let config_with_url = GitLabConfig {
            instance_url: Some("https://gitlab.company.com".into()),
            ..Default::default()
        };
        assert_eq!(config_with_url.instance_url(), "https://gitlab.company.com");
    }

    #[test]
    fn round_trip_serde() {
        let auth = GitLabAuth {
            access_token: "glpat-test".into(),
            refresh_token: Some("refresh123".into()),
            expires_at: Some(1234567890),
            instance_url: "https://gitlab.com".into(),
            token_type: GitLabTokenType::OAuth,
            client_id: Some("client123".into()),
            client_secret: Some("secret456".into()),
        };
        let json = serde_json::to_string(&auth).unwrap();
        let auth2: GitLabAuth = serde_json::from_str(&json).unwrap();
        assert_eq!(auth.access_token, auth2.access_token);
        assert_eq!(auth.refresh_token, auth2.refresh_token);
        assert_eq!(auth.instance_url, auth2.instance_url);
        assert_eq!(auth.expires_at, auth2.expires_at);
    }
}
