import { fetchApi, isNotFoundError, ApiError } from '@/shared/api/client';
import {
  Agent,
  RawAgent,
  CreateAgentInput,
  UpdateAgentInput,
} from '../types';
import {
  AgentsListResponseSchema,
  RawAgentSchema,
} from '@/lib/validation/schemas';

// Transform agent from raw API response to frontend format
// The detail endpoint (/api/agents/:id) returns full text fields (heartbeat, soul, tools)
// while the list endpoint (/api/agents) returns boolean flags (has_heartbeat, has_soul, has_tools)
export function transformAgent(raw: RawAgent): Agent {
  // Derive has_heartbeat from the boolean flag
  const hasHeartbeat = Boolean(raw.has_heartbeat);

  // Use backend-provided timestamp if available, otherwise fallback to current time
  const lastHeartbeatAt = raw.last_heartbeat_at ?? (hasHeartbeat ? new Date().toISOString() : undefined);

  // Derive provider from model field (e.g., "copilot-default" -> "copilot")
  // Backend does not provide a separate provider field
  const provider = raw.model?.split('-')[0] || 'default';

  return {
    id: raw.id,
    name: raw.id, // Backend does not provide a display name, use id
    description: raw.model ? `Model: ${raw.model}` : 'No model configured',
    status: hasHeartbeat ? 'active' : 'inactive',
    config: {
      model: raw.model,
      provider,
      systemPrompt: raw.soul || '', // Backend provides soul content when available
      toolsEnabled: raw.enabled_skills ?? [],
    },
    // Backend does not provide creation time - use backend provided if available
    createdAt: raw.created_at ?? new Date().toISOString(),
    hasHeartbeat,
    lastHeartbeatAt,
    heartbeatInterval: raw.heartbeat_secs ?? undefined,
    // Additional fields from detail endpoint
    soul: raw.soul,
    tools: raw.tools,
    heartbeat: raw.heartbeat,
    sessionCount: raw.session_count,
    cronJobsCount: raw.cron_jobs_count,
    watchPaths: raw.watch_paths,
    maxTurns: raw.max_turns,
    historyMessages: raw.history_messages,
    compactKeepRecentTurns: raw.compact_keep_recent_turns,
    maxToolIterations: raw.max_tool_iterations,
    reasoningEffort: raw.reasoning_effort,
    enabledSkills: raw.enabled_skills,
    timezone: raw.timezone,
  };
}

export async function getAgents(): Promise<Agent[]> {
  const response = await fetchApi(
    '/api/agents',
    undefined,
    AgentsListResponseSchema
  );
  return response.agents.map(raw => transformAgent(raw as RawAgent));
}

export async function getAgent(id: string): Promise<Agent> {
  // The detail endpoint returns the agent object directly (not wrapped in { agent: ... })
  const response = await fetchApi(
    `/api/agents/${encodeURIComponent(id)}`,
    undefined,
    RawAgentSchema
  );
  return transformAgent(response as RawAgent);
}

export async function createAgent(data: CreateAgentInput): Promise<Agent> {
  const response = await fetchApi<{ id: string; created: boolean }>('/api/agents', {
    method: 'POST',
    body: JSON.stringify({
      id: data.id,
      soul: data.soul,
      tools: data.tools,
      heartbeat: data.heartbeat,
      model: data.model,
      heartbeat_secs: data.heartbeat_secs,
    }),
  });

  // Derive provider from model field (backend does not provide provider)
  const provider = data.model?.split('-')[0] || 'default';

  // Return a transformed agent with the new id
  // Note: Backend only returns { id, created }, so we use input data for other fields
  return {
    id: response.id,
    name: response.id, // Backend does not provide a display name
    description: data.model ? `Model: ${data.model}` : 'No model configured',
    status: 'inactive',
    config: {
      model: data.model || '',
      provider,
      systemPrompt: data.soul || '',
      toolsEnabled: data.enabled_skills ?? [],
    },
    // Backend does not provide creation time - generated client-side
    createdAt: new Date().toISOString(),
  };
}

export async function updateAgent(id: string, data: UpdateAgentInput): Promise<Agent> {
  const response = await fetchApi<{ id: string; updated: string[] }>(`/api/agents/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  // Fetch the updated agent to get fresh data
  return getAgent(response.id);
}

export async function deleteAgent(id: string): Promise<void> {
  await fetchApi<{ id: string; deleted: boolean }>(`/api/agents/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export { isNotFoundError };
export type { ApiError };
