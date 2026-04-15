'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/shared/api/client';
import type { AgentFilePutResponse } from '@/src/lib/bindings';
import { toast } from 'sonner';
import { agentsKeys } from '../query-keys';

interface SaveAgentFileVariables {
  agentId: string;
  filename: string;
  content: string;
}

async function saveAgentFile({ agentId, filename, content }: SaveAgentFileVariables): Promise<AgentFilePutResponse> {
  const response = await fetchApi<AgentFilePutResponse>(`/api/agents/${agentId}/files/${filename}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return response;
}

export interface UseSaveAgentFileResult {
  saveFile: (agentId: string, filename: string, content: string) => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

export function useSaveAgentFile(): UseSaveAgentFileResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<AgentFilePutResponse, Error, SaveAgentFileVariables>({
    mutationFn: saveAgentFile,
    onSuccess: (_, variables) => {
      // Invalidate the specific file cache
      queryClient.invalidateQueries({
        queryKey: agentsKeys.file(variables.agentId, variables.filename),
      });
      // Also invalidate the agent detail to refresh any derived data
      queryClient.invalidateQueries({
        queryKey: agentsKeys.detail(variables.agentId),
      });
      toast.success(`File ${variables.filename} saved successfully`);
    },
    onError: (error, variables) => {
      toast.error(`Failed to save ${variables.filename}: ${error.message}`);
    },
  });

  return {
    saveFile: async (agentId, filename, content) => {
      await mutation.mutateAsync({ agentId, filename, content });
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}
