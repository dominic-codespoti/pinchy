'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/shared/api/client';
import { toast } from 'sonner';

interface DeleteMemoryResponse {
  deleted: boolean;
}

interface DeleteMemoryVariables {
  agentId: string;
  key: string;
}

async function deleteMemory({ agentId, key }: DeleteMemoryVariables): Promise<DeleteMemoryResponse> {
  const response = await fetchApi<DeleteMemoryResponse>(`/api/agents/${agentId}/memory/${key}`, {
    method: 'DELETE',
  });
  return response;
}

export interface UseDeleteMemoryResult {
  deleteMemory: (agentId: string, key: string) => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

export function useDeleteMemory(): UseDeleteMemoryResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<DeleteMemoryResponse, Error, DeleteMemoryVariables>({
    mutationFn: deleteMemory,
    onSuccess: (_, variables) => {
      // Invalidate memories cache for the agent
      queryClient.invalidateQueries({
        queryKey: ['agents', variables.agentId, 'memories'],
      });
      toast.success('Memory deleted successfully');
    },
    onError: (error) => {
      toast.error(`Failed to delete memory: ${error.message}`);
    },
  });

  return {
    deleteMemory: async (agentId, key) => {
      await mutation.mutateAsync({ agentId, key });
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
