import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Message } from '@/shared/types/common';
import { getAgentSessions, getSessionMessages, createSession, deleteSession } from './api';
import { ChatSession } from './types';

interface MutationOptions<TData = unknown, TError = Error> {
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
}

export function useAgentSessions(agentId: string) {
  return useQuery<ChatSession[], Error>({
    queryKey: ['agents', agentId, 'sessions'],
    queryFn: () => getAgentSessions(agentId),
    staleTime: 5000,
    enabled: !!agentId,
  });
}

export function useSessionMessages(sessionId: string) {
  return useQuery<Message[], Error>({
    queryKey: ['sessions', sessionId, 'messages'],
    queryFn: () => getSessionMessages(sessionId),
    staleTime: 1000,
    enabled: !!sessionId,
  });
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

export function useDeleteSession(options?: MutationOptions<void, Error>) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteSession,
    onSuccess: (_, sessionId) => {
      toast.success('Session deleted successfully');
      // Extract agentId from sessionId to invalidate the correct query
      const parts = sessionId.split('-');
      if (parts.length >= 2) {
        const agentId = parts.slice(0, -1).join('-');
        queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'sessions'] });
      }
      options?.onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to delete session: ${error.message}`);
      options?.onError?.(error);
    },
  });
}
