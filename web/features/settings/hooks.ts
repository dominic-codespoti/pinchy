/**
 * Settings feature hooks
 * TanStack Query hooks for settings data fetching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fetchModels,
  getAllProvidersStatus,
  setProviderAuth,
  testProviderConnection,
  removeProviderAuth,
  getConfig,
  updateConfig,
  getConfigSchema,
} from './api';
import { fetchApi } from '@/shared/api/client';
import { ModelInfo, ProviderConfig, ProviderTestResult, ConfigModelInfo } from './types';

// ============================================================================
// Model Hooks
// ============================================================================

export const MODELS_QUERY_KEY = ['settings', 'models'];
export const PROVIDERS_STATUS_QUERY_KEY = ['settings', 'providers', 'status'];

export function useAvailableModels() {
  return useQuery<ModelInfo[], Error>({
    queryKey: MODELS_QUERY_KEY,
    queryFn: fetchModels,
    staleTime: 60000,
  });
}

export function useProvidersStatus() {
  return useQuery({
    queryKey: PROVIDERS_STATUS_QUERY_KEY,
    queryFn: getAllProvidersStatus,
    staleTime: 30000,
  });
}

export function useTestProviderConnection() {
  return useMutation<ProviderTestResult, Error, string>({
    mutationFn: testProviderConnection,
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Connection successful${result.latencyMs ? ` (${result.latencyMs}ms)` : ''}`);
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(`Connection test failed: ${error.message}`);
    },
  });
}

export function useSetProviderAuth() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string },
    Error,
    { providerId: string; apiKey: string; endpoint?: string }
  >({
    mutationFn: ({ providerId, apiKey, endpoint }) =>
      setProviderAuth(providerId, apiKey, endpoint),
    onSuccess: (result, variables) => {
      if (result.success) {
        toast.success(`${variables.providerId} connected successfully`);
        queryClient.invalidateQueries({ queryKey: PROVIDERS_STATUS_QUERY_KEY });
        queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
      } else {
        toast.error(result.message);
      }
    },
    onError: (error) => {
      toast.error(`Failed to connect: ${error.message}`);
    },
  });
}

export function useRemoveProviderAuth() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: removeProviderAuth,
    onSuccess: () => {
      toast.success('Provider disconnected');
      queryClient.invalidateQueries({ queryKey: PROVIDERS_STATUS_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: MODELS_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to disconnect: ${error.message}`);
    },
  });
}

// ============================================================================
// Config Hooks
// ============================================================================

export const CONFIG_QUERY_KEY = ['config'];
export const CONFIG_SCHEMA_QUERY_KEY = ['config-schema'];

export function useConfig() {
  return useQuery<Record<string, unknown>, Error>({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: getConfig,
    staleTime: 30_000,
  });
}

export function useUpdateConfig() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, Record<string, unknown>>({
    mutationFn: updateConfig,
    onSuccess: () => {
      toast.success('Configuration saved');
      queryClient.invalidateQueries({ queryKey: CONFIG_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to save config: ${error.message}`);
    },
  });
}

export function useConfigSchema() {
  return useQuery<Record<string, unknown>, Error>({
    queryKey: CONFIG_SCHEMA_QUERY_KEY,
    queryFn: getConfigSchema,
    staleTime: 5 * 60_000,
  });
}

// Query key for config models
export const CONFIG_MODELS_QUERY_KEY = ['settings', 'config-models'];

/**
 * Hook to fetch configured models from the config
 */
export function useConfigModels() {
  return useQuery<ConfigModelInfo[], Error>({
    queryKey: CONFIG_MODELS_QUERY_KEY,
    queryFn: async () => {
      const config = await getConfig();
      const models = config.models as Array<{
        id: string;
        name?: string;
        provider: string;
        model: string;
        reasoning?: boolean;
        enabled?: boolean;
      }> | undefined;
      
      if (!models || !Array.isArray(models)) {
        return [];
      }
      
      return models.map(m => ({
        id: m.id,
        name: m.name || m.id,
        provider: m.provider,
        catalogModel: m.model,
        reasoning: m.reasoning,
        enabled: m.enabled,
      }));
    },
    staleTime: 30000,
  });
}
