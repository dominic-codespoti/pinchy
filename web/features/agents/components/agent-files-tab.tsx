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
import { FilePreview } from './file-preview';
import { FileActions } from './file-actions';
import { FileText, FolderOpen } from 'lucide-react';

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
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
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <FolderOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No files in workspace
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Files are created using the write_file tool
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Files ({files.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs w-32">Modified</TableHead>
              <TableHead className="text-xs w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map((file) => (
              <TableRow key={file.path}>
                <TableCell>
                  <button
                    onClick={() => handleFileClick(file)}
                    className="flex items-center gap-2 font-medium text-sm hover:underline text-left"
                  >
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    {file.name}
                  </button>
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatDate(file.modifiedAt)}
                </TableCell>
                <TableCell className="text-right">
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
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-20" />
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
