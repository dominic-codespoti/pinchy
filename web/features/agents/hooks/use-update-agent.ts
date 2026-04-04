'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/shared/api/client';
import { toast } from 'sonner';
import { Agent, UpdateAgentInput } from '../types';
import { transformAgentDetail } from '../utils';
import { agentsKeys } from '../query-keys';

interface UpdateAgentResponse {
  id: string;
  updated: string[];
}

interface UpdateAgentVariables {
  agentId: string;
  input: UpdateAgentInput;
}

async function updateAgent({ agentId, input }: UpdateAgentVariables): Promise<UpdateAgentResponse> {
  const response = await fetchApi<UpdateAgentResponse>(`/api/agents/${agentId}`, {
    method: 'PUT',
    body: JSON.stringify({
      soul: input.soul,
      tools: input.tools,
      heartbeat: input.heartbeat,
      model: input.model,
      heartbeat_secs: input.heartbeat_secs,
      max_tool_iterations: input.max_tool_iterations,
      enabled_skills: input.enabled_skills,
      max_turns: input.max_turns,
      compact_keep_recent_turns: input.compact_keep_recent_turns,
      history_messages: input.history_messages,
      reasoning_effort: input.reasoning_effort,
      enabled: input.enabled,
    }),
  });
  return response;
}

export interface UseUpdateAgentResult {
  updateAgent: (agentId: string, input: UpdateAgentInput) => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

export function useUpdateAgent(): UseUpdateAgentResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    UpdateAgentResponse,
    Error,
    UpdateAgentVariables,
    { previousAgent: Agent | undefined }
  >({
    mutationFn: updateAgent,
    // Optimistic update
    onMutate: async ({ agentId, input }) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: agentsKeys.detail(agentId) });

      // Snapshot previous value
      const previousAgent = queryClient.getQueryData<Agent>(agentsKeys.detail(agentId));

      // Optimistically update to new value
      if (previousAgent) {
        const optimisticAgent: Agent = {
          ...previousAgent,
          soul: input.soul ?? previousAgent.soul,
          tools: input.tools ?? previousAgent.tools,
          heartbeat: input.heartbeat ?? previousAgent.heartbeat,
          config: {
            ...previousAgent.config,
            model: input.model ?? previousAgent.config.model,
            systemPrompt: input.soul ?? previousAgent.config.systemPrompt,
          },
          heartbeatInterval: input.heartbeat_secs ?? previousAgent.heartbeatInterval,
          maxTurns: input.max_turns ?? previousAgent.maxTurns,
          historyMessages: input.history_messages ?? previousAgent.historyMessages,
          compactKeepRecentTurns: input.compact_keep_recent_turns ?? previousAgent.compactKeepRecentTurns,
          maxToolIterations: input.max_tool_iterations ?? previousAgent.maxToolIterations,
          reasoningEffort: input.reasoning_effort ?? previousAgent.reasoningEffort,
          enabledSkills: input.enabled_skills ?? previousAgent.enabledSkills,
        };
        queryClient.setQueryData(agentsKeys.detail(agentId), optimisticAgent);
      }

      return { previousAgent };
    },
    onSuccess: (_, { agentId }) => {
      // Invalidate the agent detail to get fresh data
      queryClient.invalidateQueries({ queryKey: agentsKeys.detail(agentId) });
      toast.success('Agent updated successfully');
    },
    onError: (error, { agentId }, context) => {
      // Rollback on error
      if (context?.previousAgent) {
        queryClient.setQueryData(agentsKeys.detail(agentId), context.previousAgent);
      }
      toast.error(`Failed to update agent: ${error.message}`);
    },
  });

  return {
    updateAgent: async (agentId, input) => {
      await mutation.mutateAsync({ agentId, input });
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
