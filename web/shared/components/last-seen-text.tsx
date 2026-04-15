'use client';

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatTimeSince, HeartbeatStatus } from './heartbeat-indicator';

interface LastSeenTextProps {
  timestamp?: string;
  status?: HeartbeatStatus;
  showIcon?: boolean;
  className?: string;
  tooltipPrefix?: string;
}

const statusIcons: Record<HeartbeatStatus, string> = {
  online: '●',
  offline: '○',
  stale: '◐',
  unknown: '?',
};

const statusColors: Record<HeartbeatStatus, string> = {
  online: 'text-emerald-600 dark:text-emerald-400',
  offline: 'text-red-600 dark:text-red-400',
  stale: 'text-amber-600 dark:text-amber-400',
  unknown: 'text-gray-500 dark:text-gray-400',
};

export function LastSeenText({
  timestamp,
  status,
  showIcon = false,
  className,
  tooltipPrefix = 'Last heartbeat',
}: LastSeenTextProps) {
  const timeText = formatTimeSince(timestamp);
  
  const content = (
    <span className={cn('text-sm text-muted-foreground', className)}>
      {showIcon && status && (
        <span className={cn('mr-1.5', statusColors[status])}>
          {statusIcons[status]}
        </span>
      )}
      {timeText}
    </span>
  );

  if (!timestamp) {
    return content;
  }

  const fullDate = new Date(timestamp).toLocaleString();

  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="top" align="center">
          <p className="text-xs">
            {tooltipPrefix}: {fullDate}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Relative time display that auto-updates
interface LiveLastSeenProps {
  timestamp?: string;
  className?: string;
  updateInterval?: number;
}

export function LiveLastSeen({
  timestamp,
  className,
  updateInterval = 30000, // Update every 30 seconds by default
}: LiveLastSeenProps) {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);

  React.useEffect(() => {
    if (!timestamp) return;
    
    const interval = setInterval(() => {
      forceUpdate();
    }, updateInterval);

    return () => clearInterval(interval);
  }, [timestamp, updateInterval]);

  return (
    <LastSeenText timestamp={timestamp} className={className} />
  );
}
