/**
 * Agents API - Agent CRUD operations
 * Endpoints from src/gateway/handlers/agents.rs
 */

import { fetchApi, getErrorMessage } from '@/shared/api/client';
import type {
  AgentListItem,
  AgentsListResponse,
  AgentDetail,
  AgentCreateResponse,
  AgentUpdateResponse,
  AgentDeleteResponse,
  AgentCloneResponse,
} from '@/src/lib/bindings';
import type {
  Agent,
  CreateAgentInput,
  UpdateAgentInput,
  CloneAgentResult,
} from '../types';

const API_BASE = '/api/agents';

// Local type for clone request body (not exported from bindings)
interface CloneAgentRequest {
  new_id: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform AgentListItem from API to frontend Agent format
 */
function transformRawAgent(raw: AgentListItem): Agent {
  return {
    id: raw.id,
    name: raw.id, // Use ID as name (backend doesn't provide separate name)
    description: '', // Backend doesn't provide description directly
    status: raw.has_heartbeat ? 'active' : 'inactive',
    config: {
      model: raw.model ?? undefined,
      provider: 'openai', // Default provider - AgentListItem doesn't have provider field
      systemPrompt: '', // Populated from SOUL.md when loading detail
      toolsEnabled: raw.enabled_skills ?? [],
    },
    createdAt: new Date().toISOString(),
    hasHeartbeat: raw.has_heartbeat,
    lastHeartbeatAt: raw.last_heartbeat_at
      ? new Date(Number(raw.last_heartbeat_at) * 1000).toISOString()
      : undefined,
    heartbeatInterval: raw.heartbeat_secs ? Number(raw.heartbeat_secs) : undefined,
    maxTurns: raw.max_turns ?? undefined,
    historyMessages: raw.history_messages ?? undefined,
    compactKeepRecentTurns: raw.compact_keep_recent_turns ?? undefined,
    maxToolIterations: raw.max_tool_iterations ?? undefined,
    reasoningEffort: raw.reasoning_effort ?? undefined,
    enabledSkills: raw.enabled_skills ?? undefined,
    timezone: raw.timezone ?? undefined,
    cronJobsCount: raw.cron_jobs_count ?? undefined,
    watchPaths: undefined, // AgentListItem doesn't have watch_paths field
  };
}

/**
 * Transform detail response to full Agent
 */
function transformAgentDetail(raw: AgentDetail): Agent {
  return {
    id: raw.id,
    name: raw.id,
    description: raw.soul || '',
    status: 'active',
    config: {
      model: raw.model ?? undefined,
      provider: raw.provider || 'openai',
      systemPrompt: raw.soul || '',
      toolsEnabled: raw.enabled_skills || [],
    },
    createdAt: new Date().toISOString(),
    soul: raw.soul ?? undefined,
    tools: raw.tools ?? undefined,
    heartbeat: raw.heartbeat ?? undefined,
    sessionCount: raw.session_count ?? undefined,
    heartbeatInterval: raw.heartbeat_secs ? Number(raw.heartbeat_secs) : undefined,
    heartbeatEnabled: raw.heartbeat_enabled ?? (raw.heartbeat_secs !== null),
    maxTurns: raw.max_turns ?? undefined,
    historyMessages: raw.history_messages ?? undefined,
    compactKeepRecentTurns: raw.compact_keep_recent_turns ?? undefined,
    maxToolIterations: raw.max_tool_iterations ?? undefined,
    reasoningEffort: raw.reasoning_effort ?? undefined,
    enabledSkills: raw.enabled_skills ?? undefined,
    timezone: raw.timezone ?? undefined,
    watchPaths: raw.watch_paths,
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get all agents
 * GET /api/agents
 */
export async function getAgents(): Promise<Agent[]> {
  const response = await fetchApi<AgentsListResponse>(API_BASE);
  return response.agents.map(transformRawAgent);
}

/**
 * Get a single agent by ID
 * GET /api/agents/:id
 */
export async function getAgent(id: string): Promise<Agent> {
  const response = await fetchApi<AgentDetail>(`${API_BASE}/${encodeURIComponent(id)}`);
  return transformAgentDetail(response);
}

/**
 * Create a new agent
 * POST /api/agents
 */
export async function createAgent(input: CreateAgentInput): Promise<string> {
  const response = await fetchApi<AgentCreateResponse>(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      id: input.id,
      model: input.model,
      soul: input.soul,
      tools: input.tools,
      heartbeat: input.heartbeat,
      heartbeat_secs: input.heartbeat_secs,
      enabled_skills: input.enabled_skills,
    }),
  });
  return response.id;
}

/**
 * Update an agent
 * PUT /api/agents/:id
 */
export async function updateAgent(
  id: string,
  data: UpdateAgentInput
): Promise<string[]> {
  const body: Record<string, unknown> = {};

  if (data.soul !== undefined) body.soul = data.soul;
  if (data.tools !== undefined) body.tools = data.tools;
  if (data.heartbeat !== undefined) body.heartbeat = data.heartbeat;
  if (data.model !== undefined) body.model = data.model;
  if (data.provider !== undefined) body.provider = data.provider;
  if (data.heartbeat_secs !== undefined) body.heartbeat_secs = data.heartbeat_secs;
  if (data.max_tool_iterations !== undefined) body.max_tool_iterations = data.max_tool_iterations;
  if (data.enabled_skills !== undefined) body.enabled_skills = data.enabled_skills;
  if (data.max_turns !== undefined) body.max_turns = data.max_turns;
  if (data.compact_keep_recent_turns !== undefined)
    body.compact_keep_recent_turns = data.compact_keep_recent_turns;
  if (data.history_messages !== undefined) body.history_messages = data.history_messages;
  if (data.reasoning_effort !== undefined) body.reasoning_effort = data.reasoning_effort;
  if (data.enabled !== undefined) {
    // Handle enabled logic (may map to heartbeat_secs being null)
    if (!data.enabled) {
      body.heartbeat_secs = null;
    }
  }
  if (data.heartbeatEnabled !== undefined) body.heartbeat_enabled = data.heartbeatEnabled;

  const response = await fetchApi<AgentUpdateResponse>(
    `${API_BASE}/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    }
  );

  return response.updated;
}

/**
 * Delete an agent
 * DELETE /api/agents/:id
 */
export async function deleteAgent(id: string): Promise<void> {
  await fetchApi<AgentDeleteResponse>(
    `${API_BASE}/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

/**
 * Clone an agent
 * POST /api/agents/:id/clone
 */
export async function cloneAgent(
  id: string,
  newId: string
): Promise<CloneAgentResult> {
  try {
    const response = await fetchApi<AgentCloneResponse>(
      `${API_BASE}/${encodeURIComponent(id)}/clone`,
      {
        method: 'POST',
        body: JSON.stringify({ new_id: newId } as CloneAgentRequest),
      }
    );

    return {
      success: true,
      agentId: response.id,
      clonedSettings: true,
      clonedFiles: true,
      clonedMemories: false, // Backend doesn't clone memories currently
      errors: [],
    };
  } catch (error) {
    return {
      success: false,
      errors: [getErrorMessage(error)],
      clonedSettings: false,
      clonedFiles: false,
      clonedMemories: false,
    };
  }
}
