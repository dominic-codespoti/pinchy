/**
 * Agents API - Agent CRUD operations
 * Endpoints from src/gateway/handlers/agents.rs
 */

import { fetchApi, getErrorMessage } from '@/shared/api/client';
import { transformAgent, transformAgentDetail } from '../utils';
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
// API Functions
// ============================================================================

/**
 * Get all agents
 * GET /api/agents
 */
export async function getAgents(): Promise<Agent[]> {
  const response = await fetchApi<AgentsListResponse>(API_BASE);
  return response.agents.map(transformAgent);
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
