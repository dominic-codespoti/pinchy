'use client';

import { AgentFile } from '../types';
import { Button } from '@/components/ui/button';
import { Download, Trash2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { downloadAgentFile, deleteAgentFile } from '../api';
import { useQueryClient } from '@tanstack/react-query';
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

interface FileActionsProps {
  file: AgentFile;
  agentId: string;
  onPreview: () => void;
}

export function FileActions({ file, agentId, onPreview }: FileActionsProps) {
  const queryClient = useQueryClient();

  const handleDownload = async () => {
    try {
      const blob = await downloadAgentFile(agentId, file.name);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${file.name}`);
    } catch {
      toast.error('Failed to download file');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteAgentFile(agentId, file.name);
      toast.success(`Deleted ${file.name}`);
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'files'] });
    } catch {
      toast.error('Failed to delete file');
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" onClick={onPreview}><Eye className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" onClick={handleDownload}><Download className="h-4 w-4" /></Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete File</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to delete <strong>{file.name}</strong>?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
