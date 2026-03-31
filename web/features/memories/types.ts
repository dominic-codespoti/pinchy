export interface Memory {
  id: string;
  agentId: string;
  content: string;
  category?: string;
  timestamp: string;
}

export interface RawMemory {
  id: string;
  agent_id: string;
  content: string;
  category?: string;
  timestamp: string;
}

export interface MemoryEntry {
  id: string;
  agent_id: string;
  content: string;
  category?: string;
  timestamp: string;
  tags?: string[];
}

export interface MemoryListResponse {
  entries: RawMemory[];
}
