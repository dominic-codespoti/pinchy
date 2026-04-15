'use client';

import { CronJob } from '../types';

interface JobRowDetailsProps {
  job: CronJob;
}

export function JobRowDetails({ job }: JobRowDetailsProps) {
  return (
    <div className="p-4 bg-muted/50 space-y-3">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Agent ID</p>
          <p className="text-sm font-mono">{job.agentId}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Job ID</p>
          <p className="text-sm font-mono">{job.id}</p>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted-foreground mb-1">Message</p>
        <p className="text-sm font-mono bg-muted p-2 rounded">{job.message}</p>
      </div>
    </div>
  );
}

JobRowDetails.displayName = 'JobRowDetails';
