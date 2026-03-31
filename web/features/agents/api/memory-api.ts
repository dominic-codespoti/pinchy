import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { Memory, RawMemory } from '../types';

// Backend memory endpoint returns { entries: [...] } not raw array
interface MemoryEntry {
  id: string;
  agent_id: string;
  content: string;
  category?: string;
  timestamp: string;
  tags?: string[];
}

interface MemoryListResponse {
  entries: MemoryEntry[];
}

function transformMemory(entry: MemoryEntry): Memory {
  return {
    id: entry.id,
    agentId: entry.agent_id,
    content: entry.content,
    category: entry.category,
    timestamp: entry.timestamp,
  };
}

export async function getAgentMemories(agentId: string, search?: string): Promise<Memory[]> {
  try {
    const queryParams = search ? `?q=${encodeURIComponent(search)}` : '';
    const response = await fetchApi<MemoryListResponse>(`/api/agents/${agentId}/memory${queryParams}`);
    return (response.entries || []).map(transformMemory);
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
  await fetchApi<void>(`/api/agents/${agentId}/memory/${key}`, {
    method: 'DELETE',
  });
}
