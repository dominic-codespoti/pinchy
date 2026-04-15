//! Kilo-aligned provider authentication types and capabilities.
//!
//! This module provides a capability-based surface for provider authentication,
//! closely aligned with Kilo's ProviderAuth module from:
//! - /packages/opencode/src/provider/auth.ts
//! - /packages/plugin/src/index.ts
//! - /packages/opencode/src/plugin/codex.ts
//! - /packages/opencode/src/plugin/copilot.ts
//! - /packages/kilo-gateway/src/plugin.ts
//!
//! ## Key Types
//!
//! - `AuthMethod`: Authentication method with prompts and authorize callback
//! - `AuthPrompt`: Input prompts (text/select) with conditions and validation
//! - `Authorization`: OAuth authorization response (url, method, instructions)
//! - `ProviderAuthCapabilities`: Full auth capabilities for a provider
//!
//! ## Auth Method Types
//!
//! - `oauth`: OAuth 2.0 flows (authorization code, device flow, PKCE)
//! - `api`: API key / personal access token
//! - `env`: Environment-variable based (non-interactive)

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Auth Method Types
// ---------------------------------------------------------------------------

/// Type of authentication method for a provider.
///
/// Aligned with Kilo's auth method types:
/// - "oauth" for OAuth 2.0 flows
/// - "api" for API keys and PATs
/// - "env" for environment-based (non-interactive)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethodType {
    /// OAuth 2.0 authorization code flow (with PKCE or traditional).
    #[serde(rename = "oauth")]
    Oauth,
    /// Simple API key or Personal Access Token authentication.
    #[serde(rename = "api")]
    Api,
    /// Environment-variable based (no user interaction needed).
    Env,
}

impl std::fmt::Display for AuthMethodType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthMethodType::Oauth => write!(f, "oauth"),
            AuthMethodType::Api => write!(f, "api"),
            AuthMethodType::Env => write!(f, "env"),
        }
    }
}

/// Legacy type alias for backward compatibility.
pub type AuthMethodTypeLegacy = AuthMethodType;

// ---------------------------------------------------------------------------
// Auth Prompts
// ---------------------------------------------------------------------------

/// A prompt for collecting user input during authentication.
///
/// Matches Kilo's prompt structure from @kilocode/plugin AuthHook.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum AuthPrompt {
    /// Text input prompt.
    Text {
        /// Key for the input value (used in authorize request).
        key: String,
        /// Display message for the prompt.
        message: String,
        /// Optional placeholder text.
        #[serde(skip_serializing_if = "Option::is_none")]
        placeholder: Option<String>,
        /// Optional validation regex pattern.
        #[serde(skip_serializing_if = "Option::is_none")]
        validate: Option<String>,
        /// Condition for showing this prompt (key -> expected value).
        #[serde(skip_serializing_if = "Option::is_none")]
        condition: Option<HashMap<String, String>>,
    },
    /// Select/dropdown prompt.
    Select {
        /// Key for the selected value.
        key: String,
        /// Display message for the prompt.
        message: String,
        /// Available options.
        options: Vec<AuthPromptOption>,
        /// Condition for showing this prompt.
        #[serde(skip_serializing_if = "Option::is_none")]
        condition: Option<HashMap<String, String>>,
    },
}

/// Option for a select prompt.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthPromptOption {
    /// Display label.
    pub label: String,
    /// Value when selected.
    pub value: String,
    /// Optional hint text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<String>,
}

impl AuthPrompt {
    /// Create a text input prompt.
    pub fn text(key: impl Into<String>, message: impl Into<String>) -> Self {
        AuthPrompt::Text {
            key: key.into(),
            message: message.into(),
            placeholder: None,
            validate: None,
            condition: None,
        }
    }

    /// Create a text input prompt with placeholder.
    pub fn text_with_placeholder(
        key: impl Into<String>,
        message: impl Into<String>,
        placeholder: impl Into<String>,
    ) -> Self {
        AuthPrompt::Text {
            key: key.into(),
            message: message.into(),
            placeholder: Some(placeholder.into()),
            validate: None,
            condition: None,
        }
    }

    /// Create a text input prompt with condition.
    pub fn text_with_condition(
        key: impl Into<String>,
        message: impl Into<String>,
        condition_key: impl Into<String>,
        condition_value: impl Into<String>,
    ) -> Self {
        let mut condition = HashMap::new();
        condition.insert(condition_key.into(), condition_value.into());
        AuthPrompt::Text {
            key: key.into(),
            message: message.into(),
            placeholder: None,
            validate: None,
            condition: Some(condition),
        }
    }

    /// Create a select prompt.
    pub fn select(
        key: impl Into<String>,
        message: impl Into<String>,
        options: Vec<AuthPromptOption>,
    ) -> Self {
        AuthPrompt::Select {
            key: key.into(),
            message: message.into(),
            options,
            condition: None,
        }
    }

    /// Create a select prompt with condition.
    pub fn select_with_condition(
        key: impl Into<String>,
        message: impl Into<String>,
        options: Vec<AuthPromptOption>,
        condition_key: impl Into<String>,
        condition_value: impl Into<String>,
    ) -> Self {
        let mut condition = HashMap::new();
        condition.insert(condition_key.into(), condition_value.into());
        AuthPrompt::Select {
            key: key.into(),
            message: message.into(),
            options,
            condition: Some(condition),
        }
    }

    /// Get the key for this prompt.
    pub fn key(&self) -> &str {
        match self {
            AuthPrompt::Text { key, .. } => key,
            AuthPrompt::Select { key, .. } => key,
        }
    }
}

impl AuthPromptOption {
    /// Create a select option.
    pub fn new(label: impl Into<String>, value: impl Into<String>) -> Self {
        Self {
            label: label.into(),
            value: value.into(),
            hint: None,
        }
    }

    /// Create a select option with hint.
    pub fn with_hint(
        label: impl Into<String>,
        value: impl Into<String>,
        hint: impl Into<String>,
    ) -> Self {
        Self {
            label: label.into(),
            value: value.into(),
            hint: Some(hint.into()),
        }
    }
}

// ---------------------------------------------------------------------------
// Auth Method
// ---------------------------------------------------------------------------

