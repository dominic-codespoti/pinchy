import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { typedRequest, rawRequest } from "@/api/http";
import { isRecord } from "@/lib/utils";
import {
  listAgentsResponseSchema,
  agentDetailSchema,
  listSessionsResponseSchema,
  getSessionResponseSchema,
  currentSessionResponseSchema,
  listCronJobsResponseSchema,
  listCronRunsResponseSchema,
  listSkillsResponseSchema,
  listSlashCommandsResponseSchema,
  listHeartbeatResponseSchema,
  heartbeatAgentSchema,
  listReceiptsResponseSchema,
  getReceiptsResponseSchema,
  usageResponseSchema,
  memoryListResponseSchema,
  memoryDeleteResponseSchema,
  agentFileResponseSchema,
  saveAgentFileResponseSchema,
  saveConfigResponseSchema,
  statusResponseSchema,
  healthResponseSchema,
  createAgentResponseSchema,
  updateAgentResponseSchema,
  deleteAgentResponseSchema,
  cloneAgentResponseSchema,
  updateSessionResponseSchema,
  deleteSessionResponseSchema,
  createCronJobResponseSchema,
  cronJobSchema,
  deleteCronJobResponseSchema,
  triggerCronJobResponseSchema,
  deleteSkillResponseSchema,
  enhancePromptResponseSchema,
  modelsResponseSchema,
  debugModelRequestsResponseSchema,
  type CreateAgentPayload,
  type UpdateAgentPayload,
  type CreateCronJobPayload,
  type UpdateCronJobPayload,
  type SessionMessage,
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
  cronJobs: ["cron-jobs"] as const,
  cronJobsByAgent: (id: string) => ["cron-jobs", id] as const,
  cronJobRuns: (jobId: string) => ["cron-job-runs", jobId] as const,
  sessions: (agentId: string) => ["sessions", agentId] as const,
  currentSession: (agentId: string) => ["current-session", agentId] as const,
  sessionMessages: (agentId: string, sessionId: string) =>
    ["session", agentId, sessionId] as const,
  skills: ["skills"] as const,
  heartbeat: ["heartbeat"] as const,
  heartbeatAgent: (id: string) => ["heartbeat", id] as const,
  receipts: (agentId: string) => ["receipts", agentId] as const,
  receiptSession: (agentId: string, sessionId: string) =>
    ["receipts", agentId, sessionId] as const,
  slashCommands: ["slash-commands"] as const,
  memory: (agentId: string, q?: string, tag?: string) =>
    ["memory", agentId, q ?? "", tag ?? ""] as const,
  usage: (agent?: string) =>
    agent != null ? (["usage", agent] as const) : (["usage"] as const),
  providerModels: (configModelId: string) =>
    ["provider-models", configModelId] as const,
  debugModelRequests: ["debug-model-requests"] as const,
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

// ── Query Hooks ──────────────────────────────────────

export function useStatusQuery() {
  return useQuery({
    queryKey: qk.status,
    queryFn: () => typedRequest(statusResponseSchema, "/api/status"),
    refetchInterval: 30_000,
  });
}

export function useHealthQuery() {
  return useQuery({
    queryKey: qk.health,
    queryFn: () => typedRequest(healthResponseSchema, "/api/health"),
    refetchInterval: 15_000,
  });
}

export function useAgentsQuery() {
  return useQuery({
    queryKey: qk.agents,
    queryFn: () => typedRequest(listAgentsResponseSchema, "/api/agents"),
  });
}

export function useAgentQuery(agentId: string) {
  return useQuery({
    queryKey: qk.agent(agentId),
    queryFn: () =>
      typedRequest(agentDetailSchema, `/api/agents/${enc(agentId)}`),
    enabled: agentId.length > 0,
  });
}

export function useSessionsQuery(agentId: string) {
  return useQuery({
    queryKey: qk.sessions(agentId),
    queryFn: () =>
      typedRequest(
        listSessionsResponseSchema,
        `/api/agents/${enc(agentId)}/sessions`,
      ),
    enabled: agentId.length > 0,
  });
}

export function useCurrentSessionQuery(agentId: string) {
  return useQuery({
    queryKey: qk.currentSession(agentId),
    queryFn: () =>
      typedRequest(
        currentSessionResponseSchema,
        `/api/agents/${enc(agentId)}/session/current`,
      ),
    enabled: agentId.length > 0,
  });
}

export function useSessionMessagesQuery(agentId: string, sessionId: string) {
  return useQuery({
    queryKey: qk.sessionMessages(agentId, sessionId),
    queryFn: () =>
      typedRequest(
        getSessionResponseSchema,
        `/api/agents/${enc(agentId)}/sessions/${enc(sessionId)}`,
      ),
    enabled: agentId.length > 0 && sessionId.length > 0,
  });
}

export function useCronJobsQuery() {
  return useQuery({
    queryKey: qk.cronJobs,
    queryFn: () => typedRequest(listCronJobsResponseSchema, "/api/cron/jobs"),
  });
}

export function useCronJobsByAgentQuery(agentId: string) {
  return useQuery({
    queryKey: qk.cronJobsByAgent(agentId),
    queryFn: () =>
      typedRequest(
        listCronJobsResponseSchema,
        `/api/cron/jobs/${enc(agentId)}`,
      ),
    enabled: agentId.length > 0,
  });
}

export function useCronJobRunsQuery(jobId: string) {
  return useQuery({
    queryKey: qk.cronJobRuns(jobId),
    queryFn: () =>
      typedRequest(
        listCronRunsResponseSchema,
        `/api/cron/jobs/${enc(jobId)}/runs`,
      ),
    enabled: jobId.length > 0,
  });
}

export function useSkillsQuery() {
  return useQuery({
    queryKey: qk.skills,
    queryFn: () => typedRequest(listSkillsResponseSchema, "/api/skills"),
  });
}

export function useSlashCommandsQuery() {
  return useQuery({
    queryKey: qk.slashCommands,
    queryFn: async () => {
      const res = await typedRequest(
        listSlashCommandsResponseSchema,
        "/api/slash/commands",
      );
      return res.commands;
    },
  });
}

export function useHeartbeatQuery() {
  return useQuery({
    queryKey: qk.heartbeat,
    queryFn: () =>
      typedRequest(listHeartbeatResponseSchema, "/api/heartbeat/status"),
    refetchInterval: 30_000,
  });
}

export function useHeartbeatAgentQuery(agentId: string) {
  return useQuery({
    queryKey: qk.heartbeatAgent(agentId),
    queryFn: () =>
      typedRequest(
        heartbeatAgentSchema,
        `/api/heartbeat/status/${enc(agentId)}`,
      ),
    enabled: agentId.length > 0,
  });
}

export function useReceiptsQuery(agentId: string) {
  return useQuery({
    queryKey: qk.receipts(agentId),
    queryFn: () =>
      typedRequest(
        listReceiptsResponseSchema,
        `/api/agents/${enc(agentId)}/receipts`,
      ),
    enabled: agentId.length > 0,
  });
}

export function useReceiptSessionQuery(agentId: string, sessionId: string) {
  return useQuery({
    queryKey: qk.receiptSession(agentId, sessionId),
    queryFn: () =>
      typedRequest(
        getReceiptsResponseSchema,
        `/api/agents/${enc(agentId)}/receipts/${enc(sessionId)}`,
      ),
    enabled: agentId.length > 0 && sessionId.length > 0,
  });
}

export function useUsageQuery(opts?: {
  readonly agent?: string;
  readonly model?: string;
  readonly from?: string;
  readonly to?: string;
}) {
  return useQuery({
    queryKey: qk.usage(opts?.agent),
    queryFn: () =>
      typedRequest(
        usageResponseSchema,
        `/api/usage${buildQs({
          agent: opts?.agent,
          model: opts?.model,
          from: opts?.from,
          to: opts?.to,
        })}`,
      ),
  });
}

export function useMemoryQuery(
  agentId: string,
  opts?: {
    readonly q?: string;
    readonly tag?: string;
    readonly limit?: number;
    readonly mode?: string;
  },
) {
  return useQuery({
    queryKey: qk.memory(agentId, opts?.q, opts?.tag),
    queryFn: () =>
      typedRequest(
        memoryListResponseSchema,
        `/api/agents/${enc(agentId)}/memory${buildQs({
          q: opts?.q,
          tag: opts?.tag,
          limit: opts?.limit,
          mode: opts?.mode,
        })}`,
      ),
    enabled: agentId.length > 0,
  });
}

export function useAgentFileQuery(agentId: string, filename: string) {
  return useQuery({
    queryKey: qk.agentFile(agentId, filename),
    queryFn: () =>
      typedRequest(
        agentFileResponseSchema,
        `/api/agents/${enc(agentId)}/files/${enc(filename)}`,
      ),
    enabled: agentId.length > 0 && filename.length > 0,
  });
}

export function useConfigQuery() {
  return useQuery<Record<string, unknown>>({
    queryKey: qk.config,
    queryFn: async () => {
      const data = await rawRequest("/api/config");
      return isRecord(data) ? data : {};
    },
  });
}

export function useConfigSchemaQuery() {
  return useQuery<Record<string, unknown>>({
    queryKey: qk.configSchema,
    queryFn: async () => {
      const data = await rawRequest("/api/config/schema");
      return isRecord(data) ? data : {};
    },
  });
}

export function useProviderModelsQuery(configModelId: string) {
  return useQuery({
    queryKey: qk.providerModels(configModelId),
    queryFn: async () => {
      const res = await typedRequest(
        modelsResponseSchema,
        `/api/models/${enc(configModelId)}`,
      );
      return res.models;
    },
    enabled: configModelId.length > 0,
  });
}

export function useDebugModelRequestsQuery() {
  return useQuery({
    queryKey: qk.debugModelRequests,
    queryFn: async () => {
      const res = await typedRequest(
        debugModelRequestsResponseSchema,
        "/api/debug/model-requests",
      );
      return res.requests;
    },
  });
}

// ── Mutation Hooks ───────────────────────────────────

export function useCreateAgentMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateAgentPayload) =>
      typedRequest(createAgentResponseSchema, "/api/agents", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.agents });
    },
  });
}

