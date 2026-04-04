import { z } from 'zod';

// ============================================================================
// Agent Schemas
// ============================================================================

export const AgentSchema = z.object({
  id: z.string(),
  has_soul: z.boolean(),
  has_tools: z.boolean(),
  has_heartbeat: z.boolean(),
  model: z.string().optional(),
  heartbeat_secs: z.number().optional(),
  max_tool_iterations: z.number().optional(),
  enabled_skills: z.array(z.string()).optional(),
  cron_jobs_count: z.number().optional(),
  history_messages: z.number().optional(),
  max_turns: z.number().optional(),
  compact_keep_recent_turns: z.number().optional(),
  timezone: z.string().optional(),
  reasoning_effort: z.string().optional(),
});

// Raw agent schema for API responses (includes all fields from backend)
export const RawAgentSchema = z.object({
  id: z.string(),
  model: z.string().optional(),
  provider: z.string().optional(),
  timezone: z.string().optional(),
  has_heartbeat: z.boolean().optional(),
  last_heartbeat_at: z.number().optional(), // u64 from backend (unix timestamp)
  has_soul: z.boolean().optional(),
  has_tools: z.boolean().optional(),
  cron_jobs_count: z.number().optional(),
  heartbeat_secs: z.number().nullable().optional(),
  max_turns: z.number().nullable().optional(),
  history_messages: z.number().nullable().optional(),
  compact_keep_recent_turns: z.number().nullable().optional(),
  max_tool_iterations: z.number().nullable().optional(),
  reasoning_effort: z.string().nullable().optional(),
  enabled_skills: z.array(z.string()).nullable().optional(),
  watch_paths: z.array(z.string()).optional(),
  created_at: z.string().optional(),
  soul: z.string().optional(),
  tools: z.string().optional(),
  heartbeat: z.string().optional(),
  session_count: z.number().optional(),
});

// ============================================================================
// Session Schemas
// ============================================================================

export const SessionSchema = z.object({
  file: z.string(),
  session_id: z.string(),
  agent_id: z.string(),
  created_at: z.number(),
  modified: z.number(),
  title: z.string().optional(),
  message_count: z.number().optional(),
});

// Transformed session schema (camelCase for UI)
export const TransformedSessionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  title: z.string().optional(),
  messageCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const RawSessionSchema = SessionSchema;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.string(), z.unknown()),
});

export const ToolResultSchema = z.object({
  tool_call_id: z.string(),
  content: z.string(),
  is_error: z.boolean().optional(),
});

export const TokenUsageSummarySchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  cached_tokens: z.number().default(0),
  reasoning_tokens: z.number().default(0),
});

export const ToolCallRecordSchema = z.object({
  tool: z.string(),
  args_summary: z.string(),
  success: z.boolean(),
  duration_ms: z.number(),
  error: z.string().optional(),
});

export const ModelCallDetailSchema = z.object({
  model: z.string(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cached_tokens: z.number(),
  reasoning_tokens: z.number(),
  cost_usd: z.number().optional(),
  latency_ms: z.number(),
});

export const TurnReceiptSchema = z.object({
  agent: z.string(),
  session: z.string().optional(),
  started_at: z.number(),
  duration_ms: z.number(),
  user_prompt: z.string(),
  tool_calls: z.array(ToolCallRecordSchema).default([]),
  tokens: TokenUsageSummarySchema,
  model_calls: z.number(),
  reply_summary: z.string(),
  model_id: z.string(),
  estimated_cost_usd: z.number().optional(),
  call_details: z.array(ModelCallDetailSchema).default([]),
});

export const ReceiptGetResponseSchema = z.object({
  file: z.string(),
  receipts: z.array(TurnReceiptSchema),
});

// ============================================================================
// Provider Status Schemas
// ============================================================================

export const ProviderStatusSchema = z.object({
  provider: z.string(),
  name: z.string(),
  configured: z.boolean(),
  has_api_key: z.boolean(),
  env_var: z.string().optional(),
  env_vars: z.array(z.string()),
  details: z.string().optional(),
  source: z.string().optional(),
  api: z.string().nullable().optional(),
  model_count: z.number(),
});

// Schema for the API response wrapper
export const ProviderStatusResponseSchema = z.object({
  providers: z.array(ProviderStatusSchema),
});

// ============================================================================
// Cron Job Schemas
// ============================================================================

export const CronJobSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  schedule: z.string(),
  message: z.string().optional(),
  last_status: z.string().nullable(),
});

// Backend cron job schema - matches Rust CronJobItem struct
export const BackendCronJobSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  schedule: z.string(),
  message: z.string().optional(),
  kind: z.string(),
  depends_on: z.array(z.string()).optional(),
  max_retries: z.number().optional(),
  retry_delay_secs: z.number().optional(),
  retry_count: z.number(), // Required - u32 in Rust
  last_status: z.string().nullable().optional(),
  enabled: z.boolean(), // Required - bool in Rust
});

// API response wrapper schemas
export const AgentsListResponseSchema = z.object({
  agents: z.array(RawAgentSchema),
});