/// An available authentication method for a provider.
///
/// Closely aligned with Kilo's AuthHook.methods structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMethod {
    /// Type of authentication (oauth or api).
    #[serde(rename = "type")]
    pub method_type: AuthMethodType,
    /// Human-readable label for this method (e.g., "Sign in with GitHub").
    pub label: String,
    /// Optional description with instructions.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Whether this method requires a browser/client interaction.
    #[serde(default)]
    pub requires_browser: bool,
    /// Whether this method requires a callback/redirect handling.
    #[serde(default)]
    pub requires_callback: bool,
    /// Input prompts for this method (replaces simple input_fields).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompts: Option<Vec<AuthPrompt>>,
    /// Legacy input fields (for backward compatibility).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_fields: Option<Vec<InputField>>,
    /// Method index (for Kilo-compatible API requests).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub method_index: Option<usize>,
}

/// Legacy input field definition for auth methods requiring form input.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InputField {
    /// Field identifier.
    pub name: String,
    /// Human-readable label.
    pub label: String,
    /// Field type (text, password, url, etc.).
    #[serde(rename = "type")]
    pub field_type: String,
    /// Whether the field is required.
    #[serde(default)]
    pub required: bool,
    /// Placeholder text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    /// Help text for the field.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub help: Option<String>,
}

impl AuthMethod {
    /// Create a new OAuth method.
    pub fn oauth(label: impl Into<String>) -> Self {
        AuthMethod {
            method_type: AuthMethodType::Oauth,
            label: label.into(),
            description: Some("Sign in using OAuth 2.0".to_string()),
            requires_browser: true,
            requires_callback: true,
            prompts: None,
            input_fields: None,
            method_index: None,
        }
    }

    /// Create a new OAuth method with prompts.
    pub fn oauth_with_prompts(label: impl Into<String>, prompts: Vec<AuthPrompt>) -> Self {
        AuthMethod {
            method_type: AuthMethodType::Oauth,
            label: label.into(),
            description: Some("Sign in using OAuth 2.0".to_string()),
            requires_browser: true,
            requires_callback: true,
            prompts: Some(prompts),
            input_fields: None,
            method_index: None,
        }
    }

    /// Create a new API key method.
    pub fn api(label: impl Into<String>) -> Self {
        AuthMethod {
            method_type: AuthMethodType::Api,
            label: label.into(),
            description: Some("Enter an API key".to_string()),
            requires_browser: false,
            requires_callback: false,
            prompts: Some(vec![AuthPrompt::text("api_key", "API Key")]),
            input_fields: Some(vec![InputField {
                name: "api_key".to_string(),
                label: "API Key".to_string(),
                field_type: "password".to_string(),
                required: true,
                placeholder: Some("sk-...".to_string()),
                help: Some("Your API key from the provider's dashboard".to_string()),
            }]),
            method_index: None,
        }
    }

    /// Create a new API key method with custom prompts.
    pub fn api_with_prompts(label: impl Into<String>, prompts: Vec<AuthPrompt>) -> Self {
        AuthMethod {
            method_type: AuthMethodType::Api,
            label: label.into(),
            description: Some("Enter an API key".to_string()),
            requires_browser: false,
            requires_callback: false,
            prompts: Some(prompts),
            input_fields: None,
            method_index: None,
        }
    }

    /// Create a device code method.
    pub fn device_code(label: impl Into<String>) -> Self {
        AuthMethod {
            method_type: AuthMethodType::Oauth,
            label: label.into(),
            description: Some(
                "Authenticate using device flow (no browser required on this device)".to_string(),
            ),
            requires_browser: false,
            requires_callback: false,
            prompts: None,
            input_fields: None,
            method_index: None,
        }
    }

    /// Create a device code method with prompts (e.g., for enterprise URL).
    pub fn device_code_with_prompts(label: impl Into<String>, prompts: Vec<AuthPrompt>) -> Self {
        AuthMethod {
            method_type: AuthMethodType::Oauth,
            label: label.into(),
            description: Some(
                "Authenticate using device flow (no browser required on this device)".to_string(),
            ),
            requires_browser: false,
            requires_callback: false,
            prompts: Some(prompts),
            input_fields: None,
            method_index: None,
        }
    }

    /// Set the method index.
    pub fn with_index(mut self, index: usize) -> Self {
        self.method_index = Some(index);
        self
    }

    /// Convert prompts to legacy input fields (for backward compatibility).
    pub fn to_input_fields(&self) -> Option<Vec<InputField>> {
        if let Some(ref prompts) = self.prompts {
            let fields: Vec<InputField> = prompts
                .iter()
                .filter_map(|p| match p {
                    AuthPrompt::Text {
                        key,
                        message,
                        placeholder,
                        ..
                    } => Some(InputField {
                        name: key.clone(),
                        label: message.clone(),
                        field_type: "password".to_string(),
                        required: true,
                        placeholder: placeholder.clone(),
                        help: None,
                    }),
                    AuthPrompt::Select { .. } => None, // Selects don't map to input fields
                })
                .collect();
            if fields.is_empty() {
                None
            } else {
                Some(fields)
            }
        } else {
            self.input_fields.clone()
        }
    }
}

// ---------------------------------------------------------------------------
// OAuth Authorization
// ---------------------------------------------------------------------------

/// OAuth authorization flow method type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthFlowMethod {
    /// Automatic flow (no user code required, callback handles everything).
    Auto,
    /// Manual code entry (user must enter a code).
    Code,
    /// Device flow (polling-based, used internally).
    Device,
}

/// OAuth authorization initiation response.
///
/// Matches Kilo's ProviderAuth.Authorization structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Authorization {
    /// Authorization URL to open in browser.
    pub url: String,
    /// Authorization method (auto = no user code, code = requires user to enter code).
    pub method: AuthFlowMethod,
    /// Instructions for the user.
    pub instructions: String,
    /// State parameter for CSRF protection (if applicable).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    /// PKCE code verifier (if using PKCE).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_verifier: Option<String>,
    /// Device code for device flow (if applicable).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device_code: Option<String>,
    /// User code for device flow (if applicable).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_code: Option<String>,
    /// Polling interval in seconds (for device flow).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<u64>,
    /// Expiry timestamp for the authorization request.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_at: Option<u64>,
    /// Verification URL (for device flow).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verification_uri: Option<String>,
}

/// OAuth callback request.
#[derive(Debug, Clone, Deserialize)]
pub struct CallbackRequest {
    /// The authorization code from the callback.
    pub code: String,
    /// State parameter (if used).
    #[serde(default)]
    pub state: Option<String>,
    /// PKCE code verifier (if used).
    #[serde(default)]
    pub code_verifier: Option<String>,
    /// Additional inputs from prompts.
    #[serde(default)]
    pub inputs: Option<HashMap<String, String>>,
}

