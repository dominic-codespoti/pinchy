'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  PROVIDERS,
  type ProviderConfig,
  type ProviderStatusItem,
  type ProviderTestResult,
  getProviderBadgeColor,
} from '@/features/settings/api/models';
import {
  Check,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  Zap,
  Unplug,
  Plus,
  Plug,
  Key,
  Lock,
  TestTube,
  ChevronLeft,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface ProviderListProps {
  providers: ProviderConfig[];
  backendStatus: Map<string, ProviderStatusItem>;
  onConnect: (providerId: string, providerName: string) => void;
  onTest: (providerId: string) => Promise<ProviderTestResult>;
  onToggle: (providerId: string, enabled: boolean) => void;
  searchQuery?: string;
}

// Provider icon mapping
const providerIcons: Record<string, React.ReactNode> = {
  openai: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M22.282 9.821a5.985 5.985 0 0 0-.516-4.91 6.046 6.046 0 0 0-6.51-2.9A6.065 6.065 0 0 0 4.981 4.18a5.985 5.985 0 0 0-3.998 2.9 6.046 6.046 0 0 0 .743 7.097 5.98 5.98 0 0 0 .51 4.911 6.051 6.051 0 0 0 6.515 2.9A5.985 5.985 0 0 0 13.26 24a6.056 6.056 0 0 0 5.772-4.206 5.99 5.99 0 0 0 3.997-2.9 6.056 6.056 0 0 0-.747-7.073zM13.26 22.43a4.476 4.476 0 0 1-2.876-1.04l.141-.081 4.779-2.758a.795.795 0 0 0 .392-.681v-6.737l2.02 1.168a.071.071 0 0 1 .038.052v5.583a4.504 4.504 0 0 1-4.494 4.494zM3.6 18.304a4.47 4.47 0 0 1-.535-3.014l.142.085 4.783 2.759a.771.771 0 0 0 .78 0l5.843-3.369v2.332a.08.08 0 0 1-.033.062L9.74 19.95a4.5 4.5 0 0 1-6.14-1.646zM2.34 7.896a4.485 4.485 0 0 1 2.366-1.973V11.6a.766.766 0 0 0 .388.676l5.815 3.355-2.02 1.168a.076.076 0 0 1-.071 0l-4.83-2.786A4.504 4.504 0 0 1 2.34 7.896zm16.597 3.855-5.833-3.387L15.119 7.2a.076.076 0 0 1 .071 0l4.83 2.791a4.494 4.494 0 0 1-.676 8.105v-5.678a.79.79 0 0 0-.407-.667zm2.01-3.023-.141-.085-4.774-2.782a.776.776 0 0 0-.785 0L9.409 9.23V6.897a.066.066 0 0 1 .028-.061l4.83-2.787a4.5 4.5 0 0 1 6.68 4.66zm-12.64 4.135-2.02-1.164a.08.08 0 0 1-.038-.057V6.075a4.5 4.5 0 0 1 7.375-3.453l-.142.08L8.704 5.46a.795.795 0 0 0-.393.681zm1.097-2.365 2.602-1.5 2.607 1.5v2.999l-2.597 1.5-2.606-1.5z" />
    </svg>
  ),
  copilot: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
    </svg>
  ),
  anthropic: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M17.304 3.541h-3.672l6.696 16.918h3.672zm-10.608 0L0 20.459h3.744l1.368-3.6h6.624l1.368 3.6h3.744L10.152 3.541zm-.264 10.656 1.848-4.848 1.848 4.848z" />
    </svg>
  ),
  google: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5.2 14.2c-.46.66-1.15 1.2-1.97 1.55-.82.35-1.75.53-2.79.53-1.42 0-2.67-.49-3.75-1.47-1.08-.98-1.62-2.21-1.62-3.68 0-1.47.54-2.7 1.62-3.68 1.08-.98 2.33-1.47 3.75-1.47 1.04 0 1.97.18 2.79.53.82.35 1.51.89 1.97 1.55v2.05h-3.9v1.4h5.5v-4.2c-.6-.75-1.35-1.35-2.25-1.8-.9-.45-1.9-.67-3-.67-1.86 0-3.4.63-4.62 1.9C7.63 8.4 7.02 10.02 7.02 12s.61 3.6 1.83 4.88c1.22 1.27 2.76 1.9 4.62 1.9 1.1 0 2.1-.22 3-.67.9-.45 1.65-1.05 2.25-1.8l1.2 1.15z" />
    </svg>
  ),
  azure: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M5.483 21.3H24L14.025 4.013l-3.038 8.347 5.836 6.938L5.483 21.3zM13.23 2.7L6.105 8.677 0 19.253h5.505l8.295-16.553z" />
    </svg>
  ),
  bedrock: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  ),
  cohere: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
    </svg>
  ),
  cerebras: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2L2 22h20L12 2zm0 4l7 14H5l7-14z" />
    </svg>
  ),
  groq: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  ),
  together: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  ),
  xai: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  ),
  mistral: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
      <path d="M12 2L8 7h8l-4-5zm-6 6l-4 5h8l-4-5zm12 0l-4 5h8l-4-5zM6 14l-4 5h8l-4-5zm12 0l-4 5h8l-4-5z" />
    </svg>
  ),
};

