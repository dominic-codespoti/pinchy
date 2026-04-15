'use client';

import { CalendarClock, Plus } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

interface CronEmptyStateProps {
  onCreate: () => void;
}

export function CronEmptyState({ onCreate }: CronEmptyStateProps) {
  return (
    <EmptyState
      icon={<CalendarClock className="h-8 w-8" />}
      title="No Cron Jobs"
      description="You haven't created any cron jobs yet. Create your first scheduled task to get started."
      action={{
        label: 'Create First Job',
        onClick: onCreate,
        icon: <Plus className="h-4 w-4" />,
      }}
    />
  );
}

CronEmptyState.displayName = 'CronEmptyState';