export function useUpdateAgentMutation(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateAgentPayload) =>
      typedRequest(
        updateAgentResponseSchema,
        `/api/agents/${enc(agentId)}`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.agent(agentId) });
      void client.invalidateQueries({ queryKey: qk.agents });
      void client.invalidateQueries({ queryKey: qk.heartbeatAgent(agentId) });
      void client.invalidateQueries({ queryKey: qk.heartbeat });
    },
  });
}

export function useDeleteAgentMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      typedRequest(deleteAgentResponseSchema, `/api/agents/${enc(id)}`, {
        method: "DELETE",
      }),
    onSuccess: (_data, id) => {
      void client.invalidateQueries({ queryKey: qk.agents });
      void client.removeQueries({ queryKey: qk.agent(id) });
      void client.removeQueries({ queryKey: qk.sessions(id) });
      void client.removeQueries({ queryKey: qk.memory(id) });
      void client.removeQueries({ queryKey: qk.receipts(id) });
      void client.removeQueries({ queryKey: qk.heartbeatAgent(id) });
    },
  });
}

export function useCloneAgentMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newId }: { readonly id: string; readonly newId: string }) =>
      typedRequest(cloneAgentResponseSchema, `/api/agents/${enc(id)}/clone`, {
        method: "POST",
        body: JSON.stringify({ new_id: newId }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.agents });
    },
  });
}

