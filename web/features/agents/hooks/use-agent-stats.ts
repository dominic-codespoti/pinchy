/**
 * useAgentStats Hook
 *
 * Hook for calculating agent statistics.
 * Uses useMemo for performance optimization.
 */

'use client';

import { useMemo } from 'react';
import { Agent } from '../types';
import { AgentStats } from '../store/types';

export interface UseAgentStatsOptions {
  agents: Agent[];
}

export interface UseAgentStatsResult extends AgentStats {
  // Additional derived stats
  averageSessionsPerAgent: number;
  averageCronJobsPerAgent: number;
  providers: Record<string, number>;
  models: Record<string, number>;
  recentlyActive: Agent[]; // Active in last 24h
  staleAgents: Agent[]; // No activity in 7 days
}

export function useAgentStats({
  agents,
}: UseAgentStatsOptions): UseAgentStatsResult {
  return useMemo(() => {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    // -------------------------------------------------------------------------
    // Basic Counts
    // -------------------------------------------------------------------------
    const total = agents.length;
    const active = agents.filter((a) => a.status === 'active').length;
    const inactive = agents.filter((a) => a.status === 'inactive').length;
    const error = agents.filter((a) => a.status === 'error').length;
    const withHeartbeat = agents.filter((a) => a.hasHeartbeat).length;
    const withoutHeartbeat = total - withHeartbeat;

    // -------------------------------------------------------------------------
    // Aggregated Stats
    // -------------------------------------------------------------------------
    const totalSessions = agents.reduce(
      (sum, a) => sum + (a.sessionCount || 0),
      0
    );
    const totalCronJobs = agents.reduce(
      (sum, a) => sum + (a.cronJobsCount || 0),
      0
    );

    // -------------------------------------------------------------------------
    // Derived Stats
    // -------------------------------------------------------------------------
    const averageSessionsPerAgent =
      total > 0 ? Math.round((totalSessions / total) * 10) / 10 : 0;
    const averageCronJobsPerAgent =
      total > 0 ? Math.round((totalCronJobs / total) * 10) / 10 : 0;

    // -------------------------------------------------------------------------
    // Provider/Model Distribution
    // -------------------------------------------------------------------------
    const providers: Record<string, number> = {};
    const models: Record<string, number> = {};

    for (const agent of agents) {
      // Provider count
      const provider = agent.config.provider || 'unknown';
      providers[provider] = (providers[provider] || 0) + 1;

      // Model count
      const model = agent.config.model || 'default';
      models[model] = (models[model] || 0) + 1;
    }

    // -------------------------------------------------------------------------
    // Activity Analysis
    // -------------------------------------------------------------------------
    const recentlyActive = agents.filter((a) => {
      if (!a.lastHeartbeatAt) return false;
      return new Date(a.lastHeartbeatAt).getTime() > oneDayAgo;
    });

    const staleAgents = agents.filter((a) => {
      if (!a.lastHeartbeatAt) {
        // Check creation date as fallback
        return new Date(a.createdAt).getTime() < sevenDaysAgo;
      }
      return new Date(a.lastHeartbeatAt).getTime() < sevenDaysAgo;
    });

    // -------------------------------------------------------------------------
    // Return Result
    // -------------------------------------------------------------------------
    return {
      // Basic counts
      total,
      active,
      inactive,
      error,
      withHeartbeat,
      withoutHeartbeat,
      totalSessions,
      totalCronJobs,

      // Derived stats
      averageSessionsPerAgent,
      averageCronJobsPerAgent,
      providers,
      models,
      recentlyActive,
      staleAgents,
    };
  }, [agents]);
}
