'use client';

import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { GC_TIME } from '@/lib/query-config';
import { AgentFile } from '../types';
import { useQueryWithToast } from '@/shared/hooks/use-query-with-toast';
import { agentsKeys } from '../query-keys';

interface FileEntry {
  name: string;
  path: string;
  size: number;
  modified_at: string;
  is_directory: boolean;
}

interface AgentFilesResponse {
  files?: FileEntry[];
}

function transformFile(raw: FileEntry): AgentFile {
  return {
    name: raw.name,
    path: raw.path,
    size: raw.size,
    modifiedAt: raw.modified_at,
    isDirectory: raw.is_directory,
  };
}

async function fetchAgentFiles(agentId: string): Promise<AgentFile[]> {
  try {
    const response = await fetchApi<AgentFilesResponse>(`/api/agents/${agentId}/files`);
    return (response.files || []).map(transformFile);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export interface UseAgentFilesResult {
  files: AgentFile[];
  isLoading: boolean;
  error: Error | null;
}

export function useAgentFiles(agentId: string): UseAgentFilesResult {
  const { data, isLoading, error } = useQueryWithToast<AgentFile[]>(
    agentsKeys.files(agentId),
    () => fetchAgentFiles(agentId),
    'Failed to load agent files',
    {
      gcTime: GC_TIME.SHORT,
      enabled: !!agentId,
    }
  );

  return {
    files: data || [],
    isLoading,
    error: error || null,
  };
}
