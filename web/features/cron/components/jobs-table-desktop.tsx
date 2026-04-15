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
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, ChevronRight, Pencil, Trash2, Play, Clock, Zap } from 'lucide-react';
import { CronJob } from '../types';
import cronstrue from 'cronstrue';
import { JobRowActions } from './job-row-actions';
import { JobRowDetails } from './job-row-details';

interface DesktopJobsTableProps {
  jobs: CronJob[];
  agents?: { id: string; name: string }[];
  onEdit: (job: CronJob) => void;
  onDelete: (job: CronJob) => void;
  onToggleStatus: (job: CronJob) => void;
  onTrigger?: (job: CronJob) => void;
}

function getAgentName(agentId: string, agents?: { id: string; name: string }[]): string {
  const agent = agents?.find((a) => a.id === agentId);
  return agent?.name || agentId;
}

function formatSchedule(schedule: string): string {
  try {
    return cronstrue.toString(schedule, { use24HourTimeFormat: true });
  } catch {
    return schedule;
  }
}

function formatDate(date?: string): string {
  if (!date) return 'Never';
  return new Date(date).toLocaleString();
}

function getJobStatusBadge(lastStatus: boolean) {
  if (lastStatus) {
    return <Badge variant="default">Active</Badge>;
  }
  return <Badge variant="secondary">Paused</Badge>;
}

export function DesktopJobsTable({
  jobs,
  agents,
  onEdit,
  onDelete,
  onToggleStatus,
  onTrigger,
}: DesktopJobsTableProps) {
  const [expandedJobs, setExpandedJobs] = React.useState<Set<string>>(new Set());

  const toggleExpand = (jobId: string) => {
    setExpandedJobs((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[40px]"></TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Schedule</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Run</TableHead>
          <TableHead>Next Run</TableHead>
          <TableHead className="w-[120px] text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {jobs.map((job) => (
          <React.Fragment key={job.id}>
            <TableRow className="group">
              <TableCell className="p-0">
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => toggleExpand(job.id)}
                    data-state={expandedJobs.has(job.id) ? 'open' : 'closed'}
                  >
                    {expandedJobs.has(job.id) ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                    <span className="sr-only">Toggle details</span>
                  </Button>
                </CollapsibleTrigger>
              </TableCell>
              <TableCell className="font-medium">
                {getAgentName(job.agentId, agents)}
              </TableCell>
              <TableCell>
                <div className="font-mono text-xs">{job.schedule}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {formatSchedule(job.schedule)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={job.lastStatus}
                    onCheckedChange={() => onToggleStatus(job)}
                  />
                  {getJobStatusBadge(job.lastStatus)}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{formatDate(job.lastRun)}</span>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                <div className="flex items-center gap-1.5">
                  <Play className="h-3.5 w-3.5" />
                  <span>{job.nextRun ? formatDate(job.nextRun) : '-'}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {onTrigger && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onTrigger(job)}
                      className="h-8 w-8"
                      title="Trigger now"
                    >
                      <Zap className="h-4 w-4" />
                      <span className="sr-only">Trigger job</span>
                    </Button>
                  )}
                  <JobRowActions
                    job={job}
                    onEdit={() => onEdit(job)}
                    onDelete={() => onDelete(job)}
                  />
                </div>
              </TableCell>
            </TableRow>
            <Collapsible open={expandedJobs.has(job.id)}>
              <CollapsibleContent asChild>
                <tr>
                  <td colSpan={7} className="p-0">
                    <JobRowDetails job={job} />
                  </td>
                </tr>
              </CollapsibleContent>
            </Collapsible>
          </React.Fragment>
        ))}
      </TableBody>
    </Table>
  );
}

DesktopJobsTable.displayName = 'DesktopJobsTable';
