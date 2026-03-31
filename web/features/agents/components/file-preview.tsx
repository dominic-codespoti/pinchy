'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Download, Save } from 'lucide-react';
import { toast } from 'sonner';
import { AgentFile } from '../types';
import { getAgentFileContent, saveAgentFileContent, downloadAgentFile } from '../api';

interface FilePreviewProps {
  file: AgentFile | null;
  agentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FilePreview({ file, agentId, open, onOpenChange }: FilePreviewProps) {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (open && file) {
      loadFileContent();
    }
  }, [open, file]);

  const loadFileContent = async () => {
    if (!file) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await getAgentFileContent(agentId, file.name);
      setContent(data);
      setHasChanges(false);
    } catch (err) {
      setError('Failed to load file content');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!file) return;
    setIsSaving(true);
    try {
      await saveAgentFileContent(agentId, file.name, content);
      toast.success(`Saved ${file.name}`);
      setHasChanges(false);
    } catch (err) {
      toast.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!file) return;
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

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setHasChanges(true);
  };

  if (!file) return null;

  const isMarkdown = file.name.endsWith('.md');
  const isText = file.name.endsWith('.txt') || isMarkdown || file.name.endsWith('.json') || file.name.endsWith('.jsonl');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{file.name}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              {isText && (
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!hasChanges || isSaving}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save'}
                </Button>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : isText ? (
          <textarea
            value={content}
            onChange={handleContentChange}
            className="w-full h-[60vh] font-mono text-sm p-4 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            spellCheck={false}
          />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <p>Preview not available for this file type</p>
            <Button variant="outline" className="mt-4" onClick={handleDownload}>
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