/// OAuth authorization request (Kilo-compatible).
#[derive(Debug, Clone, Deserialize)]
pub struct AuthorizeRequest {
    /// Method index to use.
    pub method: usize,
    /// User inputs from prompts.
    #[serde(default)]
    pub inputs: Option<HashMap<String, String>>,
    /// Callback URL for the OAuth flow.
    #[serde(default)]
    pub redirect_uri: Option<String>,
}

// ---------------------------------------------------------------------------
// Provider Auth Capabilities
// ---------------------------------------------------------------------------

/// Configuration option for a provider.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConfigOption {
    /// Option key.
    pub key: String,
    /// Display label.
    pub label: String,
    /// Option type (string, number, boolean, enum).
    #[serde(rename = "type")]
    pub option_type: String,
    /// Whether the option is required.
    #[serde(default)]
    pub required: bool,
    /// Default value.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub default: Option<serde_json::Value>,
    /// Available values for enum type.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enum_values: Option<Vec<String>>,
    /// Help text.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub help: Option<String>,
}

/// Authentication capabilities for a provider.
///
/// Aligned with Kilo's provider auth capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderAuthCapabilities {
    /// Provider ID.
    pub provider_id: String,
    /// Display name for the provider.
    pub display_name: String,
    /// Available authentication methods.
    pub methods: Vec<AuthMethod>,
    /// Whether authentication is required to use this provider.
    pub auth_required: bool,
    /// Whether the provider is currently authenticated.
    pub is_authenticated: bool,
    /// Current auth source if authenticated (env, config, auth_store, oauth).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_source: Option<String>,
    /// Configuration options available for this provider.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub config_options: Option<Vec<ConfigOption>>,
    /// Provider category for UI grouping.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

impl ProviderAuthCapabilities {
    /// Create new capabilities for a provider.
    pub fn new(provider_id: impl Into<String>, display_name: impl Into<String>) -> Self {
        Self {
            provider_id: provider_id.into(),
            display_name: display_name.into(),
            methods: Vec::new(),
            auth_required: true,
            is_authenticated: false,
            auth_source: None,
            config_options: None,
            category: None,
        }
    }

    /// Add an auth method.
    pub fn with_method(mut self, method: AuthMethod) -> Self {
        self.methods.push(method);
        self
    }

    /// Set auth required.
    pub fn with_auth_required(mut self, required: bool) -> Self {
        self.auth_required = required;
        self
    }

    /// Set authenticated status.
    pub fn with_authenticated(mut self, authenticated: bool, source: impl Into<String>) -> Self {
        self.is_authenticated = authenticated;
        self.auth_source = Some(source.into());
        self
    }

    /// Add a config option.
    pub fn with_config_option(mut self, option: ConfigOption) -> Self {
        self.config_options
            .get_or_insert_with(Vec::new)
            .push(option);
        self
    }

    /// Set category.
    pub fn with_category(mut self, category: impl Into<String>) -> Self {
        self.category = Some(category.into());
        self
    }
}

// ---------------------------------------------------------------------------
// Provider Auth Registry
// ---------------------------------------------------------------------------

/// Registry of provider authentication capabilities.
/// Thread-safe - can be accessed from multiple threads concurrently.
pub struct ProviderAuthRegistry {
    /// Map of provider ID to auth capabilities.
    capabilities: dashmap::DashMap<String, ProviderAuthCapabilities>,
}

impl Default for ProviderAuthRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl ProviderAuthRegistry {
    /// Create a new empty registry.
    pub fn new() -> Self {
        Self {
            capabilities: dashmap::DashMap::new(),
        }
    }

    /// Get auth capabilities for a provider.
    pub fn get_capabilities(&self, provider_id: &str) -> Option<ProviderAuthCapabilities> {
        self.capabilities.get(provider_id).map(|e| e.clone())
    }

    /// Register capabilities for a provider.
    pub fn register(&self, capabilities: ProviderAuthCapabilities) {
        self.capabilities
            .insert(capabilities.provider_id.clone(), capabilities);
    }

    /// List all registered provider IDs.
    pub fn list_providers(&self) -> Vec<String> {
        self.capabilities.iter().map(|e| e.key().clone()).collect()
    }

    /// Get capabilities for all providers.
    pub fn all_capabilities(&self) -> dashmap::DashMap<String, ProviderAuthCapabilities> {
        let cloned = dashmap::DashMap::new();
        for entry in self.capabilities.iter() {
            cloned.insert(entry.key().clone(), entry.value().clone());
        }
        cloned
    }
}

// ---------------------------------------------------------------------------
// Global Registry
// ---------------------------------------------------------------------------

use std::sync::{OnceLock, RwLock};

static REGISTRY: OnceLock<RwLock<ProviderAuthRegistry>> = OnceLock::new();

/// Initialize the global registry (idempotent, thread-safe).
pub fn init_registry() {
    let _ = REGISTRY.get_or_init(|| RwLock::new(ProviderAuthRegistry::new()));
}

/// Get the global registry for reading.
/// Panics if called before `init_registry()` (which is called automatically).
pub fn registry() -> std::sync::RwLockReadGuard<'static, ProviderAuthRegistry> {
    REGISTRY
        .get()
        .expect("ProviderAuthRegistry not initialized - call init_registry() first")
        .read()
        .expect("registry lock poisoned")
}

/// Get the global registry for writing.
/// Panics if called before `init_registry()`.
pub fn registry_mut() -> std::sync::RwLockWriteGuard<'static, ProviderAuthRegistry> {
    REGISTRY
        .get()
        .expect("ProviderAuthRegistry not initialized - call init_registry() first")
        .write()
        .expect("registry lock poisoned")
}

// ---------------------------------------------------------------------------
// Legacy Builder Functions (Backward Compatibility)
// ---------------------------------------------------------------------------

/// Build standard OAuth method.
pub fn oauth_method(label: impl Into<String>, requires_callback: bool) -> AuthMethod {
    AuthMethod {
        method_type: AuthMethodType::Oauth,
        label: label.into(),
        description: Some("Sign in using OAuth 2.0 authorization code flow".to_string()),
        requires_browser: true,
        requires_callback,
        prompts: None,
        input_fields: None,
        method_index: None,
    }
}

/// Build API key method.
pub fn api_key_method(label: impl Into<String>) -> AuthMethod {
    AuthMethod::api(label)
}

