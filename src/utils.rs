//! Shared utility helpers.

use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::time::{SystemTime, UNIX_EPOCH};

/// Generate a random 16-char hex nonce.
pub fn generate_nonce() -> String {
    let s = RandomState::new();
    let mut h = s.build_hasher();
    h.write_u64(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos() as u64,
    );
    format!("{:016x}", h.finish())
}

/// Return the top-level agents directory: `<pinchy_home>/agents`.
pub fn agents_dir() -> std::path::PathBuf {
    crate::pinchy_home().join("agents")
}

/// Return the agent root directory: `<pinchy_home>/agents/<id>`.
pub fn agent_root(id: &str) -> std::path::PathBuf {
    agents_dir().join(id)
}

/// Return the agent workspace directory: `<pinchy_home>/agents/<id>/workspace`.
pub fn agent_workspace(id: &str) -> std::path::PathBuf {
    agent_root(id).join("workspace")
}

/// Truncate a string to `max` chars, appending `…` if trimmed.
pub fn truncate_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        s.to_string()
    } else {
        let mut end = max;
        while !s.is_char_boundary(end) && end > 0 {
            end -= 1;
        }
        format!("{}…", &s[..end])
    }
}
