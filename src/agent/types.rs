use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

use crate::config::Config;
use crate::models::TokenUsage;
use crate::session::SessionStore;

// ---------------------------------------------------------------------------
// Constants & tiny helpers
// ---------------------------------------------------------------------------

pub const DEFAULT_PROVIDER: &str = "openai";
pub const DEFAULT_MODEL_ID: &str = "openai-default";
pub const MAX_TOOL_RESULT_BYTES: usize = 16_000;

pub fn epoch_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

pub fn epoch_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn epoch_secs() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

pub fn uuid_like_id() -> String {
    format!("{:016x}", epoch_nanos())
}

pub fn truncate_tool_result(s: String) -> String {
    if s.len() <= MAX_TOOL_RESULT_BYTES {
        return s;
    }
    let mut end = MAX_TOOL_RESULT_BYTES;
    while !s.is_char_boundary(end) && end > 0 {
        end -= 1;
    }
    format!(
        "{}\n\n[… result truncated — {} bytes total, showing first {}. Use more specific args to narrow output.]",
        &s[..end],
        s.len(),
        end,
    )
}

// ---------------------------------------------------------------------------
// Turn receipt types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ToolCallRecord {
    pub tool: String,
    pub args_summary: String,
    pub success: bool,
    pub duration_ms: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TurnReceipt {
    pub agent: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session: Option<String>,
    pub started_at: u64,
    pub duration_ms: u64,
    pub user_prompt: String,
    pub tool_calls: Vec<ToolCallRecord>,
    pub tokens: TokenUsageSummary,
    pub model_calls: u32,
    pub reply_summary: String,
}

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct TokenUsageSummary {
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub total_tokens: u64,
}

impl TokenUsageSummary {
    pub fn accumulate(&mut self, usage: &TokenUsage) {
        self.prompt_tokens += usage.prompt_tokens;
        self.completion_tokens += usage.completion_tokens;
        self.total_tokens += usage.total_tokens;
    }
}

// ---------------------------------------------------------------------------
// Agent struct
// ---------------------------------------------------------------------------

pub struct Agent {
    pub id: String,
    pub agent_root: PathBuf,
    pub workspace: PathBuf,
    pub provider: String,
    pub model_id: String,
    pub current_session: Option<String>,
    pub max_tool_iterations: usize,
    pub enabled_skills: Option<Vec<String>>,
    pub fallback_models: Vec<String>,
    pub model_config_ref: Option<String>,
}

impl Agent {
    pub fn new(id: impl Into<String>, agent_root: impl Into<PathBuf>) -> Self {
        let agent_root = agent_root.into();
        let workspace = agent_root.join("workspace");
        let current_session = SessionStore::load_current(&workspace);
        Self {
            id: id.into(),
            agent_root,
            workspace,
            provider: DEFAULT_PROVIDER.to_string(),
            model_id: DEFAULT_MODEL_ID.to_string(),
            current_session,
            max_tool_iterations: 25,
            enabled_skills: None,
            fallback_models: Vec::new(),
            model_config_ref: None,
        }
    }

    pub fn new_from_config(agent_cfg: &crate::config::AgentConfig, cfg: &Config) -> Self {
        let agent_root = PathBuf::from(&agent_cfg.root);
        let workspace = agent_root.join("workspace");
        let (provider, model_id) = agent_cfg
            .model
            .as_ref()
            .and_then(|model_ref| {
                cfg.models.iter().find(|m| m.id == *model_ref).map(|mc| {
                    (
                        mc.provider.clone(),
                        mc.model.clone().unwrap_or_else(|| mc.id.clone()),
                    )
                })
            })
            .unwrap_or_else(|| (DEFAULT_PROVIDER.to_string(), DEFAULT_MODEL_ID.to_string()));
        let current_session = SessionStore::load_current(&workspace);
        Self {
            id: agent_cfg.id.clone(),
            agent_root,
            workspace,
            provider,
            model_id,
            current_session,
            max_tool_iterations: agent_cfg.max_tool_iterations.unwrap_or(25),
            enabled_skills: agent_cfg.enabled_skills.clone(),
            fallback_models: agent_cfg.fallback_models.clone(),
            model_config_ref: agent_cfg.model.clone(),
        }
    }

    pub async fn start_session(&mut self) -> String {
        let id = crate::utils::generate_nonce();
        let _ = tokio::fs::create_dir_all(&self.workspace).await;
        let path = self.workspace.join("CURRENT_SESSION");
        let _ = tokio::fs::write(&path, &id).await;
        self.current_session = Some(id.clone());
        id
    }
}
