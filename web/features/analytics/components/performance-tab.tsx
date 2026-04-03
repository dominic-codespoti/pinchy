'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { ResponseTimeDataPoint, SummaryMetrics, ModelUsage } from '../types';
import { ChartTooltip } from './chart-tooltip';

interface PerformanceTabProps {
  responseTimeData: ResponseTimeDataPoint[];
  summaryMetrics: SummaryMetrics;
  modelUsageData: ModelUsage[];
  loading: boolean;
}

export function PerformanceTab({ responseTimeData, summaryMetrics, modelUsageData, loading }: PerformanceTabProps) {
  // Show empty state when no model data available
  const hasModelData = modelUsageData.length > 0;
  const displayModelData = hasModelData ? modelUsageData : [];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Response Time Trends</CardTitle>
          <div className="flex flex-wrap gap-3 mt-2">
            <div className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
              <span className="text-xs text-muted-foreground">
                Avg: {summaryMetrics.avgResponseTime}ms
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={responseTimeData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  interval="preserveStartEnd"
                  minTickGap={30}
                />
                <YAxis
                  tick={{ fontSize: 10 }}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  allowDecimals={false}
                  label={{
                    value: 'ms',
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  content={({ active, payload, label }) => (
                    <ChartTooltip
                      active={active}
                      payload={payload?.map((p) => ({
                        name: String(p.name || ''),
                        value: p.value as number,
                        color: p.color,
                      }))}
                      label={String(label)}
                      valueFormatter={(value) => `${value}ms`}
                    />
                  )}
                />
                <Area
                  type="monotone"
                  dataKey="avg"
                  name="Average"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="p95"
                  name="p95"
                  stroke="hsl(var(--chart-3))"
                  fill="hsl(var(--chart-3))"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="p99"
                  name="p99"
                  stroke="hsl(var(--chart-4))"
                  fill="hsl(var(--chart-4))"
                  fillOpacity={0.1}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base sm:text-lg">Model Distribution</CardTitle>
          <CardDescription>Usage breakdown by AI model</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[250px] w-full" />
          ) : !hasModelData ? (
            <div className="flex h-[200px] items-center justify-center">
              <p className="text-sm text-muted-foreground">No model usage data available</p>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={displayModelData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {displayModelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload as { name: string; value: number };
                      return (
                        <div className="rounded-lg border bg-background p-2 shadow-sm">
                          <p className="text-sm font-medium">{data.name}</p>
                          <p className="text-xs text-muted-foreground">{data.value}% of requests</p>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                {displayModelData.map((model) => (
                  <div key={model.name} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: model.color }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {model.name} ({model.value}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
