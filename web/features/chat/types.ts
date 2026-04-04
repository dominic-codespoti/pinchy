import { Session, RawSession } from '@/lib/validation/schemas';
import { Message } from '@/shared/types/common';

export type { Session, RawSession };

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
