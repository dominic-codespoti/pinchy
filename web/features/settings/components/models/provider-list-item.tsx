'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronRight, Zap, Plug, Key, Lock, TestTube, ChevronLeft, Check, X, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProviderConfig, UIProviderStatusItem, ProviderTestResult } from '../../types';
import { providerIcons, getProviderBadgeColor, getProviderModels, PROVIDERS } from './provider-constants';

function getAuthMethodIcon(method?: string) {
  switch (method) {
    case 'api_key':
      return <Key className="h-3 w-3" />;
    case 'oauth':
      return <Lock className="h-3 w-3" />;
    default:
      return <Key className="h-3 w-3" />;
  }
}

function getAuthMethodLabel(method?: string): string {
  switch (method) {
    case 'api_key':
      return 'API Key';
    case 'oauth':
      return 'OAuth';
    case 'env':
      return 'Environment';
    case 'azure_cli':
      return 'Azure CLI';
    default:
      return 'API Key';
  }
}

function StatusIndicator({
  status,
  isConnected,
}: {
  status?: UIProviderStatusItem;
  isConnected: boolean;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="relative flex items-center gap-2 cursor-help">
            <span
              className={cn(
                'relative flex h-2 w-2 rounded-full',
                isConnected ? 'bg-green-500' : 'bg-gray-400'
              )}
            >
              {isConnected && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              )}
            </span>
            <span
              className={cn(
                'text-sm',
                isConnected ? 'text-green-600 dark:text-green-400' : 'text-muted-foreground'
              )}
            >
              {isConnected ? 'Connected' : status?.configured ? 'Pending' : 'Disconnected'}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start">
          <div className="space-y-1">
            <p className="font-medium">
              Status: {isConnected ? 'Connected' : status?.configured ? 'Configured' : 'Disconnected'}
            </p>
            {status?.method && (
              <p className="text-xs text-muted-foreground capitalize">Method: {status.method}</p>
            )}
            {status?.tested !== undefined && (
              <p className="text-xs text-muted-foreground">Tested: {status.tested ? 'Yes' : 'No'}</p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface ProviderListItemProps {
  provider: ProviderConfig;
  meta?: (typeof PROVIDERS)[number];
  backend?: UIProviderStatusItem;
  isConnected: boolean;
  onConnect: (providerId: string, providerName: string) => void;
  onTest: (providerId: string) => Promise<ProviderTestResult>;
  onToggle: (providerId: string, enabled: boolean) => void;
}

export function ProviderListItem({
  provider,
  meta,
  backend,
  isConnected,
  onConnect,
  onTest,
  onToggle,
}: ProviderListItemProps) {
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<ProviderTestResult | null>(null);
  const [showAllModels, setShowAllModels] = React.useState(false);

  const models = getProviderModels(provider.id);
  const displayedModels = showAllModels ? models : models.slice(0, 4);
  const hasMoreModels = models.length > 4;

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await onTest(provider.id);
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  const requiresOAuth = meta && 'requiresOAuth' in meta ? meta.requiresOAuth : false;
  const authMethod =
    backend?.method || (requiresOAuth ? 'oauth' : 'requiresApiKey' in (meta || {}) ? 'api_key' : undefined);

  return (
    <div className="group flex flex-col gap-2 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
      {/* Main Row: Icon | Name + Status | Action */}
      <div className="flex items-center gap-3">
        {/* Provider Icon */}
        <div
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
            getProviderBadgeColor(provider.id)
          )}
        >
          {providerIcons[provider.id] || <Zap className="h-4 w-4" />}
        </div>

        {/* Name and Status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{provider.name}</span>
            {authMethod && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-0.5">
                {getAuthMethodIcon(authMethod)}
                <span className="hidden sm:inline">{getAuthMethodLabel(authMethod)}</span>
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusIndicator status={backend} isConnected={isConnected} />
            {isConnected && testResult?.latencyMs && (
              <span className="text-xs text-muted-foreground">({testResult.latencyMs}ms)</span>
            )}
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-1 shrink-0">
          {isConnected ? (
            <>
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={handleTest}
                      disabled={isTesting}
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : testResult?.success ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : testResult?.success === false ? (
                        <X className="h-4 w-4 text-destructive" />
                      ) : (
                        <TestTube className="h-4 w-4" />
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Test connection</p>
                    {testResult?.message && (
                      <p
                        className={cn(
                          'text-xs',
                          testResult.success ? 'text-green-500' : 'text-destructive'
                        )}
                      >
                        {testResult.message}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggle(provider.id, false)}
                className="h-8 text-muted-foreground hover:text-destructive"
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                <span className="hidden sm:inline">Disconnect</span>
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onConnect(provider.id, provider.name)}
              className="h-8"
            >
              <Plug className="h-4 w-4 mr-1" />
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* Models Row - Small badges */}
      {models.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pl-12">
          {displayedModels.map((model) => (
            <Badge key={model} variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
              {model}
            </Badge>
          ))}
          {hasMoreModels && !showAllModels && (
            <button
              onClick={() => setShowAllModels(true)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              +{models.length - 4} more
            </button>
          )}
          {showAllModels && hasMoreModels && (
            <button
              onClick={() => setShowAllModels(false)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
            >
              Less <ChevronRight className="h-3 w-3 rotate-90" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
