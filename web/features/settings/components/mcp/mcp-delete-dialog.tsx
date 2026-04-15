'use client';

import { Trash2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { McpDeleteDialogProps } from './mcp-types';

export function McpDeleteDialog({
  serverName,
  onOpenChange,
  onConfirm,
  isDeleting,
}: McpDeleteDialogProps) {
  return (
    <Dialog open={!!serverName} onOpenChange={() => onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete MCP Server</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the MCP server &quot;{serverName}&quot;? This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
