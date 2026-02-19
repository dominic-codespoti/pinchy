//! Secrets management – encrypted file-backed secret storage.
//!
//! Secrets are stored as AES-256-GCM encrypted files inside a `.secrets/`
//! directory (by default at the project root).  Each key maps to a single
//! file whose contents are `nonce || ciphertext` (encoded as base64).
//!
//! The encryption key is derived from either the `PINCHY_SECRET_KEY`
//! environment variable or a randomly generated `.secrets/.key` file
//! (created on first use with mode `0o600`).

use anyhow::Context;
use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::rand::{SecureRandom, SystemRandom};
use std::path::{Path, PathBuf};

/// Default directory used when no explicit path is given.
fn default_secrets_dir() -> PathBuf {
    PathBuf::from(".secrets")
}

/// Derive or load the 32-byte encryption key.
///
/// Priority:
/// 1. `PINCHY_SECRET_KEY` env var (hashed with SHA-256 to get 32 bytes)
/// 2. `.secrets/.key` file (raw 32 bytes, created if missing)
fn load_or_create_key(secrets_dir: &Path) -> anyhow::Result<[u8; 32]> {
    // 1. Check env var.
    if let Ok(passphrase) = std::env::var("PINCHY_SECRET_KEY") {
        use ring::digest;
        let hash = digest::digest(&digest::SHA256, passphrase.as_bytes());
        let mut key = [0u8; 32];
        key.copy_from_slice(hash.as_ref());
        return Ok(key);
    }

    // 2. File-based key.
    let key_path = secrets_dir.join(".key");
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

    // Generate a new random key.
    std::fs::create_dir_all(secrets_dir)
        .with_context(|| format!("create secrets dir {}", secrets_dir.display()))?;

    let rng = SystemRandom::new();
    let mut key = [0u8; 32];
    rng.fill(&mut key)
        .map_err(|_| anyhow::anyhow!("failed to generate random key"))?;

    std::fs::write(&key_path, &key)
        .with_context(|| format!("write encryption key {}", key_path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600)).ok();
    }

    Ok(key)
}

/// Encrypt `plaintext` using AES-256-GCM.
/// Returns `nonce (12 bytes) || ciphertext+tag`, base64-encoded.
fn encrypt(key: &[u8; 32], plaintext: &[u8]) -> anyhow::Result<String> {
    let unbound = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|_| anyhow::anyhow!("invalid AES key"))?;
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

    // Prepend nonce.
    let mut combined = nonce_bytes.to_vec();
    combined.extend_from_slice(&in_out);

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&combined))
}

