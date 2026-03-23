import { Schema as S } from "effect";

// ── Agent ────────────────────────────────────────────

export const AgentSchema = S.Struct({
  id: S.String,
  workspace: S.optional(S.NullishOr(S.String)),
  has_soul: S.optional(S.Boolean),
  has_tools: S.optional(S.Boolean),
  has_heartbeat: S.optional(S.Boolean),
  model: S.optional(S.NullishOr(S.String)),
  heartbeat_secs: S.optional(S.NullishOr(S.Number)),
  max_tool_iterations: S.optional(S.NullishOr(S.Number)),
  enabled_skills: S.optional(S.NullishOr(S.Array(S.String))),
  cron_jobs_count: S.optional(S.NullishOr(S.Number)),
  cron_job_count: S.optional(S.NullishOr(S.Number)),
  history_messages: S.optional(S.NullishOr(S.Number)),
  max_turns: S.optional(S.NullishOr(S.Number)),
  compact_keep_recent_turns: S.optional(S.NullishOr(S.Number)),
  timezone: S.optional(S.NullishOr(S.String)),
  reasoning_effort: S.optional(S.NullishOr(S.String)),
});

export type AgentListItem = S.Schema.Type<typeof AgentSchema>;

export const AgentDetailSchema = S.Struct({
  ...AgentSchema.fields,
  soul: S.NullOr(S.String),
  tools: S.NullOr(S.String),
  heartbeat: S.NullOr(S.String),
  session_count: S.optional(S.Number),
});

export type AgentDetail = S.Schema.Type<typeof AgentDetailSchema>;

export const ListAgentsResponseSchema = S.Struct({
  agents: S.Array(AgentSchema),
});

// ── Session ──────────────────────────────────────────

export const SessionSummarySchema = S.Struct({
  file: S.String,
  session_id: S.String,
  size: S.optional(S.Number),
  modified: S.optional(S.Number),
  created_at: S.optional(S.Number),
  title: S.NullOr(S.String),
});

export type SessionSummary = S.Schema.Type<typeof SessionSummarySchema>;

export const ListSessionsResponseSchema = S.Struct({
  sessions: S.Array(SessionSummarySchema),
});

export const SessionMessageSchema = S.Struct({
  role: S.String,
  content: S.optional(S.Unknown),
  timestamp: S.optional(S.Number),
  metadata: S.optional(S.NullishOr(S.Unknown)),
  tool_calls: S.optional(S.NullishOr(S.Array(S.Unknown))),
  tool_call_id: S.optional(S.NullishOr(S.String)),
  images: S.optional(S.Array(S.String)),
});

export type SessionMessage = S.Schema.Type<typeof SessionMessageSchema>;

export const TokenUsageSummarySchema = S.Struct({
  prompt_tokens: S.Number,
  completion_tokens: S.Number,
  total_tokens: S.Number,
  cached_tokens: S.optional(S.Number),
  reasoning_tokens: S.optional(S.Number),
});

export const ModelCallDetailSchema = S.Struct({
  model: S.String,
  prompt_tokens: S.Number,
  completion_tokens: S.Number,
  cached_tokens: S.Number,
  reasoning_tokens: S.Number,
  cost_usd: S.optional(S.NullishOr(S.Number)),
  latency_ms: S.Number,
});

export type ModelCallDetail = S.Schema.Type<typeof ModelCallDetailSchema>;

export const GetSessionResponseSchema = S.Struct({
  file: S.String,
  messages: S.Array(SessionMessageSchema),
});

export const CurrentSessionResponseSchema = S.Struct({
  session_id: S.NullOr(S.String),
});

// ── Cron ─────────────────────────────────────────────

export const CronJobSchema = S.Struct({
  id: S.String,
  agent_id: S.String,
  name: S.String,
  schedule: S.String,
  message: S.NullOr(S.String),
  kind: S.optional(S.String),
  depends_on: S.NullOr(S.String),
  last_status: S.NullOr(S.String),
  max_retries: S.NullOr(S.Number),
  retry_delay_secs: S.NullOr(S.Number),
  retry_count: S.optional(S.Number),
});

