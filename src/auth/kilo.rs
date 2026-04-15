//! Kilo Gateway device authentication (Kilo-aligned).
//!
//! Implements device authorization flow for Kilo Gateway,
//! aligned with:
//! - /packages/kilo-gateway/src/auth/device-auth-tui.ts
//! - /packages/kilo-gateway/src/plugin.ts
//!
//! ## Flow
//!
//! 1. Initiate device auth → get verification URL and code
//! 2. User opens URL and enters code
//! 3. Poll for authorization status
//! 4. On success, receive token and fetch profile

use crate::auth::provider_auth::{AuthFlowMethod, AuthMethod, AuthMethodType, Authorization};
use crate::auth::ProviderAuthInfo;
use serde::Deserialize;
use std::time::Duration;
use tracing::{debug, info};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Kilo API base URL.
const KILO_API_BASE: &str = "https://api.kilo.ai";

/// Device auth initiation endpoint.
const DEVICE_AUTH_CODES_URL: &str = "https://api.kilo.ai/api/device-auth/codes";

/// Default polling interval in milliseconds.
const POLL_INTERVAL_MS: u64 = 5000;

/// Default authorization expiration in seconds.
const DEFAULT_EXPIRES_IN: u64 = 600; // 10 minutes

// ---------------------------------------------------------------------------
// API Types
// ---------------------------------------------------------------------------

/// Device authorization initiation response.
#[derive(Debug, Clone, Deserialize)]
pub struct DeviceAuthInitiateResponse {
    /// The verification code to display to the user.
    pub code: String,
    /// URL for the user to visit.
    pub verification_url: String,
    /// Seconds until the code expires.
    pub expires_in: u64,
}

/// Device authorization poll response.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum DeviceAuthPollResponse {
    /// Authorization is still pending.
    #[serde(rename = "pending")]
    Pending,
    /// Authorization was approved.
    #[serde(rename = "approved")]
    Approved {
        /// The access token.
        token: String,
        /// User email.
        user_email: String,
        /// Organization ID (optional - user selects after auth).
        #[serde(skip_serializing_if = "Option::is_none")]
        organization_id: Option<String>,
    },
    /// Authorization was denied.
    #[serde(rename = "denied")]
    Denied,
    /// Authorization expired.
    #[serde(rename = "expired")]
    Expired,
}

/// Kilo user profile.
#[derive(Debug, Clone, Deserialize)]
pub struct KiloProfile {
    pub id: String,
    pub email: String,
    #[serde(rename = "organizations")]
    pub organizations: Vec<KiloOrganization>,
    #[serde(rename = "defaultOrganizationId")]
    pub default_organization_id: Option<String>,
}

/// Kilo organization.
#[derive(Debug, Clone, Deserialize)]
pub struct KiloOrganization {
    pub id: String,
    pub name: String,
    pub slug: String,
}

/// Kilo default model response.
#[derive(Debug, Clone, Deserialize)]
pub struct KiloDefaultModel {
    pub id: String,
    pub provider: String,
    pub name: String,
}

// ---------------------------------------------------------------------------
// Device Auth Flow
// ---------------------------------------------------------------------------

/// Initiate device authorization flow.
///
/// Returns the verification URL and code for the user.
pub async fn initiate_device_auth() -> anyhow::Result<DeviceAuthInitiateResponse> {
    let http = crate::models::get_shared_http_client();

    let resp = http
        .post(DEVICE_AUTH_CODES_URL)
        .header("Content-Type", "application/json")
        .send()
        .await?;

    if resp.status() == 429 {
        anyhow::bail!("Too many pending authorization requests. Please try again later.");
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

    let data: DeviceAuthInitiateResponse = resp.json().await?;
    info!(
        code = %data.code,
        url = %data.verification_url,
        "Initiated Kilo device authorization"
    );

    Ok(data)
}

/// Poll device authorization status.
///
/// Returns the poll response. Caller should handle retry logic.
pub async fn poll_device_auth(code: &str) -> anyhow::Result<DeviceAuthPollResponse> {
    let http = crate::models::get_shared_http_client();

    let url = format!("{}/{}", DEVICE_AUTH_CODES_URL, code);
    let resp = http.get(&url).send().await?;

    match resp.status().as_u16() {
        200 => {
            let data: DeviceAuthPollResponse = resp.json().await?;
            Ok(data)
        }
        202 => Ok(DeviceAuthPollResponse::Pending),
        403 => Ok(DeviceAuthPollResponse::Denied),
        410 => Ok(DeviceAuthPollResponse::Expired),
        _ => {
            let status = resp.status();
            let body = resp.text().await.unwrap_or_default();
            anyhow::bail!("Device auth poll failed: HTTP {} - {}", status, body)
        }
    }
}

/// Complete device authorization with polling.
///
/// Polls until authorization is approved, denied, or expired.
/// Returns the OAuth tokens on success.
pub async fn complete_device_auth(code: &str, expires_in: u64) -> anyhow::Result<ProviderAuthInfo> {
    let max_attempts = (expires_in * 1000) / POLL_INTERVAL_MS;
    let interval = Duration::from_millis(POLL_INTERVAL_MS);

    for attempt in 0..max_attempts {
        match poll_device_auth(code).await? {
            DeviceAuthPollResponse::Approved {
                token,
                user_email,
                organization_id,
            } => {
                info!(
                    email = %user_email,
                    org_id = ?organization_id,
                    "Kilo device authorization approved"
                );

                // Calculate expiration (1 year for Kilo tokens)
                let expires_at = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)?
                    .as_secs()
                    + 365 * 24 * 60 * 60;

                // Store organization ID in account_id field for later use
                return Ok(ProviderAuthInfo::Oauth(crate::auth::OauthAuth {
                    access: token.clone(),
                    refresh: token, // Kilo uses the token as both access and refresh
                    expires: expires_at,
                    account_id: organization_id,
                    enterprise_url: None,
                }));
            }
            DeviceAuthPollResponse::Denied => {
                anyhow::bail!("Authorization denied by user");
            }
            DeviceAuthPollResponse::Expired => {
                anyhow::bail!("Authorization code expired");
            }
            DeviceAuthPollResponse::Pending => {
                debug!(attempt, "Kilo device auth still pending");
                if attempt < max_attempts - 1 {
                    tokio::time::sleep(interval).await;
                }
            }
        }
    }

    anyhow::bail!("Device authorization timed out")
}

