import { Message } from '@/shared/types/common';

export interface ChatMessage extends Message {
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  agentId: string;
  title?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RawChatSession {
  session_id: string;
  agent_id: string;
  title?: string | null;
  file: string;
  created_at: number;
  modified: number;
  message_count?: number;
}

export interface Mention {
  type: 'file' | 'agent';
  id: string;
  name: string;
}

export interface WebSocketCommand {
  command?: string;
  target_agent?: string;
  session_id?: string;
  type?: string;
}

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
