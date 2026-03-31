'use client';

import { PageContainer } from '@/shared/components/page-container';
import { useDashboardStats } from '../hooks';
import { StatsSection } from './stats-section';
import { RecentAgentsTable } from './recent-agents-table';
import { TopAgentsTable } from './top-agents-table';
import { ChartsSection } from './charts-section';
import { ActivityFeed } from './activity-feed';

function PageHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
    </div>
  );
}

export function DashboardPage() {
  const { statItems, agents, isLoading } = useDashboardStats();

  return (
    <PageContainer className="space-y-6">
      <PageHeader title="Dashboard" />
      <StatsSection items={statItems} loading={isLoading} />
      <div className="grid gap-6 lg:grid-cols-2">
        <RecentAgentsTable agents={agents} loading={isLoading} />
        <TopAgentsTable agents={agents} loading={isLoading} />
      </div>
      <ChartsSection agents={agents} loading={isLoading} />
      <ActivityFeed loading={isLoading} />
    </PageContainer>
  );
}
