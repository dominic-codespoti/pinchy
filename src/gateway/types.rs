use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Response wrapper for list of agents
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentsListResponse {
    pub agents: Vec<AgentListItem>,
}

/// Individual agent item in the list response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentListItem {
    pub id: String,
    pub has_soul: bool,
    pub has_tools: bool,
    pub has_heartbeat: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_heartbeat_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heartbeat_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tool_iterations: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cron_jobs_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_messages: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compact_keep_recent_turns: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
}

/// Full agent detail response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentDetail {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub soul: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heartbeat: Option<String>,
    pub session_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub heartbeat_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_tool_iterations: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled_skills: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub history_messages: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_turns: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub compact_keep_recent_turns: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reasoning_effort: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub watch_paths: Vec<String>,
}

/// Response for agent clone operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentCloneResponse {
    pub id: String,
    pub created: bool,
    pub files_cloned: i64,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub errors: Vec<String>,
}

/// Response for agent create operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentCreateResponse {
    pub id: String,
    pub created: bool,
}

/// Response for agent update operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentUpdateResponse {
    pub id: String,
    pub updated: Vec<String>,
}

/// Response for agent delete operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentDeleteResponse {
    pub id: String,
    pub deleted: bool,
}

/// Response for agent file get operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentFileGetResponse {
    pub filename: String,
    pub content: String,
}

/// Response for agent file put operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct AgentFilePutResponse {
    pub filename: String,
    pub saved: bool,
}

/// Error response structure
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ErrorResponse {
    pub error: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allowed: Option<Vec<String>>,
}

/// Cron job list response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronJobsListResponse {
    pub jobs: Vec<CronJobItem>,
}

/// Individual cron job item
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronJobItem {
    pub id: String,
    pub agent_id: String,
    pub name: String,
    pub schedule: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub depends_on: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_retries: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retry_delay_secs: Option<u64>,
    pub retry_count: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_status: Option<String>,
    pub enabled: bool,
}

/// Cron runs list response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronRunsListResponse {
    pub runs: Vec<CronRunItem>,
}

/// Individual cron run item
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronRunItem {
    pub id: String,
    pub job_id: String,
    pub scheduled_at: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executed_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub completed_at: Option<u64>,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
}

/// Cron job create response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronJobCreateResponse {
    pub job_id: String,
    pub name: String,
    pub agent_id: String,
    pub schedule: String,
    pub message: String,
    pub created_at: u64,
}

/// Cron job delete response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronJobDeleteResponse {
    pub deleted: bool,
    pub job_id: String,
}

/// Cron job trigger response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronJobTriggerResponse {
    pub triggered: bool,
    pub job_id: String,
    pub job_name: String,
    pub agent_id: String,
}

/// Skill item for list response
#[derive(Serialize, TS)]
#[ts(export)]
pub struct SkillItem {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub has_skill: bool,
}

/// Response for skill list endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SkillListResponse {
    pub skills: Vec<SkillItem>,
}

/// Response for skill get endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SkillGetResponse {
    pub name: String,
    pub description: String,
    pub instructions: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub frontmatter: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub operator_managed: Option<bool>,
    #[serde(rename = "allowed-tools", skip_serializing_if = "Option::is_none")]
    pub allowed_tools: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub reference_files: Vec<String>,
}

/// Response for skill create endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SkillCreateResponse {
    pub name: String,
    pub created: bool,
}

/// Response for skill update endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SkillUpdateResponse {
    pub name: String,
    pub updated: bool,
}

/// Response for skill delete endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SkillDeleteResponse {
    pub name: String,
    pub deleted: bool,
}

/// Individual receipt file entry
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ReceiptItem {
    pub file: String,
}

/// Response for receipts list endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ReceiptsListResponse {
    pub receipts: Vec<ReceiptItem>,
}

