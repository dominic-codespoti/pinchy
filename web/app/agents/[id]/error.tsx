'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/shared/components/error-fallback';

interface AgentDetailErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AgentDetailError({ error, reset }: AgentDetailErrorProps) {
  useEffect(() => {
    // Log to error reporting service
    console.error('Agent detail error:', error);
  }, [error]);

  return (
    <div className="p-6">
      <ErrorFallback
        error={error}
        resetErrorBoundary={reset}
        title="Failed to load agent details"
        description="There was a problem loading the agent information. Please try again."
      />
    </div>
  );
}