/// Build PAT method.
pub fn pat_method(label: impl Into<String>) -> AuthMethod {
    AuthMethod {
        method_type: AuthMethodType::Api,
        label: label.into(),
        description: Some("Enter a Personal Access Token".to_string()),
        requires_browser: false,
        requires_callback: false,
        prompts: Some(vec![AuthPrompt::text("token", "Personal Access Token")]),
        input_fields: Some(vec![InputField {
            name: "token".to_string(),
            label: "Personal Access Token".to_string(),
            field_type: "password".to_string(),
            required: true,
            placeholder: Some("glpat-...".to_string()),
            help: Some("Your personal access token".to_string()),
        }]),
        method_index: None,
    }
}

/// Build device code method.
pub fn device_code_method(label: impl Into<String>) -> AuthMethod {
    AuthMethod::device_code(label)
}

// ---------------------------------------------------------------------------
// Provider-Specific Auth Capabilities (Kilo-Aligned)
// ---------------------------------------------------------------------------

/// Build auth capabilities for GitHub Copilot.
///
/// Supports Kilo-style device auth with enterprise URL prompts (like Kilo's copilot.ts).
/// See: /packages/opencode/src/plugin/copilot.ts
pub fn copilot_auth_capabilities() -> ProviderAuthCapabilities {
    let is_authed = crate::auth::github_device::has_token();
    let auth_source = if is_authed {
        Some("oauth".to_string())
    } else if std::env::var("COPILOT_TOKEN").is_ok() {
        Some("env".to_string())
    } else {
        None
    };

    // Kilo-style prompts for enterprise URL - matches Kilo's copilot.ts structure
    let prompts = vec![
        AuthPrompt::Select {
            key: "deployment_type".to_string(),
            message: "Select GitHub deployment type".to_string(),
            options: vec![
                AuthPromptOption::new("GitHub.com", "github.com"),
                AuthPromptOption::with_hint(
                    "GitHub Enterprise",
                    "enterprise",
                    "Data residency or self-hosted",
                ),
            ],
            condition: None,
        },
        AuthPrompt::Text {
            key: "enterprise_url".to_string(),
            message: "Enter your GitHub Enterprise URL or domain".to_string(),
            placeholder: Some("company.ghe.com or https://company.ghe.com".to_string()),
            validate: Some(r"^[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}$".to_string()),
            condition: Some({
                let mut cond = HashMap::new();
                cond.insert("deployment_type".to_string(), "enterprise".to_string());
                cond
            }),
        },
    ];

    ProviderAuthCapabilities {
        provider_id: "copilot".to_string(),
        display_name: "GitHub Copilot".to_string(),
        methods: vec![
            AuthMethod::device_code_with_prompts("Login with GitHub Copilot", prompts)
                .with_index(0),
        ],
        auth_required: true,
        is_authenticated: is_authed || std::env::var("COPILOT_TOKEN").is_ok(),
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "enterprise_url".to_string(),
                label: "Enterprise URL".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("GitHub Enterprise URL (optional, e.g., company.ghe.com)".to_string()),
            },
            ConfigOption {
                key: "base_url".to_string(),
                label: "Copilot API Base URL".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("Override the default Copilot API endpoint".to_string()),
            },
        ]),
        category: Some("major".to_string()),
    }
}

/// Build auth capabilities for GitHub Copilot Enterprise.
///
/// Same as Copilot but with enterprise-focused defaults.
pub fn copilot_enterprise_auth_capabilities() -> ProviderAuthCapabilities {
    let mut caps = copilot_auth_capabilities();
    caps.provider_id = "github-copilot-enterprise".to_string();
    caps.display_name = "GitHub Copilot Enterprise".to_string();
    caps.category = Some("enterprise".to_string());

    // Add enterprise-specific config options
    caps.config_options = Some(vec![
        ConfigOption {
            key: "enterprise_url".to_string(),
            label: "GitHub Enterprise URL".to_string(),
            option_type: "string".to_string(),
            required: true,
            default: None,
            enum_values: None,
            help: Some("Your GitHub Enterprise Server URL (e.g., github.company.com)".to_string()),
        },
        ConfigOption {
            key: "organization".to_string(),
            label: "Organization".to_string(),
            option_type: "string".to_string(),
            required: false,
            default: None,
            enum_values: None,
            help: Some("GitHub organization for Copilot access".to_string()),
        },
    ]);

    caps
}

/// Build auth capabilities for GitLab.
///
/// Supports OAuth (with PKCE) and PAT authentication with Kilo-style prompts.
pub fn gitlab_auth_capabilities() -> ProviderAuthCapabilities {
    let is_authed = crate::auth::gitlab::is_authed();
    let auth_source = if is_authed {
        if let Ok(Some(auth)) = crate::auth::gitlab::retrieve_auth() {
            match auth.token_type {
                crate::auth::gitlab::GitLabTokenType::OAuth => Some("oauth".to_string()),
                crate::auth::gitlab::GitLabTokenType::Pat => Some("pat".to_string()),
            }
        } else {
            Some("auth_store".to_string())
        }
    } else if std::env::var("GITLAB_TOKEN").is_ok() {
        Some("env".to_string())
    } else {
        None
    };

    // OAuth method prompts for instance URL
    let oauth_prompts = vec![
        AuthPrompt::Select {
            key: "instance_type".to_string(),
            message: "Select GitLab instance".to_string(),
            options: vec![
                AuthPromptOption::new("GitLab.com", "gitlab.com"),
                AuthPromptOption::with_hint(
                    "Self-hosted/GitLab CE/EE",
                    "self-hosted",
                    "Your own GitLab instance",
                ),
            ],
            condition: None,
        },
        AuthPrompt::Text {
            key: "instance_url".to_string(),
            message: "Enter your GitLab instance URL".to_string(),
            placeholder: Some("https://gitlab.company.com".to_string()),
            validate: Some(r"^https?://[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(/.*)?$".to_string()),
            condition: Some({
                let mut cond = HashMap::new();
                cond.insert("instance_type".to_string(), "self-hosted".to_string());
                cond
            }),
        },
    ];

    // PAT method prompts
    let pat_prompts = vec![
        AuthPrompt::Text {
            key: "token".to_string(),
            message: "Enter your GitLab Personal Access Token".to_string(),
            placeholder: Some("glpat-...".to_string()),
            validate: Some(r"^glpat-[a-zA-Z0-9_-]{20,}$".to_string()),
            condition: None,
        },
        AuthPrompt::Text {
            key: "instance_url".to_string(),
            message: "Enter your GitLab instance URL".to_string(),
            placeholder: Some("https://gitlab.com".to_string()),
            validate: Some(r"^https?://[a-zA-Z0-9][a-zA-Z0-9.-]*\.[a-zA-Z]{2,}(/.*)?$".to_string()),
            condition: None,
        },
    ];

    ProviderAuthCapabilities {
        provider_id: "gitlab".to_string(),
        display_name: "GitLab".to_string(),
        methods: vec![
            AuthMethod::oauth_with_prompts("Sign in with GitLab OAuth", oauth_prompts)
                .with_index(0),
            AuthMethod::api_with_prompts("Use Personal Access Token", pat_prompts).with_index(1),
        ],
        auth_required: true,
        is_authenticated: is_authed || std::env::var("GITLAB_TOKEN").is_ok(),
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "instance_url".to_string(),
                label: "GitLab Instance URL".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: Some(serde_json::json!("https://gitlab.com")),
                enum_values: None,
                help: Some("Your GitLab instance URL (defaults to gitlab.com)".to_string()),
            },
            ConfigOption {
                key: "oauth_client_id".to_string(),
                label: "OAuth Client ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("OAuth application client ID (for OAuth flow)".to_string()),
            },
            ConfigOption {
                key: "oauth_client_secret".to_string(),
                label: "OAuth Client Secret".to_string(),
                option_type: "password".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("OAuth application client secret (optional)".to_string()),
            },
        ]),
        category: Some("specialized".to_string()),
    }
}