export const CronJobsListResponseSchema = z.object({
  jobs: z.array(BackendCronJobSchema),
});

// ============================================================================
// Model Info Schema
// ============================================================================

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  description: z.string().nullable().optional(),
  input_price: z.number().nullable().optional(),
  output_price: z.number().nullable().optional(),
  context_window: z.number().nullable().optional(),
  max_output: z.number().nullable().optional(),
  tool_call: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  attachment: z.boolean().optional(),
  family: z.string().nullable().optional(),
  cache_read_price: z.number().nullable().optional(),
  cache_write_price: z.number().nullable().optional(),
  modalities: z.array(z.string()).nullable().optional(),
});

export const ModelsListResponseSchema = z.object({
  models: z.array(ModelInfoSchema).nullable().optional(),
});

// ============================================================================
// Auth Schemas
// ============================================================================

export const ChatGptAuthSessionSchema = z.object({
  login_id: z.string(),
  status: z.enum(['pending', 'complete', 'error']),
  auth_url: z.string(),
  interval: z.number().optional(),
  error: z.string().optional(),
});

export const ChatGptAuthStatusSchema = z.object({
  authenticated: z.boolean(),
  needs_refresh: z.boolean(),
  account_id: z.string().optional(),
});

export const ChatGptPollStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'error']),
  message: z.string().optional(),
});

export const CopilotAuthSessionSchema = z.object({
  login_id: z.string(),
  status: z.enum(['pending', 'complete', 'error', 'warning']),
  verification_uri: z.string(),
  user_code: z.string(),
  interval: z.number().optional(),
  error: z.string().optional(),
});

export const ApiKeyAuthResponseSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
});

export const CopilotPollResponseSchema = z.object({
  status: z.enum(['pending', 'complete', 'failed', 'timeout']),
  interval: z.number().optional(),
  error: z.string().optional(),
});

// ============================================================================
// Test Message Schema
// ============================================================================

export const TestMessageResponseSchema = z.object({
  response: z.string().optional(),
  content: z.string().optional(),
  usage: z.object({
    input_tokens: z.number().optional(),
    output_tokens: z.number().optional(),
  }).optional(),
});

// ============================================================================
// Webhook Schemas
// ============================================================================

export const WebhookConfigSchema = z.object({
  enabled: z.boolean(),
  secret: z.string().nullable().optional(),
  event_types: z.array(z.string()).default([]),
  url: z.string(),
});

export const WebhookConfigResponseSchema = z.object({
  agent_id: z.string(),
  enabled: z.boolean(),
  secret: z.string().nullable().optional(),
  event_types: z.array(z.string()).default([]),
  url: z.string(),
});

export const WebhookDeliverySchema = z.object({
  id: z.string(),
  timestamp: z.number(),
  event_type: z.string(),
  status: z.string(),
  status_code: z.number().nullable().optional(),
  error: z.string().nullable().optional(),
  duration_ms: z.number().nullable().optional(),
  payload_preview: z.string().nullable().optional(),
});

export const WebhookDeliveriesResponseSchema = z.object({
  agent_id: z.string(),
  deliveries: z.array(WebhookDeliverySchema),
});

export const WebhookTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  delivery_id: z.string().nullable().optional(),
});

// ============================================================================
// Log Schemas
// ============================================================================

// Schema for recent/persisted log entries - matches Rust logs::LogEntry struct
// Used by /api/logs/recent and /api/logs endpoints
export const RecentLogEntrySchema = z.object({
  type: z.string(),
  level: z.string(),
  target: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.unknown()).optional(),
  ts: z.string(),
});

// Schema for persisted log entries - matches Rust logs::PersistedLogEntry struct
export const PersistedLogEntrySchema = z.object({
  id: z.number(),
  type: z.string(),
  level: z.string(),
  target: z.string(),
  message: z.string(),
  fields: z.record(z.string(), z.unknown()).optional(),
  ts: z.string(),
  timestamp: z.number().optional(),
});

// Response schemas for logs endpoints
export const RecentLogsResponseSchema = z.object({
  logs: z.array(RecentLogEntrySchema),
  has_more: z.boolean(),
  buffer_capacity: z.number(),
  retention: z.string(),
});

export const PersistedLogsResponseSchema = z.object({
  logs: z.array(PersistedLogEntrySchema),
  total: z.number(),
  has_more: z.boolean(),
  next_offset: z.number(),
  retention: z.string(),
});

// ============================================================================
// Agent Log Schemas - matches Rust gateway::types::LogEntry struct
// ============================================================================

export const LogTokensSchema = z.object({
  prompt: z.number(),
  completion: z.number(),
  total: z.number(),
});

// Schema for agent logs - matches Rust LogEntry struct
// Used by /api/agents/:id/logs endpoint
export const LogEntrySchema = z.object({
  timestamp: z.number(), // u64 in Rust (unix timestamp)
  level: z.string(),
  agent: z.string(),
  source: z.string(),
  message: z.string(),
  duration_ms: z.number().optional(), // Option<u64>
  model: z.string(),
  tool_calls: z.number(), // usize in Rust
  tokens: LogTokensSchema,
});

