'use client';

import * as React from 'react';
import { formatRelativeTime } from '@/shared/lib/date-utils';
import { cn } from '@/shared/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export type HeartbeatStatus = 'online' | 'offline' | 'stale' | 'unknown';

interface HeartbeatIndicatorProps {
  status: HeartbeatStatus;
  lastSeen?: string;
  size?: 'sm' | 'md' | 'lg';
  showTooltip?: boolean;
  className?: string;
}

const statusStyles = {
  online: 'bg-emerald-500',
  offline: 'bg-red-500',
  stale: 'bg-amber-500',
  unknown: 'bg-muted',
} as const;

const pulseStyles = {
  online: 'bg-emerald-400',
  offline: 'bg-red-400',
  stale: 'bg-amber-400',
  unknown: 'bg-muted-foreground',
} as const;

const statusLabels: Record<HeartbeatStatus, string> = {
  online: 'Online',
  offline: 'Offline',
  stale: 'Stale',
  unknown: 'Unknown',
};

const sizeClasses = {
  sm: 'h-2 w-2',
  md: 'h-3 w-3',
  lg: 'h-4 w-4',
} as const;

export function formatTimeSince(dateString?: string): string {
  if (!dateString) return 'Never';
  return formatRelativeTime(dateString, { capitalize: true });
}

export function getHeartbeatStatus(
  hasHeartbeat?: boolean,
  lastHeartbeatAt?: string
): HeartbeatStatus {
  if (hasHeartbeat === undefined) return 'unknown';
  if (!hasHeartbeat) return 'offline';

  if (lastHeartbeatAt) {
    const diffMins = Math.floor((Date.now() - new Date(lastHeartbeatAt).getTime()) / 60000);
    if (diffMins > 5) return 'stale';
  }

  return 'online';
}

export function HeartbeatIndicator({
  status,
  lastSeen,
  size = 'md',
  showTooltip = true,
  className,
}: HeartbeatIndicatorProps) {
  const indicator = (
    <span
      className={cn(
        'relative inline-flex rounded-full',
        sizeClasses[size],
        statusStyles[status],
        status === 'online' && 'animate-pulse',
        className
      )}
    >
      {status === 'online' && (
        <span
          className={cn(
            'absolute inset-0 rounded-full opacity-75 animate-ping',
            pulseStyles[status]
          )}
          style={{ animationDuration: '2s' }}
        />
      )}
    </span>
  );

  if (!showTooltip) return indicator;

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{indicator}</TooltipTrigger>
        <TooltipContent side="top">
          <div className="space-y-1">
            <p className="font-medium">{statusLabels[status]}</p>
            <p className="text-xs text-muted-foreground">
              Last seen: {formatTimeSince(lastSeen)}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