export function useSaveConfigMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      typedRequest(saveConfigResponseSchema, "/api/config", {
        method: "PUT",
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.config });
      void client.invalidateQueries({ queryKey: qk.status });
      void client.invalidateQueries({ queryKey: qk.agents });
    },
  });
}

export function useCreateCronJobMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateCronJobPayload) =>
      typedRequest(createCronJobResponseSchema, "/api/cron/jobs", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (_data, payload) => {
      void client.invalidateQueries({ queryKey: qk.cronJobs });
      void client.invalidateQueries({
        queryKey: qk.cronJobsByAgent(payload.agent_id),
      });
      void client.invalidateQueries({ queryKey: qk.agent(payload.agent_id) });
    },
  });
}

export function useUpdateCronJobMutation(jobId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (payload: UpdateCronJobPayload) =>
      typedRequest(
        cronJobSchema,
        `/api/cron/jobs/${enc(jobId)}/update`,
        { method: "PUT", body: JSON.stringify(payload) },
      ),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: qk.cronJobs });
      void client.invalidateQueries({ queryKey: qk.cronJobRuns(jobId) });
      void client.invalidateQueries({
        queryKey: qk.cronJobsByAgent(data.agent_id),
      });
    },
  });
}

export function useDeleteCronJobMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      typedRequest(
        deleteCronJobResponseSchema,
        `/api/cron/jobs/${enc(jobId)}/delete`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.cronJobs });
      // Broadly invalidate all cronJobsByAgent keys since we don't know which agent
      void client.invalidateQueries({ queryKey: ["cron-jobs"] });
    },
  });
}

