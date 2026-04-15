/**
 * Sessions API - Agent session operations
 * Endpoints from src/gateway/handlers/sessions.rs
 */

import { fetchApi } from '@/shared/api/client';
import type {
  SessionsListResponse,
  SessionItem,
  SessionDeleteResponse,
  SessionUpdateResponse,
  SessionCurrentResponse,
} from '@/src/lib/bindings';
import type { Session } from '../types';

const API_BASE = '/api/agents';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform raw session item to Session type
 */
function transformSessionItem(agentId: string) {
  return (raw: SessionItem): Session => {
    return {
      id: raw.session_id,
      agentId,
      createdAt: new Date(Number(raw.created_at) * 1000).toISOString(),
      updatedAt: new Date(Number(raw.modified) * 1000).toISOString(),
      title: raw.title ?? undefined,
      messageCount: raw.message_count || 0,
    };
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get all sessions for an agent
 * GET /api/agents/:id/sessions
 */
export async function getAgentSessions(agentId: string): Promise<Session[]> {
  const response = await fetchApi<SessionsListResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/sessions`
  );
  return response.sessions.map(transformSessionItem(agentId));
}

/**
 * Get a specific session by filename
 * GET /api/agents/:id/sessions/:file
 */
export async function getAgentSession(
  agentId: string,
  sessionFile: string
): Promise<{ file: string; messages: unknown[] }> {
  // Ensure .jsonl extension
  const filename = sessionFile.endsWith('.jsonl')
    ? sessionFile
    : `${sessionFile}.jsonl`;

  return await fetchApi<{ file: string; messages: unknown[] }>(
    `${API_BASE}/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(filename)}`
  );
}

/**
 * Get the current active session for an agent
 * GET /api/agents/:id/session/current
 */
export async function getAgentCurrentSession(agentId: string): Promise<string | null> {
  const response = await fetchApi<SessionCurrentResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/session/current`
  );
  return response.session_id;
}

/**
 * Update a session (overwrite exchanges)
 * PUT /api/agents/:id/sessions/:file
 */
export async function updateAgentSession(
  agentId: string,
  sessionFile: string,
  messages: unknown[]
): Promise<void> {
  // Ensure .jsonl extension
  const filename = sessionFile.endsWith('.jsonl')
    ? sessionFile
    : `${sessionFile}.jsonl`;

  await fetchApi<SessionUpdateResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(filename)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ messages }),
    }
  );
}

/**
 * Delete a session
 * DELETE /api/agents/:id/sessions/:file
 */
export async function deleteAgentSession(
  agentId: string,
  sessionFile: string
): Promise<void> {
  // Ensure .jsonl extension
  const filename = sessionFile.endsWith('.jsonl')
    ? sessionFile
    : `${sessionFile}.jsonl`;

  await fetchApi<SessionDeleteResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/sessions/${encodeURIComponent(filename)}`,
    {
      method: 'DELETE',
    }
  );
}
