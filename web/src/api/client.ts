import { z } from "zod";

import { request } from "@/lib/http";

// ── Zod schemas ──────────────────────────────────────

const agentSchema = z.object({
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

const agentDetailSchema = agentSchema.extend({
  soul: z.string().nullable().optional(),
  tools: z.string().nullable().optional(),
  heartbeat: z.string().nullable().optional(),
  session_count: z.number().optional(),
});

const listAgentsResponseSchema = z.object({
  agents: z.array(agentSchema),
});

const sessionSummarySchema = z.object({
  file: z.string(),
  session_id: z.string(),
  size: z.number().optional(),
  modified: z.number().optional(),
  created_at: z.number().optional(),
  title: z.string().nullable().optional(),
});

const listSessionsResponseSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});

const sessionMessageSchema = z.object({
  role: z.string().optional(),
  content: z.unknown().optional(),
  timestamp: z.number().optional(),
});

const getSessionResponseSchema = z.object({
  file: z.string(),
  messages: z.array(sessionMessageSchema),
});

const currentSessionResponseSchema = z.object({
  session_id: z.string().nullable(),
});

const slashCommandSchema = z.object({
  name: z.string(),
  description: z.string(),
  usage: z.string(),
});

const cronJobSchema = z.object({
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

const cronRunSchema = z.object({
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

const skillSchema = z.object({
  id: z.string(),
  description: z.string().nullable().optional(),
  operator_managed: z.boolean().nullable().optional(),
});

const heartbeatAgentSchema = z.object({
  agent_id: z.string(),
  enabled: z.boolean().optional(),
  health: z.string().optional(),
  last_tick: z.number().nullable().optional(),
  next_tick: z.number().nullable().optional(),
  interval_secs: z.number().nullable().optional(),
  message_preview: z.string().nullable().optional(),
});

// ── Exported types ───────────────────────────────────

export type AgentListItem = z.infer<typeof agentSchema>;
export type AgentDetail = z.infer<typeof agentDetailSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
export type SessionMessage = z.infer<typeof sessionMessageSchema>;
export type CronJob = z.infer<typeof cronJobSchema>;
export type CronRun = z.infer<typeof cronRunSchema>;
export type SlashCommand = z.infer<typeof slashCommandSchema>;
export type Skill = z.infer<typeof skillSchema>;
export type HeartbeatAgent = z.infer<typeof heartbeatAgentSchema>;

// ── Request payload types ────────────────────────────

export interface CreateAgentPayload {
  id: string;
  model?: string;
  heartbeat_secs?: number;
  soul?: string;
  tools?: string;
  heartbeat?: string;
}

export interface UpdateAgentPayload {
  model?: string;
  heartbeat_secs?: number | null;
  max_tool_iterations?: number;
  max_turns?: number;
  compact_keep_recent_turns?: number;
  history_messages?: number;
  reasoning_effort?: string;
  enabled_skills?: string[] | null;
  soul?: string;
  tools?: string;
  heartbeat?: string;
}

export interface CreateCronJobPayload {
  agent_id: string;
  name: string;
  schedule: string;
  message: string;
  one_shot?: boolean;
  depends_on?: string;
  max_retries?: number;
  retry_delay_secs?: number;
}

export interface UpdateCronJobPayload {
  schedule?: string;
  message?: string;
  one_shot?: boolean;
  depends_on?: string;
  max_retries?: number;
  retry_delay_secs?: number;
}

// ── Response types ───────────────────────────────────

export interface StatusResponse {
  status: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  uptime_secs: number;
  agents: number;
}

export interface CreateAgentResponse {
  id: string;
  created: boolean;
}

export interface UpdateAgentResponse {
  id: string;
  updated: string[];
}

export interface DeleteAgentResponse {
  id: string;
  deleted: boolean;
}

export interface SaveConfigResponse {
  saved: boolean;
}

export interface AgentFileResponse {
  filename: string;
  content: string;
}

export interface SaveAgentFileResponse {
  filename: string;
  saved: boolean;
}

export interface UpdateSessionResponse {
  file: string;
  saved: boolean;
  count: number;
}

export interface DeleteSessionResponse {
  file: string;
  deleted: boolean;
}

export interface CreateCronJobResponse {
  job_id: string;
  name: string;
  agent_id: string;
  schedule: string;
  message: string;
  created_at: number;
}

export interface DeleteCronJobResponse {
  deleted: boolean;
  job_id: string;
}

export interface ListReceiptsResponse {
  receipts: string[];
}

export interface RawReceipt {
  started_at?: number;
  duration_ms?: number;
  user_prompt?: string;
  reply_summary?: string;
  model_calls?: number;
  tokens?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  tool_calls?: Array<{ tool?: string; args_summary?: string; success?: boolean; duration_ms?: number; error?: string }>;
}

export interface GetReceiptsResponse {
  file: string;
  receipts: RawReceipt[];
}

export interface EnhancePromptResponse {
  original: string;
  enhanced: string;
}

export interface UsageBucket {
  day: string;
  agent: string;
  model: string;
  turns: number;
  prompt_tokens: number;
  completion_tokens: number;
  cached_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface UsageResponse {
  usage: UsageBucket[];
  total_cost_usd: number;
  total_turns: number;
}

export interface MemoryEntry {
  key: string;
  value: string;
  tags: string[];
  timestamp: string;
  score?: number;
}

export interface MemoryListResponse {
  entries: MemoryEntry[];
}

export interface MemoryDeleteResponse {
  deleted: boolean;
  key: string;
}

// ── API functions ────────────────────────────────────

export async function getStatus(): Promise<StatusResponse> {
  return request<StatusResponse>("/api/status");
}

export async function getHealth(): Promise<HealthResponse> {
  return request<HealthResponse>("/api/health");
}

export async function listAgents() {
  const response = await request<unknown>("/api/agents");
  return listAgentsResponseSchema.parse(response);
}

export async function getAgent(agentId: string): Promise<AgentDetail> {
  const response = await request<unknown>(`/api/agents/${encodeURIComponent(agentId)}`);
  return agentDetailSchema.parse(response);
}

export async function createAgent(payload: CreateAgentPayload): Promise<CreateAgentResponse> {
  return request<CreateAgentResponse>("/api/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateAgent(
  agentId: string,
  payload: UpdateAgentPayload,
): Promise<UpdateAgentResponse> {
  return request<UpdateAgentResponse>(
    `/api/agents/${encodeURIComponent(agentId)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAgent(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/api/agents/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function cloneAgent(id: string, newId: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/api/agents/${encodeURIComponent(id)}/clone`, {
    method: "POST",
    body: JSON.stringify({ new_id: newId }),
  });
}

export async function getConfig(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/config");
}

export async function getConfigSchema(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>("/api/config/schema");
}

export async function saveConfig(config: Record<string, unknown>): Promise<SaveConfigResponse> {
  return request<SaveConfigResponse>("/api/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export async function listCronJobs() {
  const response = await request<unknown>("/api/cron/jobs");
  return z.object({ jobs: z.array(cronJobSchema) }).parse(response);
}

export async function listCronJobsByAgent(agentId: string) {
  const response = await request<unknown>(`/api/cron/jobs/${encodeURIComponent(agentId)}`);
  return z.object({ jobs: z.array(cronJobSchema) }).parse(response);
}

export async function createCronJob(payload: CreateCronJobPayload): Promise<CreateCronJobResponse> {
  return request<CreateCronJobResponse>("/api/cron/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateCronJob(
  jobId: string,
  payload: UpdateCronJobPayload,
): Promise<CronJob> {
  return request<CronJob>(`/api/cron/jobs/${encodeURIComponent(jobId)}/update`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteCronJob(jobId: string): Promise<DeleteCronJobResponse> {
  return request<DeleteCronJobResponse>(
    `/api/cron/jobs/${encodeURIComponent(jobId)}/delete`,
    { method: "DELETE" },
  );
}

export async function getCronJobRuns(jobId: string) {
  const response = await request<unknown>(`/api/cron/jobs/${encodeURIComponent(jobId)}/runs`);
  return z.object({ runs: z.array(cronRunSchema) }).parse(response);
}

export async function triggerCronJob(jobId: string) {
  return request<{ triggered: boolean; job_id: string; job_name: string; agent_id: string }>(
    `/api/cron/jobs/${encodeURIComponent(jobId)}/trigger`,
    { method: "POST" },
  );
}

export async function listSessions(agentId: string) {
  const response = await request<unknown>(`/api/agents/${encodeURIComponent(agentId)}/sessions`);
  return listSessionsResponseSchema.parse(response);
}

export async function getCurrentSession(agentId: string) {
  const response = await request<unknown>(`/api/agents/${encodeURIComponent(agentId)}/session/current`);
  return currentSessionResponseSchema.parse(response);
}

export async function getSession(agentId: string, sessionId: string) {
  const response = await request<unknown>(`/api/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`);
  return getSessionResponseSchema.parse(response);
}

export async function updateSession(
  agentId: string,
  sessionId: string,
  messages: SessionMessage[],
): Promise<UpdateSessionResponse> {
  return request<UpdateSessionResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ messages }),
    },
  );
}

export async function deleteSession(agentId: string, sessionId: string): Promise<DeleteSessionResponse> {
  return request<DeleteSessionResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(sessionId)}`,
    { method: "DELETE" },
  );
}

export async function getSkills() {
  const response = await request<unknown>("/api/skills");
  return z.object({ skills: z.array(skillSchema) }).parse(response);
}

export async function deleteSkill(name: string) {
  return request<{ status: string; name: string }>(
    `/api/skills/${encodeURIComponent(name)}`,
    { method: "DELETE" },
  );
}

export async function enhancePrompt(prompt: string): Promise<EnhancePromptResponse> {
  return request<EnhancePromptResponse>("/api/ai/enhance-prompt", {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export async function getUsage(opts?: { agent?: string; model?: string; from?: string; to?: string }): Promise<UsageResponse> {
  const params = new URLSearchParams();
  if (opts?.agent) params.set("agent", opts.agent);
  if (opts?.model) params.set("model", opts.model);
  if (opts?.from) params.set("from", opts.from);
  if (opts?.to) params.set("to", opts.to);
  const qs = params.toString();
  return request<UsageResponse>(`/api/usage${qs ? `?${qs}` : ""}`);
}

export async function listMemory(
  agentId: string,
  opts?: { q?: string; tag?: string; limit?: number; mode?: string },
): Promise<MemoryListResponse> {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.tag) params.set("tag", opts.tag);
  if (opts?.limit) params.set("limit", String(opts.limit));
  if (opts?.mode) params.set("mode", opts.mode);
  const qs = params.toString();
  return request<MemoryListResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/memory${qs ? `?${qs}` : ""}`,
  );
}

export async function deleteMemory(agentId: string, key: string): Promise<MemoryDeleteResponse> {
  return request<MemoryDeleteResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/memory/${encodeURIComponent(key)}`,
    { method: "DELETE" },
  );
}

export async function getAgentFile(agentId: string, filename: string): Promise<AgentFileResponse> {
  return request<AgentFileResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(filename)}`,
  );
}

export async function saveAgentFile(
  agentId: string,
  filename: string,
  content: string,
): Promise<SaveAgentFileResponse> {
  return request<SaveAgentFileResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/files/${encodeURIComponent(filename)}`,
    {
      method: "PUT",
      body: JSON.stringify({ content }),
    },
  );
}

export async function getHeartbeatStatus() {
  const response = await request<unknown>("/api/heartbeat/status");
  return z.object({ agents: z.array(heartbeatAgentSchema) }).parse(response);
}

export async function getHeartbeatStatusOne(agentId: string): Promise<HeartbeatAgent> {
  const response = await request<unknown>(`/api/heartbeat/status/${encodeURIComponent(agentId)}`);
  return heartbeatAgentSchema.parse(response);
}

export async function listReceipts(agentId: string): Promise<ListReceiptsResponse> {
  return request<ListReceiptsResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/receipts`,
  );
}

export async function getReceipts(agentId: string, sessionId: string): Promise<GetReceiptsResponse> {
  return request<GetReceiptsResponse>(
    `/api/agents/${encodeURIComponent(agentId)}/receipts/${encodeURIComponent(sessionId)}`,
  );
}

export async function listSlashCommands(): Promise<SlashCommand[]> {
  const res = await request<unknown>("/api/slash/commands");
  const parsed = z.object({ commands: z.array(slashCommandSchema) }).parse(res);
  return parsed.commands;
}

export async function getDebugModelRequest(requestId: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(
    `/api/debug/model-requests/${encodeURIComponent(requestId)}`,
  );
}

export async function listDebugModelRequests(): Promise<Record<string, unknown>[]> {
  const res = await request<{ requests: Record<string, unknown>[] }>(`/api/debug/model-requests`);
  return res.requests ?? [];
}

// ── Model discovery ──────────────────────────────────

const modelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  vendor: z.string().nullable().optional(),
  supported_endpoints: z.array(z.string()),
  is_default: z.boolean(),
});

