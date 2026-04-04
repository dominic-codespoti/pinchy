'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/shared/api/client';
import type { AgentCloneResponse } from '@/src/lib/bindings';
import { toast } from 'sonner';
import { CloneAgentOptions, CloneAgentResult } from '../types';
import { agentsKeys } from '../query-keys';

// Local type for clone request body
interface CloneAgentRequest {
  new_id: string;
}

interface CloneAgentVariables {
  agentId: string;
  newId: string;
  options?: CloneAgentOptions;
}

async function cloneAgent({ agentId, newId }: CloneAgentVariables): Promise<AgentCloneResponse> {
  const body: CloneAgentRequest = { new_id: newId };
  const response = await fetchApi<AgentCloneResponse>(`/api/agents/${agentId}/clone`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return response;
}

export interface UseCloneAgentResult {
  cloneAgent: (agentId: string, newId: string, options?: CloneAgentOptions) => Promise<CloneAgentResult>;
  isPending: boolean;
  error: Error | null;
}

export function useCloneAgent(): UseCloneAgentResult {
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation<AgentCloneResponse, Error, CloneAgentVariables>({
    mutationFn: cloneAgent,
    onSuccess: (data, variables) => {
      // Invalidate agents list to include cloned agent
      queryClient.invalidateQueries({ queryKey: agentsKeys.lists() });
      toast.success(`Agent cloned as ${data.id} successfully`);
      // Navigate to cloned agent
      router.push(`/agents/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Failed to clone agent: ${error.message}`);
    },
  });

  return {
    cloneAgent: async (agentId, newId, options) => {
      const response = await mutation.mutateAsync({ agentId, newId, options });
      // Return a result matching CloneAgentResult interface
      return {
        success: true,
        agentId: response.id,
        clonedSettings: options?.cloneSettings ?? true,
        clonedFiles: options?.cloneFiles ?? true,
        clonedMemories: options?.cloneMemories ?? false,
        errors: [],
      };
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
