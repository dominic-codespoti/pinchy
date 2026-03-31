import { fetchApi, isNotFoundError, ApiError } from '@/shared/api/client';
import {
  Agent,
  RawAgent,
  CreateAgentInput,
  UpdateAgentInput,
} from '../types';

// Transform agent from raw API response to frontend format
// The detail endpoint (/api/agents/:id) returns full text fields (heartbeat, soul, tools)
// while the list endpoint (/api/agents) returns boolean flags (has_heartbeat, has_soul, has_tools)
export function transformAgent(raw: RawAgent): Agent {
  // Derive has_heartbeat from either the boolean flag (list) or presence of text (detail)
  // Use Boolean() to handle both boolean and string cases properly
  const hasHeartbeat = Boolean(raw.has_heartbeat ?? (raw as unknown as Record<string, unknown>).heartbeat);

  // Calculate last heartbeat time based on has_heartbeat and heartbeat_secs
  // If has_heartbeat is true but we don't have exact timestamp, assume recent
  const lastHeartbeatAt = hasHeartbeat
    ? new Date().toISOString() // Ideally backend provides actual timestamp
    : undefined;

  return {
    id: raw.id,
    name: raw.id, // Use id as name for now
    description: raw.model ? `Model: ${raw.model}` : 'No model configured',
    status: hasHeartbeat ? 'active' : 'inactive',
    config: {
      model: raw.model,
      provider: 'copilot', // Default provider
      systemPrompt: '',
      toolsEnabled: raw.enabled_skills ?? [],
    },
    createdAt: new Date().toISOString(), // Backend doesn't provide this
    hasHeartbeat,
    lastHeartbeatAt,
    heartbeatInterval: raw.heartbeat_secs ?? undefined,
    // Additional fields from detail endpoint
    soul: raw.soul,
    tools: raw.tools,
    heartbeat: raw.heartbeat,
    sessionCount: raw.session_count,
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
  const response = await fetchApi<{ agents: RawAgent[] }>('/api/agents');
  return response.agents.map(transformAgent);
}

export async function getAgent(id: string): Promise<Agent> {
  // The detail endpoint returns the agent object directly (not wrapped in { agent: ... })
  const response = await fetchApi<RawAgent>(`/api/agents/${id}`);
  return transformAgent(response);
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
  // Return a transformed agent with the new id
  return {
    id: response.id,
    name: response.id,
    description: `Model: ${data.model || 'default'}`,
    status: 'inactive',
    config: {
      model: data.model || '',
      provider: 'copilot',
      systemPrompt: data.soul || '',
      toolsEnabled: [],
    },
    createdAt: new Date().toISOString(),
  };
}

export async function updateAgent(id: string, data: UpdateAgentInput): Promise<Agent> {
  const response = await fetchApi<{ id: string; updated: string[] }>(`/api/agents/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  // Fetch the updated agent to get fresh data
  return getAgent(response.id);
}

export async function deleteAgent(id: string): Promise<void> {
  await fetchApi<{ id: string; deleted: boolean }>(`/api/agents/${id}`, {
    method: 'DELETE',
  });
}

export { isNotFoundError };
export type { ApiError };
