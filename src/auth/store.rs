//! Unified authentication store – XDG-compliant JSON storage for OAuth/API keys.
//!
//! Matches OpenCode's auth.json pattern with optional AES-256-GCM encryption.
//! Storage path: `~/.local/share/pinchy/auth.json` (XDG_DATA_HOME).

use anyhow::Context;
use std::path::PathBuf;
use std::sync::RwLock;

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/// A single authentication entry (OAuth or API key).
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuthEntry {
    /// "oauth" or "api_key"
    pub r#type: String,
    /// OAuth access token
    pub access_token: Option<String>,
    /// OAuth refresh token
    pub refresh_token: Option<String>,
    /// Unix timestamp when token expires
    pub expires_at: Option<u64>,
    /// API key (for non-OAuth providers)
    pub api_key: Option<String>,
    /// Provider identifier (e.g., "github", "openai", "copilot")
    pub provider: String,
    /// Optional account/org identifier for subscription tracking
    pub account_id: Option<String>,
}

impl AuthEntry {
    /// Create a new OAuth entry.
    pub fn new_oauth(
        provider: impl Into<String>,
        access_token: impl Into<String>,
        refresh_token: Option<String>,
        expires_at: Option<u64>,
    ) -> Self {
        Self {
            r#type: "oauth".into(),
            access_token: Some(access_token.into()),
            refresh_token,
            expires_at,
            api_key: None,
            provider: provider.into(),
            account_id: None,
        }
    }

    /// Create a new API key entry.
    pub fn new_api_key(provider: impl Into<String>, api_key: impl Into<String>) -> Self {
        Self {
            r#type: "api_key".into(),
            access_token: None,
            refresh_token: None,
            expires_at: None,
            api_key: Some(api_key.into()),
            provider: provider.into(),
            account_id: None,
        }
    }
}

/// In-memory representation of the auth store.
#[derive(Debug, Default, Clone, serde::Serialize, serde::Deserialize)]
pub struct AuthStore {
    /// Map of provider_id -> auth entry
    pub entries: std::collections::HashMap<String, AuthEntry>,
}

// ---------------------------------------------------------------------------
// Global state (lazy-initialized)
// ---------------------------------------------------------------------------

static STORE: RwLock<Option<AuthStore>> = RwLock::new(None);

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/// Return the storage directory for auth.json.
/// Primary: `$XDG_DATA_HOME/pinchy/` (`~/.local/share/pinchy/`)
/// Fallback: `$HOME/.pinchy/`
fn auth_dir() -> anyhow::Result<PathBuf> {
    if let Some(xdg_data) = std::env::var_os("XDG_DATA_HOME") {
        if !xdg_data.is_empty() {
            return Ok(PathBuf::from(xdg_data).join("pinchy"));
        }
    }

    let data_dir = dirs::data_dir()
        .or_else(|| dirs::home_dir().map(|h| h.join(".local").join("share")))
        .ok_or_else(|| anyhow::anyhow!("cannot determine data directory"))?;

    Ok(data_dir.join("pinchy"))
}

/// Return the full path to auth.json.
fn auth_file_path() -> anyhow::Result<PathBuf> {
    Ok(auth_dir()?.join("auth.json"))
}

/// Return the legacy secrets directory path (for migration).
fn legacy_secrets_dir() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(".secrets")
}

// ---------------------------------------------------------------------------
// Encryption helpers (reusing secrets module patterns)
// ---------------------------------------------------------------------------

fn encryption_enabled() -> bool {
    std::env::var("PINCHY_AUTH_ENCRYPTED").as_deref() == Ok("true")
}

