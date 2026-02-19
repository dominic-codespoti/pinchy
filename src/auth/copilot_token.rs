//! Copilot token exchange and caching.
//!
//! Exchanges a GitHub access token for a short-lived Copilot session
//! token via the internal Copilot API, and caches the result on disk.

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tracing::{debug, warn};

// ---------------------------------------------------------------------------
// CopilotToken
// ---------------------------------------------------------------------------

/// A short-lived Copilot session token obtained by exchanging a GitHub
/// personal / OAuth access token.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CopilotToken {
    /// The bearer token used to authenticate with the Copilot API proxy.
    pub token: String,
    /// When this token expires (if the API provided the information).
    pub expires_at: Option<DateTime<Utc>>,
    /// Optional proxy endpoint returned by the token exchange API.
    pub proxy_ep: Option<String>,
}

impl CopilotToken {
    /// Returns `true` when the token has a known expiry that is in the past
    /// (with a 60-second safety margin).
    pub fn is_expired(&self) -> bool {
        match self.expires_at {
            Some(exp) => Utc::now() >= exp - chrono::Duration::seconds(60),
            None => false, // unknown expiry → treat as valid
        }
    }
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

/// Exchange a GitHub access token for a Copilot session token.
///
/// Sends `GET https://api.github.com/copilot_internal/v2/token` with the
/// provided GitHub token as a Bearer credential.  The response JSON is
/// expected to contain at least a `token` field; `expires_at` and
/// `endpoints.api` (proxy endpoint) are extracted when present.
pub async fn exchange_github_for_copilot_token(github_token: &str) -> anyhow::Result<CopilotToken> {
    let http = reqwest::Client::new();

    let resp: serde_json::Value = http
        .get("https://api.github.com/copilot_internal/v2/token")
        .header("Authorization", format!("Bearer {github_token}"))
        .header("User-Agent", "mini_claw")
        .header("Accept", "application/json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let token = resp["token"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing `token` in Copilot token response"))?
        .to_string();

    // Try to parse `expires_at` — the API may return an ISO-8601 string or
    // a Unix timestamp (integer).
    let expires_at: Option<DateTime<Utc>> = resp.get("expires_at").and_then(|v| {
        if let Some(s) = v.as_str() {
            DateTime::parse_from_rfc3339(s)
                .map(|dt| dt.with_timezone(&Utc))
                .ok()
        } else if let Some(ts) = v.as_i64() {
            DateTime::from_timestamp(ts, 0)
        } else {
            None
        }
    });

    // Proxy endpoint — the API may return it at top level or nested under
    // `endpoints.api`.
    let proxy_ep: Option<String> = resp
        .get("endpoints")
        .and_then(|e| e.get("api"))
        .and_then(|v| v.as_str())
        .or_else(|| resp.get("proxy_ep").and_then(|v| v.as_str()))
        .map(|s| s.to_string());

    debug!("Copilot token exchange succeeded");
    Ok(CopilotToken {
        token,
        expires_at,
        proxy_ep,
    })
}

// ---------------------------------------------------------------------------
// Disk cache helpers
// ---------------------------------------------------------------------------

/// Return the cache file path: `$XDG_CONFIG_HOME/mini_claw/copilot-token.json`
/// (falls back to `$HOME/.config/mini_claw/copilot-token.json`).
fn cache_path() -> anyhow::Result<PathBuf> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| anyhow::anyhow!("cannot determine config directory"))?;
    Ok(config_dir.join("mini_claw").join("copilot-token.json"))
}

/// Persist a [`CopilotToken`] to the local cache file with `0o600` permissions.
pub fn cache_copilot_token(t: &CopilotToken) -> anyhow::Result<()> {
    let path = cache_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let json = serde_json::to_string_pretty(t)?;
    fs::write(&path, &json)?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    debug!(path = %path.display(), "Copilot token cached");
    Ok(())
}

/// Load a previously cached [`CopilotToken`], if one exists and parses
/// correctly.  Returns `Ok(None)` when no cache file is present.
pub fn retrieve_cached_copilot_token() -> anyhow::Result<Option<CopilotToken>> {
    let path = cache_path()?;
    if !path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&path)?;
    match serde_json::from_str::<CopilotToken>(&data) {
        Ok(t) => Ok(Some(t)),
        Err(e) => {
            warn!(path = %path.display(), "failed to parse cached Copilot token: {e}");
            Ok(None)
        }
    }
}

/// Remove the cached Copilot token file, if it exists.
pub fn remove_cached_copilot_token() -> anyhow::Result<()> {
    let path = cache_path()?;
    if path.exists() {
        fs::remove_file(&path)?;
        debug!(path = %path.display(), "cached Copilot token removed");
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cache_path_looks_reasonable() {
        let p = cache_path().unwrap();
        assert!(p.to_string_lossy().contains("mini_claw"));
        assert!(p.to_string_lossy().ends_with("copilot-token.json"));
    }

    #[test]
    fn is_expired_with_no_expiry() {
        let ct = CopilotToken {
            token: "test".into(),
            expires_at: None,
            proxy_ep: None,
        };
        assert!(!ct.is_expired());
    }

    #[test]
    fn is_expired_with_past_expiry() {
        let ct = CopilotToken {
            token: "test".into(),
            expires_at: Some(Utc::now() - chrono::Duration::hours(1)),
            proxy_ep: None,
        };
        assert!(ct.is_expired());
    }

    #[test]
    fn is_expired_with_future_expiry() {
        let ct = CopilotToken {
            token: "test".into(),
            expires_at: Some(Utc::now() + chrono::Duration::hours(1)),
            proxy_ep: None,
        };
        assert!(!ct.is_expired());
    }

    #[test]
    fn round_trip_serde() {
        let ct = CopilotToken {
            token: "tok_abc".into(),
            expires_at: Some(Utc::now()),
            proxy_ep: Some("https://proxy.example.com".into()),
        };
        let json = serde_json::to_string(&ct).unwrap();
        let ct2: CopilotToken = serde_json::from_str(&json).unwrap();
        assert_eq!(ct.token, ct2.token);
        assert_eq!(ct.proxy_ep, ct2.proxy_ep);
    }
}
