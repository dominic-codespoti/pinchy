'use client';

import { useEffect } from 'react';
import { AlertCircle, RefreshCw, WifiOff, ServerCrash, AlertTriangle } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ErrorFallbackProps {
  error: Error & { digest?: string; statusCode?: number };
  resetErrorBoundary?: () => void;
  title?: string;
  description?: string;
  context?: string;
}

function getErrorIcon(error: Error) {
  const message = error.message.toLowerCase();
  if (message.includes('network') || message.includes('fetch') || message.includes('connection')) {
    return <WifiOff className="size-4" />;
  }
  if (message.includes('500') || message.includes('server') || message.includes('internal')) {
    return <ServerCrash className="size-4" />;
  }
  if (message.includes('403') || message.includes('unauthorized') || message.includes('forbidden')) {
    return <AlertTriangle className="size-4" />;
  }
  return <AlertCircle className="size-4" />;
}

function getErrorTitle(error: Error, fallbackTitle: string) {
  const message = error.message.toLowerCase();
  if (message.includes('network') || message.includes('fetch')) {
    return 'Connection error';
  }
  if (message.includes('500') || message.includes('server')) {
    return 'Server error';
  }
  if (message.includes('404') || message.includes('not found')) {
    return 'Not found';
  }
  if (message.includes('403') || message.includes('unauthorized')) {
    return 'Access denied';
  }
  return fallbackTitle;
}

export function ErrorFallback({
  error,
  resetErrorBoundary,
  title = 'Something went wrong',
  description = 'An error occurred while loading this content.',
  context = 'component',
}: ErrorFallbackProps) {
  useEffect(() => {
    console.error(`[${context} Error Fallback]`, {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
      timestamp: new Date().toISOString(),
    });
  }, [error, context]);

  const displayTitle = getErrorTitle(error, title);
  const isNetworkError = error.message.toLowerCase().includes('network') || 
                         error.message.toLowerCase().includes('fetch');

  return (
    <Alert variant="destructive" className="my-4">
      {getErrorIcon(error)}
      <AlertTitle>{displayTitle}</AlertTitle>
      <AlertDescription className="space-y-2 mt-2">
        <p>{description}</p>
        <p className="text-xs font-mono bg-destructive/10 p-2 rounded break-all">
          {error.message}
        </p>
        {error.digest && (
          <p className="text-xs opacity-70">Error ID: {error.digest}</p>
        )}
        {resetErrorBoundary && (
          <div className="flex gap-2 mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={resetErrorBoundary}
            >
              <RefreshCw className="mr-1.5 size-3.5" />
              Try again
            </Button>
            {isNetworkError && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.location.reload()}
              >
                Reload
              </Button>
            )}
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}