/// Derive or load the 32-byte encryption key.
/// Priority:
/// 1. `PINCHY_SECRET_KEY` env var (hashed with SHA-256)
/// 2. `~/.local/share/pinchy/.key` file (raw 32 bytes, created if missing)
fn load_or_create_encryption_key() -> anyhow::Result<[u8; 32]> {
    use ring::rand::{SecureRandom, SystemRandom};

    // 1. Check env var
    if let Ok(passphrase) = std::env::var("PINCHY_SECRET_KEY") {
        use ring::digest;
        let hash = digest::digest(&digest::SHA256, passphrase.as_bytes());
        let mut key = [0u8; 32];
        key.copy_from_slice(hash.as_ref());
        return Ok(key);
    }

    // 2. File-based key in auth directory
    let key_path = auth_dir()?.join(".key");
    if key_path.exists() {
        let data = std::fs::read(&key_path)
            .with_context(|| format!("read encryption key {}", key_path.display()))?;
        if data.len() != 32 {
            anyhow::bail!(
                "encryption key file {} has wrong length ({} bytes, expected 32)",
                key_path.display(),
                data.len()
            );
        }
        let mut key = [0u8; 32];
        key.copy_from_slice(&data);
        return Ok(key);
    }

    // Generate new random key
    std::fs::create_dir_all(auth_dir()?).with_context(|| "create auth dir")?;

    let rng = SystemRandom::new();
    let mut key = [0u8; 32];
    rng.fill(&mut key)
        .map_err(|_| anyhow::anyhow!("failed to generate random key"))?;

    std::fs::write(&key_path, key)
        .with_context(|| format!("write encryption key {}", key_path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600)).ok();
    }

    Ok(key)
}

/// Encrypt data using AES-256-GCM. Returns `nonce (12 bytes) || ciphertext+tag`, base64-encoded.
fn encrypt_data(key: &[u8; 32], plaintext: &[u8]) -> anyhow::Result<String> {
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
    use ring::rand::{SecureRandom, SystemRandom};

    let unbound =
        UnboundKey::new(&AES_256_GCM, key).map_err(|_| anyhow::anyhow!("invalid AES key"))?;
    let sealing_key = LessSafeKey::new(unbound);

    let rng = SystemRandom::new();
    let mut nonce_bytes = [0u8; 12];
    rng.fill(&mut nonce_bytes)
        .map_err(|_| anyhow::anyhow!("failed to generate nonce"))?;
    let nonce = Nonce::assume_unique_for_key(nonce_bytes);

    let mut in_out = plaintext.to_vec();
    sealing_key
        .seal_in_place_append_tag(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| anyhow::anyhow!("encryption failed"))?;

    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&in_out);

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

/// Decrypt base64-encoded `nonce || ciphertext+tag`.
fn decrypt_data(key: &[u8; 32], encoded: &str) -> anyhow::Result<Vec<u8>> {
    use base64::Engine;
    use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};

    let combined = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .context("base64 decode failed")?;

    if combined.len() < 12 {
        anyhow::bail!("encrypted data too short");
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce_arr: [u8; 12] = nonce_bytes.try_into().unwrap();
    let nonce = Nonce::assume_unique_for_key(nonce_arr);

    let unbound =
        UnboundKey::new(&AES_256_GCM, key).map_err(|_| anyhow::anyhow!("invalid AES key"))?;
    let opening_key = LessSafeKey::new(unbound);

    let mut in_out = ciphertext.to_vec();
    let plaintext = opening_key
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| anyhow::anyhow!("decryption failed — wrong key or corrupted data"))?;

    Ok(plaintext.to_vec())
}

// ---------------------------------------------------------------------------
// Core storage operations
// ---------------------------------------------------------------------------

/// Load auth store from disk.
/// If encrypted mode is enabled, decrypts the file before parsing.
pub fn load_auth_store() -> anyhow::Result<AuthStore> {
    let path = auth_file_path()?;

    if !path.exists() {
        // Try migration from legacy secrets
        if let Some(migrated) = try_migrate_from_legacy()? {
            return Ok(migrated);
        }
        return Ok(AuthStore::default());
    }

    let data = std::fs::read_to_string(&path)
        .with_context(|| format!("read auth store {}", path.display()))?;

    if encryption_enabled() {
        let key = load_or_create_encryption_key()?;
        let decrypted = decrypt_data(&key, &data)?;
        let json =
            String::from_utf8(decrypted).context("decrypted auth store is not valid UTF-8")?;
        let store: AuthStore = serde_json::from_str(&json)
            .with_context(|| format!("parse encrypted auth store {}", path.display()))?;
        Ok(store)
    } else {
        let store: AuthStore = serde_json::from_str(&data)
            .with_context(|| format!("parse auth store {}", path.display()))?;
        Ok(store)
    }
}

