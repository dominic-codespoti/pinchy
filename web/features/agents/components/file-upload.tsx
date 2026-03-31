'use client';

import { useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, File } from 'lucide-react';
import { toast } from 'sonner';

interface FileUploadProps {
  agentId: string;
}

export function FileUpload({ agentId }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Backend doesn't support file uploads via API
    toast.error('File upload not supported by backend. Use write_file tool instead.');
  }, []);

  const handleFileSelect = useCallback(() => {
    // Backend doesn't support file uploads via API
    toast.error('File upload not supported by backend. Use write_file tool instead.');
  }, []);

  return (
    <Card
      className={`border-dashed cursor-pointer transition-colors ${
        isDragging ? 'border-primary bg-primary/5' : ''
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleFileSelect}
    >
      <CardContent className="p-6">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <div className="p-3 rounded-full bg-muted">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-sm">Drop files here or click to upload</p>
          <p className="text-xs">Backend file upload not supported</p>
        </div>
      </CardContent>
    </Card>
  );
}
