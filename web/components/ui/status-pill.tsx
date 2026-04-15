'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const statusPillVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        online:
          'border-emerald-500/20 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400',
        offline:
          'border-slate-500/20 bg-slate-100 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-400',
        degraded:
          'border-amber-500/20 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-400',
        error:
          'border-rose-500/20 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400',
        unknown:
          'border-slate-500/20 bg-slate-100 text-slate-600 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-400',
        pending:
          'border-blue-500/20 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400',
      },
    },
    defaultVariants: {
      variant: 'unknown',
    },
  }
);

const dotVariants = cva('rounded-full', {
  variants: {
    variant: {
      online: 'bg-emerald-500',
      offline: 'bg-slate-500',
      degraded: 'bg-amber-500',
      error: 'bg-rose-500',
      unknown: 'bg-slate-400',
      pending: 'bg-blue-500',
    },
  },
  defaultVariants: {
    variant: 'unknown',
  },
});

const pulseVariants = cva('rounded-full opacity-75 animate-ping', {
  variants: {
    variant: {
      online: 'bg-emerald-400',
      offline: 'bg-slate-400',
      degraded: 'bg-amber-400',
      error: 'bg-rose-400',
      unknown: 'bg-slate-300',
      pending: 'bg-blue-400',
    },
  },
  defaultVariants: {
    variant: 'unknown',
  },
});

export type StatusPillVariant = 'online' | 'offline' | 'degraded' | 'error' | 'unknown' | 'pending';

const statusLabels: Record<StatusPillVariant, string> = {
  online: 'Online',
  offline: 'Offline',
  degraded: 'Degraded',
  error: 'Error',
  unknown: 'Unknown',
  pending: 'Pending',
};

interface StatusPillProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof statusPillVariants> {
  pulse?: boolean;
  showLabel?: boolean;
  label?: string;
}

function StatusPill({
  className,
  variant,
  pulse = false,
  showLabel = true,
  label,
  ...props
}: StatusPillProps) {
  const dotSizeClasses = showLabel ? 'h-1.5 w-1.5' : 'h-2 w-2';
  const currentVariant = variant || 'unknown';

  return (
    <span
      className={cn(statusPillVariants({ variant }), className)}
      {...props}
    >
      <span className={cn('relative inline-flex', dotSizeClasses)}>
        <span
          className={cn(
            'absolute inset-0',
            pulse && 'animate-ping',
            pulse && pulseVariants({ variant })
          )}
          style={{ animationDuration: pulse ? '2s' : undefined }}
        />
        <span className={cn('relative inline-flex rounded-full', dotSizeClasses, dotVariants({ variant }))} />
      </span>
      {showLabel && <span>{label || statusLabels[currentVariant]}</span>}
    </span>
  );
}

export { StatusPill, statusPillVariants, statusLabels };
export type { StatusPillProps };
