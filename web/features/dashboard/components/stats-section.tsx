'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { StatItem } from '../types';

interface StatCardProps {
  item: StatItem;
  loading: boolean;
}

function StatCard({ item, loading }: StatCardProps) {
  const Icon = item.icon;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardDescription>{item.title}</CardDescription>
        <Icon className="size-4 text-muted-foreground" data-icon="inline-end" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                'text-2xl font-bold tracking-tight',
                item.tone === 'success' && 'text-green-600 dark:text-green-400',
                item.tone === 'warning' && 'text-amber-600 dark:text-amber-400',
                item.tone === 'danger' && 'text-rose-600 dark:text-rose-400'
              )}
            >
              {item.value}
            </span>
            <span className="text-sm text-muted-foreground">{item.description}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="size-4" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-16" />
      </CardContent>
    </Card>
  );
}

interface StatsSectionProps {
  items: StatItem[];
  loading: boolean;
}

export function StatsSection({ items, loading }: StatsSectionProps) {
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {loading
        ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        : items.map((item) => <StatCard key={item.id} item={item} loading={loading} />)}
    </section>
  );
}
