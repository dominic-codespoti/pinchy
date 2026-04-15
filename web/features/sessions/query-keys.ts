/**
 * Query key factory for Sessions feature
 * 
 * Provides consistent query keys for session management.
 * 
 * Usage:
 *   queryKey: sessionsKeys.all()              // ['sessions']
 *   queryKey: sessionsKeys.lists()            // ['sessions', 'list']
 *   queryKey: sessionsKeys.byAgent(agentId)   // ['sessions', 'agent', agentId]
 *   queryKey: sessionsKeys.detail(id)          // ['sessions', 'detail', id]
 */

export const sessionsKeys = {
  /** Base key for all sessions queries */
  all: () => ['sessions'] as const,

  /** List queries */
  lists: () => [...sessionsKeys.all(), 'list'] as const,

  /** Detail queries */
  details: () => [...sessionsKeys.all(), 'detail'] as const,
  detail: (id: string) => [...sessionsKeys.details(), id] as const,

  /** Agent-specific sessions */
  byAgent: (agentId: string) => [...sessionsKeys.all(), 'agent', agentId] as const,

  /** All sessions across agents */
  allAcrossAgents: (agentIds: string[]) => 
    [...sessionsKeys.all(), 'all', { agentIds }] as const,

  /** Session messages/transcript */
  messages: (sessionId: string) => 
    [...sessionsKeys.detail(sessionId), 'messages'] as const,

  /** Session receipts */
  receipts: (sessionId: string) => 
    [...sessionsKeys.detail(sessionId), 'receipts'] as const,
};

/**
 * Mutation keys for session operations
 */
export const sessionsMutationKeys = {
  create: () => [...sessionsKeys.all(), 'create'] as const,
  delete: () => [...sessionsKeys.all(), 'delete'] as const,
  deleteByAgent: (agentId: string) => 
    [...sessionsKeys.byAgent(agentId), 'delete'] as const,
  update: (id: string) => [...sessionsKeys.detail(id), 'update'] as const,
};
