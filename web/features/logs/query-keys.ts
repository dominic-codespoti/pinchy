/**
 * Query key factory for Logs feature
 * 
 * Provides consistent query keys for log queries.
 * 
 * Usage:
 *   queryKey: logsKeys.all()                    // ['logs']
 *   queryKey: logsKeys.system()                 // ['logs', 'system']
 *   queryKey: logsKeys.recent()                 // ['logs', 'recent']
 *   queryKey: logsKeys.agent(agentId)           // ['logs', 'agent', agentId]
 *   queryKey: logsKeys.agentWithLimit(id, 100)  // ['logs', 'agent', id, { limit: 100 }]
 */

export const logsKeys = {
  /** Base key for all logs queries */
  all: () => ['logs'] as const,

  /** System logs */
  system: () => [...logsKeys.all(), 'system'] as const,
  systemWithLimit: (limit?: number) => [...logsKeys.system(), { limit }] as const,

  /** Recent logs (from in-memory buffer) */
  recent: () => [...logsKeys.all(), 'recent'] as const,
  recentWithLimit: (limit?: number) => [...logsKeys.recent(), { limit }] as const,

  /** Agent-specific logs */
  agent: (agentId: string) => [...logsKeys.all(), 'agent', agentId] as const,
  agentWithLimit: (agentId: string, limit?: number) => 
    [...logsKeys.agent(agentId), { limit }] as const,

  /** Session-specific logs */
  session: (sessionId: string) => [...logsKeys.all(), 'session', sessionId] as const,
};
