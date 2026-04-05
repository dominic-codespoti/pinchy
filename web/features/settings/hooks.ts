'use client';

/**
 * Settings feature hooks
 * TanStack Query hooks for settings data fetching and mutations
 */

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/query-config';
import {
  fetchModels,
  fetchAgentModelOptions,
  getAllProvidersStatus,
  setProviderAuth,
  testProviderConnection,
  removeProviderAuth,
  getConfig,
  updateConfig,
  getConfigSchema,
} from './api';
import { fetchApi } from '@/shared/api/client';
import { ModelInfo, ProviderConfig, ProviderTestResult, UIProviderStatusItem, AgentModelOption } from './types';

// ============================================================================
// Model Hooks
// ============================================================================

export const MODELS_QUERY_KEY = ['settings', 'models'];
export const CONFIG_MODELS_QUERY_KEY = ['settings', 'config', 'models'];
export const PROVIDERS_STATUS_QUERY_KEY = ['settings', 'providers', 'status'];

export function useAvailableModels() {
  const { data, isLoading, error } = useQuery<ModelInfo[], Error>({
    queryKey: MODELS_QUERY_KEY,
    queryFn: fetchModels,
    staleTime: STALE_TIME.LONG,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load models: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

/**
 * Hook for agent model selection.
 * 
 * Fetches only config-defined models (from /api/config/models).
 * These are the only models valid for agent configuration.
 * Falls back to registry models only if the config endpoint fails.
 */
export function useAgentModels() {
  const query = useQuery<AgentModelOption[], Error>({
    queryKey: CONFIG_MODELS_QUERY_KEY,
    queryFn: fetchAgentModelOptions,
    staleTime: STALE_TIME.LONG,
  });

  const data = query.data;
  const isLoading = query.isLoading;
  const error = query.error;

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load models: ${error.message}`);
    }
  }, [error]);

  return { 
    data, 
    isLoading, 
    error,
    source: 'config' as const,
    isValid: !!data?.length,
  };
}

export function useProvidersStatus() {
  const { data, isLoading, error } = useQuery<UIProviderStatusItem[], Error>({
    queryKey: PROVIDERS_STATUS_QUERY_KEY,
    queryFn: getAllProvidersStatus,
    staleTime: STALE_TIME.NORMAL,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load provider status: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
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
  const { data, isLoading, error } = useQuery<Record<string, unknown>, Error>({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: getConfig,
    staleTime: STALE_TIME.NORMAL,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load config: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
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
  const { data, isLoading, error } = useQuery<Record<string, unknown>, Error>({
    queryKey: CONFIG_SCHEMA_QUERY_KEY,
    queryFn: getConfigSchema,
    staleTime: STALE_TIME.SCHEMA,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load config schema: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}
