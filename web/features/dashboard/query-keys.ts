/**
 * Query key factory for Dashboard feature
 * 
 * Provides consistent query keys for dashboard data.
 * 
 * Usage:
 *   queryKey: dashboardKeys.all()              // ['dashboard']
 *   queryKey: dashboardKeys.agents()            // ['dashboard', 'agents']
 *   queryKey: dashboardKeys.cronJobs()          // ['dashboard', 'cronJobs']
 *   queryKey: dashboardKeys.health()            // ['dashboard', 'health']
 */

export const dashboardKeys = {
  /** Base key for all dashboard queries */
  all: () => ['dashboard'] as const,

  /** Dashboard agents (summary view) */
  agents: () => [...dashboardKeys.all(), 'agents'] as const,

  /** Dashboard cron jobs */
  cronJobs: () => [...dashboardKeys.all(), 'cronJobs'] as const,

  /** System health */
  health: () => [...dashboardKeys.all(), 'health'] as const,

  /** Stats aggregation (combines multiple queries) */
  stats: () => [...dashboardKeys.all(), 'stats'] as const,
};
