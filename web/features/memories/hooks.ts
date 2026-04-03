import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import { MutationOptions } from '@/shared/types/mutation';
import { getAgentMemories, searchMemories, addMemory, deleteMemory } from './api';
import { Memory } from './types';

export function useAgentMemories(agentId: string, search?: string) {
  return useQuery<Memory[], Error>({
    queryKey: ['agents', agentId, 'memories', search],
    queryFn: () => getAgentMemories(agentId, search),
    staleTime: STALE_TIME.SHORT,
    enabled: !!agentId,
  });
}

export function useSearchMemories(agentId: string, query: string) {
  return useQuery<Memory[], Error>({
    queryKey: ['agents', agentId, 'memories', 'search', query],
    queryFn: () => searchMemories(agentId, query),
    staleTime: STALE_TIME.SHORT,
    enabled: !!agentId && query.length > 0,
  });
}

export function useAddMemory(agentId: string, options?: MutationOptions<Memory, Error>) {
  const queryClient = useQueryClient();

  return useMutation<Memory, Error, { content: string; category?: string }>({
    mutationFn: ({ content, category }) => addMemory(agentId, content, category),
    onSuccess: (data) => {
      toast.success('Memory added successfully');
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'memories'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      toast.error(`Failed to add memory: ${error.message}`);
      options?.onError?.(error);
    },
  });
}

export function useDeleteMemory(agentId: string, options?: MutationOptions<void, Error>) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (memoryId) => deleteMemory(memoryId),
    onSuccess: () => {
      toast.success('Memory deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'memories'] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      toast.error(`Failed to delete memory: ${error.message}`);
      options?.onError?.(error);
    },
  });
}
