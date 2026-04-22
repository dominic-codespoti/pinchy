'use client';

import { useEffect, useState } from 'react';
import { Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/utils';

interface ReasoningPreviewProps {
  text?: string;
  isStreaming?: boolean;
  onViewDetails?: () => void;
}

export function ReasoningPreview({ text, isStreaming = false, onViewDetails }: ReasoningPreviewProps) {
  const trimmed = text?.trim();
  const [displayText, setDisplayText] = useState(trimmed ?? '');
  const [isVisible, setIsVisible] = useState(Boolean(trimmed));

  useEffect(() => {
    if (!trimmed) {
      setDisplayText('');
      setIsVisible(false);
      return;
    }

    if (!displayText) {
      setDisplayText(trimmed);
      setIsVisible(true);
      return;
    }

    if (trimmed === displayText) {
      setIsVisible(true);
      return;
    }

    setIsVisible(false);
    const timeout = window.setTimeout(() => {
      setDisplayText(trimmed);
      setIsVisible(true);
    }, 120);

    return () => window.clearTimeout(timeout);
  }, [displayText, trimmed]);

  if (!trimmed) {
    return null;
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
      <Brain className={cn('size-3.5 shrink-0', isStreaming && 'animate-pulse')} />
      <span
        className={cn(
          'min-w-0 flex-1 truncate translate-y-px transition-opacity duration-200',
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
        title={displayText}
      >
        {displayText}
      </span>
      {onViewDetails && (
        <Button variant="link" size="sm" className="h-auto px-0 text-xs text-muted-foreground" onClick={onViewDetails}>
          View details
        </Button>
      )}
    </div>
  );
}
