'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const toneVariants = cva('', {
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

export interface InfoRow {
  label: string;
  value: string | number;
  tone?: VariantProps<typeof toneVariants>['tone'];
}

export interface InfoBlockProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  badge?: {
    text: string;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline';
  };
  rows: InfoRow[];
  loading?: boolean;
}

export function InfoBlock({
  title,
  badge,
  rows,
  loading = false,
  className,
  ...props
}: InfoBlockProps) {
  if (loading) {
    return (
      <Card className={cn('overflow-hidden', className)} {...props}>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-5 w-16 rounded-md" />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn('overflow-hidden', className)} {...props}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {badge && (
            <Badge variant={badge.variant || 'secondary'} className="text-xs">
              {badge.text}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-1.5 border-b border-border/50 last:border-0"
            >
              <span className="text-sm text-muted-foreground">{row.label}</span>
              <span className={cn('text-sm font-medium', toneVariants({ tone: row.tone }))}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function InfoBlockSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-5 w-16 rounded-md" />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