// Get available models for a provider
const getProviderModels = (providerId: string): string[] => {
  const modelMap: Record<string, string[]> = {
    openai: ['GPT-4o', 'GPT-4o Mini', 'GPT-4 Turbo', 'o3-mini'],
    azure: ['GPT-4', 'GPT-4o', 'GPT-3.5 Turbo'],
    copilot: ['Copilot GPT-4', 'Copilot Claude'],
    anthropic: ['Claude 3.5 Sonnet', 'Claude 3 Opus', 'Claude 3 Haiku'],
    google: ['Gemini Pro', 'Gemini Ultra'],
    bedrock: ['Claude 3', 'Llama 3', 'Titan'],
    cohere: ['Command', 'Command Light'],
    cerebras: ['Llama 3.1 70B', 'Llama 3.1 8B'],
    groq: ['Llama 3.1 70B', 'Llama 3.1 8B', 'Mixtral 8x7B'],
    together: ['Llama 3', 'Qwen 2', 'DeepSeek'],
    xai: ['Grok 2', 'Grok 1.5'],
    mistral: ['Mistral Large', 'Mistral Medium', 'Codestral'],
  };
  return modelMap[providerId] || [];
};

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

// Status Indicator Component
function StatusIndicator({
  status,
  isConnected,
}: {
  status?: ProviderStatusItem;
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

// Simplified Provider List Item (OpenCode pattern)
function ProviderListItem({
  provider,
  meta,
  backend,
  isConnected,
  onConnect,
  onTest,
  onToggle,
}: {
  provider: ProviderConfig;
  meta?: (typeof PROVIDERS)[number];
  backend?: ProviderStatusItem;
  isConnected: boolean;
  onConnect: (providerId: string, providerName: string) => void;
  onTest: (providerId: string) => Promise<ProviderTestResult>;
  onToggle: (providerId: string, enabled: boolean) => void;
}) {
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
  const authMethod = backend?.method || (requiresOAuth ? 'oauth' : 'requiresApiKey' in (meta || {}) ? 'api_key' : undefined);

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
                      <p className={cn('text-xs', testResult.success ? 'text-green-500' : 'text-destructive')}>
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

// Empty State Component
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <Card className="flex flex-col items-center justify-center p-12 text-center">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Plug className="h-12 w-12 text-muted-foreground" />
      </div>
      <CardTitle className="text-xl mb-2">No providers connected</CardTitle>
      <CardDescription className="mb-6 max-w-sm">
        Add a provider to get started with AI-powered features
      </CardDescription>
      <Button onClick={onAdd}>
        <Plus className="h-4 w-4 mr-2" />
        Connect Provider
      </Button>
    </Card>
  );
}

// Main Provider List Component
export function ProviderList({
  providers,
  backendStatus,
  onConnect,
  onTest,
  onToggle,
  searchQuery = '',
}: ProviderListProps) {
  // Filter providers based on search query
  const filteredProviders = React.useMemo(() => {
    if (!searchQuery.trim()) return providers;
    const query = searchQuery.toLowerCase();
    return providers.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        getProviderModels(p.id).some((m) => m.toLowerCase().includes(query))
    );
  }, [providers, searchQuery]);

  // Group providers: connected first, then available
  const { connected, available } = React.useMemo(() => {
    const connected: ProviderConfig[] = [];
    const available: ProviderConfig[] = [];

    for (const provider of filteredProviders) {
      const backend = backendStatus.get(provider.id);
      const isConnected = backend?.configured || provider.enabled;

      if (isConnected) {
        connected.push(provider);
      } else {
        available.push(provider);
      }
    }

    return { connected, available };
  }, [filteredProviders, backendStatus]);

  const hasProviders = filteredProviders.length > 0;
  const hasConnected = connected.length > 0;

  if (!hasProviders) {
    return <EmptyState onAdd={() => onConnect('', '')} />;
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="space-y-4">
        {/* Connected Providers */}
        {hasConnected && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Connected ({connected.length})
            </h3>
            <div className="space-y-2">
              {connected.map((config) => {
                const meta = PROVIDERS.find((p) => p.id === config.id);
                const backend = backendStatus.get(config.id);
                const isConnected = backend?.configured || config.enabled;

                return (
                  <ProviderListItem
                    key={config.id}
                    provider={config}
                    meta={meta}
                    backend={backend}
                    isConnected={isConnected}
                    onConnect={onConnect}
                    onTest={onTest}
                    onToggle={onToggle}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Available Providers */}
        {available.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Available ({available.length})
            </h3>
            <div className="space-y-2">
              {available.map((config) => {
                const meta = PROVIDERS.find((p) => p.id === config.id);
                const backend = backendStatus.get(config.id);
                const isConnected = backend?.configured || config.enabled;

                return (
                  <ProviderListItem
                    key={config.id}
                    provider={config}
                    meta={meta}
                    backend={backend}
                    isConnected={isConnected}
                    onConnect={onConnect}
                    onTest={onTest}
                    onToggle={onToggle}
                  />
                );
              })}
            </div>
          </section>
        )}
      </div>
    </TooltipProvider>
  );
}

ProviderList.displayName = 'ProviderList';
