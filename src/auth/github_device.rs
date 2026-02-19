//! GitHub OAuth device-flow login and keyring-backed token storage.
//!
//! Provides [`device_flow_get_token`] to interactively obtain a GitHub
//! token, plus [`store_token`] / [`retrieve_token`] / [`remove_token`]
//! for persisting it in the OS keyring (with a file-based fallback).

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::PathBuf;

use tracing::{debug, warn};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Default GitHub OAuth App client ID (OpenClaw).
pub const DEFAULT_CLIENT_ID: &str = "Iv1.b507a08c87ecfe98";

const KEYRING_SERVICE: &str = "mini_claw_copilot";
const KEYRING_USER: &str = "default";

// ---------------------------------------------------------------------------
// Device-flow login
// ---------------------------------------------------------------------------

/// Run the GitHub OAuth device-flow to obtain an access token.
///
/// Prints the verification URI and user code to stdout, then polls
/// until the user authorises the app.
pub async fn device_flow_get_token(client_id: &str) -> anyhow::Result<String> {
    let http = reqwest::Client::new();

    // Step 1 — request a device code.
    let resp: serde_json::Value = http
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", client_id), ("scope", "read:user")])
        .send()
        .await?
        .json()
        .await?;

    let device_code = resp["device_code"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("missing device_code in response"))?
        .to_string();
    let user_code = resp["user_code"].as_str().unwrap_or("???");
    let uri = resp["verification_uri"]
        .as_str()
        .unwrap_or("https://github.com/login/device");
    let interval = resp["interval"].as_u64().unwrap_or(5);

    // Print to stdout (never to tracing, to avoid leaking codes in logs).
    println!();
    println!("  Open:  {uri}");
    println!("  Code:  {user_code}");
    println!();
    println!("Waiting for authorisation…");

    // Step 2 — poll until authorised.
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;

        let poll: serde_json::Value = http
            .post("https://github.com/login/oauth/access_token")
            .header("Accept", "application/json")
            .form(&[
                ("client_id", client_id),
                ("device_code", device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await?
            .json()
            .await?;

        if let Some(tok) = poll["access_token"].as_str() {
            return Ok(tok.to_string());
        }

        match poll["error"].as_str() {
            Some("authorization_pending") => continue,
            Some("slow_down") => {
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
            Some(other) => anyhow::bail!("device flow error: {other}"),
            None => anyhow::bail!("unexpected poll response: {poll}"),
        }
    }
}

// ---------------------------------------------------------------------------
// Token storage (keyring with file fallback)
// ---------------------------------------------------------------------------

/// Resolve the fallback file path: `$HOME/.config/mini_claw/copilot_token`.
fn fallback_path() -> anyhow::Result<PathBuf> {
    let home = std::env::var("HOME").map(PathBuf::from).or_else(|_| {
        dirs::home_dir().ok_or_else(|| anyhow::anyhow!("cannot determine home directory"))
    })?;
    Ok(home.join(".config").join("mini_claw").join("copilot_token"))
}

/// Store a token in the OS keyring; fall back to a file if keyring fails.
pub fn store_token(token: &str) -> anyhow::Result<()> {
    // Try keyring first.
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER);
    match entry.set_password(token) {
        Ok(()) => {
            debug!("token stored in OS keyring");
            return Ok(());
        }
        Err(e) => {
            warn!("keyring store failed ({e}), falling back to file");
        }
    }

    // File fallback.
    let path = fallback_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(&path, token)?;
    fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
    debug!(path = %path.display(), "token stored in fallback file");
    Ok(())
}

/// Retrieve the stored token (keyring first, then file fallback).
///
/// Returns `Ok(None)` when no token has been stored yet.
pub fn retrieve_token() -> anyhow::Result<Option<String>> {
    // Try keyring first.
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER);
    match entry.get_password() {
        Ok(pw) => return Ok(Some(pw)),
        Err(keyring::Error::NoEntry) => { /* fall through */ }
        Err(e) => {
            warn!("keyring retrieve failed ({e}), trying file fallback");
        }
    }

    // File fallback.
    let path = fallback_path()?;
    if path.exists() {
        let contents = fs::read_to_string(&path)?;
        let trimmed = contents.trim().to_string();
        if trimmed.is_empty() {
            Ok(None)
        } else {
            Ok(Some(trimmed))
        }
    } else {
        Ok(None)
    }
}

/// Remove the stored token from both keyring and fallback file.
pub fn remove_token() -> anyhow::Result<()> {
    let mut removed = false;

    // Keyring.
    let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER);
    match entry.delete_password() {
        Ok(()) => {
            debug!("token removed from OS keyring");
            removed = true;
        }
        Err(keyring::Error::NoEntry) => { /* nothing stored */ }
        Err(e) => warn!("keyring delete failed: {e}"),
    }

    // File fallback.
    let path = fallback_path()?;
    if path.exists() {
        fs::remove_file(&path)?;
        debug!(path = %path.display(), "fallback token file removed");
        removed = true;
    }

    if !removed {
        debug!("no stored token found — nothing to remove");
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
    fn fallback_path_is_reasonable() {
        let p = fallback_path().unwrap();
        assert!(p.to_string_lossy().contains("mini_claw"));
        assert!(p.to_string_lossy().ends_with("copilot_token"));
    }
}