// ---------------------------------------------------------------------------
// Profile API
// ---------------------------------------------------------------------------

/// Get Kilo user profile.
pub async fn get_kilo_profile(token: &str) -> anyhow::Result<KiloProfile> {
    let http = crate::models::get_shared_http_client();

    let resp = http
        .get(format!("{}/api/profile", KILO_API_BASE))
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!("Failed to get Kilo profile: HTTP {} - {}", status, body);
    }

    let profile: KiloProfile = resp.json().await?;
    Ok(profile)
}

/// Get Kilo default model for user/org.
pub async fn get_kilo_default_model(
    token: &str,
    organization_id: Option<&str>,
) -> anyhow::Result<KiloDefaultModel> {
    let http = crate::models::get_shared_http_client();

    let url = if let Some(org_id) = organization_id {
        format!(
            "{}/api/organizations/{}/default-model",
            KILO_API_BASE, org_id
        )
    } else {
        format!("{}/api/default-model", KILO_API_BASE)
    };

    let resp = http
        .get(&url)
        .header("Authorization", format!("Bearer {}", token))
        .send()
        .await?;

    if !resp.status().is_success() {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        anyhow::bail!(
            "Failed to get Kilo default model: HTTP {} - {}",
            status,
            body
        );
    }

    let model: KiloDefaultModel = resp.json().await?;
    Ok(model)
}

// ---------------------------------------------------------------------------
// Kilo-Style Auth Methods
// ---------------------------------------------------------------------------

/// Get Kilo auth methods (Kilo-aligned).
///
/// Returns the single device authorization method.
pub fn get_kilo_auth_methods() -> Vec<AuthMethod> {
    vec![AuthMethod {
        method_type: AuthMethodType::Oauth,
        label: "Kilo Gateway (Device Authorization)".to_string(),
        description: Some("Authenticate with Kilo Gateway using device flow".to_string()),
        requires_browser: true,
        requires_callback: false,
        prompts: None,
        input_fields: None,
        method_index: Some(0),
    }]
}

/// Initiate Kilo device authorization (Kilo-compatible).
pub async fn initiate_kilo_oauth() -> anyhow::Result<Authorization> {
    let device_data = initiate_device_auth().await?;

    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs()
        + device_data.expires_in;

    Ok(Authorization {
        url: device_data.verification_url.clone(),
        method: AuthFlowMethod::Auto,
        instructions: format!(
            "Open {} and enter code: {}",
            device_data.verification_url, device_data.code
        ),
        state: None,
        code_verifier: None,
        device_code: Some(device_data.code.clone()),
        user_code: Some(device_data.code),
        interval: Some(POLL_INTERVAL_MS / 1000),
        expires_at: Some(expires_at),
        verification_uri: Some(device_data.verification_url),
    })
}

/// Complete Kilo OAuth callback.
pub async fn complete_kilo_oauth(device_code: &str) -> anyhow::Result<ProviderAuthInfo> {
    complete_device_auth(device_code, DEFAULT_EXPIRES_IN).await
}

// ---------------------------------------------------------------------------
// Auth Store Integration
// ---------------------------------------------------------------------------

