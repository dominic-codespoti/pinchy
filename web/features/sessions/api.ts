import { fetchApi, isNotFoundError } from '@/shared/api/client';
import type { SessionsListResponse, SessionItem } from '@/src/lib/bindings';
import { Agent } from '@/features/agents/types';
import { Session } from './types';

function transformSession(raw: SessionItem): Session {
  return {
    id: raw.session_id,
    agentId: raw.agent_id,
    title: raw.title ?? undefined,
    messageCount: raw.message_count ?? 0,
    createdAt: new Date(Number(raw.created_at)).toISOString(),
    updatedAt: new Date(Number(raw.modified) * 1000).toISOString(),
  };
}

export async function getAgentSessions(agentId: string): Promise<Session[]> {
  try {
    const response = await fetchApi<SessionsListResponse>(`/api/agents/${agentId}/sessions`);
    const rawSessions = response.sessions ?? [];
    return rawSessions.map((raw) => transformSession(raw));
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

export async function deleteSession(sessionId: string, agentId: string): Promise<void> {
  const sessionFile = `${sessionId}.jsonl`;
  await fetchApi<{ session_id: string; deleted: boolean }>(`/api/agents/${agentId}/sessions/${sessionFile}`, {
    method: 'DELETE',
  });
}
