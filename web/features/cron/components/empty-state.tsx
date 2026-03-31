'use client';

import { CalendarClock, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
  onCreate: () => void;
}

export function EmptyState({ onCreate }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        <div className="rounded-full bg-muted p-4 mb-4">
          <CalendarClock className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No Cron Jobs</h3>
        <p className="text-muted-foreground max-w-sm mb-6">
          You haven&apos;t created any cron jobs yet. Create your first scheduled task to get started.
        </p>
        <Button onClick={onCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Create First Job
        </Button>
      </CardContent>
    </Card>
  );
}

EmptyState.displayName = 'EmptyState';
