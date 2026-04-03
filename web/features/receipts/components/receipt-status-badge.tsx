'use client';

import { Badge } from '@/components/ui/badge';
import { ToolCallRecord } from '../types';

interface ReceiptStatusBadgeProps {
  success: boolean;
  error?: string;
  className?: string;
}

export function ReceiptStatusBadge({ success, error, className }: ReceiptStatusBadgeProps) {
  if (error) {
    return (
      <Badge variant="destructive" className={className}>
        Error
      </Badge>
    );
  }

  if (success) {
    return (
      <Badge variant="default" className={className}>
        Success
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      Unknown
    </Badge>
  );
}

interface ToolCallStatusBadgeProps {
  toolCall: ToolCallRecord;
  className?: string;
}

export function ToolCallStatusBadge({ toolCall, className }: ToolCallStatusBadgeProps) {
  if (toolCall.error) {
    return (
      <Badge variant="destructive" className={className}>
        Failed
      </Badge>
    );
  }

  if (toolCall.success) {
    return (
      <Badge variant="outline" className={className}>
        Success
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      Unknown
    </Badge>
  );
}
