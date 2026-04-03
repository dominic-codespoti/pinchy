'use client';

import { cn } from '@/shared/lib/utils';

interface LoadingDotsProps {
  className?: string;
  label?: string;
}

export function LoadingDots({ className, label }: LoadingDotsProps) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="flex gap-0.5">
        <span className="animate-bounce">.</span>
        <span className="animate-bounce [animation-delay:100ms]">.</span>
        <span className="animate-bounce [animation-delay:200ms]">.</span>
      </div>
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  );
}
