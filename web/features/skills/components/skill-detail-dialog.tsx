'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useSkillDetail } from '../hooks';
import { Scale, Info, FileText } from 'lucide-react';

function formatSkillName(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface SkillDetailDialogProps {
  skillId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SkillDetailDialog({ skillId, open, onOpenChange }: SkillDetailDialogProps) {
  const { data: detail, isLoading, error } = useSkillDetail(skillId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {formatSkillName(skillId)}
            {detail?.operatorManaged && (
              <Badge variant="secondary" className="text-xs">Built-in</Badge>
            )}
            {detail && !detail.operatorManaged && (
              <Badge variant="outline" className="text-xs">Custom</Badge>
            )}
          </DialogTitle>
          {detail?.description && (
            <DialogDescription>{detail.description}</DialogDescription>
          )}
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : error ? (
          <div className="text-sm text-destructive">
            Failed to load skill details: {error.message}
          </div>
        ) : detail ? (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4">
              {detail.license && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Scale className="h-3.5 w-3.5" />
                    License
                  </div>
                  <p className="text-sm">{detail.license}</p>
                </div>
              )}

              {detail.compatibility && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    Compatibility
                  </div>
                  <p className="text-sm">{detail.compatibility}</p>
                </div>
              )}

              {detail.instructions && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Instructions
                  </div>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono">
                    {detail.instructions}
                  </pre>
                </div>
              )}

              {detail.manifest && !detail.instructions && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Manifest
                  </div>
                  <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-words font-mono">
                    {detail.manifest}
                  </pre>
                </div>
              )}

              {!detail.license && !detail.compatibility && !detail.instructions && !detail.manifest && (
                <p className="text-sm text-muted-foreground">
                  No additional details available for this skill.
                </p>
              )}
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

SkillDetailDialog.displayName = 'SkillDetailDialog';