export type CronJob = S.Schema.Type<typeof CronJobSchema>;

export const CronRunSchema = S.Struct({
  id: S.Union(S.String, S.Number),
  job_id: S.String,
  scheduled_at: S.NullOr(S.Number),
  executed_at: S.NullOr(S.Number),
  completed_at: S.NullOr(S.Number),
  status: S.String,
  output_preview: S.NullOr(S.String),
  error: S.NullOr(S.String),
  duration_ms: S.NullOr(S.Number),
});

export type CronRun = S.Schema.Type<typeof CronRunSchema>;

export const ListCronJobsResponseSchema = S.Struct({
  jobs: S.Array(CronJobSchema),
});

export const ListCronRunsResponseSchema = S.Struct({
  runs: S.Array(CronRunSchema),
});

// ── Skills ───────────────────────────────────────────

export const SkillSchema = S.Struct({
  id: S.String,
  description: S.NullOr(S.String),
  operator_managed: S.NullOr(S.Boolean),
});

export type Skill = S.Schema.Type<typeof SkillSchema>;

export const SkillDetailSchema = S.Struct({
  id: S.String,
  description: S.String,
  operator_managed: S.NullOr(S.Boolean),
  license: S.NullOr(S.String),
  compatibility: S.NullOr(S.String),
  metadata: S.NullOr(S.Record({ key: S.String, value: S.String })),
  manifest: S.String,
  instructions: S.String,
  raw: S.String,
});

export type SkillDetail = S.Schema.Type<typeof SkillDetailSchema>;

export const ListSkillsResponseSchema = S.Struct({
  skills: S.Array(SkillSchema),
});

// ── Slash Commands ───────────────────────────────────

export const SlashCommandSchema = S.Struct({
  name: S.String,
  description: S.String,
  usage: S.String,
});

export const ListSlashCommandsResponseSchema = S.Struct({
  commands: S.Array(SlashCommandSchema),
});

// ── Heartbeat ────────────────────────────────────────

export const HeartbeatAgentSchema = S.Struct({
  agent_id: S.String,
  enabled: S.optional(S.Boolean),
  health: S.optional(S.String),
  last_tick: S.NullOr(S.Number),
  next_tick: S.NullOr(S.Number),
  interval_secs: S.NullOr(S.Number),
  message_preview: S.NullOr(S.String),
});

export type HeartbeatAgent = S.Schema.Type<typeof HeartbeatAgentSchema>;

export const ListHeartbeatResponseSchema = S.Struct({
  agents: S.Array(HeartbeatAgentSchema),
});

// ── Receipts ─────────────────────────────────────────

export const ToolCallRecordSchema = S.Struct({
  tool: S.optional(S.String),
  args_summary: S.optional(S.String),
  success: S.optional(S.Boolean),
  duration_ms: S.optional(S.Number),
  error: S.optional(S.String),
});

export const RawReceiptSchema = S.Struct({
  agent: S.optional(S.String),
  session: S.optional(S.NullishOr(S.String)),
  started_at: S.optional(S.Number),
  duration_ms: S.optional(S.Number),
  user_prompt: S.optional(S.String),
  reply_summary: S.optional(S.String),
  model_calls: S.optional(S.Number),
  model_id: S.optional(S.String),
  estimated_cost_usd: S.optional(S.NullishOr(S.Number)),
  tokens: S.optional(TokenUsageSummarySchema),
  prompt_tokens: S.optional(S.Number),
  completion_tokens: S.optional(S.Number),
  total_tokens: S.optional(S.Number),
  tool_calls: S.optional(S.Array(ToolCallRecordSchema)),
  call_details: S.optional(S.Array(ModelCallDetailSchema)),
});

export type RawReceipt = S.Schema.Type<typeof RawReceiptSchema>;

export const ListReceiptsResponseSchema = S.Struct({
  receipts: S.Array(S.String),
});

export const GetReceiptsResponseSchema = S.Struct({
  file: S.String,
  receipts: S.Array(RawReceiptSchema),
});

