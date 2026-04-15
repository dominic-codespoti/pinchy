'use client';

import * as React from 'react';
import { useMemo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { DashboardAgent } from '../types';
import { FALLBACKS } from '@/lib/constants/fallbacks';

interface ChartsSectionProps extends React.HTMLAttributes<HTMLElement> {
  agents: DashboardAgent[] | undefined;
  loading: boolean;
}

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

function useModelDistribution(agents: DashboardAgent[] | undefined) {
  const data = useMemo(() => {
    if (!agents?.length) return [];

    const modelCounts = new Map<string, number>();

    agents.forEach((agent) => {
      const model = agent.config.model || FALLBACKS.MODEL;
      modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
    });

    return Array.from(modelCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [agents]);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  return { data, total };
}

export const ChartsSection = React.forwardRef<HTMLElement, ChartsSectionProps>(
  ({ agents, loading, className, ...props }, ref) => {
    const { data, total } = useModelDistribution(agents);
    const displayData = data.slice(0, 5);

    return (
      <section ref={ref} className={cn('grid gap-6 md:grid-cols-2', className)} {...props}>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Model Distribution</CardTitle>
            <CardDescription>Agents by model type</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : data.length === 0 ? (
              <div className="flex h-40 items-center justify-center">
                <p className="text-sm text-muted-foreground">No model data available</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-3">
                  {displayData.map((entry, index) => (
                    <div key={entry.name} className="flex items-center gap-2">
                      <div
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm text-muted-foreground">{entry.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {entry.value}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total: {total} agents across {data.length} models
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Agent Overview</CardTitle>
            <CardDescription>Quick stats summary</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : agents ? (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Total Agents</span>
                  <span className="font-medium">{agents.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Active</span>
                  <span className="font-medium">
                    {agents.filter((a) => a.status === 'active').length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">With Heartbeat</span>
                  <span className="font-medium">
                    {agents.filter((a) => a.hasHeartbeat).length}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No data available</p>
            )}
          </CardContent>
        </Card>
      </section>
    );
  }
);

ChartsSection.displayName = 'ChartsSection';
