import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Agent } from '@/features/agents/types';
import { Session, RawSession } from './types';

interface SessionsListResponse {
  sessions: RawSession[];
}

function transformSession(raw: RawSession, agentId: string): Session {
  return {
    id: raw.session_id,
    agentId,
    title: raw.title ?? undefined,
    messageCount: raw.message_count ?? 0,
    createdAt: new Date(raw.created_at).toISOString(),
    updatedAt: new Date(raw.modified * 1000).toISOString(),
  };
}

export async function getAgentSessions(agentId: string): Promise<Session[]> {
  try {
    const response = await fetchApi<SessionsListResponse>(`/api/agents/${agentId}/sessions`);
    const rawSessions = response.sessions ?? [];
    return rawSessions.map((raw) => transformSession(raw, agentId));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getAllSessions(agents: Agent[]): Promise<Session[]> {
  const allSessions: Session[] = [];

  for (const agent of agents) {
    try {
      const agentSessions = await getAgentSessions(agent.id);
      allSessions.push(...agentSessions);
    } catch {
      // Skip agents with errors
    }
  }

  // Sort by updatedAt descending
  return allSessions.sort((a, b) =>
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

export async function deleteSession(id: string): Promise<void> {
  const parts = id.split('-');
  if (parts.length < 2) {
    throw new Error('Invalid session ID format');
  }
  const agentId = parts.slice(0, -1).join('-');
  const sessionFile = `${id}.jsonl`;
  await fetchApi<{ session_id: string; deleted: boolean }>(`/api/agents/${agentId}/sessions/${sessionFile}`, {
    method: 'DELETE',
  });
}