export function useTriggerCronJobMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) =>
      typedRequest(
        triggerCronJobResponseSchema,
        `/api/cron/jobs/${enc(jobId)}/trigger`,
        { method: "POST" },
      ),
    onSuccess: (_data, jobId) => {
      void client.invalidateQueries({ queryKey: qk.cronJobs });
      void client.invalidateQueries({ queryKey: qk.cronJobRuns(jobId) });
    },
  });
}

export function useUpdateSessionMutation(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      messages,
    }: {
      readonly sessionId: string;
      readonly messages: ReadonlyArray<SessionMessage>;
    }) =>
      typedRequest(
        updateSessionResponseSchema,
        `/api/agents/${enc(agentId)}/sessions/${enc(sessionId)}`,
        { method: "PUT", body: JSON.stringify({ messages }) },
      ),
    onSuccess: (_data, vars) => {
      void client.invalidateQueries({ queryKey: qk.sessions(agentId) });
      void client.invalidateQueries({
        queryKey: qk.sessionMessages(agentId, vars.sessionId),
      });
    },
  });
}

export function useDeleteSessionMutation(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) =>
      typedRequest(
        deleteSessionResponseSchema,
        `/api/agents/${enc(agentId)}/sessions/${enc(sessionId)}`,
        { method: "DELETE" },
      ),
    onSuccess: (_data, sessionId) => {
      void client.invalidateQueries({ queryKey: qk.sessions(agentId) });
      void client.invalidateQueries({ queryKey: qk.currentSession(agentId) });
      void client.removeQueries({
        queryKey: qk.sessionMessages(agentId, sessionId),
      });
    },
  });
}

export function useDeleteSkillMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      typedRequest(
        deleteSkillResponseSchema,
        `/api/skills/${enc(name)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.skills });
    },
  });
}

export function useDeleteMemoryMutation(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (key: string) =>
      typedRequest(
        memoryDeleteResponseSchema,
        `/api/agents/${enc(agentId)}/memory/${enc(key)}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      // Invalidate all memory queries for this agent regardless of search params
      void client.invalidateQueries({ queryKey: ["memory", agentId] });
    },
  });
}

export function useSaveAgentFileMutation(agentId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      filename,
      content,
    }: {
      readonly filename: string;
      readonly content: string;
    }) =>
      typedRequest(
        saveAgentFileResponseSchema,
        `/api/agents/${enc(agentId)}/files/${enc(filename)}`,
        { method: "PUT", body: JSON.stringify({ content }) },
      ),
    onSuccess: (_data, vars) => {
      void client.invalidateQueries({
        queryKey: qk.agentFile(agentId, vars.filename),
      });
      void client.invalidateQueries({ queryKey: qk.agent(agentId) });
    },
  });
}

export function useEnhancePromptMutation() {
  return useMutation({
    mutationFn: (prompt: string) =>
      typedRequest(enhancePromptResponseSchema, "/api/ai/enhance-prompt", {
        method: "POST",
        body: JSON.stringify({ prompt }),
      }),
  });
}
