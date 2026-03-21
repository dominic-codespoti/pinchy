import { z } from "zod";

// ── Agent ────────────────────────────────────────────

export const agentSchema = z.object({
  id: z.string(),
  workspace: z.string().optional(),
  has_soul: z.boolean().optional(),
  has_tools: z.boolean().optional(),
  has_heartbeat: z.boolean().optional(),
  model: z.string().nullable().optional(),
  heartbeat_secs: z.number().nullable().optional(),
  max_tool_iterations: z.number().nullable().optional(),
  enabled_skills: z.array(z.string()).nullable().optional(),
  cron_jobs_count: z.number().optional(),
  cron_job_count: z.number().optional(),
  history_messages: z.number().nullable().optional(),
  max_turns: z.number().nullable().optional(),
  compact_keep_recent_turns: z.number().nullable().optional(),
  timezone: z.string().nullable().optional(),
  reasoning_effort: z.string().nullable().optional(),
});

export type AgentListItem = z.infer<typeof agentSchema>;

export const agentDetailSchema = agentSchema.extend({
  soul: z.string().nullable().optional(),
  tools: z.string().nullable().optional(),
  heartbeat: z.string().nullable().optional(),
  session_count: z.number().optional(),
});

export type AgentDetail = z.infer<typeof agentDetailSchema>;

export const listAgentsResponseSchema = z.object({
  agents: z.array(agentSchema),
});

// ── Session ──────────────────────────────────────────

export const sessionSummarySchema = z.object({
  file: z.string(),
  session_id: z.string(),
  size: z.number().optional(),
  modified: z.number().optional(),
  created_at: z.number().optional(),
  title: z.string().nullable().optional(),
});

export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const listSessionsResponseSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});

export const sessionMessageSchema = z.object({
  role: z.string().optional(),
  content: z.unknown().optional(),
  timestamp: z.number().optional(),
});

export type SessionMessage = z.infer<typeof sessionMessageSchema>;

export const getSessionResponseSchema = z.object({
  file: z.string(),
  messages: z.array(sessionMessageSchema),
});

export const currentSessionResponseSchema = z.object({
  session_id: z.string().nullable(),
});

// ── Cron ─────────────────────────────────────────────

export const cronJobSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  name: z.string(),
  schedule: z.string(),
  message: z.string().nullable().optional(),
  kind: z.string().optional(),
  depends_on: z.string().nullable().optional(),
  last_status: z.string().nullable().optional(),
  max_retries: z.number().nullable().optional(),
  retry_delay_secs: z.number().nullable().optional(),
  retry_count: z.number().optional(),
});

export type CronJob = z.infer<typeof cronJobSchema>;

export const cronRunSchema = z.object({
  id: z.union([z.string(), z.number()]),
  job_id: z.string(),
  scheduled_at: z.number().nullable().optional(),
  executed_at: z.number().nullable().optional(),
  completed_at: z.number().nullable().optional(),
  status: z.string(),
  output_preview: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
  duration_ms: z.number().nullable().optional(),
});

export type CronRun = z.infer<typeof cronRunSchema>;

export const listCronJobsResponseSchema = z.object({
  jobs: z.array(cronJobSchema),
});

export const listCronRunsResponseSchema = z.object({
  runs: z.array(cronRunSchema),
});

// ── Skills ───────────────────────────────────────────

export const skillSchema = z.object({
  id: z.string(),
  description: z.string().nullable().optional(),
  operator_managed: z.boolean().nullable().optional(),
});

export type Skill = z.infer<typeof skillSchema>;

export const listSkillsResponseSchema = z.object({
  skills: z.array(skillSchema),
});

// ── Slash Commands ───────────────────────────────────

export const slashCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  usage: z.string(),
});

export type SlashCommand = z.infer<typeof slashCommandSchema>;

export const listSlashCommandsResponseSchema = z.object({
  commands: z.array(slashCommandSchema),
});

// ── Heartbeat ────────────────────────────────────────

export const heartbeatAgentSchema = z.object({
  agent_id: z.string(),
  enabled: z.boolean().optional(),
  health: z.string().optional(),
  last_tick: z.number().nullable().optional(),
  next_tick: z.number().nullable().optional(),
  interval_secs: z.number().nullable().optional(),
  message_preview: z.string().nullable().optional(),
});

export type HeartbeatAgent = z.infer<typeof heartbeatAgentSchema>;

export const listHeartbeatResponseSchema = z.object({
  agents: z.array(heartbeatAgentSchema),
});

// ── Receipts ─────────────────────────────────────────

export const toolCallRecordSchema = z.object({
  tool: z.string().optional(),
  args_summary: z.string().optional(),
  success: z.boolean().optional(),
  duration_ms: z.number().optional(),
  error: z.string().optional(),
});

export const rawReceiptSchema = z.object({
  started_at: z.number().optional(),
  duration_ms: z.number().optional(),
  user_prompt: z.string().optional(),
  reply_summary: z.string().optional(),
  model_calls: z.number().optional(),
  tokens: z
    .object({
      prompt_tokens: z.number().optional(),
      completion_tokens: z.number().optional(),
      total_tokens: z.number().optional(),
    })
    .optional(),
  prompt_tokens: z.number().optional(),
  completion_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
  tool_calls: z.array(toolCallRecordSchema).optional(),
});

export type RawReceipt = z.infer<typeof rawReceiptSchema>;

export const listReceiptsResponseSchema = z.object({
  receipts: z.array(z.string()),
});

export const getReceiptsResponseSchema = z.object({
  file: z.string(),
  receipts: z.array(rawReceiptSchema),
});

// ── Usage ────────────────────────────────────────────

