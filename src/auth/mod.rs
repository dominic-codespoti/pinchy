//! Authentication helpers (GitHub device flow, keyring token storage, Copilot token exchange).

pub mod copilot_token;
pub mod github_device;
pub mod gitlab;
pub mod kilo;
pub mod openai_codex;
pub mod provider_auth;
pub mod refresh;
pub mod store;

/// OAuth authentication data.
#[derive(Debug, Clone)]
pub struct OauthAuth {
    /// OAuth access token
    pub access: String,
    /// OAuth refresh token
    pub refresh: String,
    /// Unix timestamp when token expires
    pub expires: u64,
    /// Organization/account identifier
    pub account_id: Option<String>,
    /// Enterprise URL (for GitHub Enterprise)
    pub enterprise_url: Option<String>,
}

/// Provider authentication information.
#[derive(Debug, Clone)]
pub enum ProviderAuthInfo {
    /// OAuth authentication
    Oauth(OauthAuth),
    /// API key authentication
    ApiKey(String),
}

impl ProviderAuthInfo {
    /// Create a new OAuth auth info.
    pub fn oauth(access: impl Into<String>, refresh: impl Into<String>, expires: u64) -> Self {
        Self::Oauth(OauthAuth {
            access: access.into(),
            refresh: refresh.into(),
            expires,
            account_id: None,
            enterprise_url: None,
        })
    }

    /// Create a new OAuth auth info with account details.
    pub fn oauth_with_account(
        access: impl Into<String>,
        refresh: impl Into<String>,
        expires: u64,
        account_id: Option<String>,
    ) -> Self {
        Self::Oauth(OauthAuth {
            access: access.into(),
            refresh: refresh.into(),
            expires,
            account_id,
            enterprise_url: None,
        })
    }

    /// Create a new API key auth info.
    pub fn api_key(key: impl Into<String>) -> Self {
        Self::ApiKey(key.into())
    }

    /// Check if this is an OAuth variant.
    pub fn is_oauth(&self) -> bool {
        matches!(self, Self::Oauth(_))
    }

    /// Check if this is an API key variant.
    pub fn is_api_key(&self) -> bool {
        matches!(self, Self::ApiKey(_))
    }

    /// Get the access token if OAuth.
    pub fn access_token(&self) -> Option<&str> {
        match self {
            Self::Oauth(oauth) => Some(&oauth.access),
            _ => None,
        }
    }

    /// Get the refresh token if OAuth.
    pub fn refresh_token(&self) -> Option<&str> {
        match self {
            Self::Oauth(oauth) => Some(&oauth.refresh),
            _ => None,
        }
    }

    /// Get expires timestamp if OAuth.
    pub fn expires_at(&self) -> Option<u64> {
        match self {
            Self::Oauth(oauth) => Some(oauth.expires),
            _ => None,
        }
    }

    /// Get API key if ApiKey variant.
    pub fn api_key_value(&self) -> Option<&str> {
        match self {
            Self::ApiKey(key) => Some(key),
            _ => None,
        }
    }

    /// Get account ID if OAuth.
    pub fn account_id(&self) -> Option<&str> {
        match self {
            Self::Oauth(oauth) => oauth.account_id.as_deref(),
            _ => None,
        }
    }
}

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
