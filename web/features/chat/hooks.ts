'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { MutationOptions } from '@/shared/types/mutation';
import { Message } from '@/shared/types/common';
import { useDeleteSession, useAgentSessions } from '@/features/sessions/hooks';
import { getSessionMessages, createSession } from './api';
import { Session } from './types';

// Re-export from sessions feature
export { useDeleteSession, useAgentSessions };

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

export function useCreateSession(options?: MutationOptions<Session, Error>) {
  const queryClient = useQueryClient();

  return useMutation<Session, Error, string>({
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
