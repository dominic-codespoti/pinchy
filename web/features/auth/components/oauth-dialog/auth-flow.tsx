'use client';

import { Loader2, ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DialogState } from '../../types';

interface AuthFlowProps {
  dialogState: Extract<DialogState, { type: 'oauth_browser' | 'oauth_device' | 'pending' }>;
  onBack: () => void;
  onClose: () => void;
  onCopyCode?: (code: string) => void;
  onOpenGitHub?: (uri: string) => void;
  onAuthorized?: () => void;
}

export function AuthFlow({ dialogState, onBack, onClose, onCopyCode, onOpenGitHub, onAuthorized }: AuthFlowProps) {
  if (dialogState.type === 'oauth_browser') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-center text-muted-foreground">{dialogState.message}</p>
        </div>
        <div className="rounded-lg bg-muted p-4 text-sm">
          <p className="text-muted-foreground mb-2">Waiting for authorization...</p>
          <div className="flex gap-2">
            <div className="h-2 flex-1 rounded-full bg-primary/30 animate-pulse" />
            <div className="h-2 flex-1 rounded-full bg-primary/30 animate-pulse delay-100" />
            <div className="h-2 flex-1 rounded-full bg-primary/30 animate-pulse delay-200" />
          </div>
        </div>
        <Button variant="outline" className="w-full" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  if (dialogState.type === 'oauth_device') {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border bg-card p-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-2xl font-mono font-bold tracking-wider">
            <span className="text-primary">{dialogState.userCode}</span>
            {onCopyCode && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onCopyCode(dialogState.userCode)}
                title="Copy code"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </Button>
            )}
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>1. Visit github.com/login/device</p>
            <p>
              2. Enter code:{' '}
              <span className="font-mono font-medium text-foreground">{dialogState.userCode}</span>
            </p>
            <p>3. Click &quot;Continue&quot; to authorize</p>
          </div>

          <div className="flex gap-3 pt-2">
            {onOpenGitHub && (
              <Button variant="outline" className="flex-1" onClick={() => onOpenGitHub(dialogState.verificationUri)}>
                <svg className="h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Open GitHub
              </Button>
            )}
            <Button variant="default" className="flex-1" onClick={onAuthorized || onClose}>
              I&apos;ve Authorized
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Waiting for authorization...</span>
        </div>

        <Button variant="outline" className="w-full" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }

  // Pending state
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Connecting...</p>
    </div>
  );
}
