import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Message } from '@/shared/types/common';
import { ChatSession, RawChatSession } from './types';

interface SessionsListResponse {
  sessions: RawChatSession[];
}

interface MessagesResponse {
  messages: Message[];
}

function transformSession(raw: RawChatSession, agentId: string): ChatSession {
  return {
    id: raw.session_id,
    agentId,
    title: raw.title ?? undefined,
    messageCount: raw.message_count ?? 0,
    createdAt: new Date(raw.created_at).toISOString(),
    updatedAt: new Date(raw.modified * 1000).toISOString(),
  };
}

export async function getAgentSessions(agentId: string): Promise<ChatSession[]> {
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

export async function getSessionMessages(sessionId: string): Promise<Message[]> {
  try {
    const parts = sessionId.split('-');
    if (parts.length < 2) {
      return [];
    }
    const agentId = parts.slice(0, -1).join('-');
    const sessionFile = `${sessionId}.jsonl`;
    const response = await fetchApi<MessagesResponse>(`/api/agents/${agentId}/sessions/${sessionFile}`);
    return response.messages;
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export async function createSession(agentId: string): Promise<ChatSession> {
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
