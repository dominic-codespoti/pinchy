import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Agent } from '@/features/agents/types';
import { getAgentSessions, getAllSessions, deleteSession } from './api';
import { Session } from './types';

interface MutationOptions<TData = unknown, TError = Error> {
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
}

export function useAgentSessions(agentId: string) {
  return useQuery<Session[], Error>({
    queryKey: ['agents', agentId, 'sessions'],
    queryFn: () => getAgentSessions(agentId),
    staleTime: 5000,
    enabled: !!agentId,
  });
}

export function useAllSessions(agents: Agent[]) {
  return useQuery<Session[], Error>({
    queryKey: ['sessions', 'all', agents.map(a => a.id)],
    queryFn: () => getAllSessions(agents),
    staleTime: 5000,
    enabled: agents.length > 0,
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
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to delete session: ${error.message}`);
      options?.onError?.(error);
    },
  });
}
