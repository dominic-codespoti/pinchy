import type { SessionItem as RawSession } from '@/src/lib/bindings';

// Define Session type that UI expects (camelCase version of SessionItem)
export interface Session {
  id: string;
  agentId: string;
  title?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type { RawSession };
