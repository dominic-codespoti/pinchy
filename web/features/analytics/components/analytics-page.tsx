'use client';

import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Clock, Users } from 'lucide-react';
import { TimeRange, SummaryMetrics } from '../types';
import { useAgents, useUsage } from '../hooks';
import { AnalyticsHeader } from './analytics-header';
import { AnalyticsMetrics } from './analytics-metrics';
import { UsageTab } from './usage-tab';
import { PerformanceTab } from './performance-tab';
import { AgentsBreakdownTab } from './agents-breakdown-tab';

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: usageData, isLoading: usageLoading, error: usageError } = useUsage(timeRange);

  const handleTimeRangeChange = (value: TimeRange) => {
    setTimeRange(value);
  };

  const loading = usageLoading || agentsLoading;

  // Use real data when available, fallback to empty arrays when loading
  const tokenData = usageData?.tokenData ?? [];
  const requestData = usageData?.requestData ?? [];
  const responseTimeData = usageData?.responseTimeData ?? [];
  const agentPerformance = usageData?.agentPerformance ?? [];
  const modelUsageData = usageData?.modelUsageData ?? [];
  const summaryMetrics: SummaryMetrics = usageData?.summaryMetrics ?? {
    totalRequests: 0,
    totalTokens: 0,
    totalCost: 0,
    avgResponseTime: 0,
  };

  return (
    <PageContainer className="space-y-6">
      <AnalyticsHeader timeRange={timeRange} onTimeRangeChange={handleTimeRangeChange} />

      <AnalyticsMetrics metrics={summaryMetrics} timeRange={timeRange} loading={loading} />

      <Tabs defaultValue="usage" className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Usage
          </TabsTrigger>
          <TabsTrigger value="performance" className="gap-2">
            <Clock className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-2">
            <Users className="h-4 w-4" />
            Agent Breakdown
          </TabsTrigger>
        </TabsList>

        <TabsContent value="usage" className="space-y-4">
          <UsageTab
            tokenData={tokenData}
            requestData={requestData}
            summaryMetrics={summaryMetrics}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <PerformanceTab
            responseTimeData={responseTimeData}
            summaryMetrics={summaryMetrics}
            modelUsageData={modelUsageData}
            loading={loading}
          />
        </TabsContent>

        <TabsContent value="agents" className="space-y-4">
          <AgentsBreakdownTab agentPerformance={agentPerformance} loading={loading} />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
