'use client';

import { AlertCircle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/shared/lib/utils';

interface UnsavedChangesBannerProps {
  show: boolean;
  className?: string;
}

export function UnsavedChangesBanner({ show, className }: UnsavedChangesBannerProps) {
  if (!show) return null;

  return (
    <Alert
      variant="warning"
      className={cn(
        'sticky top-0 z-50 rounded-none border-x-0 border-t-0',
        className
      )}
    >
      <AlertCircle data-icon="inline-start" />
      <AlertTitle>Unsaved Changes</AlertTitle>
      <AlertDescription className="hidden sm:inline">
        Save or discard before leaving
      </AlertDescription>
    </Alert>
  );
}
