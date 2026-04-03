'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Search,
  Save,
  RotateCcw,
  Key,
  Globe,
  Loader2,
  Plug,
  Zap,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  TestTube,
  Wrench,
  Brain,
  Paperclip,
  DollarSign,
  Maximize,
  MoreHorizontal,
  Plus,
  LayoutGrid,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Label } from '@/components/ui/label';
import { cn } from '@/shared/lib/utils';
import { useUnsavedChangesWarning } from '@/shared/hooks/use-unsaved-changes-warning';
import { OAuthDialog } from '@/features/auth';
import {
  useAvailableModels,
  useProvidersStatus,
  MODELS_QUERY_KEY,
  PROVIDERS_STATUS_QUERY_KEY,
} from '../../hooks';
import { fetchModelsRegistry, setProviderAuth, testProviderConnection } from '../../api';
import {
  ModelInfo,
  ProviderStatusItem,
  ModelsDevProvider,
  ModelsDevModel,
  ProviderTestResult,
} from '../../types';
import { PROVIDERS, providerFromModelsDevData, getProviderBadgeColor, getProviderTextColor } from './provider-constants';

// ============================================================================
// Conversion Utility: ModelInfo -> ModelsDevModel
// ============================================================================

function modelInfoToDevModel(model: ModelInfo): ModelsDevModel {
  return {
    id: model.id,
    name: model.name,
    family: model.family || model.provider,
    attachment: model.attachment ?? false,
    reasoning: model.reasoning ?? false,
    tool_call: model.tool_call ?? false,
    cost: (model.input_price !== undefined && model.input_price !== null) || 
          (model.output_price !== undefined && model.output_price !== null) ? {
      input: model.input_price ?? undefined,
      output: model.output_price ?? undefined,
      cache_read: model.cache_read_price ?? undefined,
      cache_write: model.cache_write_price ?? undefined,
    } : undefined,
    limit: (model.context_window !== undefined && model.context_window !== null) || 
            (model.max_output !== undefined && model.max_output !== null) ? {
      context: model.context_window ?? undefined,
      output: model.max_output ?? undefined,
    } : undefined,
    modalities: model.modalities ?? undefined,
  };
}

// ============================================================================
// Types
// ============================================================================

interface EnhancedProviderStatus extends ProviderStatusItem {
  modelCount?: number;
  modelsDevData?: ModelsDevProvider;
}

interface ModelSettings {
  defaultModel: string;
}

// ============================================================================
// Constants
// ============================================================================

// Top 20 popular providers based on common usage
const POPULAR_PROVIDER_IDS = new Set([
  'openai',
  'anthropic',
  'google',
  'azure-openai',
  'copilot',
  'bedrock',
  'groq',
  'together',
  'mistral',
  'fireworks',
  'cohere',
  'deepseek',
  'xai',
  'openrouter',
  'cerebras',
  'ollama',
  'lmstudio',
  'perplexity',
  'ai21',
  'huggingface',
]);

// Local providers that don't require API keys
const LOCAL_PROVIDER_IDS = new Set(['ollama', 'lmstudio', 'vllm']);

// ============================================================================
// Helper Components
// ============================================================================

function CapabilityBadge({
  icon: Icon,
  label,
  variant = 'secondary',
}: {
  icon: React.ElementType;
  label: string;
  variant?: 'secondary' | 'outline' | 'default' | 'destructive';
}) {
  return (
    <Badge variant={variant} className="gap-1 text-xs">
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  );
}

function ModelCapabilities({ model }: { model: ModelsDevModel }) {
  return (
    <div className="flex flex-wrap gap-1">
      {model.tool_call && (
        <CapabilityBadge icon={Wrench} label="Tools" variant="outline" />
      )}
      {model.reasoning && (
        <CapabilityBadge icon={Brain} label="Reasoning" variant="outline" />
      )}
      {model.attachment && (
        <CapabilityBadge icon={Paperclip} label="Attachments" variant="outline" />
      )}
    </div>
  );
}

function ModelPricing({ model }: { model: ModelsDevModel }) {
  if (!model.cost?.input && !model.cost?.output) return null;

  const formatPrice = (price?: number) => {
    if (!price) return '-';
    return `$${price.toFixed(2)}`;
  };

  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <DollarSign className="h-3 w-3" />
      <span>In: {formatPrice(model.cost.input)}/M</span>
      <span>Out: {formatPrice(model.cost.output)}/M</span>
    </div>
  );
}

function ModelContextWindow({ model }: { model: ModelsDevModel }) {
  if (!model.limit?.context) return null;

  const formatTokens = (tokens: number) => {
    if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`;
    if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`;
    return tokens.toString();
  };

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Maximize className="h-3 w-3" />
      <span>{formatTokens(model.limit.context)} ctx</span>
    </div>
  );
}

