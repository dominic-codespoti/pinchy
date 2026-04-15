/**
 * Query key factory for Cron feature
 * 
 * Provides consistent query keys for cron job management.
 * 
 * Usage:
 *   queryKey: cronKeys.all()              // ['cron']
 *   queryKey: cronKeys.lists()            // ['cron', 'list']
 *   queryKey: cronKeys.jobs()             // ['cron', 'jobs']
 *   queryKey: cronKeys.byAgent(agentId)  // ['cron', 'jobs', agentId]
 */

export const cronKeys = {
  /** Base key for all cron queries */
  all: () => ['cron'] as const,

  /** List queries */
  lists: () => [...cronKeys.all(), 'list'] as const,

  /** Job queries */
  jobs: () => [...cronKeys.all(), 'jobs'] as const,
  job: (id: string) => [...cronKeys.jobs(), id] as const,

  /** Agent-specific jobs */
  byAgent: (agentId: string) => [...cronKeys.jobs(), agentId] as const,

  /** Available cron agents */
  agents: () => [...cronKeys.all(), 'agents'] as const,

  /** Execution history */
  history: () => [...cronKeys.all(), 'history'] as const,
  jobHistory: (jobId: string) => [...cronKeys.history(), jobId] as const,
};

/**
 * Mutation keys for cron operations
 */
export const cronMutationKeys = {
  create: () => [...cronKeys.all(), 'create'] as const,
  update: (id: string) => [...cronKeys.job(id), 'update'] as const,
  delete: () => [...cronKeys.all(), 'delete'] as const,
  toggle: (id: string) => [...cronKeys.job(id), 'toggle'] as const,
  trigger: (id: string) => [...cronKeys.job(id), 'trigger'] as const,
};
