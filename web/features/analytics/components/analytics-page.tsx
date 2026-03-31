'use client';

import { useState, useMemo } from 'react';
import { PageContainer } from '@/shared/components/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Clock, Users } from 'lucide-react';
import { TimeRange, SummaryMetrics } from '../types';
import { generateMockData, generateAgentPerformance } from '../utils';
import { useAgents } from '../hooks';
import { AnalyticsHeader } from './analytics-header';
import { AnalyticsMetrics } from './analytics-metrics';
import { UsageTab } from './usage-tab';
import { PerformanceTab } from './performance-tab';
import { AgentsBreakdownTab } from './agents-breakdown-tab';

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [isLoading, setIsLoading] = useState(false);
  const { data: agents, isLoading: agentsLoading } = useAgents();

  const { tokenData, responseTimeData, requestData } = useMemo(
    () => generateMockData(timeRange),
    [timeRange]
  );

  const agentPerformance = useMemo(() => {
    if (!agents) return [];
    return generateAgentPerformance(agents.map((a) => a.id));
  }, [agents]);

  const summaryMetrics: SummaryMetrics = useMemo(() => {
    const totalRequests = requestData.reduce((sum, d) => sum + d.requests, 0);
    const totalTokens = tokenData.reduce(
      (sum, d) => sum + d.inputTokens + d.outputTokens,
      0
    );
    const totalCost = tokenData.reduce((sum, d) => sum + d.cost, 0);
    const avgResponseTime = Math.round(
      responseTimeData.reduce((sum, d) => sum + d.avg, 0) / responseTimeData.length
    );

    return {
      totalRequests,
      totalTokens,
      totalCost,
      avgResponseTime,
    };
  }, [tokenData, responseTimeData, requestData]);

  const handleTimeRangeChange = (value: TimeRange) => {
    setIsLoading(true);
    setTimeRange(value);
    setTimeout(() => setIsLoading(false), 300);
  };

  const loading = isLoading || agentsLoading;

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
