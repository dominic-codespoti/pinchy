export interface Memory {
  id: string;
  agentId: string;
  content: string;
  category?: string;
  tags: string[];
  timestamp: string;
  score?: number;
}

export interface RawMemory {
  key: string;
  value: string;
  tags?: string[];
  timestamp: string;
  score?: number;
}

export interface MemoryListResponse {
  entries: RawMemory[];
}
