'use client';

import * as React from 'react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  MobileCard,
  MobileCardRow,
  MobileCardTitle,
} from '@/components/ui/mobile-card';
import { ChevronDown, Clock, Play, Zap } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { CronJob } from '../types';
import cronstrue from 'cronstrue';
import { JobRowActions } from './job-row-actions';

interface JobMobileCardProps {
  job: CronJob;
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

function formatRelativeDate(date?: string): string {
  if (!date) return 'Never';
  const d = new Date(date);
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(Math.abs(diff) / (1000 * 60 * 60 * 24));

  if (diff > 0) {
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    return `In ${days} days`;
  } else {
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
  }
}

function getJobStatusBadge(lastStatus: boolean) {
  if (lastStatus) {
    return <Badge variant="default">Active</Badge>;
  }
  return <Badge variant="secondary">Paused</Badge>;
}

export function JobMobileCard({
  job,
  agents,
  onEdit,
  onDelete,
  onToggleStatus,
  onTrigger,
}: JobMobileCardProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <MobileCard>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <MobileCardTitle className="line-clamp-1">
            {getAgentName(job.agentId, agents)}
          </MobileCardTitle>
        </div>
        {getJobStatusBadge(job.lastStatus)}
      </div>

      <MobileCardRow
        label="Schedule"
        value={
          <div className="text-right">
            <div className="font-mono text-xs">{job.schedule}</div>
            <div className="text-xs text-muted-foreground">
              {formatSchedule(job.schedule)}
            </div>
          </div>
        }
      />

      <MobileCardRow
        label="Message"
        value={
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {job.message}
          </span>
        }
      />

      <MobileCardRow
        label="Last Run"
        value={
          <span className="inline-flex items-center gap-1 text-xs">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {formatRelativeDate(job.lastRun)}
          </span>
        }
      />

      <MobileCardRow
        label="Next Run"
        value={
          <span className="inline-flex items-center gap-1 text-xs">
            <Play className="h-3 w-3 text-muted-foreground" />
            {job.nextRun ? formatRelativeDate(job.nextRun) : '-'}
          </span>
        }
      />

      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between">
            <span className="text-xs">Details</span>
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                isOpen && 'rotate-180'
              )}
            />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-2 p-3 bg-muted rounded-md space-y-2 text-xs">
            <div className="font-mono text-muted-foreground">Job ID: {job.id}</div>
            <div className="font-mono text-muted-foreground">Agent ID: {job.agentId}</div>
            <div className="border-t pt-2">
              <p className="text-muted-foreground mb-1">Message:</p>
              <p className="font-mono">{job.message}</p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center justify-between pt-3 border-t mt-2">
        <div className="flex items-center gap-2">
          <Switch
            checked={job.lastStatus}
            onCheckedChange={() => onToggleStatus(job)}
            id={`mobile-switch-${job.id}`}
          />
          <Label
            htmlFor={`mobile-switch-${job.id}`}
            className="text-sm text-muted-foreground cursor-pointer"
          >
            {job.lastStatus ? 'Enabled' : 'Disabled'}
          </Label>
        </div>
        <div className="flex items-center gap-1">
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
            showLabels={false}
          />
        </div>
      </div>
    </MobileCard>
  );
}

JobMobileCard.displayName = 'JobMobileCard';
