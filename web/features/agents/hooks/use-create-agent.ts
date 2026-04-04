'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { fetchApi } from '@/shared/api/client';
import type { AgentCreateResponse } from '@/src/lib/bindings';
import { toast } from 'sonner';
import { CreateAgentInput } from '../types';
import { agentsKeys } from '../query-keys';

async function createAgent(input: CreateAgentInput): Promise<AgentCreateResponse> {
  const response = await fetchApi<AgentCreateResponse>('/api/agents', {
    method: 'POST',
    body: JSON.stringify({
      id: input.id,
      model: input.model,
      provider: input.provider,
      soul: input.soul,
      tools: input.tools,
      heartbeat: input.heartbeat,
      heartbeat_secs: input.heartbeat_secs,
      enabled_skills: input.enabled_skills,
    }),
  });
  return response;
}

export interface UseCreateAgentResult {
  createAgent: (input: CreateAgentInput) => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

export function useCreateAgent(): UseCreateAgentResult {
  const queryClient = useQueryClient();
  const router = useRouter();

  const mutation = useMutation<AgentCreateResponse, Error, CreateAgentInput>({
    mutationFn: createAgent,
    onSuccess: (data) => {
      // Invalidate agents list to include new agent
      queryClient.invalidateQueries({ queryKey: agentsKeys.lists() });
      toast.success(`Agent ${data.id} created successfully`);
      // Navigate to new agent detail page
      router.push(`/agents/${data.id}`);
    },
    onError: (error) => {
      toast.error(`Failed to create agent: ${error.message}`);
    },
  });

  return {
    createAgent: async (input) => {
      await mutation.mutateAsync(input);
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
