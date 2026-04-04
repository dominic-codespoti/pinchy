'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchApi } from '@/shared/api/client';
import type { TestAgentResponse, TestAgentUsage } from '@/src/lib/bindings';
import { toast } from 'sonner';
import { SendTestMessageResponse } from '../types';

interface TestAgentVariables {
  agentId: string;
  message: string;
}

async function testAgent({ agentId, message }: TestAgentVariables): Promise<TestAgentResponse> {
  const response = await fetchApi<TestAgentResponse>(`/api/agents/${agentId}/test`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  });
  return response;
}

export interface UseTestAgentResult {
  testAgent: (agentId: string, message: string) => Promise<SendTestMessageResponse>;
  isPending: boolean;
  error: Error | null;
}

/**
 * Hook to test an agent by sending a test message.
 * Calls the backend endpoint POST /api/agents/:id/test
 */
export function useTestAgent(): UseTestAgentResult {
  const mutation = useMutation<TestAgentResponse, Error, TestAgentVariables>({
    mutationFn: testAgent,
    onSuccess: () => {
      toast.success('Test message sent successfully');
    },
    onError: (error) => {
      toast.error(`Failed to send test message: ${error.message}`);
    },
  });

  return {
    testAgent: async (agentId, message) => {
      const response = await mutation.mutateAsync({ agentId, message });
      return {
        response: response.response,
        content: response.content ?? undefined,
        usage: response.usage
          ? {
              input_tokens: Number((response.usage as TestAgentUsage).input_tokens) || undefined,
              output_tokens: Number((response.usage as TestAgentUsage).output_tokens) || undefined,
            }
          : undefined,
      };
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
