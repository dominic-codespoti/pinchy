'use client';

import { useState } from 'react';
import { ChevronLeft, Copy, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuthMethod } from '../../types';

interface ApiKeyFormProps {
  provider: string;
  apiKey: string;
  isLoading: boolean;
  onApiKeyChange: (value: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}

export function ApiKeyForm({
  provider,
  apiKey,
  isLoading,
  onApiKeyChange,
  onSubmit,
  onBack,
}: ApiKeyFormProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="api-key">API Key</Label>
        <Input
          id="api-key"
          type="password"
          placeholder={provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          disabled={isLoading}
          className="font-mono"
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">Your API key is stored securely and never shared.</p>
      </div>

      <div className="flex gap-3">
        <Button variant="outline" className="flex-1" onClick={onBack}>
          Back
        </Button>
        <Button className="flex-1" onClick={onSubmit} disabled={!apiKey.trim() || isLoading}>
          {isLoading ? 'Connecting...' : 'Connect'}
        </Button>
      </div>
    </div>
  );
}

interface ProviderListProps {
  methods: AuthMethod[];
  isLoading: boolean;
  selectedMethod: AuthMethod | null;
  onMethodSelect: (method: AuthMethod) => void;
}

export function ProviderMethodList({
  methods,
  isLoading,
  selectedMethod,
  onMethodSelect,
}: ProviderListProps) {
  const methodLabels: Record<AuthMethod, { label: string; icon: React.ReactNode; description: string }> = {
    oauth_browser: {
      label: 'Browser OAuth',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
        </svg>
      ),
      description: 'Sign in with your browser',
    },
    oauth_device: {
      label: 'Device Code',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      ),
      description: 'Enter a code on another device',
    },
    api_key: {
      label: 'API Key',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
        </svg>
      ),
      description: 'Enter your API key directly',
    },
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-center text-muted-foreground">Select login method:</p>
      <div className="grid gap-3">
        {methods.map((method) => {
          const config = methodLabels[method];
          return (
            <button
              key={method}
              onClick={() => onMethodSelect(method)}
              disabled={isLoading}
              className={`
                flex items-center gap-4 p-4 rounded-lg border transition-all
                hover:bg-accent hover:border-accent-foreground/20
                focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2
                ${selectedMethod === method ? 'border-primary bg-primary/5' : ''}
              `}
            >
              <div className="p-2 rounded-md bg-muted">{config.icon}</div>
              <div className="flex-1 text-left">
                <p className="font-medium">{config.label}</p>
                <p className="text-sm text-muted-foreground">{config.description}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