/// Response for receipt get endpoint
#[derive(Serialize)]
pub(crate) struct ReceiptGetResponse {
    pub file: String,
    pub receipts: Vec<serde_json::Value>,
}

/// Provider status item in the list response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ProviderStatusItem {
    pub provider: String,
    pub name: String,
    pub configured: bool,
    pub has_api_key: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_var: Option<String>,
    pub env_vars: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api: Option<String>,
    pub model_count: usize,
}

/// Response for provider status list endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ProviderStatusListResponse {
    pub providers: Vec<ProviderStatusItem>,
}

/// Response for device flow start endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct DeviceFlowStartResponse {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub interval: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in: Option<u64>,
}

/// Response for device flow poll endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct DeviceFlowPollResponse {
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval: Option<u64>,
}

/// Response for provider auth save operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ProviderAuthResponse {
    pub success: bool,
    pub message: String,
}

/// Response for masked key endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct MaskedKeyResponse {
    pub provider: String,
    pub has_key: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub masked_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_var: Option<String>,
}

/// Response for provider key clear/set operations
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ProviderSetKeyResponse {
    pub ok: bool,
    pub provider: String,
}

/// Model information for discovery responses
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ModelInfo {
    pub id: String,
    pub name: String,
    pub provider: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_window: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_output: Option<u64>,
    #[serde(default)]
    pub tool_call: bool,
    #[serde(default)]
    pub reasoning: bool,
    #[serde(default)]
    pub attachment: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub family: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_read_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cache_write_price: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modalities: Option<Vec<String>>,
}

/// Response for listing available models
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ModelsListResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub models: Option<Vec<ModelInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

/// Response for config save operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct ConfigSaveResponse {
    pub saved: bool,
}

/// Request for enhance prompt endpoint
#[derive(Deserialize)]
pub(crate) struct EnhancePromptRequest {
    pub prompt: String,
}

/// Response for the models.dev registry endpoint
#[derive(Serialize)]
pub(crate) struct ModelsRegistryResponse {
    pub providers: Vec<serde_json::Value>,
    pub cached_at: u64,
    pub total_providers: usize,
    pub total_models: usize,
}

/// Session list item
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SessionItem {
    pub file: String,
    pub session_id: String,
    pub agent_id: String,
    pub created_at: i64,
    pub modified: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub message_count: usize,
}

/// Response for listing sessions
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SessionsListResponse {
    pub sessions: Vec<SessionItem>,
}

/// Response for getting a session
#[derive(Serialize)]
pub(crate) struct SessionGetResponse {
    pub file: String,
    pub messages: Vec<serde_json::Value>,
}

/// Response for session update operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SessionUpdateResponse {
    pub session_id: String,
    pub saved: bool,
    pub count: usize,
}

/// Response for getting current session
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SessionCurrentResponse {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
}

/// Response for session delete operation
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SessionDeleteResponse {
    pub session_id: String,
    pub deleted: bool,
}

/// Dashboard session item for global sessions endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct DashboardSessionItem {
    pub id: String,
    pub agent_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub message_count: usize,
    pub updated_at: i64,
}

/// Response for global sessions list endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct GlobalSessionsListResponse {
    pub sessions: Vec<DashboardSessionItem>,
}

/// Debug payload list response
#[derive(Serialize)]
pub(crate) struct DebugPayloadListResponse {
    pub requests: Vec<serde_json::Value>,
}

/// Log entry for agent logs
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct LogEntry {
    pub timestamp: u64,
    pub level: String,
    pub agent: String,
    pub source: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    pub model: String,
    pub tool_calls: usize,
    pub tokens: LogTokens,
}

/// Token counts for log entry
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct LogTokens {
    pub prompt: u64,
    pub completion: u64,
    pub total: u64,
}

/// Logs list response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct LogsListResponse {
    pub logs: Vec<LogEntry>,
}

/// Cron enhance response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CronEnhanceResponse {
    pub original: String,
    pub enhanced: String,
}