/// Save auth store to disk.
/// Creates parent directories, sets 0o600 permissions, and encrypts if enabled.
pub fn save_auth_store(store: &AuthStore) -> anyhow::Result<()> {
    let path = auth_file_path()?;

    // Ensure directory exists with proper permissions
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("create auth dir {}", parent.display()))?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700)).ok();
        }
    }

    let json = serde_json::to_string_pretty(store)?;

    let output = if encryption_enabled() {
        let key = load_or_create_encryption_key()?;
        encrypt_data(&key, json.as_bytes())?
    } else {
        json
    };

    std::fs::write(&path, &output)
        .with_context(|| format!("write auth store {}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .with_context(|| format!("set permissions on {}", path.display()))?;
    }

    // Update in-memory cache
    if let Ok(mut cache) = STORE.write() {
        *cache = Some(store.clone());
    }

    Ok(())
}

/// Get the in-memory cached store, loading from disk if needed.
fn get_cached_store() -> anyhow::Result<AuthStore> {
    if let Ok(cache) = STORE.read() {
        if let Some(store) = cache.as_ref() {
            return Ok(store.clone());
        }
    }

    let store = load_auth_store()?;
    if let Ok(mut cache) = STORE.write() {
        *cache = Some(store.clone());
    }
    Ok(store)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Get auth entry for a provider.
pub fn get_auth(provider: &str) -> Option<AuthEntry> {
    get_cached_store()
        .ok()
        .and_then(|store| store.entries.get(provider).cloned())
}

/// Set auth entry for a provider and persist to disk.
pub fn set_auth(provider: &str, entry: AuthEntry) -> anyhow::Result<()> {
    let mut store = get_cached_store()?;
    store.entries.insert(provider.to_string(), entry);
    save_auth_store(&store)?;
    Ok(())
}

/// Remove auth entry for a provider.
pub fn remove_auth(provider: &str) -> anyhow::Result<()> {
    let mut store = get_cached_store()?;
    if store.entries.remove(provider).is_some() {
        save_auth_store(&store)?;
    }
    Ok(())
}

/// Check if auth needs refresh (expires within 5 minutes).
pub fn needs_refresh(entry: &AuthEntry) -> bool {
    if entry.r#type != "oauth" {
        return false;
    }

    let Some(expires_at) = entry.expires_at else {
        return false;
    };

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // 5 minutes = 300 seconds buffer
    expires_at.saturating_sub(now) < 300
}

/// List all providers with auth configured.
pub fn list_authed_providers() -> Vec<String> {
    get_cached_store()
        .map(|store| store.entries.keys().cloned().collect())
        .unwrap_or_default()
}

// ---------------------------------------------------------------------------
// Migration from legacy .secrets/ storage
// ---------------------------------------------------------------------------

/// Try to migrate existing secrets from the legacy .secrets/ directory.
fn try_migrate_from_legacy() -> anyhow::Result<Option<AuthStore>> {
    let legacy_dir = legacy_secrets_dir();
    if !legacy_dir.exists() {
        return Ok(None);
    }

    let mut store = AuthStore::default();
    let mut migrated = false;

    // Try to read and migrate known provider secrets
    // Map legacy secret keys to provider names
    let legacy_mappings: &[(&str, &str, &str)] = &[
        ("COPILOT_TOKEN", "copilot", "oauth"),
        ("GITHUB_TOKEN", "github", "oauth"),
        ("OPENAI_API_KEY", "openai", "api_key"),
        ("DISCORD_TOKEN", "discord", "api_key"),
        ("ANTHROPIC_API_KEY", "anthropic", "api_key"),
    ];

    for (key, provider, auth_type) in legacy_mappings {
        let secret_file = legacy_dir.join(key);
        if !secret_file.exists() {
            continue;
        }

        // Try to read the secret (may be encrypted)
        match crate::secrets::get_secret_file(Some(&legacy_dir), key) {
            Ok(Some(value)) => {
                let entry = if *auth_type == "oauth" {
                    AuthEntry::new_oauth(*provider, value, None, None)
                } else {
                    AuthEntry::new_api_key(*provider, value)
                };
                store.entries.insert(provider.to_string(), entry);
                migrated = true;
                tracing::info!("Migrated {} secret to auth store", provider);
            }
            Ok(None) => {}
            Err(e) => {
                tracing::warn!("Failed to migrate {}: {}", key, e);
            }
        }
    }

    if migrated {
        // Create backup of legacy directory
        let backup_dir = legacy_dir.with_extension("backup");
        if let Err(e) = backup_legacy_secrets(&legacy_dir, &backup_dir) {
            tracing::warn!("Failed to backup legacy secrets: {}", e);
        } else {
            tracing::info!("Backed up legacy secrets to {}", backup_dir.display());
        }

        // Save the migrated store
        save_auth_store(&store)?;
        Ok(Some(store))
    } else {
        Ok(None)
    }
}

