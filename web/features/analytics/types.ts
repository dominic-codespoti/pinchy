export type TimeRange = '24h' | '7d' | '30d';

// Extended TimeRange to include 'custom'
export type ExtendedTimeRange = TimeRange | 'custom';

// ============================================================================
// API Types
// ============================================================================

export interface UsageBucket {
  day: string;
  agent: string;
  model: string;
  turns: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface UsageApiResponse {
  usage: UsageBucket[];
  total_cost_usd: number;
  total_turns: number;
}

// ============================================================================
// Chart Data Types
// ============================================================================

export interface TokenDataPoint {
  time: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface ResponseTimeDataPoint {
  time: string;
  avg: number;
  p95: number;
  p99: number;
}

export interface RequestDataPoint {
  time: string;
  requests: number;
  errors: number;
}

export interface AgentPerformance {
  agentId: string;
  requests: number;
  tokens: number;
  avgResponseTime: number;
  cost: number;
  successRate: number;
}

export interface ModelUsage {
  name: string;
  value: number;
  color: string;
}

export interface SummaryMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  avgResponseTime: number;
}

export interface MockData {
  tokenData: TokenDataPoint[];
  responseTimeData: ResponseTimeDataPoint[];
  requestData: RequestDataPoint[];
}

// Extended types with computed properties for components
export interface AgentPerformanceWithComputed {
  agentId: string;
  requests: number;
  totalRequests: number;
  tokens: number;
  totalTokens: number;
  avgResponseTime: number;
  cost: number;
  estimatedCost: number;
  successRate: number;
}

export interface TokenDataPointWithComputed {
  time: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
}

export interface ModelUsageWithComputed {
  name: string;
  value: number;
  color: string;
  model: string;
  totalRequests: number;
  successRate: number;
  avgResponseTime: number;
  p95ResponseTime: number;
  tokenEfficiency: number;
  avgInputTokens: number;
  avgOutputTokens: number;
}

export interface ResponseTimeDataPointWithTimestamp {
  time: string;
  timestamp: string;
  avg: number;
  p95: number;
  p99: number;
}

// Analytics filters and export options
export interface AnalyticsFilters {
  timeRange: ExtendedTimeRange;
  agentId?: string;
  model?: string;
  startDate?: Date;
  endDate?: Date;
}

export interface ExportOptions {
  format: 'csv' | 'json';
  dataType: 'all' | 'responseTime' | 'tokenUsage' | 'modelComparison';
  timeRange: ExtendedTimeRange;
}
