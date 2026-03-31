import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Memory } from '../types';

// Backend memory endpoint returns entries with key/value/tags, not id/content/category
interface MemoryEntry {
  key: string;
  value: string;
  tags?: string[];
  timestamp: string;
  score?: number;
}

interface MemoryListResponse {
  entries: MemoryEntry[];
}

function transformMemory(entry: MemoryEntry, agentId: string): Memory {
  return {
    id: entry.key,
    agentId,
    content: entry.value,
    category: entry.tags?.[0],
    tags: entry.tags ?? [],
    timestamp: entry.timestamp,
  };
}

export async function getAgentMemories(agentId: string, search?: string): Promise<Memory[]> {
  try {
    const queryParams = search ? `?q=${encodeURIComponent(search)}` : '';
    const response = await fetchApi<MemoryListResponse>(`/api/agents/${encodeURIComponent(agentId)}/memory${queryParams}`);
    return (response.entries || []).map((entry) => transformMemory(entry, agentId));
  } catch (error) {
    if (isNotFoundError(error)) {
      // Endpoint not available - return empty array
      return [];
    }
    throw error;
  }
}

export async function searchMemories(agentId: string, query: string): Promise<Memory[]> {
  return getAgentMemories(agentId, query);
}

// Backend does not support adding memories via API (only via tool calls)
// This function is kept for compatibility but will throw an error
export async function addMemory(agentId: string, content: string, category?: string): Promise<Memory> {
  throw new Error('Adding memories via API is not supported. Use the save_memory tool instead.');
}

// Backend does not support updating memories
export async function updateMemory(memoryId: string, content: string): Promise<Memory> {
  throw new Error('Memory update not supported by backend');
}

// Backend uses DELETE /api/agents/:agent_id/memory/:key
export async function deleteMemory(memoryId: string): Promise<void> {
  // memoryId format should be "agent_id/key"
  const parts = memoryId.split('/');
  if (parts.length !== 2) {
    throw new Error('Invalid memory ID format. Expected: agent_id/key');
  }
  const [agentId, key] = parts;
  await fetchApi<void>(`/api/agents/${encodeURIComponent(agentId)}/memory/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
}