// ============================================================================
// API Key Dialog
// ============================================================================

interface ApiKeyDialogProps {
  providerId: string;
  providerName: string;
  requiresEndpoint: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (apiKey: string, endpoint?: string) => void;
}

function ApiKeyDialog({
  providerId,
  providerName,
  requiresEndpoint,
  isOpen,
  onClose,
  onSubmit,
}: ApiKeyDialogProps) {
  const [apiKey, setApiKey] = React.useState('');
  const [endpoint, setEndpoint] = React.useState('');
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setApiKey('');
      setEndpoint('');
      setIsSubmitting(false);
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;
    setIsSubmitting(true);
    try {
      await onSubmit(apiKey.trim(), requiresEndpoint ? endpoint.trim() : undefined);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Connect {providerName}
          </DialogTitle>
          <DialogDescription>
            Enter your {providerName} API key to connect this provider.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="api-key">API Key</Label>
            <Input
              id="api-key"
              type="password"
              placeholder={`Enter your ${providerName} API key`}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoFocus
            />
          </div>
          {requiresEndpoint && (
            <div className="space-y-2">
              <Label htmlFor="endpoint" className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Endpoint URL
              </Label>
              <Input
                id="endpoint"
                type="url"
                placeholder="https://api.example.com/v1"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={!apiKey.trim() || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Connecting...
                </>
              ) : (
                'Connect'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// Default Model Card Component
// ============================================================================

interface DefaultModelCardProps {
  settings: ModelSettings;
  originalSettings: ModelSettings;
  hasChanges: boolean;
  isSaving: boolean;
  availableModels: ModelInfo[];
  modelsLoading: boolean;
  onModelClick: () => void;
  onSave: () => void;
  onReset: () => void;
}

function DefaultModelCard({
  settings,
  hasChanges,
  isSaving,
  availableModels,
  modelsLoading,
  onModelClick,
  onSave,
  onReset,
}: DefaultModelCardProps) {
  const selectedModel = availableModels.find((m) => m.id === settings.defaultModel);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Default Model
        </CardTitle>
        <CardDescription>
          The model used by default for new agents and conversations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {modelsLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : selectedModel ? (
          <button
            onClick={onModelClick}
            className="w-full text-left p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="font-semibold">{selectedModel.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedModel.provider}
                </p>
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {selectedModel.tool_call && (
                  <Badge variant="outline" className="text-xs">Tools</Badge>
                )}
                {selectedModel.reasoning && (
                  <Badge variant="outline" className="text-xs">Reasoning</Badge>
                )}
                {selectedModel.attachment && (
                  <Badge variant="outline" className="text-xs">Attachments</Badge>
                )}
                {selectedModel.context_window && (
                  <Badge variant="secondary" className="text-xs">
                    {(selectedModel.context_window / 1000).toFixed(0)}K ctx
                  </Badge>
                )}
              </div>
            </div>
          </button>
        ) : (
          <button
            onClick={onModelClick}
            className="w-full p-4 rounded-lg border border-dashed bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <LayoutGrid className="h-8 w-8" />
              <p>Select a default model</p>
            </div>
          </button>
        )}

        {hasChanges && (
          <>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onReset} disabled={isSaving} size="sm">
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={onSave} disabled={isSaving} size="sm">
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Connected Provider Row Component
// ============================================================================

interface ConnectedProviderRowProps {
  provider: EnhancedProviderStatus;
  liveModels: ModelInfo[];
  onEdit: () => void;
  onTest: () => Promise<ProviderTestResult>;
  onDisconnect: () => void;
}

function ConnectedProviderRow({
  provider,
  liveModels,
  onEdit,
  onTest,
  onDisconnect,
}: ConnectedProviderRowProps) {
  const [isExpanded, setIsExpanded] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<ProviderTestResult | null>(null);

  const handleTest = async () => {
    setIsTesting(true);
    try {
      const result = await onTest();
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  // Merge live models with registry models, avoiding duplicates
  const registryModels = provider.modelsDevData?.models || [];
  const registryModelIds = new Set(registryModels.map(m => m.id));
  
  // Filter live models for this provider that aren't already in registry
  const providerLiveModels = liveModels.filter(
    m => m.provider === provider.id && !registryModelIds.has(m.id)
  );
  
  // Convert live models to ModelsDevModel format and merge
  const mergedModels: ModelsDevModel[] = [
    ...registryModels,
    ...providerLiveModels.map(modelInfoToDevModel),
  ];

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className={cn(
            'flex w-full items-center gap-3 p-3 rounded-lg border bg-card text-left transition-colors hover:bg-accent/50 cursor-pointer',
            isExpanded && 'rounded-b-none border-b-0'
          )}
        >
          {/* Status dot */}
          <div
            className={cn(
              'h-2.5 w-2.5 rounded-full shrink-0',
              provider.configured ? 'bg-green-500' : 'bg-red-500'
            )}
          />

          {/* Provider info */}
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">
              {provider.modelsDevData?.name || provider.id}
            </p>
            <p className="text-xs text-muted-foreground">
              {mergedModels.length > 0 ? `${mergedModels.length} models` : 'No models loaded'}
              {testResult?.latencyMs && ` · ${testResult.latencyMs}ms`}
            </p>
          </div>

          {/* Actions — stop propagation so clicks don't toggle the row */}
          <div
            className="flex items-center gap-1 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onEdit}>
                  <Key className="h-4 w-4 mr-2" />
                  Edit Connection
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleTest} disabled={isTesting}>
                  {isTesting ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : testResult?.success ? (
                    <Check className="h-4 w-4 mr-2 text-green-500" />
                  ) : testResult?.success === false ? (
                    <X className="h-4 w-4 mr-2 text-destructive" />
                  ) : (
                    <TestTube className="h-4 w-4 mr-2" />
                  )}
                  Test Connection
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDisconnect} className="text-destructive">
                  <Plug className="h-4 w-4 mr-2" />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Expand indicator */}
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="rounded-b-lg border border-t-0 bg-card/50">
          {mergedModels.length > 0 ? (
            <div className="max-h-48 overflow-y-auto divide-y">
              {mergedModels.map((model) => (
                <div
                  key={model.id}
                  className="flex items-center justify-between px-4 py-2 text-sm"
                >
                  <span className="truncate">{model.name}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {model.tool_call && (
                      <Badge variant="outline" className="text-xs h-5 px-1.5">Tools</Badge>
                    )}
                    {model.reasoning && (
                      <Badge variant="outline" className="text-xs h-5 px-1.5">Reasoning</Badge>
                    )}
                    <ModelContextWindow model={model} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-4 py-3 text-xs text-muted-foreground">No models available</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Connected Providers Card Component
// ============================================================================

interface ConnectedProvidersCardProps {
  providers: EnhancedProviderStatus[];
  liveModels: ModelInfo[];
  onConnect: (provider: EnhancedProviderStatus) => void;
  onDisconnect: (providerId: string) => void;
  onTest: (providerId: string) => Promise<ProviderTestResult>;
  onAddProvider: () => void;
  isLoading: boolean;
}

function ConnectedProvidersCard({
  providers,
  liveModels,
  onConnect,
  onDisconnect,
  onTest,
  onAddProvider,
  isLoading,
}: ConnectedProvidersCardProps) {
  const configuredProviders = providers.filter((p) => p.configured);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Connected Providers
          </CardTitle>
          <CardDescription>Manage your AI provider connections</CardDescription>
        </div>
        <Badge variant="secondary">{configuredProviders.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : configuredProviders.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-muted-foreground">No providers connected yet</p>
            <Button onClick={onAddProvider}>
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </div>
        ) : (
          configuredProviders.map((provider) => (
            <ConnectedProviderRow
              key={provider.id}
              provider={provider}
              liveModels={liveModels}
              onEdit={() => onConnect(provider)}
              onTest={() => onTest(provider.id)}
              onDisconnect={() => onDisconnect(provider.id)}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Add Provider Command Dialog
// ============================================================================

interface AddProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  providers: EnhancedProviderStatus[];
  onSelectProvider: (provider: EnhancedProviderStatus) => void;
}

function AddProviderDialog({
  isOpen,
  onClose,
  providers,
  onSelectProvider,
}: AddProviderDialogProps) {
  const configuredIds = new Set(providers.filter((p) => p.configured).map((p) => p.id));

  // Group providers
  const groupedProviders = React.useMemo(() => {
    const popular: EnhancedProviderStatus[] = [];
    const local: EnhancedProviderStatus[] = [];
    const all: EnhancedProviderStatus[] = [];

    // Sort by name
    const sorted = [...providers].sort((a, b) => {
      const nameA = a.modelsDevData?.name || a.id;
      const nameB = b.modelsDevData?.name || b.id;
      return nameA.localeCompare(nameB);
    });

    for (const provider of sorted) {
      all.push(provider);
      if (POPULAR_PROVIDER_IDS.has(provider.id)) {
        popular.push(provider);
      }
      if (LOCAL_PROVIDER_IDS.has(provider.id)) {
        local.push(provider);
      }
    }

    return { popular, local, all };
  }, [providers]);

  return (
    <CommandDialog open={isOpen} onOpenChange={onClose}>
      <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
        <CommandInput placeholder="Search providers..." />
        <CommandList className="max-h-[400px]">
          <CommandEmpty>No providers found.</CommandEmpty>

          {/* Popular Providers */}
          {groupedProviders.popular.length > 0 && (
            <CommandGroup heading="Popular">
              {groupedProviders.popular.map((provider) => (
                <CommandItem
                  key={provider.id}
                  onSelect={() => onSelectProvider(provider)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    <span>{provider.modelsDevData?.name || provider.id}</span>
                  </div>
                  {configuredIds.has(provider.id) && (
                    <Badge variant="default" className="bg-green-500 text-white text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* Local Providers */}
          {groupedProviders.local.length > 0 && (
            <CommandGroup heading="Local">
              {groupedProviders.local.map((provider) => (
                <CommandItem
                  key={provider.id}
                  onSelect={() => onSelectProvider(provider)}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4" />
                    <span>{provider.modelsDevData?.name || provider.id}</span>
                  </div>
                  {configuredIds.has(provider.id) && (
                    <Badge variant="default" className="bg-green-500 text-white text-xs">
                      <Check className="h-3 w-3 mr-1" />
                      Connected
                    </Badge>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {/* All Providers */}
          <CommandGroup heading="All Providers">
            {groupedProviders.all.map((provider) => (
              <CommandItem
                key={provider.id}
                onSelect={() => onSelectProvider(provider)}
                className="flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Plug className="h-4 w-4" />
                  <span>{provider.modelsDevData?.name || provider.id}</span>
                </div>
                {configuredIds.has(provider.id) && (
                  <Badge variant="default" className="bg-green-500 text-white text-xs">
                    <Check className="h-3 w-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

// ============================================================================
// Model Picker Sheet
// ============================================================================

interface ModelPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  providers: EnhancedProviderStatus[];
  liveModels: ModelInfo[];
  currentModel: string;
  onSelectModel: (modelId: string) => void;
}

interface FlattenedModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  model: ModelsDevModel;
  isConnected: boolean;
}

// ============================================================================
// Memoized Model Row Component
// ============================================================================

interface ModelRowProps {
  item: FlattenedModel;
  isSelected: boolean;
  onSelect: (modelId: string) => void;
}

const ModelRow = React.memo(function ModelRow({
  item,
  isSelected,
  onSelect,
}: ModelRowProps) {
  return (
    <button
      onClick={() => onSelect(item.id)}
      className={cn(
        'w-full text-left p-3 mb-2 rounded-lg border transition-colors',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'bg-card hover:bg-accent/50'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <p className="font-medium truncate">{item.name}</p>
          <p className={cn('text-xs', getProviderTextColor(item.providerId))}>
            {item.providerName}
            {!item.isConnected && (
              <span className="ml-2 text-amber-600">
                (provider not connected)
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <ModelContextWindow model={item.model} />
          <ModelPricing model={item.model} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <ModelCapabilities model={item.model} />
        {isSelected && (
          <Badge variant="default" className="text-xs">
            <Check className="h-3 w-3 mr-1" />
            Selected
          </Badge>
        )}
      </div>
    </button>
  );
});

// ============================================================================
// Model Picker Sheet
// ============================================================================

function ModelPickerSheet({
  isOpen,
  onClose,
  providers,
  liveModels,
  currentModel,
  onSelectModel,
}: ModelPickerSheetProps) {
  const [searchQuery, setSearchQuery] = React.useState('');
  const deferredSearch = React.useDeferredValue(searchQuery);
  const [providerFilter, setProviderFilter] = React.useState<string>('all');
  const [capabilityFilters, setCapabilityFilters] = React.useState<{
    tools: boolean;
    reasoning: boolean;
    attachments: boolean;
  }>({ tools: false, reasoning: false, attachments: false });
  const [connectedFilter, setConnectedFilter] = React.useState(false);

  // Memoize configuredIds to avoid recomputation on every render
  const configuredIds = React.useMemo(
    () => new Set(providers.filter((p) => p.configured).map((p) => p.id)),
    [providers]
  );

  // Flatten all models from registry and live models - only compute when sheet is open
  const allModels = React.useMemo((): FlattenedModel[] => {
    // Skip expensive computation when sheet is closed
    if (!isOpen) return [];

    const models: FlattenedModel[] = [];
    const seenModelIds = new Set<string>();

    // Add models from registry
    for (const provider of providers) {
      if (provider.modelsDevData?.models) {
        for (const model of provider.modelsDevData.models) {
          if (!seenModelIds.has(model.id)) {
            seenModelIds.add(model.id);
            models.push({
              id: model.id,
              name: model.name,
              providerId: provider.id,
              providerName: provider.modelsDevData.name || provider.id,
              model,
              isConnected: provider.configured,
            });
          }
        }
      }
    }

    // Add live models not already in registry
    for (const liveModel of liveModels) {
      if (!seenModelIds.has(liveModel.id)) {
        seenModelIds.add(liveModel.id);
        const provider = providers.find(p => p.id === liveModel.provider);
        const devModel = modelInfoToDevModel(liveModel);
        models.push({
          id: liveModel.id,
          name: liveModel.name,
          providerId: liveModel.provider,
          providerName: provider?.modelsDevData?.name || liveModel.provider,
          model: devModel,
          isConnected: provider?.configured ?? false,
        });
      }
    }

    // Sort: connected providers first, then by name
    return models.sort((a, b) => {
      if (a.isConnected && !b.isConnected) return -1;
      if (!a.isConnected && b.isConnected) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [providers, liveModels, isOpen]);

  // Filter models - uses deferredSearch for performance
  // When filtering by provider, build a complete list from that provider (not just globally unique models)
  const filteredModels = React.useMemo(() => {
    // If filtering by a specific provider, build a complete list from that provider only
    if (providerFilter !== 'all') {
      const targetProvider = providers.find(p => p.id === providerFilter);
      if (!targetProvider) return [];

      const providerModels: FlattenedModel[] = [];
      const seenIds = new Set<string>();

      // Add registry models for this provider
      if (targetProvider.modelsDevData?.models) {
        for (const model of targetProvider.modelsDevData.models) {
          if (!seenIds.has(model.id)) {
            seenIds.add(model.id);
            providerModels.push({
              id: model.id,
              name: model.name,
              providerId: targetProvider.id,
              providerName: targetProvider.modelsDevData.name || targetProvider.id,
              model,
              isConnected: targetProvider.configured,
            });
          }
        }
      }

      // Add live models for this provider (that aren't already in registry)
      const providerLiveModels = liveModels.filter(m => m.provider === providerFilter);
      for (const liveModel of providerLiveModels) {
        if (!seenIds.has(liveModel.id)) {
          seenIds.add(liveModel.id);
          const devModel = modelInfoToDevModel(liveModel);
          providerModels.push({
            id: liveModel.id,
            name: liveModel.name,
            providerId: liveModel.provider,
            providerName: targetProvider.modelsDevData?.name || liveModel.provider,
            model: devModel,
            isConnected: targetProvider.configured,
          });
        }
      }

      // Apply text search and capability filters to provider-specific models
      let filtered = providerModels;

      // Text search
      if (deferredSearch.trim()) {
        const query = deferredSearch.toLowerCase();
        filtered = filtered.filter(
          (m) =>
            m.name.toLowerCase().includes(query) ||
            m.id.toLowerCase().includes(query)
        );
      }

      // Capability filters
      if (capabilityFilters.tools) {
        filtered = filtered.filter((m) => m.model.tool_call);
      }
      if (capabilityFilters.reasoning) {
        filtered = filtered.filter((m) => m.model.reasoning);
      }
      if (capabilityFilters.attachments) {
        filtered = filtered.filter((m) => m.model.attachment);
      }

      // Connected filter (redundant when filtering by configured provider, but keep for consistency)
      if (connectedFilter) {
        filtered = filtered.filter((m) => m.isConnected);
      }

      return filtered;
    }

    // "All providers" mode - use the globally deduplicated allModels
    let filtered = allModels;

    // Text search
    if (deferredSearch.trim()) {
      const query = deferredSearch.toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.providerName.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query)
      );
    }

    // Capability filters
    if (capabilityFilters.tools) {
      filtered = filtered.filter((m) => m.model.tool_call);
    }
    if (capabilityFilters.reasoning) {
      filtered = filtered.filter((m) => m.model.reasoning);
    }
    if (capabilityFilters.attachments) {
      filtered = filtered.filter((m) => m.model.attachment);
    }

    // Connected filter
    if (connectedFilter) {
      filtered = filtered.filter((m) => m.isConnected);
    }

    return filtered;
  }, [allModels, deferredSearch, providerFilter, capabilityFilters, connectedFilter, providers, liveModels]);

  // Virtualization setup
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredModels.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96, // ~88px content + 8px margin
    overscan: 5,
  });

  // Force virtualizer to recalculate after Sheet content mounts in the DOM
  React.useEffect(() => {
    if (isOpen) {
      // Sheet portal needs a frame to mount — then re-measure so virtualizer picks up the scroll element
      const raf = requestAnimationFrame(() => {
        virtualizer.measure();
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [isOpen, virtualizer]);

  // Get unique providers for filter dropdown
  const uniqueProviders = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const provider of providers) {
      map.set(provider.id, provider.modelsDevData?.name || provider.id);
    }
    return Array.from(map.entries()).sort((a, b) => {
      const aConnected = configuredIds.has(a[0]);
      const bConnected = configuredIds.has(b[0]);
      if (aConnected && !bConnected) return -1;
      if (!aConnected && bConnected) return 1;
      return a[1].localeCompare(b[1]);
    });
  }, [providers, configuredIds]);

  const toggleCapability = (key: keyof typeof capabilityFilters) => {
    setCapabilityFilters((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectModel = React.useCallback((modelId: string) => {
    onSelectModel(modelId);
    onClose();
  }, [onSelectModel, onClose]);

  // Reset filters when sheet opens
  React.useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setProviderFilter('all');
      setCapabilityFilters({ tools: false, reasoning: false, attachments: false });
      setConnectedFilter(false);
    }
  }, [isOpen]);

  const virtualItems = virtualizer.getVirtualItems();

  // Compute total model count for accurate display
  // When showing "all", use globally deduplicated count
  // When filtering by provider, show that provider's actual total
  const totalModelCount = React.useMemo(() => {
    if (providerFilter === 'all') {
      return allModels.length;
    }
    // For specific provider, calculate their total (registry + live, deduplicated within provider)
    const provider = providers.find(p => p.id === providerFilter);
    if (!provider) return allModels.length;

    const registryModels = provider.modelsDevData?.models || [];
    const registryModelIds = new Set(registryModels.map(m => m.id));
    const providerLiveModels = liveModels.filter(m => m.provider === providerFilter && !registryModelIds.has(m.id));

    return registryModels.length + providerLiveModels.length;
  }, [providerFilter, providers, liveModels, allModels.length]);

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent className="sm:max-w-xl w-full flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <LayoutGrid className="h-5 w-5" />
            Browse Models
          </SheetTitle>
          <SheetDescription>
            Select a model to use as your default
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4 flex-1 flex flex-col min-h-0">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search models..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger className="w-[180px] h-8">
                <SelectValue placeholder="All providers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All providers</SelectItem>
                {uniqueProviders.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    <div className="flex items-center gap-2">
                      {configuredIds.has(id) && (
                        <div className="h-2 w-2 rounded-full bg-green-500" />
                      )}
                      {name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Badge
              variant={capabilityFilters.tools ? 'default' : 'outline'}
              className="cursor-pointer h-7"
              onClick={() => toggleCapability('tools')}
            >
              <Wrench className="h-3 w-3 mr-1" />
              Tools
            </Badge>
            <Badge
              variant={connectedFilter ? 'default' : 'outline'}
              className="cursor-pointer h-7"
              onClick={() => setConnectedFilter((prev) => !prev)}
            >
              <Plug className="h-3 w-3 mr-1" />
              Connected
            </Badge>
            <Badge
              variant={capabilityFilters.reasoning ? 'default' : 'outline'}
              className="cursor-pointer h-7"
              onClick={() => toggleCapability('reasoning')}
            >
              <Brain className="h-3 w-3 mr-1" />
              Reasoning
            </Badge>
            <Badge
              variant={capabilityFilters.attachments ? 'default' : 'outline'}
              className="cursor-pointer h-7"
              onClick={() => toggleCapability('attachments')}
            >
              <Paperclip className="h-3 w-3 mr-1" />
              Attachments
            </Badge>
          </div>

          {/* Results count */}
          <p className="text-xs text-muted-foreground">
            Showing {filteredModels.length} of {totalModelCount} models
          </p>

          {/* Virtualized Model list */}
          <div
            ref={parentRef}
            className="flex-1 min-h-[300px] overflow-y-auto -mx-6 px-6"
          >
            {filteredModels.length > 0 ? (
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  position: 'relative',
                }}
              >
                {virtualItems.map((virtualRow) => {
                  const item = filteredModels[virtualRow.index];
                  return (
                    <div
                      key={virtualRow.key}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      data-index={virtualRow.index}
                      ref={virtualizer.measureElement}
                    >
                      <ModelRow
                        item={item}
                        isSelected={currentModel === item.id}
                        onSelect={handleSelectModel}
                      />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <p>No models match your filters</p>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setProviderFilter('all');
                    setCapabilityFilters({ tools: false, reasoning: false, attachments: false });
                    setConnectedFilter(false);
                  }}
                  className="mt-2"
                >
                  Clear filters
                </Button>
              </div>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export function ModelsPage() {
  // Settings state
  const [settings, setSettings] = React.useState<ModelSettings>({ defaultModel: 'gpt-4o-mini' });
  const [originalSettings, setOriginalSettings] = React.useState<ModelSettings>({
    defaultModel: 'gpt-4o-mini',
  });
  const [hasChanges, setHasChanges] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);

  // Dialog states
  const [apiKeyDialogOpen, setApiKeyDialogOpen] = React.useState(false);
  const [activeProvider, setActiveProvider] = React.useState<EnhancedProviderStatus | null>(null);
  const [oauthDialogOpen, setOauthDialogOpen] = React.useState(false);
  const [oauthProvider, setOauthProvider] = React.useState<{ id: string; name: string } | null>(
    null
  );
  const [addProviderDialogOpen, setAddProviderDialogOpen] = React.useState(false);
  const [modelPickerOpen, setModelPickerOpen] = React.useState(false);

  // Data fetching
  const queryClient = useQueryClient();
  const { data: availableModels = [], isLoading: modelsLoading } = useAvailableModels();
  const { data: providerStatuses = [], isLoading: providersLoading } = useProvidersStatus();
  const [modelsRegistry, setModelsRegistry] = React.useState<Map<string, ModelsDevProvider>>(
    new Map()
  );
  const [isLoadingRegistry, setIsLoadingRegistry] = React.useState(false);

  // ID aliases for providers with mismatched IDs
  const providerIdAliases: Record<string, string[]> = {
    'copilot': ['github-copilot'],
    'fireworks': ['fireworks-ai'],
  };

  // Helper to get provider data with alias support
  const getProviderFromRegistry = (id: string): ModelsDevProvider | undefined => {
    // Direct lookup
    let data = modelsRegistry.get(id);
    if (data) return data;

    // Try aliases
    const aliases = providerIdAliases[id];
    if (aliases) {
      for (const alias of aliases) {
        data = modelsRegistry.get(alias);
        if (data) return data;
      }
    }

    return undefined;
  };

  // Load models registry for configured providers
  React.useEffect(() => {
    const loadRegistry = async () => {
      setIsLoadingRegistry(true);
      try {
        const registry = await fetchModelsRegistry();
        const registryMap = new Map<string, ModelsDevProvider>();
        for (const provider of registry) {
          registryMap.set(provider.id, provider);
        }
        setModelsRegistry(registryMap);
      } catch {
        // Silently fail
      } finally {
        setIsLoadingRegistry(false);
      }
    };
    loadRegistry();
  }, []);

  // Load saved settings
  React.useEffect(() => {
    const saved = localStorage.getItem('modelSettings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const newSettings = { defaultModel: parsed.defaultModel ?? 'gpt-4o-mini' };
        setSettings(newSettings);
        setOriginalSettings(newSettings);
      } catch {
        // ignore parse errors
      }
    }
    setIsLoaded(true);
  }, []);

  // Track changes
  React.useEffect(() => {
    const changed = JSON.stringify(settings) !== JSON.stringify(originalSettings);
    setHasChanges(changed);
  }, [settings, originalSettings]);

  // Unsaved changes warning
  useUnsavedChangesWarning({ hasChanges });

  // Enhance provider statuses with models.dev data
  const enhancedProviders = React.useMemo((): EnhancedProviderStatus[] => {
    const statusMap = new Map<string, ProviderStatusItem>();
    for (const status of providerStatuses) {
      statusMap.set(status.id, status);
    }

    // Start with all providers from backend status (105+)
    const allProviders = new Map<string, EnhancedProviderStatus>();

    // Add from backend status
    for (const status of providerStatuses) {
      const modelsDevData = getProviderFromRegistry(status.id);
      allProviders.set(status.id, {
        ...status,
        modelCount: modelsDevData?.models?.length ?? status.method ? 1 : 0,
        modelsDevData,
      });
    }

    // Add from models registry if not already present
    for (const [id, data] of modelsRegistry) {
      if (!allProviders.has(id)) {
        allProviders.set(id, {
          id,
          name: data.name || id,
          configured: false,
          modelCount: data.models?.length ?? 0,
          modelsDevData: data,
        });
      }
    }

    // Add from fallback list if still missing
    for (const provider of PROVIDERS) {
      if (!allProviders.has(provider.id)) {
        allProviders.set(provider.id, {
          id: provider.id,
          name: provider.name,
          configured: false,
        });
      }
    }

    return Array.from(allProviders.values());
  }, [providerStatuses, modelsRegistry]);

  // Handlers
  const handleModelChange = (modelId: string) => {
    setSettings((prev) => ({ ...prev, defaultModel: modelId }));
  };

  const handleConnect = (provider: EnhancedProviderStatus) => {
    const providerId = provider.id;
    const requiresOAuth = providerId === 'copilot' || providerId === 'github-copilot';

    if (requiresOAuth) {
      setOauthProvider({ id: providerId, name: provider.modelsDevData?.name || providerId });
      setOauthDialogOpen(true);
      return;
    }

    setActiveProvider(provider);
    setApiKeyDialogOpen(true);
  };

  const handleApiKeySubmit = async (apiKey: string, endpoint?: string) => {
    if (!activeProvider) return;

    try {
      const result = await setProviderAuth(activeProvider.id, apiKey, endpoint);
      if (result.success) {
        toast.success(`${activeProvider.modelsDevData?.name || activeProvider.id} connected successfully`);
        queryClient.invalidateQueries({ queryKey: PROVIDERS_STATUS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
        setApiKeyDialogOpen(false);
        setActiveProvider(null);
      } else {
        toast.error(`Failed to connect: ${result.message}`);
      }
    } catch {
      toast.error(`Failed to connect to ${activeProvider.modelsDevData?.name || activeProvider.id}`);
    }
  };

  const handleDisconnect = async (providerId: string) => {
    // Store previous state for potential rollback
    const previousStatuses = queryClient.getQueryData<ProviderStatusItem[]>(PROVIDERS_STATUS_QUERY_KEY);

    // Optimistically update cache to show provider as disconnected immediately
    queryClient.setQueryData<ProviderStatusItem[]>(PROVIDERS_STATUS_QUERY_KEY, (old) => {
      if (!old) return old;
      return old.map((p) =>
        p.id === providerId ? { ...p, configured: false, method: undefined } : p
      );
    });

    try {
      const { removeProviderAuth } = await import('../../api');
      await removeProviderAuth(providerId);
      toast.success('Provider disconnected');
      // Refetch to ensure server state consistency
      await queryClient.invalidateQueries({ queryKey: PROVIDERS_STATUS_QUERY_KEY });
      await queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
    } catch {
      // Revert optimistic update on failure
      queryClient.setQueryData(PROVIDERS_STATUS_QUERY_KEY, previousStatuses);
      toast.error('Failed to disconnect provider');
    }
  };

  const handleTest = async (providerId: string) => {
    return testProviderConnection(providerId);
  };

  const handleOAuthComplete = () => {
    setOauthDialogOpen(false);
    if (oauthProvider) {
      toast.success(`${oauthProvider.name} connected successfully`);
    }
    queryClient.invalidateQueries({ queryKey: PROVIDERS_STATUS_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
    setOauthProvider(null);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      localStorage.setItem('modelSettings', JSON.stringify(settings));
      setOriginalSettings(settings);
      setHasChanges(false);
      toast.success('Model settings saved successfully');
    } catch {
      toast.error('Failed to save model settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset model settings to defaults?')) {
      const defaults = { defaultModel: 'gpt-4o-mini' };
      setSettings(defaults);
      setOriginalSettings(defaults);
      setHasChanges(false);
      localStorage.removeItem('modelSettings');
      toast.info('Model settings reset to defaults');
    }
  };

  if (!isLoaded || providersLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const activeProviderRequiresEndpoint =
    activeProvider?.id.includes('azure') ||
    ['ollama', 'lmstudio', 'vllm'].includes(activeProvider?.id || '');

  return (
    <div className="space-y-6">
      {/* Section A: Default Model Card */}
      <DefaultModelCard
        settings={settings}
        originalSettings={originalSettings}
        hasChanges={hasChanges}
        isSaving={isSaving}
        availableModels={availableModels}
        modelsLoading={modelsLoading}
        onModelClick={() => setModelPickerOpen(true)}
        onSave={handleSave}
        onReset={handleReset}
      />

      {/* Section B: Connected Providers */}
      <ConnectedProvidersCard
        providers={enhancedProviders}
        liveModels={availableModels}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onTest={handleTest}
        onAddProvider={() => setAddProviderDialogOpen(true)}
        isLoading={isLoadingRegistry || providersLoading}
      />

      {/* Section C: Action Bar */}
      <div className="flex gap-3">
        <Button onClick={() => setAddProviderDialogOpen(true)} variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Provider
        </Button>
        <Button onClick={() => setModelPickerOpen(true)}>
          <LayoutGrid className="h-4 w-4 mr-2" />
          Browse Models
        </Button>
      </div>

      {/* Add Provider Command Dialog */}
      <AddProviderDialog
        isOpen={addProviderDialogOpen}
        onClose={() => setAddProviderDialogOpen(false)}
        providers={enhancedProviders}
        onSelectProvider={(provider) => {
          setAddProviderDialogOpen(false);
          handleConnect(provider);
        }}
      />

      {/* Model Picker Sheet */}
      <ModelPickerSheet
        isOpen={modelPickerOpen}
        onClose={() => setModelPickerOpen(false)}
        providers={enhancedProviders}
        liveModels={availableModels}
        currentModel={settings.defaultModel}
        onSelectModel={handleModelChange}
      />

      {/* OAuth Dialog */}
      {oauthProvider && (
        <OAuthDialog
          provider={oauthProvider.id}
          providerName={oauthProvider.name}
          isOpen={oauthDialogOpen}
          onClose={() => {
            setOauthDialogOpen(false);
            setOauthProvider(null);
          }}
          onComplete={handleOAuthComplete}
        />
      )}

      {/* API Key Dialog */}
      <ApiKeyDialog
        providerId={activeProvider?.id || ''}
        providerName={activeProvider?.modelsDevData?.name || activeProvider?.id || ''}
        requiresEndpoint={activeProviderRequiresEndpoint}
        isOpen={apiKeyDialogOpen}
        onClose={() => {
          setApiKeyDialogOpen(false);
          setActiveProvider(null);
        }}
        onSubmit={handleApiKeySubmit}
      />
    </div>
  );
}
