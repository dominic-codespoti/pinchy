'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSystemStats } from '../hooks';
import { formatBytes, formatDuration } from '@/shared/lib/format';
import { Bot, MessageSquare, History, Database, Clock } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: React.ReactNode;
  loading?: boolean;
}

function StatCard({ title, value, description, icon, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-7 w-20" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function SystemStats() {
  const { data: stats, isLoading } = useSystemStats();

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <StatCard
        title="Total Agents"
        value={stats?.totalAgents ?? 0}
        description="Active and inactive agents"
        icon={<Bot className="h-4 w-4 text-muted-foreground" />}
        loading={isLoading}
      />
      <StatCard
        title="Total Sessions"
        value={stats?.totalSessions ?? 0}
        description="All recorded sessions"
        icon={<History className="h-4 w-4 text-muted-foreground" />}
        loading={isLoading}
      />
      <StatCard
        title="Total Messages"
        value={stats?.totalMessages ?? 0}
        description="Messages across all sessions"
        icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />}
        loading={isLoading}
      />
      <StatCard
        title="Storage Usage"
        value={stats ? formatBytes(stats.storageUsage) : '0 B'}
        description="Database and file storage"
        icon={<Database className="h-4 w-4 text-muted-foreground" />}
        loading={isLoading}
      />
      <StatCard
        title="Uptime"
        value={stats ? formatDuration(stats.uptime) : '0m'}
        description="System uptime"
        icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        loading={isLoading}
      />
    </div>
  );
}