/// Build auth capabilities for OpenAI.
///
/// Supports Kilo-style methods:
/// - ChatGPT Pro/Plus (browser)
/// - ChatGPT Pro/Plus (headless)
/// - Manually enter API Key
pub fn openai_auth_capabilities() -> ProviderAuthCapabilities {
    let has_key =
        std::env::var("OPENAI_API_KEY").is_ok() || crate::auth::store::get_auth("openai").is_some();

    let auth_source = if std::env::var("OPENAI_API_KEY").is_ok() {
        Some("env".to_string())
    } else if crate::auth::store::get_auth("openai").is_some() {
        if let Some(entry) = crate::auth::store::get_auth("openai") {
            Some(if entry.r#type == "oauth" {
                "oauth".to_string()
            } else {
                "auth_store".to_string()
            })
        } else {
            Some("auth_store".to_string())
        }
    } else {
        None
    };

    // Use Kilo-style methods from openai_codex module
    let methods = crate::auth::openai_codex::get_openai_auth_methods();

    ProviderAuthCapabilities {
        provider_id: "openai".to_string(),
        display_name: "OpenAI".to_string(),
        methods,
        auth_required: true,
        is_authenticated: has_key,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "organization".to_string(),
                label: "Organization ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("OpenAI organization ID (optional)".to_string()),
            },
            ConfigOption {
                key: "project".to_string(),
                label: "Project ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("OpenAI project ID (optional)".to_string()),
            },
        ]),
        category: Some("major".to_string()),
    }
}

/// Build auth capabilities for OpenAI Codex.
///
/// Supports Kilo-style OAuth methods for Codex-specific authentication.
pub fn openai_codex_auth_capabilities() -> ProviderAuthCapabilities {
    let has_key = std::env::var("OPENAI_API_KEY").is_ok()
        || crate::auth::store::get_auth("openai-codex").is_some();

    let auth_source = if std::env::var("OPENAI_API_KEY").is_ok() {
        Some("env".to_string())
    } else if crate::auth::store::get_auth("openai-codex").is_some() {
        if let Some(entry) = crate::auth::store::get_auth("openai-codex") {
            Some(if entry.r#type == "oauth" {
                "oauth".to_string()
            } else {
                "auth_store".to_string()
            })
        } else {
            Some("auth_store".to_string())
        }
    } else {
        None
    };

    // Use Kilo-style OAuth methods from openai_codex module
    let methods = crate::auth::openai_codex::get_openai_auth_methods();

    ProviderAuthCapabilities {
        provider_id: "openai-codex".to_string(),
        display_name: "OpenAI Codex".to_string(),
        methods,
        auth_required: true,
        is_authenticated: has_key,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "organization".to_string(),
                label: "Organization ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("OpenAI organization ID (optional)".to_string()),
            },
            ConfigOption {
                key: "project".to_string(),
                label: "Project ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("OpenAI project ID (optional)".to_string()),
            },
        ]),
        category: Some("major".to_string()),
    }
}

/// Build auth capabilities for Anthropic.
///
/// Supports API key and optional OAuth token (CLAUDE_CODE_OAUTH_TOKEN).
/// Aligned with Kilo's anthropic plugin handling.
pub fn anthropic_auth_capabilities() -> ProviderAuthCapabilities {
    let has_key = std::env::var("ANTHROPIC_API_KEY").is_ok()
        || std::env::var("CLAUDE_CODE_OAUTH_TOKEN").is_ok()
        || crate::auth::store::get_auth("anthropic").is_some();

    let auth_source = if std::env::var("ANTHROPIC_API_KEY").is_ok() {
        Some("env".to_string())
    } else if std::env::var("CLAUDE_CODE_OAUTH_TOKEN").is_ok() {
        Some("oauth".to_string())
    } else if crate::auth::store::get_auth("anthropic").is_some() {
        if let Some(entry) = crate::auth::store::get_auth("anthropic") {
            Some(if entry.r#type == "oauth" {
                "oauth".to_string()
            } else {
                "auth_store".to_string()
            })
        } else {
            Some("auth_store".to_string())
        }
    } else {
        None
    };

    // Methods: API key (standard) and OAuth token (for CLAUDE_CODE_OAUTH_TOKEN)
    // API key method with prompt for direct entry
    let api_key_prompts = vec![AuthPrompt::Text {
        key: "api_key".to_string(),
        message: "Enter your Anthropic API Key".to_string(),
        placeholder: Some("sk-ant-...".to_string()),
        validate: Some(r"^sk-ant-[a-zA-Z0-9]{32,}$".to_string()),
        condition: None,
    }];

    // OAuth token method for Claude Code token
    let oauth_prompts = vec![AuthPrompt::Text {
        key: "oauth_token".to_string(),
        message: "Enter your Claude Code OAuth Token".to_string(),
        placeholder: Some("sk-ant-...".to_string()),
        validate: Some(r"^sk-ant-[a-zA-Z0-9]{32,}$".to_string()),
        condition: None,
    }];

    let methods = vec![
        AuthMethod::api_with_prompts("Enter Anthropic API Key", api_key_prompts).with_index(0),
        AuthMethod::api_with_prompts("Use Claude Code OAuth Token", oauth_prompts).with_index(1),
    ];

    ProviderAuthCapabilities {
        provider_id: "anthropic".to_string(),
        display_name: "Anthropic".to_string(),
        methods,
        auth_required: true,
        is_authenticated: has_key,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "base_url".to_string(),
                label: "API Base URL".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: Some(serde_json::json!("https://api.anthropic.com")),
                enum_values: None,
                help: Some("Anthropic API base URL (for proxying)".to_string()),
            },
            ConfigOption {
                key: "beta_features".to_string(),
                label: "Beta Features".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("Comma-separated list of beta feature flags".to_string()),
            },
        ]),
        category: Some("major".to_string()),
    }
}

