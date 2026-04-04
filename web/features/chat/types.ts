import type { SessionItem as RawSession } from '@/src/lib/bindings';
import { Message } from '@/shared/types/common';

export type { RawSession };

// Define Session type that UI expects (camelCase version of SessionItem)
export interface Session {
  id: string;
  agentId: string;
  title?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage extends Message {
  isStreaming?: boolean;
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
