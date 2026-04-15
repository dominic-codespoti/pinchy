import { Session } from '../types';

export interface ParsedSessionId {
  /** The full session ID (e.g., "agent-123-timestamp") */
  sessionId: string;
  /** The agent ID portion extracted from the session ID */
  agentId: string;
  /** The session filename for API calls (e.g., "agent-123-timestamp.jsonl") */
  sessionFile: string;
  /** Whether the session ID format is valid */
  isValid: boolean;
}

/**
 * Parse a session ID into its constituent parts.
 * Session IDs follow the format: {agentId}-{timestamp}
 * 
 * Examples:
 * - "my-agent-123-1743513600000" -> agentId: "my-agent-123", sessionFile: "my-agent-123-1743513600000.jsonl"
 * - "agent-1743513600000" -> agentId: "agent", sessionFile: "agent-1743513600000.jsonl"
 * 
 * @param sessionId - The session ID to parse
 * @returns ParsedSessionId object with agentId, sessionFile, and validity flag
 */
export function parseSessionId(sessionId: string): ParsedSessionId {
  const parts = sessionId.split('-');
  
  if (parts.length < 2) {
    return {
      sessionId,
      agentId: '',
      sessionFile: `${sessionId}.jsonl`,
      isValid: false,
    };
  }
  
  const agentId = parts.slice(0, -1).join('-');
  
  return {
    sessionId,
    agentId,
    sessionFile: `${sessionId}.jsonl`,
    isValid: !!agentId,
  };
}

/**
 * Extract the agent ID from a session ID.
 * Returns null if the session ID format is invalid.
 */
export function extractAgentId(sessionId: string): string | null {
  const parsed = parseSessionId(sessionId);
  return parsed.isValid ? parsed.agentId : null;
}

/**
 * Build the API path for session messages.
 * Returns null if the session ID format is invalid.
 */
export function buildSessionMessagesPath(sessionId: string): string | null {
  const parsed = parseSessionId(sessionId);
  if (!parsed.isValid) return null;
  return `/api/agents/${parsed.agentId}/sessions/${parsed.sessionFile}`;
}

/**
 * Find a session in a list by ID.
 * Returns undefined if not found.
 */
export function findSessionById(
  sessions: Session[] | undefined,
  sessionId: string | null
): Session | undefined {
  if (!sessionId || !sessions) return undefined;
  return sessions.find(s => s.id === sessionId);
}

/**
 * Filter sessions by agent ID.
 */
export function filterSessionsByAgent(
  sessions: Session[] | undefined,
  agentId: string
): Session[] {
  if (!sessions) return [];
  return sessions.filter(s => s.agentId === agentId);
}
