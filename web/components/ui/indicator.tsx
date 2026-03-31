'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const indicatorVariants = cva('relative inline-flex rounded-full', {
  variants: {
    variant: {
      online: 'bg-emerald-500',
      offline: 'bg-slate-500',
      degraded: 'bg-amber-500',
      error: 'bg-rose-500',
      unknown: 'bg-slate-400',
      pending: 'bg-blue-500',
    },
    size: {
      sm: 'h-2 w-2',
      md: 'h-3 w-3',
      lg: 'h-4 w-4',
    },
  },
  defaultVariants: {
    variant: 'unknown',
    size: 'md',
  },
});

const pulseRingVariants = cva('absolute inset-0 rounded-full opacity-75 animate-ping', {
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

export type IndicatorVariant = 'online' | 'offline' | 'degraded' | 'error' | 'unknown' | 'pending';

interface IndicatorProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof indicatorVariants> {
  pulse?: boolean;
}

function Indicator({
  className,
  variant,
  size,
  pulse = false,
  ...props
}: IndicatorProps) {
  return (
    <span
      className={cn(indicatorVariants({ variant, size }), className)}
      {...props}
    >
      {pulse && (
        <span
          className={cn(
            'absolute inset-0 rounded-full opacity-75 animate-ping',
            pulseRingVariants({ variant })
          )}
          style={{ animationDuration: '2s' }}
        />
      )}
    </span>
  );
}

export { Indicator, indicatorVariants };
export type { IndicatorProps };
