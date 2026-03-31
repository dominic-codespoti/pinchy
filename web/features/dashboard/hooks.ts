import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Activity, Clock, Server } from 'lucide-react';
import { getDashboardAgents, getDashboardCronJobs } from './api';
import { StatItem, DashboardAgent } from './types';

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
  return useQuery<DashboardAgent[], Error>({
    queryKey: ['dashboard', 'agents'],
    queryFn: getDashboardAgents,
    staleTime: 5000,
  });
}

export function useDashboardCronJobs() {
  return useQuery<
    Array<{
      id: string;
      agentId: string;
      schedule: string;
      message: string;
      lastStatus: boolean;
    }>,
    Error
  >({
    queryKey: ['dashboard', 'cron'],
    queryFn: getDashboardCronJobs,
    staleTime: 5000,
  });
}

export function useDashboardStats() {
  const { data: agents, isLoading: agentsLoading } = useDashboardAgents();
  const { data: cronJobs, isLoading: cronJobsLoading } = useDashboardCronJobs();

  const isLoading = agentsLoading || cronJobsLoading;

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

    return {
      totalAgents,
      activeAgents,
      onlineAgents,
      totalCronJobs,
      activeCronJobs,
    };
  }, [agents, cronJobs]);

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
        value: 'Healthy',
        description: 'All services operational',
        icon: Server,
        tone: 'success',
      },
    ],
    [stats]
  );

  return { statItems, agents, isLoading };
}
