'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { MutationOptions } from '@/shared/types/mutation';
import { Message } from '@/shared/types/common';
import { useAgentSessions as useAgentSessionsFromSessions } from '@/features/sessions/hooks';
import { getSessionMessages, createSession, deleteSession } from './api';
import { ChatSession } from './types';

// Re-export useAgentSessions from sessions feature with ChatSession type
export function useAgentSessions(agentId: string) {
  const result = useAgentSessionsFromSessions(agentId);
  
  return {
    ...result,
    // Cast data to ChatSession[] for compatibility
    data: result.data as ChatSession[] | undefined,
  };
}

export function useSessionMessages(sessionId: string, agentId: string) {
  const { data, isLoading, error } = useQuery<Message[], Error>({
    queryKey: ['sessions', sessionId, 'messages'],
    queryFn: () => getSessionMessages(sessionId, agentId),
    staleTime: STALE_TIME.REALTIME,
    enabled: !!sessionId && !!agentId,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load session messages: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

export function useCreateSession(options?: MutationOptions<ChatSession, Error>) {
  const queryClient = useQueryClient();

  return useMutation<ChatSession, Error, string>({
    mutationFn: createSession,
    onSuccess: (data) => {
      toast.success('Session created successfully');
      queryClient.invalidateQueries({ queryKey: ['agents', data.agentId, 'sessions'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(`Failed to create session: ${error.message}`);
      options?.onError?.(error);
    },
  });
}

interface DeleteSessionVariables {
  sessionId: string;
  agentId: string;
}

// Re-export useDeleteSession from sessions feature
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
