'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bot, Activity, Clock, Server } from 'lucide-react';
import { STALE_TIME } from '@/lib/query-config';
import { getDashboardAgents, getDashboardCronJobs, getHealth } from './api';
import { StatItem, DashboardAgent, HealthResponse } from './types';
import { dashboardKeys } from './query-keys';

// Helper to get heartbeat status (duplicated from shared for feature isolation)
function getHeartbeatStatus(
  hasHeartbeat?: boolean,
  lastHeartbeatAt?: string
): 'online' | 'offline' | 'stale' | 'unknown' {
  if (hasHeartbeat === undefined) return 'unknown';
  if (!hasHeartbeat) return 'offline';

  if (lastHeartbeatAt) {
    const diffMins = Math.floor(
      (Date.now() - new Date(lastHeartbeatAt).getTime()) / 60000
    );
    if (diffMins > 5) return 'stale';
  }

  return 'online';
}

export function useDashboardAgents() {
  const { data, isLoading, error } = useQuery<DashboardAgent[], Error>({
    queryKey: dashboardKeys.agents(),
    queryFn: getDashboardAgents,
    staleTime: STALE_TIME.SHORT,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load dashboard agents: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

export function useDashboardCronJobs() {
  const { data, isLoading, error } = useQuery<
    Array<{
      id: string;
      agentId: string;
      schedule: string;
      message: string;
      lastStatus: boolean;
    }>,
    Error
  >({
    queryKey: dashboardKeys.cronJobs(),
    queryFn: getDashboardCronJobs,
    staleTime: STALE_TIME.SHORT,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load cron jobs: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

export function useHealth() {
  const { data, isLoading, error } = useQuery<HealthResponse, Error>({
    queryKey: dashboardKeys.health(),
    queryFn: getHealth,
    staleTime: STALE_TIME.SHORT,
    retry: 1,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load system health: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

export function useDashboardStats() {
  const { data: agents, isLoading: agentsLoading } = useDashboardAgents();
  const { data: cronJobs, isLoading: cronJobsLoading } = useDashboardCronJobs();
  const { data: health, isLoading: healthLoading, error: healthError } = useHealth();

  const isLoading = agentsLoading || cronJobsLoading || healthLoading;

  const stats = useMemo(() => {
    const totalAgents = agents?.length ?? 0;
    const activeAgents = agents?.filter((a) => a.status === 'active').length ?? 0;
    const onlineAgents =
      agents?.filter((a) => {
        const status = getHeartbeatStatus(a.hasHeartbeat, a.lastHeartbeatAt);
        return status === 'online';
      }).length ?? 0;
    const totalCronJobs = cronJobs?.length ?? 0;
    const activeCronJobs = cronJobs?.filter((c) => c.lastStatus).length ?? 0;

    // Determine health status from API or error state
    let healthStatus: string;
    let healthTone: 'success' | 'warning' | 'danger' | 'default';
    let healthDescription: string;

    if (healthError) {
      healthStatus = 'Error';
      healthTone = 'danger';
      healthDescription = 'Failed to check system status';
    } else if (!health) {
      healthStatus = 'Unknown';
      healthTone = 'warning';
      healthDescription = 'Status unavailable';
    } else if (health.status === 'ok') {
      healthStatus = 'Healthy';
      healthTone = 'success';
      healthDescription = 'All services operational';
    } else {
      healthStatus = 'Degraded';
      healthTone = 'warning';
      healthDescription = 'Some services may be affected';
    }

    return {
      totalAgents,
      activeAgents,
      onlineAgents,
      totalCronJobs,
      activeCronJobs,
      healthStatus,
      healthTone,
      healthDescription,
    };
  }, [agents, cronJobs, health, healthError]);

  const statItems: StatItem[] = useMemo(
    () => [
      {
        id: 'total-agents',
        title: 'Total Agents',
        value: stats.totalAgents,
        description: `${stats.activeAgents} active`,
        icon: Bot,
      },
      {
        id: 'active-sessions',
        title: 'Online Agents',
        value: stats.onlineAgents,
        description: `${stats.totalAgents} total`,
        icon: Activity,
        tone: stats.onlineAgents > 0 ? 'success' : 'default',
      },
      {
        id: 'cron-jobs',
        title: 'Active Jobs',
        value: stats.activeCronJobs,
        description: `${stats.totalCronJobs} total`,
        icon: Clock,
      },
      {
        id: 'system-status',
        title: 'System Status',
        value: stats.healthStatus,
        description: stats.healthDescription,
        icon: Server,
        tone: stats.healthTone,
      },
    ],
    [stats]
  );

  return { statItems, agents, isLoading };
}
