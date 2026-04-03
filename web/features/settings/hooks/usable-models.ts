/**
 * Hook for usable models - merges configured models with discovered provider models
 */

import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '@/shared/api/client';
import { ModelInfo, ConfigModelInfo } from '../types';
import { useConfigModels } from '../hooks';
import { MODELS_QUERY_KEY, PROVIDERS_STATUS_QUERY_KEY } from '../hooks';

// Query key for usable models
export const USABLE_MODELS_QUERY_KEY = ['settings', 'usable-models'];

/** Combined model entry for selectors - includes both config and discovered models */
export interface UsableModelInfo extends ModelInfo {
  /** The config model ID (for configured models) or discovered model ID */
  id: string;
  /** The provider ID */
  provider: string;
  /** Whether this model has a corresponding config entry */
  hasConfigEntry: boolean;
  /** The config model ID to use when saving (same as id for config entries, generated for discovered) */
  configId: string;
  /** The actual catalog model name */
  catalogModel: string;
}

/**
 * Fetch all discovered models from connected providers
 */
async function fetchDiscoveredModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetchApi<{ models: Array<{
      id: string;
      name: string;
      provider: string;
      description?: string;
      input_price?: number;
      output_price?: number;
      context_window?: number;
      max_output?: number;
      tool_call?: boolean;
      reasoning?: boolean;
      attachment?: boolean;
      family?: string;
      cache_read_price?: number;
      cache_write_price?: number;
      modalities?: { input?: string[]; output?: string[] };
    }> }>('/api/models');
    return (response.models || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider,
      description: m.description || m.provider,
      input_price: m.input_price,
      output_price: m.output_price,
      context_window: m.context_window,
      max_output: m.max_output,
      tool_call: m.tool_call,
      reasoning: m.reasoning,
      attachment: m.attachment,
      family: m.family,
      cache_read_price: m.cache_read_price,
      cache_write_price: m.cache_write_price,
      modalities: m.modalities,
    }));
  } catch (error) {
    console.error('[settings] Failed to fetch discovered models:', error);
    return [];
  }
}

/**
 * Create or get a config model entry for a discovered model
 */
async function ensureModelConfig(provider: string, model: string): Promise<{ configId: string }> {
  const response = await fetchApi<{ configId: string }>('/api/config/models/ensure', {
    method: 'POST',
    body: JSON.stringify({ provider, model }),
  });
  return response;
}

/**
 * Hook to fetch all usable models - merges configured models with discovered models
 * from connected providers. When a discovered model is selected, it automatically
 * creates/reuses a config entry.
 */
export function useUsableModels() {
  const { data: configModels = [], isLoading: configLoading } = useConfigModels();
  
  const { data: discoveredModels = [], isLoading: discoveredLoading } = useQuery({
    queryKey: MODELS_QUERY_KEY,
    queryFn: fetchDiscoveredModels,
    staleTime: 60000,
  });

  const { data: providersStatus = [], isLoading: providersLoading } = useQuery({
    queryKey: PROVIDERS_STATUS_QUERY_KEY,
    queryFn: async () => {
      const response = await fetchApi<{ providers: Array<{ 
        provider: string; 
        configured: boolean;
        has_api_key: boolean;
        source?: string;
        details?: string;
        manually_disconnected?: boolean;
      }> }>('/api/providers/status');
      return response.providers.map((p) => ({
        id: p.provider,
        configured: p.configured,
        method: p.source || (p.has_api_key ? 'api_key' : undefined),
        tested: p.configured,
        manuallyDisconnected: p.manually_disconnected,
      }));
    },
    staleTime: 30000,
  });

  // Merge config models with discovered models
  const mergedModels = useMemo((): UsableModelInfo[] => {
    const result: UsableModelInfo[] = [];
    const seenKeys = new Set<string>();

    // First, add all configured models
    for (const configModel of configModels) {
      const catalogModel = configModel.catalogModel || configModel.id;
      const key = `${configModel.provider}:${catalogModel}`;
      
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        
        // Try to enrich with discovered model data
        const discovered = discoveredModels.find(
          d => d.provider === configModel.provider && d.id === catalogModel
        );
        
        result.push({
          id: configModel.id,
          name: discovered?.name || configModel.name || configModel.id,
          provider: configModel.provider,
          description: discovered?.description || configModel.id,
          input_price: discovered?.input_price,
          output_price: discovered?.output_price,
          context_window: discovered?.context_window,
          max_output: discovered?.max_output,
          tool_call: discovered?.tool_call ?? false,
          reasoning: discovered?.reasoning ?? configModel.reasoning ?? false,
          attachment: discovered?.attachment ?? false,
          family: discovered?.family,
          cache_read_price: discovered?.cache_read_price,
          cache_write_price: discovered?.cache_write_price,
          modalities: discovered?.modalities,
          hasConfigEntry: true,
          configId: configModel.id,
          catalogModel: catalogModel,
        });
      }
    }

    // Then, add discovered models that don't have a config entry
    // Only include models from configured providers
    const configuredProviders = new Set(
      providersStatus.filter(p => p.configured).map(p => p.id)
    );

    for (const discovered of discoveredModels) {
      const key = `${discovered.provider}:${discovered.id}`;
      
      // Skip if already added from config
      if (seenKeys.has(key)) continue;
      
      // Skip if provider is not configured (not connected)
      if (!configuredProviders.has(discovered.provider)) continue;
      
      seenKeys.add(key);
      
      result.push({
        id: discovered.id, // Use catalog ID as the display id
        name: discovered.name,
        provider: discovered.provider,
        description: discovered.description,
        input_price: discovered.input_price,
        output_price: discovered.output_price,
        context_window: discovered.context_window,
        max_output: discovered.max_output,
        tool_call: discovered.tool_call,
        reasoning: discovered.reasoning,
        attachment: discovered.attachment,
        family: discovered.family,
        cache_read_price: discovered.cache_read_price,
        cache_write_price: discovered.cache_write_price,
        modalities: discovered.modalities,
        hasConfigEntry: false, // Discovered, not configured yet
        configId: '', // Will be set when selected
        catalogModel: discovered.id,
      });
    }

    return result;
  }, [configModels, discoveredModels, providersStatus]);

  return {
    data: mergedModels,
    isLoading: configLoading || discoveredLoading || providersLoading,
  };
}

/**
 * Mutation to ensure a config model entry exists for a discovered model
 */
export function useEnsureModelConfig() {
  const queryClient = useQueryClient();

  return useMutation<
    { configId: string },
    Error,
    { provider: string; model: string }
  >({
    mutationFn: ({ provider, model }) => ensureModelConfig(provider, model),
    onSuccess: () => {
      // Invalidate all queries that depend on config/models to reflect the new config entry
      queryClient.invalidateQueries({ queryKey: ['config'] });
      queryClient.invalidateQueries({ queryKey: USABLE_MODELS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: ['settings', 'models'] });
    },
    onError: (error) => {
      console.error('[useEnsureModelConfig] Failed to ensure model config:', error);
    },
  });
}