/// Build auth capabilities for Kilo Gateway.
///
/// Supports device authorization flow.
pub fn kilo_auth_capabilities() -> ProviderAuthCapabilities {
    let methods = crate::auth::kilo::get_kilo_auth_methods();

    ProviderAuthCapabilities {
        provider_id: "kilo".to_string(),
        display_name: "Kilo Gateway".to_string(),
        methods,
        auth_required: true,
        is_authenticated: crate::auth::kilo::is_authenticated(),
        auth_source: if crate::auth::kilo::is_authenticated() {
            Some("oauth".to_string())
        } else {
            None
        },
        config_options: Some(vec![
            ConfigOption {
                key: "base_url".to_string(),
                label: "API Base URL".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: Some(serde_json::json!("https://api.kilo.ai")),
                enum_values: None,
                help: Some("Kilo Gateway API base URL".to_string()),
            },
            ConfigOption {
                key: "organization_id".to_string(),
                label: "Organization ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("Kilo organization ID (optional)".to_string()),
            },
        ]),
        category: Some("gateway".to_string()),
    }
}

/// Build auth capabilities for Azure OpenAI.
pub fn azure_auth_capabilities() -> ProviderAuthCapabilities {
    let has_key = std::env::var("AZURE_OPENAI_API_KEY").is_ok()
        || crate::auth::store::get_auth("azure").is_some();

    let auth_source = if std::env::var("AZURE_OPENAI_API_KEY").is_ok() {
        Some("env".to_string())
    } else if crate::auth::store::get_auth("azure").is_some() {
        Some("auth_store".to_string())
    } else {
        None
    };

    ProviderAuthCapabilities {
        provider_id: "azure".to_string(),
        display_name: "Azure OpenAI".to_string(),
        methods: vec![AuthMethod::api("Enter Azure API Key").with_index(0)],
        auth_required: true,
        is_authenticated: has_key,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "endpoint".to_string(),
                label: "Azure OpenAI Endpoint".to_string(),
                option_type: "string".to_string(),
                required: true,
                default: None,
                enum_values: None,
                help: Some("Your Azure OpenAI endpoint URL".to_string()),
            },
            ConfigOption {
                key: "api_version".to_string(),
                label: "API Version".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: Some(serde_json::json!("2024-02-01")),
                enum_values: None,
                help: Some("Azure OpenAI API version".to_string()),
            },
        ]),
        category: Some("cloud".to_string()),
    }
}

/// Build auth capabilities for Google (Gemini/Vertex).
pub fn google_auth_capabilities() -> ProviderAuthCapabilities {
    let has_key = std::env::var("GOOGLE_API_KEY").is_ok()
        || std::env::var("GOOGLE_APPLICATION_CREDENTIALS").is_ok()
        || crate::auth::store::get_auth("google").is_some();

    let auth_source = if std::env::var("GOOGLE_API_KEY").is_ok()
        || std::env::var("GOOGLE_APPLICATION_CREDENTIALS").is_ok()
    {
        Some("env".to_string())
    } else if crate::auth::store::get_auth("google").is_some() {
        Some("auth_store".to_string())
    } else {
        None
    };

    ProviderAuthCapabilities {
        provider_id: "google".to_string(),
        display_name: "Google AI".to_string(),
        methods: vec![
            AuthMethod::api("Enter Google API Key").with_index(0),
            AuthMethod {
                method_type: AuthMethodType::Env,
                label: "Use Google Application Default Credentials".to_string(),
                description: Some("Use gcloud ADC for authentication".to_string()),
                requires_browser: false,
                requires_callback: false,
                prompts: None,
                input_fields: None,
                method_index: Some(1),
            },
        ],
        auth_required: true,
        is_authenticated: has_key,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "project_id".to_string(),
                label: "Google Cloud Project ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("Google Cloud project ID".to_string()),
            },
            ConfigOption {
                key: "location".to_string(),
                label: "Vertex AI Location".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: Some(serde_json::json!("us-central1")),
                enum_values: None,
                help: Some("Vertex AI region (e.g., us-central1)".to_string()),
            },
        ]),
        category: Some("cloud".to_string()),
    }
}

/// Build auth capabilities for AWS Bedrock.
///
/// Supports multiple AWS credential methods.
pub fn bedrock_auth_capabilities() -> ProviderAuthCapabilities {
    let has_creds = std::env::var("AWS_ACCESS_KEY_ID").is_ok()
        || std::env::var("AWS_BEARER_TOKEN_BEDROCK").is_ok()
        || std::env::var("AWS_PROFILE").is_ok();

    let auth_source = if has_creds {
        Some("env".to_string())
    } else {
        None
    };

    ProviderAuthCapabilities {
        provider_id: "bedrock".to_string(),
        display_name: "AWS Bedrock".to_string(),
        methods: vec![AuthMethod {
            method_type: AuthMethodType::Env,
            label: "AWS Credentials".to_string(),
            description: Some(
                "Use AWS credentials (IAM role, access key, SSO, or bearer token)".to_string(),
            ),
            requires_browser: false,
            requires_callback: false,
            prompts: None,
            input_fields: None,
            method_index: Some(0),
        }],
        auth_required: true,
        is_authenticated: has_creds,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "region".to_string(),
                label: "AWS Region".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: Some(serde_json::json!("us-east-1")),
                enum_values: None,
                help: Some("AWS region for Bedrock".to_string()),
            },
            ConfigOption {
                key: "profile".to_string(),
                label: "AWS Profile".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("AWS CLI profile name".to_string()),
            },
            ConfigOption {
                key: "bearer_token".to_string(),
                label: "AWS Bearer Token".to_string(),
                option_type: "password".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("AWS bearer token for Bedrock (alternative to access key)".to_string()),
            },
        ]),
        category: Some("cloud".to_string()),
    }
}

