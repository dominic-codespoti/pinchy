'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { toast } from 'sonner';
import { GC_TIME } from '@/lib/query-config';
import { AgentFile } from '../types';

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
  const { data, isLoading, error } = useQuery<AgentFile[], Error>({
    queryKey: ['agents', agentId, 'files'],
    queryFn: () => fetchAgentFiles(agentId),
    gcTime: GC_TIME.SHORT,
    enabled: !!agentId,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load agent files: ${error.message}`);
    }
  }, [error]);

  return {
    files: data || [],
    isLoading,
    error: error || null,
  };
}