/// Store Kilo auth tokens.
pub fn store_auth(auth: &ProviderAuthInfo) -> anyhow::Result<()> {
    match auth {
        ProviderAuthInfo::Oauth(oauth) => {
            let entry = crate::auth::store::AuthEntry::new_oauth(
                "kilo",
                &oauth.access,
                Some(oauth.refresh.clone()),
                Some(oauth.expires),
            );
            crate::auth::store::set_auth("kilo", entry)?;
            info!("Stored Kilo auth tokens");
            Ok(())
        }
        _ => anyhow::bail!("Expected OAuth auth info"),
    }
}

/// Get stored Kilo auth.
pub fn get_stored_auth() -> Option<ProviderAuthInfo> {
    crate::auth::store::get_auth("kilo").map(|entry| match entry.r#type.as_str() {
        "oauth" => ProviderAuthInfo::Oauth(crate::auth::OauthAuth {
            access: entry.access_token.unwrap_or_default(),
            refresh: entry.refresh_token.unwrap_or_default(),
            expires: entry.expires_at.unwrap_or(0),
            account_id: entry.account_id,
            enterprise_url: None,
        }),
        _ => ProviderAuthInfo::api_key(entry.api_key.unwrap_or_default()),
    })
}

/// Check if Kilo is authenticated.
pub fn is_authenticated() -> bool {
    get_stored_auth().is_some() || std::env::var("KILO_API_KEY").is_ok()
}

/// Remove stored Kilo auth.
pub fn clear_auth() -> anyhow::Result<()> {
    crate::auth::store::remove_auth("kilo")?;
    info!("Cleared Kilo auth");
    Ok(())
}

// ---------------------------------------------------------------------------
// Full Device Auth Flow (High-Level)
// ---------------------------------------------------------------------------

/// Run the complete Kilo device authorization flow.
///
/// This is a high-level function that:
/// 1. Initiates device auth
/// 2. Returns authorization info for the UI
/// 3. The UI calls complete_device_auth after user completes browser flow
pub async fn device_authorization_flow() -> anyhow::Result<Authorization> {
    initiate_kilo_oauth().await
}

/// Check if token needs refresh.
pub fn needs_refresh(auth: &ProviderAuthInfo) -> bool {
    match auth {
        ProviderAuthInfo::Oauth(oauth) => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs();
            // Refresh if expiring within 1 hour
            oauth.expires.saturating_sub(now) < 3600
        }
        _ => false,
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kilo_auth_methods_count() {
        let methods = get_kilo_auth_methods();
        assert_eq!(methods.len(), 1);
        assert_eq!(methods[0].method_type, AuthMethodType::Oauth);
        assert_eq!(methods[0].label, "Kilo Gateway (Device Authorization)");
        assert_eq!(methods[0].method_index, Some(0));
    }

    #[test]
    fn device_auth_poll_response_deserialize() {
        let pending_json = r#"{"status":"pending"}"#;
        let pending: DeviceAuthPollResponse = serde_json::from_str(pending_json).unwrap();
        assert!(matches!(pending, DeviceAuthPollResponse::Pending));

        let approved_json =
            r#"{"status":"approved","token":"abc123","user_email":"test@example.com"}"#;
        let approved: DeviceAuthPollResponse = serde_json::from_str(approved_json).unwrap();
        assert!(matches!(approved, DeviceAuthPollResponse::Approved { .. }));

        if let DeviceAuthPollResponse::Approved {
            token, user_email, ..
        } = approved
        {
            assert_eq!(token, "abc123");
            assert_eq!(user_email, "test@example.com");
        }

        let denied_json = r#"{"status":"denied"}"#;
        let denied: DeviceAuthPollResponse = serde_json::from_str(denied_json).unwrap();
        assert!(matches!(denied, DeviceAuthPollResponse::Denied));
    }

    #[test]
    fn kilo_profile_deserialize() {
        let json = r#"{
            "id": "user_123",
            "email": "test@example.com",
            "organizations": [
                {"id": "org_1", "name": "Test Org", "slug": "test-org"}
            ],
            "defaultOrganizationId": "org_1"
        }"#;

        let profile: KiloProfile = serde_json::from_str(json).unwrap();
        assert_eq!(profile.id, "user_123");
        assert_eq!(profile.email, "test@example.com");
        assert_eq!(profile.organizations.len(), 1);
        assert_eq!(profile.organizations[0].id, "org_1");
        assert_eq!(profile.default_organization_id, Some("org_1".to_string()));
    }

    #[test]
    fn needs_refresh_calculation() {
        let future = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 7200; // 2 hours from now

        let auth = ProviderAuthInfo::oauth("access", "refresh", future);
        assert!(!needs_refresh(&auth));

        let soon = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            + 1800; // 30 minutes from now

        let auth = ProviderAuthInfo::oauth("access", "refresh", soon);
        assert!(needs_refresh(&auth));

        let past = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            - 60; // 1 minute ago

        let auth = ProviderAuthInfo::oauth("access", "refresh", past);
        assert!(needs_refresh(&auth));
    }
}
