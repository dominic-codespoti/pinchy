'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HardDrive, Download, Upload, Trash2 } from 'lucide-react';
import { useCreateBackup, useRestoreBackup, useDeleteBackup } from '../hooks';
import { mockBackups } from '../utils';
import { formatBytes, formatDate } from '@/shared/lib/format';

export function BackupsTab() {
  const createMutation = useCreateBackup();
  const restoreMutation = useRestoreBackup();
  const deleteMutation = useDeleteBackup();

  const isProcessing = createMutation.isPending || restoreMutation.isPending || deleteMutation.isPending;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <CardTitle className="text-base sm:text-lg flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Backup & Restore
            </CardTitle>
            <CardDescription>Manage database backups and restoration</CardDescription>
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={isProcessing}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Create Backup
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {mockBackups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <HardDrive className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-sm">No backups found</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mockBackups.map((backup) => (
              <div
                key={backup.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <HardDrive className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{backup.id}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(backup.createdAt)} • {formatBytes(backup.size)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={backup.status === 'complete' ? 'secondary' : 'outline'}>
                    {backup.status}
                  </Badge>
                  <Badge variant="outline">{backup.type}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restoreMutation.mutate(backup.id)}
                    disabled={isProcessing}
                    className="gap-1"
                  >
                    <Upload className="h-3 w-3" />
                    Restore
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteMutation.mutate(backup.id)}
                    disabled={isProcessing}
                    className="h-8 w-8 text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