/// Create a backup of the legacy secrets directory.
fn backup_legacy_secrets(source: &std::path::Path, backup: &std::path::Path) -> anyhow::Result<()> {
    use std::io::Write;

    // Create backup directory
    std::fs::create_dir_all(backup)
        .with_context(|| format!("create backup dir {}", backup.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(backup, std::fs::Permissions::from_mode(0o700)).ok();
    }

    // Copy all files
    for entry in std::fs::read_dir(source)? {
        let entry = entry?;
        let path = entry.path();
        if path.is_file() {
            let dest = backup.join(path.file_name().unwrap());
            std::fs::copy(&path, &dest)?;
            #[cfg(unix)]
            {
                if let Ok(metadata) = entry.metadata() {
                    std::fs::set_permissions(&dest, metadata.permissions()).ok();
                }
            }
        }
    }

    // Write timestamp file
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let mut ts_file = std::fs::File::create(backup.join(".migrated_at"))?;
    writeln!(ts_file, "{}", timestamp)?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_entry_oauth_creation() {
        let entry = AuthEntry::new_oauth(
            "github",
            "token123",
            Some("refresh456".into()),
            Some(1234567890),
        );
        assert_eq!(entry.r#type, "oauth");
        assert_eq!(entry.provider, "github");
        assert_eq!(entry.access_token, Some("token123".into()));
        assert_eq!(entry.refresh_token, Some("refresh456".into()));
        assert_eq!(entry.expires_at, Some(1234567890));
        assert!(entry.api_key.is_none());
    }

    #[test]
    fn auth_entry_api_key_creation() {
        let entry = AuthEntry::new_api_key("openai", "sk-abc123");
        assert_eq!(entry.r#type, "api_key");
        assert_eq!(entry.provider, "openai");
        assert_eq!(entry.api_key, Some("sk-abc123".into()));
        assert!(entry.access_token.is_none());
        assert!(entry.refresh_token.is_none());
        assert!(entry.expires_at.is_none());
    }

    #[test]
    fn needs_refresh_with_no_expiry() {
        let entry = AuthEntry::new_oauth("github", "token", None, None);
        assert!(!needs_refresh(&entry));
    }

    #[test]
    fn needs_refresh_with_future_expiry() {
        let future = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 3600; // 1 hour from now
        let entry = AuthEntry::new_oauth("github", "token", None, Some(future));
        assert!(!needs_refresh(&entry));
    }

    #[test]
    fn needs_refresh_with_past_expiry() {
        let past = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            - 60; // 1 minute ago
        let entry = AuthEntry::new_oauth("github", "token", None, Some(past));
        assert!(needs_refresh(&entry));
    }

    #[test]
    fn needs_refresh_with_imminent_expiry() {
        let soon = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 60; // 1 minute from now
        let entry = AuthEntry::new_oauth("github", "token", None, Some(soon));
        assert!(needs_refresh(&entry));
    }

    #[test]
    fn needs_refresh_api_key_never() {
        let entry = AuthEntry::new_api_key("openai", "sk-abc");
        assert!(!needs_refresh(&entry));
    }
}