/// Usage row for usage endpoint (from store::UsageBucket)
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct UsageRow {
    pub day: String,
    pub agent: String,
    pub model: String,
    pub turns: u64,
    pub prompt_tokens: u64,
    pub completion_tokens: u64,
    pub cached_tokens: u64,
    pub reasoning_tokens: u64,
    pub total_tokens: u64,
    pub estimated_cost_usd: f64,
}

/// Response for usage endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct UsageResponse {
    pub usage: Vec<UsageRow>,
    pub total_cost_usd: f64,
    pub total_turns: u64,
}

/// Memory item for list response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct MemoryItem {
    pub key: String,
    pub value: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    pub timestamp: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub score: Option<f64>,
}

/// Response for memory list endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct MemoryListResponse {
    pub entries: Vec<MemoryItem>,
}

/// Response for memory delete endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct MemoryDeleteResponse {
    pub deleted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
}

/// Individual heartbeat status item
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct HeartbeatStatusItem {
    pub agent_id: String,
    pub enabled: bool,
    pub health: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_tick: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_tick: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub interval_secs: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latest_session: Option<String>,
}

/// Response for heartbeat status endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct HeartbeatStatusResponse {
    pub agents: Vec<HeartbeatStatusItem>,
}

/// Response for health endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct HealthResponse {
    pub status: String,
    pub version: String,
    pub uptime_secs: u64,
    pub agents: usize,
}

/// Response for webhook ingest endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct WebhookIngestResponse {
    pub success: bool,
    pub message: String,
}

/// Webhook configuration for an agent
#[derive(Serialize, Deserialize, TS)]
#[ts(export)]
pub(crate) struct WebhookConfig {
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secret: Option<String>,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub event_types: Vec<String>,
    pub url: String,
}

/// Response for webhook config endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct WebhookConfigResponse {
    pub agent_id: String,
    #[serde(flatten)]
    pub config: WebhookConfig,
}

/// Request body for PUT /api/agents/:id/webhook/config
#[derive(Deserialize)]
pub(crate) struct UpdateWebhookConfigRequest {
    pub enabled: bool,
    #[serde(default)]
    pub secret: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    pub event_types: Vec<String>, // Reserved for future use
}

/// Response for webhook config update
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct WebhookConfigUpdateResponse {
    pub agent_id: String,
    pub updated: bool,
}

/// Individual webhook delivery log entry
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct WebhookDeliveryItem {
    pub id: String,
    pub timestamp: u64,
    pub event_type: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status_code: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payload_preview: Option<String>,
}

/// Response for webhook deliveries list endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct WebhookDeliveriesResponse {
    pub agent_id: String,
    pub deliveries: Vec<WebhookDeliveryItem>,
}

/// Request body for POST /api/agents/:id/webhook/test
#[derive(Deserialize)]
pub(crate) struct TestWebhookRequest {
    #[serde(default = "default_test_event_type")]
    pub event_type: String,
    #[serde(default)]
    pub payload: Option<serde_json::Value>,
}

fn default_test_event_type() -> String {
    "test".to_string()
}

/// Response for webhook test endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct WebhookTestResponse {
    pub success: bool,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub delivery_id: Option<String>,
}

/// Individual command info for slash commands
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct CommandInfo {
    pub name: String,
    pub description: String,
    pub usage: String,
}

/// Response for slash commands endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct SlashCommandsResponse {
    pub commands: Vec<CommandInfo>,
}

/// Request body for POST /api/agents/:id/test
#[derive(Deserialize)]
pub(crate) struct TestAgentRequest {
    pub message: String,
}

/// Usage info for test agent response
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct TestAgentUsage {
    pub input_tokens: u64,
    pub output_tokens: u64,
}

/// Response for agent test endpoint
#[derive(Serialize, TS)]
#[ts(export)]
pub(crate) struct TestAgentResponse {
    pub response: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<TestAgentUsage>,
}
