'use client';

import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { DialogState } from '../../types';

interface AuthStatusProps {
  dialogState: Extract<DialogState, { type: 'success' | 'error' | 'pending' }>;
  providerName: string;
  onClose: () => void;
  onRetry: () => void;
}

export function AuthStatus({ dialogState, providerName, onClose, onRetry }: AuthStatusProps) {
  if (dialogState.type === 'success') {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="p-4 rounded-full bg-green-500/10">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>
        <p className="font-medium text-lg">{providerName} connected</p>
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  if (dialogState.type === 'error') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="p-4 rounded-full bg-destructive/10">
            <XCircle className="h-10 w-10 text-destructive" />
          </div>
          <div className="text-center">
            <p className="font-medium text-destructive">Authentication failed</p>
            <p className="text-sm text-muted-foreground mt-1">{dialogState.message}</p>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-md border hover:bg-accent transition-colors"
          >
            Close
          </button>
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // Pending state
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Connecting to {providerName}...</p>
    </div>
  );
}
