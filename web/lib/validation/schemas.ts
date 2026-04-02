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
  last_heartbeat_at: z.string().optional(),
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
  api: z.string().optional(),
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

// Backend cron job schema with all optional fields
export const BackendCronJobSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  schedule: z.string(),
  message: z.string().optional(),
  kind: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  max_retries: z.number().optional(),
  retry_delay_secs: z.number().optional(),
  retry_count: z.number().optional(),
  last_status: z.string().nullable().optional(),
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
  description: z.string().optional(),
  input_price: z.number().optional(),
  output_price: z.number().optional(),
  context_window: z.number().optional(),
  max_output: z.number().optional(),
  tool_call: z.boolean().optional(),
  reasoning: z.boolean().optional(),
  attachment: z.boolean().optional(),
  family: z.string().optional(),
  cache_read_price: z.number().optional(),
  cache_write_price: z.number().optional(),
  modalities: z.array(z.string()).optional(),
});

export const ModelsListResponseSchema = z.object({
  models: z.array(ModelInfoSchema).optional(),
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
// Export inferred types
// ============================================================================

export type Agent = z.infer<typeof AgentSchema>;
export type RawAgent = z.infer<typeof RawAgentSchema>;
export type Session = z.infer<typeof SessionSchema>;
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
export type ModelInfo = z.infer<typeof ModelInfoSchema>;
export type ChatGptAuthSession = z.infer<typeof ChatGptAuthSessionSchema>;
export type ChatGptAuthStatus = z.infer<typeof ChatGptAuthStatusSchema>;
export type ChatGptPollStatus = z.infer<typeof ChatGptPollStatusSchema>;
export type CopilotAuthSession = z.infer<typeof CopilotAuthSessionSchema>;
export type ApiKeyAuthResponse = z.infer<typeof ApiKeyAuthResponseSchema>;
export type CopilotPollResponse = z.infer<typeof CopilotPollResponseSchema>;
export type TestMessageResponse = z.infer<typeof TestMessageResponseSchema>;
