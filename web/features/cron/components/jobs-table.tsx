'use client';

import * as React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CronJob } from '../types';
import { DesktopJobsTable } from './jobs-table-desktop';
import { JobMobileCard } from './job-mobile-card';

interface JobsTableProps {
  jobs?: CronJob[];
  agents?: { id: string; name: string }[];
  loading: boolean;
  onEdit: (job: CronJob) => void;
  onDelete: (job: CronJob) => void;
  onToggleStatus: (job: CronJob) => void;
}

export function JobsTable({
  jobs,
  agents,
  loading,
  onEdit,
  onDelete,
  onToggleStatus,
}: JobsTableProps) {
  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <CardTitle>Cron Jobs</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {/* Desktop Table View */}
        <div className="hidden md:block">
          <DesktopJobsTable
            jobs={jobs || []}
            agents={agents}
            onEdit={onEdit}
            onDelete={onDelete}
            onToggleStatus={onToggleStatus}
          />
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden space-y-3 p-4">
          {jobs?.map((job) => (
            <JobMobileCard
              key={job.id}
              job={job}
              agents={agents}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleStatus={onToggleStatus}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

JobsTable.displayName = 'JobsTable';