const modelsResponseSchema = z.object({
  models: z.array(modelInfoSchema).nullable(),
  message: z.string().optional(),
});

export type ModelInfo = z.infer<typeof modelInfoSchema>;

export async function listProviderModels(configModelId: string): Promise<ModelInfo[] | null> {
  const res = await request<z.infer<typeof modelsResponseSchema>>(
    `/api/models/${encodeURIComponent(configModelId)}`,
  );
  const parsed = modelsResponseSchema.parse(res);
  return parsed.models;
}

// ── Query keys ───────────────────────────────────────

export const queryKeys = {
  status: ["status"] as const,
  health: ["health"] as const,
  agents: ["agents"] as const,
  config: ["config"] as const,
  configSchema: ["config-schema"] as const,
  cronJobs: ["cron-jobs"] as const,
  cronJobsByAgent: (agentId: string) => ["cron-jobs", agentId] as const,
  cronJobRuns: (jobId: string) => ["cron-job-runs", jobId] as const,
  sessions: (agentId: string) => ["sessions", agentId] as const,
  currentSession: (agentId: string) => ["current-session", agentId] as const,
  sessionMessages: (agentId: string, sessionId: string) => ["session", agentId, sessionId] as const,
  agent: (agentId: string) => ["agent", agentId] as const,
  agentFile: (agentId: string, filename: string) => ["agent-file", agentId, filename] as const,
  skills: ["skills"] as const,
  heartbeat: ["heartbeat"] as const,
  heartbeatAgent: (agentId: string) => ["heartbeat", agentId] as const,
  receipts: (agentId: string) => ["receipts", agentId] as const,
  receiptSession: (agentId: string, sessionId: string) => ["receipts", agentId, sessionId] as const,
  slashCommands: ["slash-commands"] as const,
  memory: (agentId: string) => ["memory", agentId] as const,
  usage: (opts?: { agent?: string }) => opts?.agent ? ["usage", opts.agent] as const : ["usage"] as const,
  providerModels: (configModelId: string) => ["provider-models", configModelId] as const,
};
