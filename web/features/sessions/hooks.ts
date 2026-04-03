'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEffect } from 'react';
import { STALE_TIME } from '@/lib/query-config';
import { MutationOptions } from '@/shared/types/mutation';
import { Agent } from '@/features/agents/types';
import { getAgentSessions, getAllSessions, deleteSession } from './api';
import { Session } from './types';

export interface UseAgentSessionsResult {
  data: Session[] | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useAgentSessions(agentId: string): UseAgentSessionsResult {
  const { data, isLoading, error } = useQuery<Session[], Error>({
    queryKey: ['agents', agentId, 'sessions'],
    queryFn: () => getAgentSessions(agentId),
    staleTime: STALE_TIME.SHORT,
    enabled: !!agentId,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load sessions: ${error.message}`);
    }
  }, [error]);

  return {
    data,
    isLoading,
    error: error || null,
  };
}

export function useAllSessions(agents: Agent[]) {
  const { data, isLoading, error } = useQuery<Session[], Error>({
    queryKey: ['sessions', 'all', agents.map(a => a.id)],
    queryFn: () => getAllSessions(agents),
    staleTime: STALE_TIME.SHORT,
    enabled: agents.length > 0,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load all sessions: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

interface DeleteSessionVariables {
  sessionId: string;
  agentId: string;
}

export function useDeleteSession(options?: MutationOptions<void, Error>) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, DeleteSessionVariables>({
    mutationFn: (vars) => deleteSession(vars.sessionId, vars.agentId),
    onSuccess: (_, variables) => {
      toast.success('Session deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['agents', variables.agentId, 'sessions'] });
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to delete session: ${error.message}`);
      options?.onError?.(error);
    },
  });
}
