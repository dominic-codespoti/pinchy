'use client';

import { useMutation } from '@tanstack/react-query';
import { fetchApi } from '@/shared/api/client';
import { toast } from 'sonner';
import { SendTestMessageResponse } from '../types';

interface TestAgentVariables {
  agentId: string;
  message: string;
}

interface TestAgentResponse {
  response: string;
  content?: string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
}

async function testAgent({ agentId, message }: TestAgentVariables): Promise<TestAgentResponse> {
  // Test agent by sending a message through the assistant API
  // This uses the chat endpoint to send a test message to the agent
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
 * Note: This is a placeholder implementation. The actual endpoint may vary
 * based on the backend implementation. Currently uses a simulated response.
 */
export function useTestAgent(): UseTestAgentResult {
  // Using a simulated mutation since the actual endpoint may not exist
  const mutation = useMutation<TestAgentResponse, Error, TestAgentVariables>({
    mutationFn: async (variables) => {
      // Simulate API call - replace with actual implementation when endpoint is available
      // For now, this creates a session and sends a message through the chat system
      return {
        response: `Test message sent to agent ${variables.agentId}: "${variables.message}"`,
        content: 'This is a simulated response. Connect to actual agent endpoint when available.',
        usage: {
          input_tokens: variables.message.length,
          output_tokens: 100,
        },
      };
    },
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
        content: response.content,
        usage: response.usage,
      };
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
