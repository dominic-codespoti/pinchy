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
