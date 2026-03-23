import { Effect } from "effect";
import { typedRequest, rawRequest, type HttpError, type ParseError } from "@/api/http";
import {
  ListAgentsResponseSchema,
  AgentDetailSchema,
  ListSessionsResponseSchema,
  GetSessionResponseSchema,
  CurrentSessionResponseSchema,
  GetReceiptsResponseSchema,
  ListCronJobsResponseSchema,
  ListCronRunsResponseSchema,
  ListSkillsResponseSchema,
  SkillDetailSchema,
  ListHeartbeatResponseSchema,
  UsageResponseSchema,
  MemoryListResponseSchema,
  MemoryDeleteResponseSchema,
  AgentFileResponseSchema,
  SaveAgentFileResponseSchema,
  SaveConfigResponseSchema,
  StatusResponseSchema,
  HealthResponseSchema,
  CreateAgentResponseSchema,
  UpdateAgentResponseSchema,
  DeleteAgentResponseSchema,
  CloneAgentResponseSchema,
  DeleteSessionResponseSchema,
  CreateCronJobResponseSchema,
  CronJobSchema,
  DeleteCronJobResponseSchema,
  TriggerCronJobResponseSchema,
  DeleteSkillResponseSchema,
  CreateSkillResponseSchema,
  UpdateSkillResponseSchema,
  ModelsResponseSchema,
  ProviderAuthStatusSchema,
  CopilotLoginSessionSchema,
  ChatGptLoginSessionSchema,
  type CreateAgentPayload,
  type UpdateAgentPayload,
  type CreateCronJobPayload,
  type CreateSkillPayload,
  type UpdateCronJobPayload,
  type UpdateSkillPayload,
} from "@/api/schemas";

// ── Query Keys ───────────────────────────────────────

export const qk = {
  status: ["status"] as const,
  health: ["health"] as const,
  agents: ["agents"] as const,
  agent: (id: string) => ["agent", id] as const,
  agentFile: (id: string, file: string) => ["agent-file", id, file] as const,
  config: ["config"] as const,
  configSchema: ["config-schema"] as const,
  providerAuthStatus: ["provider-auth-status"] as const,
  discoveredModels: (configModelId: string) =>
    ["discovered-models", configModelId] as const,
  cronJobs: ["cron-jobs"] as const,
  cronJobsByAgent: (id: string) => ["cron-jobs", id] as const,
  cronJobRuns: (jobId: string) => ["cron-job-runs", jobId] as const,
  sessions: (agentId: string) => ["sessions", agentId] as const,
  currentSession: (agentId: string) => ["current-session", agentId] as const,
  sessionMessages: (agentId: string, sessionId: string) =>
    ["session", agentId, sessionId] as const,
  receiptsSession: (agentId: string, sessionId: string) =>
    ["receipts", agentId, sessionId] as const,
  skills: ["skills"] as const,
  skillDetail: (name: string) => ["skill", name] as const,
  heartbeat: ["heartbeat"] as const,
  heartbeatAgent: (id: string) => ["heartbeat", id] as const,
  receipts: (agentId: string) => ["receipts", agentId] as const,
  memory: (agentId: string, q?: string, tag?: string) =>
    ["memory", agentId, q ?? "", tag ?? ""] as const,
  usage: (agent?: string) =>
    agent != null ? (["usage", agent] as const) : (["usage"] as const),
} as const;

// ── Helpers ──────────────────────────────────────────

function enc(s: string): string {
  return encodeURIComponent(s);
}