/// Decrypt a base64-encoded `nonce || ciphertext+tag`.
fn decrypt(key: &[u8; 32], encoded: &str) -> anyhow::Result<Vec<u8>> {
    use base64::Engine;
    let combined = base64::engine::general_purpose::STANDARD
        .decode(encoded.trim())
        .context("base64 decode failed")?;

    if combined.len() < 12 {
        anyhow::bail!("encrypted data too short");
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce_arr: [u8; 12] = nonce_bytes.try_into().unwrap();
    let nonce = Nonce::assume_unique_for_key(nonce_arr);

    let unbound = UnboundKey::new(&AES_256_GCM, key)
        .map_err(|_| anyhow::anyhow!("invalid AES key"))?;
    let opening_key = LessSafeKey::new(unbound);

    let mut in_out = ciphertext.to_vec();
    let plaintext = opening_key
        .open_in_place(nonce, Aad::empty(), &mut in_out)
        .map_err(|_| anyhow::anyhow!("decryption failed — wrong key or corrupted data"))?;

    Ok(plaintext.to_vec())
}

/// Persist `value` for `key` inside the secrets directory (encrypted).
///
/// * `dir` – override for the secrets directory; uses `.secrets/` when `None`.
/// * `key` – filename-safe identifier (e.g. `DISCORD_TOKEN`).
/// * `value` – the secret value to store.
///
/// The directory is created with mode `0o700` and the file with `0o600`.
pub fn set_secret_file(dir: Option<&Path>, key: &str, value: &str) -> anyhow::Result<()> {
    // Reject path-traversal attempts in secret keys
    if key.contains('/') || key.contains('\\') || key.contains('\0') || key.contains("..") || key.is_empty() {
        anyhow::bail!("invalid secret key: {key:?}");
    }

    let base = match dir {
        Some(d) => d.to_path_buf(),
        None => default_secrets_dir(),
    };

    std::fs::create_dir_all(&base)
        .with_context(|| format!("create secrets dir {}", base.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&base, std::fs::Permissions::from_mode(0o700)).ok();
    }

    let enc_key = load_or_create_key(&base)?;
    let encrypted = encrypt(&enc_key, value.as_bytes())?;

    let path = base.join(key);
    std::fs::write(&path, &encrypted)
        .with_context(|| format!("write secret {}", path.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).ok();
    }

    Ok(())
}

/// Read a previously stored secret (returns `None` when the file doesn't exist).
pub fn get_secret_file(dir: Option<&Path>, key: &str) -> anyhow::Result<Option<String>> {
    // Reject path-traversal attempts in secret keys
    if key.contains('/') || key.contains('\\') || key.contains('\0') || key.contains("..") || key.is_empty() {
        anyhow::bail!("invalid secret key: {key:?}");
    }
    let base = match dir {
        Some(d) => d.to_path_buf(),
        None => default_secrets_dir(),
    };
    let path = base.join(key);
    if !path.exists() {
        return Ok(None);
    }

    let enc_key = load_or_create_key(&base)?;
    let encoded = std::fs::read_to_string(&path)
        .with_context(|| format!("read secret {}", path.display()))?;

    // Try decrypting; if it fails, try reading as legacy plaintext and
    // auto-migrate to encrypted format.
    match decrypt(&enc_key, &encoded) {
        Ok(plaintext) => {
            let val = String::from_utf8(plaintext)
                .context("secret is not valid UTF-8")?;
            Ok(Some(val))
        }
        Err(_) => {
            // Legacy plaintext fallback — auto-migrate.
            let val = encoded.trim_end().to_string();
            // Re-save encrypted.
            set_secret_file(dir, key, &val)?;
            Ok(Some(val))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_roundtrip() {
        let key = [42u8; 32];
        let secret = "my-super-secret-token";
        let encrypted = encrypt(&key, secret.as_bytes()).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(String::from_utf8(decrypted).unwrap(), secret);
    }

    #[test]
    fn set_and_get_secret() {
        let dir = tempfile::tempdir().unwrap();
        set_secret_file(Some(dir.path()), "TEST_KEY", "test_value").unwrap();
        let val = get_secret_file(Some(dir.path()), "TEST_KEY").unwrap();
        assert_eq!(val.as_deref(), Some("test_value"));
    }

    #[test]
    fn missing_secret_returns_none() {
        let dir = tempfile::tempdir().unwrap();
        let val = get_secret_file(Some(dir.path()), "NONEXISTENT").unwrap();
        assert!(val.is_none());
    }

    #[test]
    fn rejects_path_traversal() {
        let dir = tempfile::tempdir().unwrap();
        assert!(set_secret_file(Some(dir.path()), "../escape", "bad").is_err());
        assert!(set_secret_file(Some(dir.path()), "foo/bar", "bad").is_err());
    }

    #[test]
    fn legacy_plaintext_auto_migrates() {
        let dir = tempfile::tempdir().unwrap();
        // Write plaintext directly (simulating legacy).
        let path = dir.path().join("LEGACY_KEY");
        std::fs::write(&path, "legacy_value").unwrap();
        // Ensure key file exists for decryption.
        let _ = load_or_create_key(dir.path()).unwrap();
        // Reading should auto-migrate.
        let val = get_secret_file(Some(dir.path()), "LEGACY_KEY").unwrap();
        assert_eq!(val.as_deref(), Some("legacy_value"));
        // File should now be encrypted (base64), not plaintext.
        let raw = std::fs::read_to_string(&path).unwrap();
        assert_ne!(raw.trim(), "legacy_value");
    }
}
