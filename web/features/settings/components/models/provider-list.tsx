'use client';

import * as React from 'react';
import { Unplug, Plus, Plug } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { ProviderConfig, UIProviderStatusItem, ProviderTestResult } from '../../types';
import { getProviderModels, PROVIDERS } from './provider-constants';
import { ProviderListItem } from './provider-list-item';

interface ProviderListProps {
  providers: ProviderConfig[];
  backendStatus: Map<string, UIProviderStatusItem>;
  onConnect: (providerId: string, providerName: string) => void;
  onTest: (providerId: string) => Promise<ProviderTestResult>;
  onToggle: (providerId: string, enabled: boolean) => void;
  searchQuery?: string;
}

// Empty State Component
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border rounded-lg bg-card">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Plug className="h-12 w-12 text-muted-foreground" />
      </div>
      <h3 className="text-xl font-medium mb-2">No providers connected</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Add a provider to get started with AI-powered features
      </p>
      <button
        onClick={onAdd}
        className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-2"
      >
        <Plus className="h-4 w-4" />
        Connect Provider
      </button>
    </div>
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
      const isConnected = backend ? backend.configured : provider.enabled;

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
              const isConnected = backend ? backend.configured : config.enabled;

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
              const isConnected = backend ? backend.configured : config.enabled;

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
  );
}

ProviderList.displayName = 'ProviderList';