// ── Usage ────────────────────────────────────────────

export const UsageBucketSchema = S.Struct({
  day: S.String,
  agent: S.String,
  model: S.String,
  turns: S.Number,
  prompt_tokens: S.Number,
  completion_tokens: S.Number,
  cached_tokens: S.Number,
  reasoning_tokens: S.Number,
  total_tokens: S.Number,
  estimated_cost_usd: S.Number,
});

export const UsageResponseSchema = S.Struct({
  usage: S.Array(UsageBucketSchema),
  total_cost_usd: S.Number,
  total_turns: S.Number,
});

// ── Memory ───────────────────────────────────────────

export const MemoryEntrySchema = S.Struct({
  key: S.String,
  value: S.String,
  tags: S.Array(S.String),
  timestamp: S.String,
  score: S.optional(S.Number),
});

export type MemoryEntry = S.Schema.Type<typeof MemoryEntrySchema>;

export const MemoryListResponseSchema = S.Struct({
  entries: S.Array(MemoryEntrySchema),
});

export const MemoryDeleteResponseSchema = S.Struct({
  deleted: S.Boolean,
  key: S.String,
});

// ── Config ───────────────────────────────────────────

export const SaveConfigResponseSchema = S.Struct({
  saved: S.Boolean,
});

// ── Agent Files ──────────────────────────────────────

export const AgentFileResponseSchema = S.Struct({
  filename: S.String,
  content: S.String,
});

export const SaveAgentFileResponseSchema = S.Struct({
  filename: S.String,
  saved: S.Boolean,
});

// ── Models ───────────────────────────────────────────

export const ModelInfoSchema = S.Struct({
  id: S.String,
  name: S.String,
  vendor: S.NullOr(S.String),
  supported_endpoints: S.Array(S.String),
  is_default: S.Boolean,
});

export type ModelInfo = S.Schema.Type<typeof ModelInfoSchema>;

export const ModelsResponseSchema = S.Struct({
  models: S.NullOr(S.Array(ModelInfoSchema)),
  message: S.optional(S.String),
});

export type ModelsResponse = S.Schema.Type<typeof ModelsResponseSchema>;

export interface DiscoverModelsPayload {
  readonly provider: string;
  readonly model?: string;
  readonly endpoint?: string;
  readonly api_version?: string;
  readonly embedding_deployment?: string;
  readonly api_key?: string;
  readonly auth_mode?: string;
  readonly headers?: Record<string, string>;
  readonly reasoning_effort?: string;
}

export const AzureAuthStatusSchema = S.Struct({
  installed: S.Boolean,
  connected: S.Boolean,
  user_name: S.NullOr(S.String),
  tenant_id: S.NullOr(S.String),
  subscription_id: S.NullOr(S.String),
  subscription_name: S.NullOr(S.String),
  error: S.NullOr(S.String),
  command_hint: S.NullOr(S.String),
});

export type AzureAuthStatus = S.Schema.Type<typeof AzureAuthStatusSchema>;

export const AzureLoginSessionSchema = S.Struct({
  login_id: S.String,
  status: S.String,
  verification_uri: S.NullOr(S.String),
  user_code: S.NullOr(S.String),
  error: S.NullOr(S.String),
});

export type AzureLoginSession = S.Schema.Type<typeof AzureLoginSessionSchema>;

export const ProviderAuthStatusSchema = S.Struct({
  copilot: S.Struct({
    github_connected: S.Boolean,
    session_cached: S.Boolean,
    session_expired: S.Boolean,
  }),
  azure: AzureAuthStatusSchema,
  openai: S.Struct({
    env_available: S.Boolean,
    secrets_hint: S.Array(S.String),
  }),
  openai_chatgpt: S.optional(S.Struct({
    authenticated: S.Boolean,
    needs_refresh: S.Boolean,
  })),
});

export type ProviderAuthStatus = S.Schema.Type<typeof ProviderAuthStatusSchema>;

