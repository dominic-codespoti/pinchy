'use client';

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HeartbeatIndicator, HeartbeatStatus, formatTimeSince, getHeartbeatStatus } from './heartbeat-indicator';

export { getHeartbeatStatus, formatTimeSince };

const statusConfig: Record<HeartbeatStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  online: { variant: 'default', label: 'Online' },
  offline: { variant: 'destructive', label: 'Offline' },
  stale: { variant: 'secondary', label: 'Stale' },
  unknown: { variant: 'outline', label: 'Unknown' },
};

const statusTextColors: Record<HeartbeatStatus, string> = {
  online: 'text-emerald-600 dark:text-emerald-400',
  offline: 'text-red-600 dark:text-red-400',
  stale: 'text-amber-600 dark:text-amber-400',
  unknown: 'text-muted-foreground',
};

interface HeartbeatBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: HeartbeatStatus;
  lastSeen?: string;
  showTooltip?: boolean;
  showIndicator?: boolean;
  pulseIndicator?: boolean;
}

export function HeartbeatBadge({
  status,
  lastSeen,
  showTooltip = true,
  showIndicator = true,
  pulseIndicator = true,
  className,
  ...props
}: HeartbeatBadgeProps) {
  const config = statusConfig[status];
  
  const content = (
    <Badge variant={config.variant} className={cn('gap-1.5', className)} {...props}>
      {showIndicator && (
        <HeartbeatIndicator
          status={status}
          size="sm"
          showTooltip={false}
          className={cn(!pulseIndicator && 'animate-none')}
        />
      )}
      <span>{config.label}</span>
    </Badge>
  );

  if (!showTooltip) return content;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">
              Last seen: {formatTimeSince(lastSeen)}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Simplified version for compact displays (e.g., table cells)
interface HeartbeatBadgeCompactProps {
  status: HeartbeatStatus;
  lastSeen?: string;
  className?: string;
}

export function HeartbeatBadgeCompact({
  status,
  lastSeen,
  className,
}: HeartbeatBadgeCompactProps) {
  const config = statusConfig[status];

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1.5', className)}>
            <HeartbeatIndicator status={status} size="sm" showTooltip={false} />
            <span className={cn('text-xs font-medium', statusTextColors[status])}>
              {config.label}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">
              Last seen: {formatTimeSince(lastSeen)}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
