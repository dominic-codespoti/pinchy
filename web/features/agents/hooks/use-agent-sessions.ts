'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { toast } from 'sonner';
import { Session, RawSession } from '../types';

const GC_TIME = 5 * 60 * 1000; // 5 minutes

interface SessionsResponse {
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

async function fetchAgentSessions(agentId: string): Promise<Session[]> {
  try {
    const response = await fetchApi<SessionsResponse>(`/api/agents/${agentId}/sessions`);
    const rawSessions = response.sessions ?? [];
    return rawSessions.map((raw) => transformSession(raw, agentId));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export interface UseAgentSessionsResult {
  sessions: Session[];
  isLoading: boolean;
  error: Error | null;
}

export function useAgentSessions(agentId: string): UseAgentSessionsResult {
  const { data, isLoading, error } = useQuery<Session[], Error>({
    queryKey: ['agents', agentId, 'sessions'],
    queryFn: () => fetchAgentSessions(agentId),
    gcTime: GC_TIME,
    enabled: !!agentId,
  });

  if (error) {
    toast.error(`Failed to load sessions: ${error.message}`);
  }

  return {
    sessions: data || [],
    isLoading,
    error: error || null,
  };
}
