'use client';

import { MetricCard } from '@/components/ui/metric-card';
import { Activity, Zap, Coins, Clock } from 'lucide-react';
import { SummaryMetrics, TimeRange } from '../types';

interface AnalyticsMetricsProps {
  metrics: SummaryMetrics;
  timeRange: TimeRange;
  loading: boolean;
}

export function AnalyticsMetrics({ metrics, timeRange, loading }: AnalyticsMetricsProps) {
  const timeLabel = timeRange === '24h' ? 'Last 24h' : timeRange === '7d' ? 'Last 7 days' : 'Last 30 days';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        title="Total Requests"
        value={metrics.totalRequests.toLocaleString()}
        secondaryText={timeLabel}
        icon={Activity}
        accent="blue"
        loading={loading}
        trend={{ direction: 'up', value: '12.5%', positive: true }}
      />
      <MetricCard
        title="Tokens Used"
        value={metrics.totalTokens.toLocaleString()}
        secondaryText="Input + Output tokens"
        icon={Zap}
        accent="violet"
        loading={loading}
        trend={{ direction: 'up', value: '8.2%', positive: true }}
      />
      <MetricCard
        title="Est. Cost"
        value={`$${metrics.totalCost.toFixed(2)}`}
        secondaryText="Based on token usage"
        icon={Coins}
        accent="amber"
        loading={loading}
        trend={{ direction: 'down', value: '3.1%', positive: true }}
      />
      <MetricCard
        title="Avg Response Time"
        value={`${metrics.avgResponseTime}ms`}
        secondaryText="Average across all agents"
        icon={Clock}
        accent="emerald"
        loading={loading}
        trend={{ direction: 'down', value: '5.3%', positive: true }}
      />
    </div>
  );
}
