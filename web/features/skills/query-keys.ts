/**
 * Query key factory for Skills feature
 * 
 * Provides consistent query keys for skill management.
 * 
 * Usage:
 *   queryKey: skillsKeys.all()        // ['skills']
 *   queryKey: skillsKeys.lists()      // ['skills', 'list']
 *   queryKey: skillsKeys.detail(name) // ['skills', 'detail', name]
 */

export const skillsKeys = {
  /** Base key for all skills queries */
  all: () => ['skills'] as const,

  /** List queries */
  lists: () => [...skillsKeys.all(), 'list'] as const,

  /** Detail queries */
  details: () => [...skillsKeys.all(), 'detail'] as const,
  detail: (name: string) => [...skillsKeys.details(), name] as const,

  /** Skill manifest/content */
  manifest: (name: string) => [...skillsKeys.detail(name), 'manifest'] as const,

  /** Active/enabled skills per agent */
  byAgent: (agentId: string) => [...skillsKeys.all(), 'agent', agentId] as const,

  /** Skill categories/tags */
  categories: () => [...skillsKeys.all(), 'categories'] as const,
};

/**
 * Mutation keys for skill operations
 */
export const skillsMutationKeys = {
  create: () => [...skillsKeys.all(), 'create'] as const,
  update: (name: string) => [...skillsKeys.detail(name), 'update'] as const,
  delete: () => [...skillsKeys.all(), 'delete'] as const,
  enable: (name: string) => [...skillsKeys.detail(name), 'enable'] as const,
};
