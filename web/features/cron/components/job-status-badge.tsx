'use client';

import { Badge } from '@/components/ui/badge';

interface JobStatusBadgeProps {
  enabled: boolean;
}

export function JobStatusBadge({ enabled }: JobStatusBadgeProps) {
  if (enabled) {
    return <Badge variant="default">Active</Badge>;
  }
  return <Badge variant="secondary">Paused</Badge>;
}

JobStatusBadge.displayName = 'JobStatusBadge';