function buildQs(
  params: Readonly<Record<string, string | number | undefined>>,
): string {
  const entries = Object.entries(params).filter(
    (pair): pair is [string, string | number] => pair[1] != null,
  );
  if (entries.length === 0) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of entries) sp.set(k, String(v));
  return `?${sp.toString()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// ── Query Functions ──────────────────────────────────
//
// Each returns an Effect that resolves to the parsed response.
// No hooks, no React — just data fetching as Effect pipelines.

export function fetchStatus() {
  return typedRequest(StatusResponseSchema, "/api/status");
}

export function fetchHealth() {
  return typedRequest(HealthResponseSchema, "/api/health");
}

export function fetchAgents() {
  return typedRequest(ListAgentsResponseSchema, "/api/agents");
}

export function fetchAgent(agentId: string) {
  return typedRequest(AgentDetailSchema, `/api/agents/${enc(agentId)}`);
}

export function fetchSessions(agentId: string) {
  return typedRequest(
    ListSessionsResponseSchema,
    `/api/agents/${enc(agentId)}/sessions`,
  );
}

export function fetchCurrentSession(agentId: string) {
  return typedRequest(
    CurrentSessionResponseSchema,
    `/api/agents/${enc(agentId)}/session/current`,
  );
}

export function fetchSessionMessages(agentId: string, sessionId: string) {
  return typedRequest(
    GetSessionResponseSchema,
    `/api/agents/${enc(agentId)}/sessions/${enc(sessionId)}`,
  );
}

export function fetchSessionReceipts(agentId: string, sessionId: string) {
  return typedRequest(
    GetReceiptsResponseSchema,
    `/api/agents/${enc(agentId)}/receipts/${enc(sessionId)}`,
  );
}

export function fetchCronJobs() {
  return typedRequest(ListCronJobsResponseSchema, "/api/cron/jobs");
}

export function fetchCronJobRuns(jobId: string) {
  return typedRequest(
    ListCronRunsResponseSchema,
    `/api/cron/jobs/${enc(jobId)}/runs`,
  );
}

export function fetchSkills() {
  return typedRequest(ListSkillsResponseSchema, "/api/skills");
}

export function fetchSkill(name: string) {
  return typedRequest(SkillDetailSchema, `/api/skills/${enc(name)}`);
}

export function fetchHeartbeat() {
  return typedRequest(ListHeartbeatResponseSchema, "/api/heartbeat/status");
}

export function fetchUsage(opts?: {
  readonly agent?: string;
  readonly model?: string;
  readonly from?: string;
  readonly to?: string;
}) {
  return typedRequest(
    UsageResponseSchema,
    `/api/usage${buildQs({
      agent: opts?.agent,
      model: opts?.model,
      from: opts?.from,
      to: opts?.to,
    })}`,
  );
}

export function fetchMemory(
  agentId: string,
  opts?: {
    readonly q?: string;
    readonly tag?: string;
    readonly limit?: number;
    readonly mode?: string;
  },
) {
  return typedRequest(
    MemoryListResponseSchema,
    `/api/agents/${enc(agentId)}/memory${buildQs({
      q: opts?.q,
      tag: opts?.tag,
      limit: opts?.limit,
      mode: opts?.mode,
    })}`,
  );
}

export function fetchAgentFile(agentId: string, filename: string) {
  return typedRequest(
    AgentFileResponseSchema,
    `/api/agents/${enc(agentId)}/files/${enc(filename)}`,
  );
}

export function fetchConfig(): Effect.Effect<Record<string, unknown>, HttpError> {
  return Effect.map(rawRequest("/api/config"), (data) =>
    isRecord(data) ? data : {},
  );
}

export function fetchConfigSchema(): Effect.Effect<Record<string, unknown>, HttpError> {
  return Effect.map(rawRequest("/api/config/schema"), (data) =>
    isRecord(data) ? data : {},
  );
}

export function fetchProviderAuthStatus() {
  return typedRequest(ProviderAuthStatusSchema, "/api/auth/providers");
}

export function fetchDiscoveredModels(configModelId: string) {
  return typedRequest(ModelsResponseSchema, `/api/models/${enc(configModelId)}`);
}

// ── Mutation Functions ───────────────────────────────
//
// Each returns an Effect. Cache invalidation is handled separately
// by ws-sync.ts and the createMutation wrapper in use-api.ts.

export function createAgent(payload: CreateAgentPayload) {
  return typedRequest(CreateAgentResponseSchema, "/api/agents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgent(agentId: string, payload: UpdateAgentPayload) {
  return typedRequest(
    UpdateAgentResponseSchema,
    `/api/agents/${enc(agentId)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function deleteAgent(id: string) {
  return typedRequest(DeleteAgentResponseSchema, `/api/agents/${enc(id)}`, {
    method: "DELETE",
  });
}

export function cloneAgent(id: string, newId: string) {
  return typedRequest(
    CloneAgentResponseSchema,
    `/api/agents/${enc(id)}/clone`,
    { method: "POST", body: JSON.stringify({ new_id: newId }) },
  );
}

export function saveConfig(config: Record<string, unknown>) {
  return typedRequest(SaveConfigResponseSchema, "/api/config", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

export function startCopilotLogin() {
  return typedRequest(CopilotLoginSessionSchema, "/api/auth/copilot/login", {
    method: "POST",
  });
}

export function startChatGptLogin() {
  return typedRequest(ChatGptLoginSessionSchema, "/api/auth/chatgpt/login", {
    method: "POST",
  });
}

export function chatGptLogout(): Effect.Effect<unknown, HttpError> {
  return rawRequest("/api/auth/chatgpt/logout", { method: "POST" });
}

export function createCronJob(payload: CreateCronJobPayload) {
  return typedRequest(CreateCronJobResponseSchema, "/api/cron/jobs", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCronJob(jobId: string, payload: UpdateCronJobPayload) {
  return typedRequest(
    CronJobSchema,
    `/api/cron/jobs/${enc(jobId)}/update`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export function deleteCronJob(jobId: string) {
  return typedRequest(
    DeleteCronJobResponseSchema,
    `/api/cron/jobs/${enc(jobId)}/delete`,
    { method: "DELETE" },
  );
}

export function triggerCronJob(jobId: string) {
  return typedRequest(
    TriggerCronJobResponseSchema,
    `/api/cron/jobs/${enc(jobId)}/trigger`,
    { method: "POST" },
  );
}

export function deleteSession(agentId: string, sessionId: string) {
  return typedRequest(
    DeleteSessionResponseSchema,
    `/api/agents/${enc(agentId)}/sessions/${enc(sessionId)}`,
    { method: "DELETE" },
  );
}

export function deleteSkill(name: string) {
  return typedRequest(
    DeleteSkillResponseSchema,
    `/api/skills/${enc(name)}`,
    { method: "DELETE" },
  );
}

export function createSkill(payload: CreateSkillPayload) {
  return typedRequest(CreateSkillResponseSchema, "/api/skills", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateSkill(name: string, payload: UpdateSkillPayload) {
  return typedRequest(UpdateSkillResponseSchema, `/api/skills/${enc(name)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deleteMemory(agentId: string, key: string) {
  return typedRequest(
    MemoryDeleteResponseSchema,
    `/api/agents/${enc(agentId)}/memory/${enc(key)}`,
    { method: "DELETE" },
  );
}

export function saveAgentFile(
  agentId: string,
  filename: string,
  content: string,
) {
  return typedRequest(
    SaveAgentFileResponseSchema,
    `/api/agents/${enc(agentId)}/files/${enc(filename)}`,
    { method: "PUT", body: JSON.stringify({ content }) },
  );
}
