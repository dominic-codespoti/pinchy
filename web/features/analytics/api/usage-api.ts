import { format, subDays } from 'date-fns';
import { TimeRange, UsageBucket, UsageApiResponse } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export async function getUsage(
  timeRange: TimeRange,
  agent?: string,
  model?: string
): Promise<UsageApiResponse> {
  const params = new URLSearchParams();

  // Convert timeRange to from/to dates
  const to = format(new Date(), 'yyyy-MM-dd');
  const from = format(
    timeRange === '24h' ? subDays(new Date(), 1) : timeRange === '7d' ? subDays(new Date(), 7) : subDays(new Date(), 30),
    'yyyy-MM-dd'
  );

  params.set('from', from);
  params.set('to', to);
  if (agent) params.set('agent', agent);
  if (model) params.set('model', model);

  const response = await fetch(`${API_BASE}/api/usage?${params.toString()}`);

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Transform backend usage buckets into time-series data grouped by day.
 * Since the backend aggregates by (day, agent, model), we roll up to day level.
 */
export function transformUsageData(buckets: UsageBucket[]) {
  // Group by day
  const byDay = new Map<string, UsageBucket[]>();

  for (const bucket of buckets) {
    const existing = byDay.get(bucket.day) || [];
    existing.push(bucket);
    byDay.set(bucket.day, existing);
  }

  // Sort days
  const sortedDays = Array.from(byDay.keys()).sort();

  // Build time-series data
  const tokenData = sortedDays.map((day) => {
    const dayBuckets = byDay.get(day) || [];
    const inputTokens = dayBuckets.reduce((sum, b) => sum + b.prompt_tokens, 0);
    const outputTokens = dayBuckets.reduce((sum, b) => sum + b.completion_tokens, 0);
    const cost = dayBuckets.reduce((sum, b) => sum + b.estimated_cost_usd, 0);

    return {
      time: day,
      inputTokens,
      outputTokens,
      cost,
    };
  });

  const requestData = sortedDays.map((day) => {
    const dayBuckets = byDay.get(day) || [];
    const requests = dayBuckets.reduce((sum, b) => sum + b.turns, 0);

    return {
      time: day,
      requests,
      errors: 0, // Backend doesn't track errors separately yet
    };
  });

  // For response time, we don't have per-request data from backend
  // Return empty array - the performance tab will handle this
  const responseTimeData: Array<{ time: string; avg: number; p95: number; p99: number }> = [];

  // Agent performance - aggregate by agent across all days
  const byAgent = new Map<string, UsageBucket[]>();
  for (const bucket of buckets) {
    const existing = byAgent.get(bucket.agent) || [];
    existing.push(bucket);
    byAgent.set(bucket.agent, existing);
  }

  const agentPerformance = Array.from(byAgent.entries()).map(([agentId, agentBuckets]) => {
    const requests = agentBuckets.reduce((sum, b) => sum + b.turns, 0);
    const tokens = agentBuckets.reduce((sum, b) => sum + b.total_tokens, 0);
    const cost = agentBuckets.reduce((sum, b) => sum + b.estimated_cost_usd, 0);

    return {
      agentId,
      requests,
      tokens,
      avgResponseTime: 0, // Not available from backend
      cost,
      successRate: 1, // Not tracked by backend, default to 100%
    };
  });

  // Model distribution - aggregate by model
  const byModel = new Map<string, number>();
  let totalTurns = 0;
  for (const bucket of buckets) {
    const current = byModel.get(bucket.model) || 0;
    byModel.set(bucket.model, current + bucket.turns);
    totalTurns += bucket.turns;
  }

  const modelUsageData = Array.from(byModel.entries()).map(([name, turns], index) => ({
    name: name || 'Unknown',
    value: totalTurns > 0 ? Math.round((turns / totalTurns) * 100) : 0,
    color: `hsl(var(--chart-${(index % 5) + 1}))`,
  }));

  // Summary metrics
  const totalRequests = buckets.reduce((sum, b) => sum + b.turns, 0);
  const totalTokens = buckets.reduce((sum, b) => sum + b.total_tokens, 0);
  const totalCost = buckets.reduce((sum, b) => sum + b.estimated_cost_usd, 0);

  return {
    tokenData,
    responseTimeData,
    requestData,
    agentPerformance,
    modelUsageData,
    summaryMetrics: {
      totalRequests,
      totalTokens,
      totalCost,
      avgResponseTime: 0, // Not available from backend
    },
  };
}
