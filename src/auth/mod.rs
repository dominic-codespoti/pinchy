//! Authentication helpers (GitHub device flow, keyring token storage, Copilot token exchange).

pub mod copilot_token;
pub mod github_device;

/// A typed authentication error that any model provider can return.
///
/// Dispatch code can downcast `anyhow::Error` to this type to detect
/// auth failures generically, without provider-specific string matching.
#[derive(Debug)]
pub struct AuthError {
    /// Which provider failed (e.g. "copilot", "openai").
    pub provider: String,
    /// User-facing recovery hint (e.g. "run `/gh-login` to re-authorise").
    pub hint: String,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} authentication failed — {}", self.provider, self.hint)
    }
}

impl std::error::Error for AuthError {}

/// Check whether an error chain contains an [`AuthError`].
pub fn is_auth_error(err: &anyhow::Error) -> bool {
    err.chain()
        .any(|cause| cause.downcast_ref::<AuthError>().is_some())
}

/// Extract the first [`AuthError`] from an error chain, if any.
pub fn find_auth_error(err: &anyhow::Error) -> Option<&AuthError> {
    err.chain()
        .find_map(|cause| cause.downcast_ref::<AuthError>())
}
