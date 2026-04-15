'use client';

import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CronJob } from '../types';
import { DeleteJobDialog } from './delete-job-dialog';
import { useState } from 'react';

interface JobRowActionsProps {
  job: CronJob;
  onEdit: () => void;
  onDelete: () => void;
  showLabels?: boolean;
}

export function JobRowActions({
  job,
  onEdit,
  onDelete,
  showLabels = true,
}: JobRowActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size={showLabels ? 'default' : 'icon'}
          onClick={onEdit}
          className={showLabels ? 'h-8' : 'h-8 w-8'}
        >
          <Pencil className="h-4 w-4" />
          {showLabels && <span className="ml-2">Edit</span>}
          {!showLabels && <span className="sr-only">Edit job</span>}
        </Button>
        <Button
          variant="ghost"
          size={showLabels ? 'default' : 'icon'}
          onClick={() => setDeleteOpen(true)}
          className={
            showLabels
              ? 'h-8 text-destructive hover:text-destructive'
              : 'h-8 w-8 text-destructive hover:text-destructive'
          }
        >
          <Trash2 className="h-4 w-4" />
          {showLabels && <span className="ml-2">Delete</span>}
          {!showLabels && <span className="sr-only">Delete job</span>}
        </Button>
      </div>
      <DeleteJobDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onConfirm={() => {
          onDelete();
          setDeleteOpen(false);
        }}
        jobName={`job for "${job.message.slice(0, 30)}${job.message.length > 30 ? '...' : ''}"`}
      />
    </>
  );
}

JobRowActions.displayName = 'JobRowActions';