/// Build auth capabilities for Cloudflare AI Gateway.
///
/// Uses Cloudflare API tokens for authentication.
pub fn cloudflare_auth_capabilities() -> ProviderAuthCapabilities {
    let has_key = std::env::var("CLOUDFLARE_API_TOKEN").is_ok()
        || crate::auth::store::get_auth("cloudflare").is_some();

    let auth_source = if std::env::var("CLOUDFLARE_API_TOKEN").is_ok() {
        Some("env".to_string())
    } else if crate::auth::store::get_auth("cloudflare").is_some() {
        Some("auth_store".to_string())
    } else {
        None
    };

    let prompts = vec![
        AuthPrompt::Text {
            key: "api_token".to_string(),
            message: "Enter your Cloudflare API Token".to_string(),
            placeholder: Some("your-cloudflare-api-token".to_string()),
            validate: None,
            condition: None,
        },
        AuthPrompt::Text {
            key: "account_id".to_string(),
            message: "Enter your Cloudflare Account ID".to_string(),
            placeholder: Some("your-account-id".to_string()),
            validate: None,
            condition: None,
        },
    ];

    ProviderAuthCapabilities {
        provider_id: "cloudflare".to_string(),
        display_name: "Cloudflare AI Gateway".to_string(),
        methods: vec![
            AuthMethod::api_with_prompts("Use Cloudflare API Token", prompts).with_index(0),
        ],
        auth_required: true,
        is_authenticated: has_key,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "account_id".to_string(),
                label: "Account ID".to_string(),
                option_type: "string".to_string(),
                required: true,
                default: None,
                enum_values: None,
                help: Some("Your Cloudflare account ID".to_string()),
            },
            ConfigOption {
                key: "gateway_id".to_string(),
                label: "Gateway ID".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("Your Cloudflare AI Gateway ID (optional)".to_string()),
            },
        ]),
        category: Some("cloud".to_string()),
    }
}

/// Build auth capabilities for SAP AI Core.
///
/// Uses SAP AI Core service keys for authentication.
pub fn sap_ai_core_auth_capabilities() -> ProviderAuthCapabilities {
    let has_key = std::env::var("SAP_AI_CORE_SERVICE_KEY").is_ok()
        || std::env::var("AICORE_AUTH_URL").is_ok()
        || crate::auth::store::get_auth("sap-ai-core").is_some();

    let auth_source = if std::env::var("SAP_AI_CORE_SERVICE_KEY").is_ok()
        || std::env::var("AICORE_AUTH_URL").is_ok()
    {
        Some("env".to_string())
    } else if crate::auth::store::get_auth("sap-ai-core").is_some() {
        Some("auth_store".to_string())
    } else {
        None
    };

    let prompts = vec![
        AuthPrompt::Text {
            key: "auth_url".to_string(),
            message: "Enter SAP AI Core Auth URL".to_string(),
            placeholder: Some(
                "https://your-instance.authentication.sap.hana.ondemand.com".to_string(),
            ),
            validate: Some(r"^https://.*\.authentication\.sap\.hana\.ondemand\.com$".to_string()),
            condition: None,
        },
        AuthPrompt::Text {
            key: "client_id".to_string(),
            message: "Enter Client ID".to_string(),
            placeholder: Some("your-client-id".to_string()),
            validate: None,
            condition: None,
        },
        AuthPrompt::Text {
            key: "client_secret".to_string(),
            message: "Enter Client Secret".to_string(),
            placeholder: Some("your-client-secret".to_string()),
            validate: None,
            condition: None,
        },
    ];

    ProviderAuthCapabilities {
        provider_id: "sap-ai-core".to_string(),
        display_name: "SAP AI Core".to_string(),
        methods: vec![
            AuthMethod::api_with_prompts("Use SAP AI Core Service Key", prompts).with_index(0),
        ],
        auth_required: true,
        is_authenticated: has_key,
        auth_source,
        config_options: Some(vec![
            ConfigOption {
                key: "auth_url".to_string(),
                label: "Auth URL".to_string(),
                option_type: "string".to_string(),
                required: true,
                default: None,
                enum_values: None,
                help: Some("SAP AI Core authentication URL".to_string()),
            },
            ConfigOption {
                key: "api_url".to_string(),
                label: "API URL".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: None,
                enum_values: None,
                help: Some("SAP AI Core API base URL".to_string()),
            },
            ConfigOption {
                key: "resource_group".to_string(),
                label: "Resource Group".to_string(),
                option_type: "string".to_string(),
                required: false,
                default: Some(serde_json::json!("default")),
                enum_values: None,
                help: Some("SAP AI Core resource group".to_string()),
            },
        ]),
        category: Some("enterprise".to_string()),
    }
}

/// Build auth capabilities for local providers (Ollama, LM Studio, vLLM).
pub fn local_provider_auth_capabilities(provider_id: &str) -> ProviderAuthCapabilities {
    use crate::ports::{ANTHROPIC_COMPAT, LMSTUDIO_DEFAULT, OLLAMA_DEFAULT, VLLM_DEFAULT};

    let (display_name, default_url) = match provider_id {
        "ollama" => ("Ollama", format!("http://localhost:{}", OLLAMA_DEFAULT)),
        "lmstudio" => (
            "LM Studio",
            format!("http://localhost:{}", LMSTUDIO_DEFAULT),
        ),
        "vllm" => ("vLLM", format!("http://localhost:{}", VLLM_DEFAULT)),
        _ => (
            provider_id,
            format!("http://localhost:{}", ANTHROPIC_COMPAT),
        ),
    };

    ProviderAuthCapabilities {
        provider_id: provider_id.to_string(),
        display_name: display_name.to_string(),
        methods: vec![AuthMethod {
            method_type: AuthMethodType::Env,
            label: "No Authentication Required".to_string(),
            description: Some("Local provider requires no authentication".to_string()),
            requires_browser: false,
            requires_callback: false,
            prompts: None,
            input_fields: None,
            method_index: Some(0),
        }],
        auth_required: false,
        is_authenticated: true, // Local providers are always "authenticated"
        auth_source: Some("local".to_string()),
        config_options: Some(vec![ConfigOption {
            key: "base_url".to_string(),
            label: "Base URL".to_string(),
            option_type: "string".to_string(),
            required: false,
            default: Some(serde_json::json!(default_url)),
            enum_values: None,
            help: Some(format!("{} server URL", display_name)),
        }]),
        category: Some("local".to_string()),
    }
}