export const CopilotLoginSessionSchema = S.Struct({
  login_id: S.String,
  status: S.String,
  verification_uri: S.NullOr(S.String),
  user_code: S.NullOr(S.String),
  error: S.NullOr(S.String),
});

export type CopilotLoginSession = S.Schema.Type<typeof CopilotLoginSessionSchema>;

export const ChatGptLoginSessionSchema = S.Struct({
  login_id: S.String,
  status: S.String,
  auth_url: S.optional(S.String),
  error: S.optional(S.NullOr(S.String)),
});

export type ChatGptLoginSession = S.Schema.Type<typeof ChatGptLoginSessionSchema>;

// ── Health / Status ──────────────────────────────────

export const StatusResponseSchema = S.Struct({
  status: S.String,
});

export const HealthResponseSchema = S.Struct({
  status: S.String,
  version: S.String,
  uptime_secs: S.Number,
  agents: S.Number,
});

// ── Misc Responses ───────────────────────────────────

export const CreateAgentResponseSchema = S.Struct({
  id: S.String,
  created: S.Boolean,
});

export const UpdateAgentResponseSchema = S.Struct({
  id: S.String,
  updated: S.Array(S.String),
});

export const DeleteAgentResponseSchema = S.Struct({
  id: S.String,
  deleted: S.Boolean,
});

export const CloneAgentResponseSchema = S.Struct({
  id: S.String,
});

export const UpdateSessionResponseSchema = S.Struct({
  file: S.String,
  saved: S.Boolean,
  count: S.Number,
});

export const DeleteSessionResponseSchema = S.Struct({
  session_id: S.String,
  deleted: S.Boolean,
});

export const CreateCronJobResponseSchema = S.Struct({
  job_id: S.String,
  name: S.String,
  agent_id: S.String,
  schedule: S.String,
  message: S.String,
  created_at: S.Number,
});

export const DeleteCronJobResponseSchema = S.Struct({
  deleted: S.Boolean,
  job_id: S.String,
});

export const TriggerCronJobResponseSchema = S.Struct({
  triggered: S.Boolean,
  job_id: S.String,
  job_name: S.String,
  agent_id: S.String,
});

export const DeleteSkillResponseSchema = S.Struct({
  status: S.String,
  name: S.String,
});

export const CreateSkillResponseSchema = S.Struct({
  id: S.String,
  created: S.Boolean,
});

export const UpdateSkillResponseSchema = S.Struct({
  id: S.String,
  updated: S.Boolean,
});

export const EnhancePromptResponseSchema = S.Struct({
  original: S.String,
  enhanced: S.String,
});

// ── Request Payloads ─────────────────────────────────

export interface CreateAgentPayload {
  readonly id: string;
  readonly model?: string;
  readonly heartbeat_secs?: number;
  readonly soul?: string;
  readonly tools?: string;
  readonly heartbeat?: string;
}

export interface UpdateAgentPayload {
  readonly model?: string;
  readonly heartbeat_secs?: number | null;
  readonly max_tool_iterations?: number;
  readonly max_turns?: number;
  readonly compact_keep_recent_turns?: number;
  readonly history_messages?: number;
  readonly reasoning_effort?: string;
  readonly enabled_skills?: string[] | null;
  readonly soul?: string;
  readonly tools?: string;
  readonly heartbeat?: string;
}

export interface CreateCronJobPayload {
  readonly agent_id: string;
  readonly name: string;
  readonly schedule: string;
  readonly message: string;
  readonly one_shot?: boolean;
  readonly depends_on?: string;
  readonly max_retries?: number;
  readonly retry_delay_secs?: number;
}

export interface UpdateCronJobPayload {
  readonly schedule?: string;
  readonly message?: string;
  readonly one_shot?: boolean;
  readonly depends_on?: string;
  readonly max_retries?: number;
  readonly retry_delay_secs?: number;
}

export interface CreateSkillPayload {
  readonly name: string;
  readonly description: string;
  readonly instructions: string;
}

export interface UpdateSkillPayload {
  readonly description?: string;
  readonly instructions?: string;
}
