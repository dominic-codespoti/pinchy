import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Session, RawSession } from '../types';

// Transform session from raw API response to frontend format
export function transformSession(raw: RawSession, agentId?: string): Session {
  return {
    id: raw.session_id,
    agentId: agentId ?? '', // Must be populated by the caller when available
    title: raw.title ?? undefined,
    messageCount: 0, // Backend doesn't provide message count
    // created_at is in milliseconds, modified is in seconds
    createdAt: new Date(raw.created_at).toISOString(),
    updatedAt: new Date(raw.modified * 1000).toISOString(),
  };
}

// Raw session shape from the /api/agents/:id/sessions endpoint
interface RawAgentSession {
  session_id: string;
  title: string | null;
  file: string;
  created_at: number; // Unix timestamp in milliseconds
  modified: number;   // Unix timestamp in seconds
}

interface SessionsListResponse {
  sessions: RawAgentSession[];
}

// Backend returns sessions at /api/agents/:id/sessions
export async function getAgentSessions(agentId: string): Promise<Session[]> {
  try {
    const response = await fetchApi<SessionsListResponse>(`/api/agents/${agentId}/sessions`);
    const rawSessions = response.sessions ?? [];
    return rawSessions.map((raw) => ({
      id: raw.session_id,
      agentId,
      title: raw.title ?? undefined,
      messageCount: 0, // API doesn't provide message count
      // created_at is in milliseconds, modified is in seconds
      createdAt: new Date(raw.created_at).toISOString(),
      updatedAt: new Date(raw.modified * 1000).toISOString(),
    }));
  } catch (error) {
    if (isNotFoundError(error)) {
      // Endpoint not available - return empty array
      return [];
    }
    throw error;
  }
}

export async function createSession(agentId: string): Promise<Session> {
  // Sessions are created by sending a message to the webhook endpoint
  // or by starting a new conversation
  const sessionId = `${agentId}-${Date.now()}`;
  const now = new Date().toISOString();

  return {
    id: sessionId,
    agentId,
    title: 'New Session',
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export async function deleteSession(id: string): Promise<void> {
  // Backend expects DELETE /api/agents/:agent_id/sessions/:session_file
  // where session_file is the session id with .jsonl extension
  // Extract agent_id from session id format: agent_id-timestamp
  const parts = id.split('-');
  if (parts.length < 2) {
    throw new Error('Invalid session ID format');
  }
  // The agent_id is everything before the last segment (timestamp)
  // Handle cases where agent_id itself contains hyphens
  const agentId = parts.slice(0, -1).join('-');
  const sessionFile = `${id}.jsonl`;
  await fetchApi<{ session_id: string; deleted: boolean }>(`/api/agents/${agentId}/sessions/${sessionFile}`, {
    method: 'DELETE',
  });
}
