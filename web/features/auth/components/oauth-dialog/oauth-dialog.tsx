'use client';

import * as React from 'react';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn } from '@/shared/lib/utils';
import { providerConfigs, OpenAIIcon, GitHubIcon, AnthropicIcon } from './oauth-constants';
import { AuthMethod, DialogState } from '../../types';
import { ProviderMethodList, ApiKeyForm } from './auth-forms';
import { AuthFlow } from './auth-flow';
import { AuthStatus } from './auth-status';
import { useStartChatGptAuth, useStartCopilotAuth, useAuthenticateWithApiKey } from '../../hooks';
import { pollCopilotAuth } from '../../api';

interface OAuthDialogProps {
  provider: string;
  providerName: string;
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

// Max polling duration: 5 minutes
const MAX_POLLING_DURATION_MS = 5 * 60 * 1000;

export function OAuthDialog({ provider, providerName, isOpen, onClose, onComplete }: OAuthDialogProps) {
  const [dialogState, setDialogState] = useState<DialogState>({ type: 'select_method' });
  const [selectedMethod, setSelectedMethod] = useState<AuthMethod | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartTimeRef = useRef<number | null>(null);

  const startChatGptAuthMutation = useStartChatGptAuth();
  const startCopilotAuthMutation = useStartCopilotAuth();
  const authenticateApiKeyMutation = useAuthenticateWithApiKey();

  const config = providerConfigs[provider] || {
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
    bgColor: 'bg-primary/10',
    methods: ['api_key'],
  };

  // Cleanup polling on unmount or when dialog closes
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  // Stop polling when dialog is closed
  useEffect(() => {
    if (!isOpen && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
      pollStartTimeRef.current = null;
    }
  }, [isOpen]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setDialogState({ type: 'select_method' });
      setSelectedMethod(null);
      setApiKey('');
      setIsLoading(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      pollStartTimeRef.current = null;
    }
  }, [isOpen]);

  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    pollStartTimeRef.current = null;
  }, []);

  const startChatGPTAuth = useCallback(async () => {
    setIsLoading(true);
    setDialogState({ type: 'pending' });

    try {
      const data = await startChatGptAuthMutation.mutateAsync();
      const authUrl = data.auth_url;

      if (authUrl) {
        window.open(authUrl, '_blank');
      }

      setDialogState({
        type: 'oauth_browser',
        authUrl,
        message: 'Complete authorization in your browser. This window will update automatically.',
      });

      pollStartTimeRef.current = Date.now();

      pollIntervalRef.current = setInterval(async () => {
        if (pollStartTimeRef.current && Date.now() - pollStartTimeRef.current > MAX_POLLING_DURATION_MS) {
          clearPolling();
          setDialogState({ type: 'error', message: 'Authentication timed out. Please try again.' });
          return;
        }

        try {
          const response = await fetch('/api/auth/chatgpt/status');
          const statusData = await response.json();

          if (statusData.status === 'success') {
            clearPolling();
            setDialogState({ type: 'success' });
            setTimeout(() => {
              onComplete();
            }, 1500);
          } else if (statusData.status === 'error') {
            clearPolling();
            setDialogState({ type: 'error', message: statusData.message || 'Authentication failed' });
          }
        } catch {
          // Silently continue polling on network errors
        }
      }, 3000);
    } catch (err) {
      setDialogState({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start OAuth flow',
      });
    } finally {
      setIsLoading(false);
    }
  }, [startChatGptAuthMutation, onComplete, clearPolling]);

  const startCopilotAuth = useCallback(async () => {
    setIsLoading(true);
    setDialogState({ type: 'pending' });

    try {
      const data = await startCopilotAuthMutation.mutateAsync();

      setDialogState({
        type: 'oauth_device',
        verificationUri: data.verification_uri,
        userCode: data.user_code,
        message: 'Enter this code on GitHub to authorize access.',
      });

      pollStartTimeRef.current = Date.now();

      const pollInterval = (data.interval || 5) * 1000;

      pollIntervalRef.current = setInterval(async () => {
        if (pollStartTimeRef.current && Date.now() - pollStartTimeRef.current > MAX_POLLING_DURATION_MS) {
          clearPolling();
          setDialogState({ type: 'error', message: 'Authentication timed out. Please try again.' });
          return;
        }

          try {
            const pollData = await pollCopilotAuth();

            if (pollData.status === 'complete') {
              clearPolling();
              setDialogState({ type: 'success' });
              setTimeout(() => {
                onComplete();
              }, 1500);
            } else if (pollData.status === 'failed') {
              clearPolling();
              setDialogState({ type: 'error', message: pollData.error || 'Authentication failed' });
            } else if (pollData.status === 'timeout') {
              clearPolling();
              setDialogState({ type: 'error', message: pollData.error || 'Authentication timed out' });
            }
            // For 'pending', continue polling
          } catch (error) {
            console.error('[copilot-auth] Poll error:', error);

            // If the server explicitly says no flow exists, stop polling and show error
            const msg = error && typeof error === 'object' && 'message' in error
              ? (error as any).message
              : '';
            if (msg.includes('no_flow') || msg.includes('no device flow')) {
              clearPolling();
              setDialogState({ type: 'error', message: 'Authentication session expired. Please try again.' });
              return;
            }
            // For transient network errors, continue polling
          }
      }, pollInterval);
    } catch (err) {
      setDialogState({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to start device flow',
      });
    } finally {
      setIsLoading(false);
    }
  }, [startCopilotAuthMutation, onComplete, clearPolling]);

  const handleMethodSelect = useCallback(
    async (method: AuthMethod) => {
      setSelectedMethod(method);

      if (method === 'oauth_browser') {
        await startChatGPTAuth();
      } else if (method === 'oauth_device') {
        await startCopilotAuth();
      } else if (method === 'api_key') {
        setDialogState({ type: 'api_key' });
      }
    },
    [startChatGPTAuth, startCopilotAuth]
  );

  const handleApiKeySubmit = useCallback(async () => {
    if (!apiKey.trim()) return;

    setIsLoading(true);
    setDialogState({ type: 'pending' });

    try {
      const result = await authenticateApiKeyMutation.mutateAsync({ provider, apiKey: apiKey.trim() });

      if (result.success) {
        setDialogState({ type: 'success' });
        setTimeout(() => {
          onComplete();
        }, 1500);
      } else {
        setDialogState({ type: 'error', message: result.message || 'Authentication failed' });
      }
    } catch (err) {
      setDialogState({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to authenticate',
      });
    } finally {
      setIsLoading(false);
    }
  }, [apiKey, provider, authenticateApiKeyMutation, onComplete]);

  const handleBack = useCallback(() => {
    clearPolling();
    setDialogState({ type: 'select_method' });
    setSelectedMethod(null);
    setApiKey('');
  }, [clearPolling]);

  const handleClose = useCallback(() => {
    clearPolling();
    onClose();
  }, [clearPolling, onClose]);

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  const openGitHub = useCallback((uri: string) => {
    window.open(uri, '_blank');
  }, []);

  const getDescription = () => {
    switch (dialogState.type) {
      case 'select_method':
        return 'Select how you want to authenticate';
      case 'oauth_browser':
        return 'Complete authorization in your browser';
      case 'oauth_device':
        return 'Enter the code on GitHub';
      case 'api_key':
        return 'Enter your API key';
      case 'pending':
        return 'Connecting...';
      case 'success':
        return 'Successfully connected';
      case 'error':
        return 'Authentication failed';
      default:
        return '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className={cn('p-3 rounded-full', config.bgColor)}>{config.icon}</div>
          </div>
          <DialogTitle className="text-xl font-semibold">{providerName}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">{getDescription()}</DialogDescription>
        </DialogHeader>

        <div className="py-6">
          {dialogState.type === 'select_method' && (
            <ProviderMethodList
              methods={config.methods}
              isLoading={isLoading}
              selectedMethod={selectedMethod}
              onMethodSelect={handleMethodSelect}
            />
          )}

          {(dialogState.type === 'oauth_browser' || dialogState.type === 'oauth_device' || dialogState.type === 'pending') && (
            <AuthFlow
              dialogState={dialogState}
              onBack={handleBack}
              onClose={handleClose}
              onCopyCode={copyToClipboard}
              onOpenGitHub={openGitHub}
              onAuthorized={() => {
                // For device flow, polling happens automatically.
                // This button is informational - user can wait for polling to complete.
              }}
            />
          )}

          {dialogState.type === 'api_key' && (
            <ApiKeyForm
              provider={provider}
              apiKey={apiKey}
              isLoading={isLoading}
              onApiKeyChange={setApiKey}
              onSubmit={handleApiKeySubmit}
              onBack={handleBack}
            />
          )}

          {(dialogState.type === 'success' || dialogState.type === 'error') && (
            <AuthStatus
              dialogState={dialogState}
              providerName={providerName}
              onClose={handleClose}
              onRetry={handleBack}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

OAuthDialog.displayName = 'OAuthDialog';

export type { OAuthDialogProps };