export const usageBucketSchema = z.object({
  day: z.string(),
  agent: z.string(),
  model: z.string(),
  turns: z.number(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cached_tokens: z.number(),
  reasoning_tokens: z.number(),
  total_tokens: z.number(),
  estimated_cost_usd: z.number(),
});

export type UsageBucket = z.infer<typeof usageBucketSchema>;

export const usageResponseSchema = z.object({
  usage: z.array(usageBucketSchema),
  total_cost_usd: z.number(),
  total_turns: z.number(),
});

export type UsageResponse = z.infer<typeof usageResponseSchema>;

// ── Memory ───────────────────────────────────────────

export const memoryEntrySchema = z.object({
  key: z.string(),
  value: z.string(),
  tags: z.array(z.string()),
  timestamp: z.string(),
  score: z.number().optional(),
});

export type MemoryEntry = z.infer<typeof memoryEntrySchema>;

export const memoryListResponseSchema = z.object({
  entries: z.array(memoryEntrySchema),
});

export const memoryDeleteResponseSchema = z.object({
  deleted: z.boolean(),
  key: z.string(),
});

// ── Config ───────────────────────────────────────────

export const saveConfigResponseSchema = z.object({
  saved: z.boolean(),
});

// ── Agent Files ──────────────────────────────────────

export const agentFileResponseSchema = z.object({
  filename: z.string(),
  content: z.string(),
});

export const saveAgentFileResponseSchema = z.object({
  filename: z.string(),
  saved: z.boolean(),
});

// ── Models ───────────────────────────────────────────

export const modelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string().nullable().optional(),
  supported_endpoints: z.array(z.string()),
  is_default: z.boolean(),
});

export type ModelInfo = z.infer<typeof modelInfoSchema>;

export const modelsResponseSchema = z.object({
  models: z.array(modelInfoSchema).nullable(),
  message: z.string().optional(),
});

// ── Health / Status ──────────────────────────────────

export const statusResponseSchema = z.object({
  status: z.string(),
});

export type StatusResponse = z.infer<typeof statusResponseSchema>;

export const healthResponseSchema = z.object({
  status: z.string(),
  version: z.string(),
  uptime_secs: z.number(),
  agents: z.number(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ── Misc Responses ───────────────────────────────────

export const createAgentResponseSchema = z.object({
  id: z.string(),
  created: z.boolean(),
});

export const updateAgentResponseSchema = z.object({
  id: z.string(),
  updated: z.array(z.string()),
});

export const deleteAgentResponseSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
});

export const cloneAgentResponseSchema = z.object({
  id: z.string(),
});

export const updateSessionResponseSchema = z.object({
  file: z.string(),
  saved: z.boolean(),
  count: z.number(),
});

export const deleteSessionResponseSchema = z.object({
  session_id: z.string(),
  deleted: z.boolean(),
});

export const createCronJobResponseSchema = z.object({
  job_id: z.string(),
  name: z.string(),
  agent_id: z.string(),
  schedule: z.string(),
  message: z.string(),
  created_at: z.number(),
});

export const deleteCronJobResponseSchema = z.object({
  deleted: z.boolean(),
  job_id: z.string(),
});

export const triggerCronJobResponseSchema = z.object({
  triggered: z.boolean(),
  job_id: z.string(),
  job_name: z.string(),
  agent_id: z.string(),
});

export const deleteSkillResponseSchema = z.object({
  status: z.string(),
  name: z.string(),
});

export const enhancePromptResponseSchema = z.object({
  original: z.string(),
  enhanced: z.string(),
});

export type EnhancePromptResponse = z.infer<typeof enhancePromptResponseSchema>;

// ── Request Payloads ─────────────────────────────────

export const createAgentPayloadSchema = z.object({
  id: z.string(),
  model: z.string().optional(),
  heartbeat_secs: z.number().optional(),
  soul: z.string().optional(),
  tools: z.string().optional(),
  heartbeat: z.string().optional(),
});

export type CreateAgentPayload = z.infer<typeof createAgentPayloadSchema>;

export const updateAgentPayloadSchema = z.object({
  model: z.string().optional(),
  heartbeat_secs: z.number().nullable().optional(),
  max_tool_iterations: z.number().optional(),
  max_turns: z.number().optional(),
  compact_keep_recent_turns: z.number().optional(),
  history_messages: z.number().optional(),
  reasoning_effort: z.string().optional(),
  enabled_skills: z.array(z.string()).nullable().optional(),
  soul: z.string().optional(),
  tools: z.string().optional(),
  heartbeat: z.string().optional(),
});

export type UpdateAgentPayload = z.infer<typeof updateAgentPayloadSchema>;

export const createCronJobPayloadSchema = z.object({
  agent_id: z.string(),
  name: z.string(),
  schedule: z.string(),
  message: z.string(),
  one_shot: z.boolean().optional(),
  depends_on: z.string().optional(),
  max_retries: z.number().optional(),
  retry_delay_secs: z.number().optional(),
});

export type CreateCronJobPayload = z.infer<typeof createCronJobPayloadSchema>;

export const updateCronJobPayloadSchema = z.object({
  schedule: z.string().optional(),
  message: z.string().optional(),
  one_shot: z.boolean().optional(),
  depends_on: z.string().optional(),
  max_retries: z.number().optional(),
  retry_delay_secs: z.number().optional(),
});

export type UpdateCronJobPayload = z.infer<typeof updateCronJobPayloadSchema>;

// ── Debug ────────────────────────────────────────────

export const debugModelRequestsResponseSchema = z.object({
  requests: z.array(z.record(z.string(), z.unknown())),
});
