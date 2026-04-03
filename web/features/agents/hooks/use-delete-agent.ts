'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/shared/api/client';
import { toast } from 'sonner';
import { Agent } from '../types';

interface DeleteAgentResponse {
  id: string;
  deleted: boolean;
}

async function deleteAgent(agentId: string): Promise<DeleteAgentResponse> {
  const response = await fetchApi<DeleteAgentResponse>(`/api/agents/${agentId}`, {
    method: 'DELETE',
  });
  return response;
}

export interface UseDeleteAgentResult {
  deleteAgent: (agentId: string) => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

export function useDeleteAgent(): UseDeleteAgentResult {
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation<
    DeleteAgentResponse,
    Error,
    string,
    { previousAgents: Agent[] | undefined }
  >({
    mutationFn: deleteAgent,
    // Optimistic update - remove from list immediately
    onMutate: async (agentId) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['agents'] });

      // Snapshot previous value
      const previousAgents = queryClient.getQueryData<Agent[]>(['agents']);

      // Optimistically remove from list
      if (previousAgents) {
        queryClient.setQueryData<Agent[]>(
          ['agents'],
          previousAgents.filter((a) => a.id !== agentId)
        );
      }

      return { previousAgents };
    },
    onSuccess: (_, agentId) => {
      // Remove the deleted agent from cache
      queryClient.removeQueries({ queryKey: ['agents', agentId] });
      toast.success('Agent deleted successfully');
      // Navigate to list
      router.push('/agents');
    },
    onError: (error, agentId, context) => {
      // Rollback on error
      if (context?.previousAgents) {
        queryClient.setQueryData(['agents'], context.previousAgents);
      }
      toast.error(`Failed to delete agent: ${error.message}`);
    },
  });

  return {
    deleteAgent: async (agentId) => {
      await mutation.mutateAsync(agentId);
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