export const LogsListResponseSchema = z.object({
  logs: z.array(LogEntrySchema),
});

// ============================================================================
// Usage/Analytics Schemas
// ============================================================================

export const UsageBucketSchema = z.object({
  day: z.string(),
  agent: z.string(),
  model: z.string(),
  turns: z.number(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  estimated_cost_usd: z.number(),
});

export const UsageApiResponseSchema = z.object({
  usage: z.array(UsageBucketSchema),
  total_cost_usd: z.number(),
  total_turns: z.number(),
});

// ============================================================================
// Cron Run Schemas - matches Rust CronRunItem struct
// ============================================================================

export const CronRunItemSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  scheduled_at: z.number(), // u64 in Rust
  executed_at: z.number().optional(), // Option<u64>
  completed_at: z.number().optional(), // Option<u64>
  status: z.string(),
  output_preview: z.string().optional(),
  error: z.string().optional(),
  duration_ms: z.number().optional(), // Option<u64>
});

export const CronRunsListResponseSchema = z.object({
  runs: z.array(CronRunItemSchema),
});

// ============================================================================
// Memory Schemas - matches Rust MemoryItem struct
// ============================================================================

export const MemoryItemSchema = z.object({
  key: z.string(),
  value: z.string(),
  tags: z.array(z.string()).default([]),
  timestamp: z.string(),
  score: z.number().optional(), // Option<f64>
});

export const MemoryListResponseSchema = z.object({
  entries: z.array(MemoryItemSchema),
});

export const MemoryDeleteResponseSchema = z.object({
  deleted: z.boolean(),
  key: z.string().optional(),
});

// ============================================================================
// Skill Schemas - matches Rust SkillItem struct
// ============================================================================

export const SkillItemSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  has_skill: z.boolean(),
});

export const SkillListResponseSchema = z.object({
  skills: z.array(SkillItemSchema),
});

// ============================================================================
// Heartbeat Status Schemas - matches Rust HeartbeatStatusItem struct
// ============================================================================

export const HeartbeatStatusItemSchema = z.object({
  agent_id: z.string(),
  enabled: z.boolean(),
  health: z.string(),
  last_tick: z.number().optional(), // Option<u64>
  next_tick: z.number().optional(), // Option<u64>
  interval_secs: z.number().optional(), // Option<u64>
  message_preview: z.string().optional(),
  latest_session: z.string().optional(),
});

export const HeartbeatStatusResponseSchema = z.object({
  agents: z.array(HeartbeatStatusItemSchema),
});

export type Agent = z.infer<typeof AgentSchema>;
export type RawAgent = z.infer<typeof RawAgentSchema>;
export type Session = z.infer<typeof TransformedSessionSchema>;
export type RawSession = z.infer<typeof RawSessionSchema>;
export type ToolCall = z.infer<typeof ToolCallSchema>;
export type ToolResult = z.infer<typeof ToolResultSchema>;
export type TokenUsageSummary = z.infer<typeof TokenUsageSummarySchema>;
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;
export type ModelCallDetail = z.infer<typeof ModelCallDetailSchema>;
export type TurnReceipt = z.infer<typeof TurnReceiptSchema>;
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
export type CronJob = z.infer<typeof CronJobSchema>;
export type BackendCronJob = z.infer<typeof BackendCronJobSchema>;
export type CronRunItem = z.infer<typeof CronRunItemSchema>;
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ChatGptAuthSession = z.infer<typeof ChatGptAuthSessionSchema>;
export type ChatGptAuthStatus = z.infer<typeof ChatGptAuthStatusSchema>;
export type ChatGptPollStatus = z.infer<typeof ChatGptPollStatusSchema>;
export type CopilotAuthSession = z.infer<typeof CopilotAuthSessionSchema>;
export type ApiKeyAuthResponse = z.infer<typeof ApiKeyAuthResponseSchema>;
export type CopilotPollResponse = z.infer<typeof CopilotPollResponseSchema>;
export type TestMessageResponse = z.infer<typeof TestMessageResponseSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type WebhookConfigResponse = z.infer<typeof WebhookConfigResponseSchema>;
export type WebhookDelivery = z.infer<typeof WebhookDeliverySchema>;
export type WebhookDeliveriesResponse = z.infer<typeof WebhookDeliveriesResponseSchema>;
export type WebhookTestResponse = z.infer<typeof WebhookTestResponseSchema>;
export type UsageBucket = z.infer<typeof UsageBucketSchema>;
export type UsageApiResponse = z.infer<typeof UsageApiResponseSchema>;
export type RecentLogEntry = z.infer<typeof RecentLogEntrySchema>;
export type PersistedLogEntry = z.infer<typeof PersistedLogEntrySchema>;
export type LogEntry = z.infer<typeof LogEntrySchema>;
export type LogTokens = z.infer<typeof LogTokensSchema>;
export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type SkillItem = z.infer<typeof SkillItemSchema>;
export type HeartbeatStatusItem = z.infer<typeof HeartbeatStatusItemSchema>;
