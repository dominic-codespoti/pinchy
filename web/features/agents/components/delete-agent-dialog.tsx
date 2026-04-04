'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Trash2 } from 'lucide-react';
import { Agent } from '../types';

interface DeleteAgentDialogProps {
  agent: Agent | null;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDelete?: (agentId: string) => Promise<void>;
  trigger?: React.ReactNode;
}

export function DeleteAgentDialog({ 
  agent, 
  open: controlledOpen, 
  onOpenChange, 
  onDelete, 
  trigger 
}: DeleteAgentDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (value: boolean) => {
    setInternalOpen(value);
    onOpenChange?.(value);
  };
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!agent) return;
    setIsDeleting(true);
    try {
      await onDelete?.(agent.id);
      setOpen(false);
    } catch (error) {
      console.error('Failed to delete agent:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  // Don't render if no agent and no trigger (controlled mode)
  if (!agent && !trigger) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      {trigger && (
        <AlertDialogTrigger asChild>
          {trigger}
        </AlertDialogTrigger>
      )}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">
            Delete {agent?.name || 'Agent'}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This action cannot be undone. This will permanently delete the agent{' '}
            <strong>{agent?.id || ''}</strong> and all associated data including:
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-lg bg-muted p-4 text-sm">
          <ul className="list-disc list-inside space-y-1 text-muted-foreground">
            <li>All conversation sessions</li>
            <li>Saved memories and knowledge</li>
            <li>Configuration files (SOUL.md, TOOLS.md, HEARTBEAT.md)</li>
            <li>Cron job schedules</li>
          </ul>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting...
              </>
            ) : (
              <>
                <Trash2 className="mr-2 h-4 w-4" />
                Delete Agent
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
