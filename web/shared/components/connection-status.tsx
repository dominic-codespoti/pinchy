'use client';

import * as React from 'react';
import { StatusPill, StatusPillVariant } from '@/components/ui/status-pill';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useWebSocket, WebSocketStatus } from '@/shared/providers/websocket';

const wsStatusMap: Record<WebSocketStatus, { variant: StatusPillVariant; label: string }> = {
  connected: { variant: 'online', label: 'Connected' },
  connecting: { variant: 'pending', label: 'Connecting' },
  disconnected: { variant: 'offline', label: 'Disconnected' },
  error: { variant: 'error', label: 'Error' },
  max_retries_exceeded: { variant: 'error', label: 'Connection Failed' },
};

interface ConnectionStatusProps {
  showLabel?: boolean;
  showTooltip?: boolean;
  pulse?: boolean;
  className?: string;
}

function ConnectionStatus({
  showLabel = true,
  showTooltip = true,
  pulse = true,
  className,
}: ConnectionStatusProps) {
  const { status } = useWebSocket();
  const config = wsStatusMap[status];

  const content = (
    <StatusPill
      variant={config.variant}
      label={config.label}
      showLabel={showLabel}
      pulse={pulse && status === 'connected'}
      className={className}
    />
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
              WebSocket {status}
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { ConnectionStatus };
export type { ConnectionStatusProps };
