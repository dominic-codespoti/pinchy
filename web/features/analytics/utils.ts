import { format, subDays, subHours } from 'date-fns';
import {
  TimeRange,
  TokenDataPoint,
  ResponseTimeDataPoint,
  RequestDataPoint,
  AgentPerformance,
  ModelUsage,
} from './types';

export function generateMockData(timeRange: TimeRange): {
  tokenData: TokenDataPoint[];
  responseTimeData: ResponseTimeDataPoint[];
  requestData: RequestDataPoint[];
} {
  const now = new Date();
  const dataPoints = timeRange === '24h' ? 24 : timeRange === '7d' ? 7 : 30;
  const interval = timeRange === '24h' ? 'hour' : 'day';

  const labels = Array.from({ length: dataPoints }, (_, i) => {
    if (interval === 'hour') {
      return format(subHours(now, dataPoints - i - 1), 'HH:mm');
    }
    return format(subDays(now, dataPoints - i - 1), 'MMM d');
  });

  const tokenData = labels.map((time) => ({
    time,
    inputTokens: Math.floor(Math.random() * 50000) + 10000,
    outputTokens: Math.floor(Math.random() * 30000) + 5000,
    cost: Math.random() * 2 + 0.5,
  }));

  const responseTimeData = labels.map((time) => ({
    time,
    avg: Math.floor(Math.random() * 800) + 200,
    p95: Math.floor(Math.random() * 1500) + 800,
    p99: Math.floor(Math.random() * 2500) + 1500,
  }));

  const requestData = labels.map((time) => ({
    time,
    requests: Math.floor(Math.random() * 500) + 50,
    errors: Math.floor(Math.random() * 20),
  }));

  return { tokenData, responseTimeData, requestData };
}

export function generateAgentPerformance(agentIds: string[]): AgentPerformance[] {
  return agentIds.map((id) => ({
    agentId: id,
    requests: Math.floor(Math.random() * 1000) + 100,
    tokens: Math.floor(Math.random() * 500000) + 50000,
    avgResponseTime: Math.floor(Math.random() * 800) + 200,
    cost: Math.random() * 50 + 10,
    successRate: Math.random() * 0.15 + 0.85,
  }));
}

export const modelUsageData: ModelUsage[] = [
  { name: 'GPT-4', value: 45, color: 'hsl(var(--chart-1))' },
  { name: 'GPT-4 Turbo', value: 30, color: 'hsl(var(--chart-2))' },
  { name: 'Claude 3.5', value: 20, color: 'hsl(var(--chart-3))' },
  { name: 'Claude 3 Opus', value: 5, color: 'hsl(var(--chart-4))' },
];
