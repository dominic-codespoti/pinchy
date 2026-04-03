'use client';

import { LoadingDots } from '@/components/ui/loading-dots';

interface AssistantLoadingIndicatorProps {
  label?: string;
  className?: string;
}

export function AssistantLoadingIndicator({
  label = 'Pinchy is thinking...',
  className,
}: AssistantLoadingIndicatorProps) {
  return (
    <div className={className}>
      <LoadingDots label={label} />
    </div>
  );
}
