'use client';

import { useState } from 'react';
import { AgentFile } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { FileUpload } from './file-upload';
import { FilePreview } from './file-preview';
import { FileActions } from './file-actions';

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

interface FilesTabProps {
  agentId: string;
  files: AgentFile[];
}

export function FilesTab({ agentId, files }: FilesTabProps) {
  const [previewFile, setPreviewFile] = useState<AgentFile | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const handleFileClick = (file: AgentFile) => {
    setPreviewFile(file);
    setPreviewOpen(true);
  };

  if (files.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload agentId={agentId} />
          <p className="text-muted-foreground text-center py-8">
            No files in workspace. Upload a file to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Files ({files.length})</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FileUpload agentId={agentId} />

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="w-24">Size</TableHead>
              <TableHead className="w-44">Modified</TableHead>
              <TableHead className="w-28">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.path}>
                <TableCell
                  className="font-medium cursor-pointer hover:underline"
                  onClick={() => handleFileClick(file)}
                >
                  {file.name}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatFileSize(file.size)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {formatDate(file.modifiedAt)}
                </TableCell>
                <TableCell>
                  <FileActions
                    file={file}
                    agentId={agentId}
                    onPreview={() => handleFileClick(file)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <FilePreview
          file={previewFile}
          agentId={agentId}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      </CardContent>
    </Card>
  );
}

export function FilesTabSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-24" />
      </CardHeader>
      <CardContent className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-10 w-full" />
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full mt-px" />
        ))}
      </CardContent>
    </Card>
  );
}