/// Build the default registry with all known providers.
pub fn build_default_registry() -> ProviderAuthRegistry {
    let registry = ProviderAuthRegistry::new();

    // Register major providers
    registry.register(copilot_auth_capabilities());
    registry.register(copilot_enterprise_auth_capabilities());
    registry.register(gitlab_auth_capabilities());
    registry.register(openai_auth_capabilities());
    registry.register(openai_codex_auth_capabilities());
    registry.register(anthropic_auth_capabilities());
    registry.register(kilo_auth_capabilities());
    registry.register(azure_auth_capabilities());
    registry.register(google_auth_capabilities());
    registry.register(bedrock_auth_capabilities());
    registry.register(cloudflare_auth_capabilities());
    registry.register(sap_ai_core_auth_capabilities());

    // Register local providers
    for provider in ["ollama", "lmstudio", "vllm"] {
        registry.register(local_provider_auth_capabilities(provider));
    }

    registry
}

/// Get all available auth methods for all providers.
pub fn get_all_auth_methods() -> HashMap<String, Vec<AuthMethod>> {
    let registry = build_default_registry();
    registry
        .all_capabilities()
        .iter()
        .map(|e| (e.key().clone(), e.value().methods.clone()))
        .collect()
}

/// Get auth methods for a specific provider.
pub fn get_provider_auth_methods(provider_id: &str) -> Option<Vec<AuthMethod>> {
    let registry = build_default_registry();
    registry
        .get_capabilities(provider_id)
        .map(|caps| caps.methods.clone())
}

/// Get full auth capabilities for a provider.
pub fn get_provider_auth_capabilities(provider_id: &str) -> Option<ProviderAuthCapabilities> {
    let registry = build_default_registry();
    registry.get_capabilities(provider_id)
}

/// Check if a provider supports OAuth authorization.
pub fn provider_supports_oauth(provider_id: &str) -> bool {
    get_provider_auth_methods(provider_id)
        .map(|methods| {
            methods
                .iter()
                .any(|m| m.method_type == AuthMethodType::Oauth)
        })
        .unwrap_or(false)
}

/// Check if a provider supports API key authentication.
pub fn provider_supports_api_key(provider_id: &str) -> bool {
    get_provider_auth_methods(provider_id)
        .map(|methods| {
            methods.iter().any(|m| {
                m.method_type == AuthMethodType::Api || m.method_type == AuthMethodType::Env
            })
        })
        .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn auth_method_type_display() {
        assert_eq!(AuthMethodType::Oauth.to_string(), "oauth");
        assert_eq!(AuthMethodType::Api.to_string(), "api");
        assert_eq!(AuthMethodType::Env.to_string(), "env");
    }

    #[test]
    fn oauth_method_builder() {
        let method = AuthMethod::oauth("Sign in");
        assert_eq!(method.method_type, AuthMethodType::Oauth);
        assert_eq!(method.label, "Sign in");
        assert!(method.requires_browser);
        assert!(method.requires_callback);
    }

    #[test]
    fn api_method_builder() {
        let method = AuthMethod::api("Enter API Key");
        assert_eq!(method.method_type, AuthMethodType::Api);
        assert_eq!(method.label, "Enter API Key");
        assert!(!method.requires_browser);
        assert!(method.prompts.is_some());
    }

    #[test]
    fn auth_prompt_text() {
        let prompt = AuthPrompt::text("api_key", "Enter your API key");
        assert_eq!(prompt.key(), "api_key");
        match prompt {
            AuthPrompt::Text { key, message, .. } => {
                assert_eq!(key, "api_key");
                assert_eq!(message, "Enter your API key");
            }
            _ => panic!("expected Text prompt"),
        }
    }

    #[test]
    fn auth_prompt_select() {
        let options = vec![
            AuthPromptOption::new("GitHub.com", "github.com"),
            AuthPromptOption::with_hint("Enterprise", "enterprise", "Self-hosted"),
        ];
        let prompt = AuthPrompt::select("deployment", "Select deployment", options);
        assert_eq!(prompt.key(), "deployment");
        match prompt {
            AuthPrompt::Select { key, options, .. } => {
                assert_eq!(key, "deployment");
                assert_eq!(options.len(), 2);
                assert_eq!(options[0].label, "GitHub.com");
                assert_eq!(options[1].hint, Some("Self-hosted".to_string()));
            }
            _ => panic!("expected Select prompt"),
        }
    }

    #[test]
    fn auth_prompt_with_condition() {
        let prompt =
            AuthPrompt::text_with_condition("url", "Enter URL", "deployment", "enterprise");
        match prompt {
            AuthPrompt::Text { condition, .. } => {
                assert!(condition.is_some());
                let cond = condition.unwrap();
                assert_eq!(cond.get("deployment"), Some(&"enterprise".to_string()));
            }
            _ => panic!("expected Text prompt"),
        }
    }

    #[test]
    fn authorization_serde() {
        let auth = Authorization {
            url: "https://example.com/auth".to_string(),
            method: AuthFlowMethod::Auto,
            instructions: "Open this URL".to_string(),
            state: Some("state123".to_string()),
            code_verifier: Some("verifier456".to_string()),
            device_code: None,
            user_code: None,
            interval: None,
            expires_at: Some(1234567890),
            verification_uri: None,
        };

        let json = serde_json::to_string(&auth).unwrap();
        assert!(json.contains("\"url\""));
        assert!(json.contains("\"method\""));
        assert!(json.contains("\"auto\""));
    }

    #[test]
    fn provider_auth_capabilities_builder() {
        let caps = ProviderAuthCapabilities::new("openai", "OpenAI")
            .with_method(AuthMethod::oauth("Sign in with OpenAI"))
            .with_method(AuthMethod::api("Enter API Key"))
            .with_auth_required(true)
            .with_authenticated(false, "none")
            .with_category("major");

        assert_eq!(caps.provider_id, "openai");
        assert_eq!(caps.methods.len(), 2);
        assert!(caps.auth_required);
        assert!(!caps.is_authenticated);
        assert_eq!(caps.category, Some("major".to_string()));
    }

    #[test]
    fn registry_operations() {
        let registry = ProviderAuthRegistry::new();

        let caps = ProviderAuthCapabilities::new("test", "Test Provider")
            .with_method(AuthMethod::api("Test"));

        registry.register(caps);

        assert!(registry.get_capabilities("test").is_some());
        assert!(registry.get_capabilities("missing").is_none());
        assert_eq!(registry.list_providers().len(), 1);
    }

    #[test]
    fn auth_method_index() {
        let method = AuthMethod::oauth("Sign in").with_index(0);
        assert_eq!(method.method_index, Some(0));
    }

    #[test]
    fn authorize_request_deserialize() {
        let json = r#"{"method": 0, "inputs": {"key": "value"}}"#;
        let req: AuthorizeRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.method, 0);
        assert_eq!(req.inputs.unwrap().get("key"), Some(&"value".to_string()));
    }
}
