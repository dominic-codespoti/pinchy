export interface Session {
  id: string;
  agentId: string;
  title?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RawSession {
  session_id: string;
  title?: string | null;
  file: string;
  created_at: number;
  modified: number;
  message_count?: number;
}
