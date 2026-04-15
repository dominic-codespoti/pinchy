'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';

const accentVariants = cva(
  'rounded-lg p-2.5 flex items-center justify-center',
  {
    variants: {
      accent: {
        blue: 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/15',
        green: 'bg-green-500/10 text-green-500 dark:bg-green-500/15',
        violet: 'bg-violet-500/10 text-violet-500 dark:bg-violet-500/15',
        amber: 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/15',
        rose: 'bg-rose-500/10 text-rose-500 dark:bg-rose-500/15',
        emerald: 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/15',
      },
    },
    defaultVariants: {
      accent: 'blue',
    },
  }
);

const valueToneVariants = cva('', {
  variants: {
    tone: {
      default: 'text-foreground',
      success: 'text-green-600 dark:text-green-400',
      warning: 'text-amber-600 dark:text-amber-400',
      danger: 'text-rose-600 dark:text-rose-400',
      info: 'text-blue-600 dark:text-blue-400',
    },
  },
  defaultVariants: {
    tone: 'default',
  },
});

export interface MetricCardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof accentVariants>,
    VariantProps<typeof valueToneVariants> {
  title: string;
  value: string | number;
  secondaryText?: string;
  icon: LucideIcon;
  loading?: boolean;
  trend?: {
    direction: 'up' | 'down';
    value: string;
    positive?: boolean;
  };
}

export function MetricCard({
  title,
  value,
  secondaryText,
  icon: Icon,
  accent = 'blue',
  tone = 'default',
  loading = false,
  trend,
  className,
  ...props
}: MetricCardProps) {
  if (loading) {
    return (
      <Card
        className={cn(
          'relative overflow-hidden transition-shadow duration-200',
          className
        )}
        {...props}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-10 w-10 rounded-lg" />
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        'relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
        className
      )}
      {...props}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={cn(accentVariants({ accent }))}>
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-baseline gap-2">
          <span className={cn('text-2xl font-bold tracking-tight', valueToneVariants({ tone }))}>
            {value}
          </span>
          {trend && (
            <div
              className={cn(
                'flex items-center gap-0.5 text-xs font-medium',
                trend.positive ? 'text-green-600 dark:text-green-400' : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {trend.direction === 'up' ? (
                <TrendingUp className="h-3.5 w-3.5" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5" />
              )}
              <span>{trend.value}</span>
            </div>
          )}
        </div>
        {secondaryText && (
          <p className="text-xs text-muted-foreground mt-1">{secondaryText}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function MetricCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-10 rounded-lg" />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-4 w-32" />
      </CardContent>
    </Card>
  );
}
