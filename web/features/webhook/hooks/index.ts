/**
 * Webhook hooks using TanStack Query
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  getWebhookConfig,
  updateWebhookConfig,
  getWebhookDeliveries,
  sendTestWebhook,
} from '../api';
import {
  WebhookConfigResponse,
  WebhookDeliveriesResponse,
  WebhookTestResponse,
  UpdateWebhookConfigInput,
  TestWebhookInput,
} from '../types';

const STALE_TIME = 10 * 1000; // 10 seconds
const GC_TIME = 5 * 60 * 1000; // 5 minutes

// ============================================================================
// Query Keys
// ============================================================================

export const webhookKeys = {
  all: ['webhooks'] as const,
  config: (agentId: string) => [...webhookKeys.all, 'config', agentId] as const,
  deliveries: (agentId: string) => [...webhookKeys.all, 'deliveries', agentId] as const,
};

// ============================================================================
// useWebhookConfig Hook
// ============================================================================

export interface UseWebhookConfigResult {
  config: WebhookConfigResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWebhookConfig(agentId: string): UseWebhookConfigResult {
  const { data, isLoading, error, refetch } = useQuery<WebhookConfigResponse, Error>({
    queryKey: webhookKeys.config(agentId),
    queryFn: () => getWebhookConfig(agentId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!agentId,
  });

  if (error) {
    toast.error(`Failed to load webhook config: ${error.message}`);
  }

  return {
    config: data || null,
    isLoading,
    error: error || null,
    refetch,
  };
}

// ============================================================================
// useUpdateWebhookConfig Hook
// ============================================================================

export interface UseUpdateWebhookConfigResult {
  updateConfig: (agentId: string, input: UpdateWebhookConfigInput) => Promise<void>;
  isPending: boolean;
  error: Error | null;
}

export function useUpdateWebhookConfig(): UseUpdateWebhookConfigResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<
    { agent_id: string; updated: boolean },
    Error,
    { agentId: string; input: UpdateWebhookConfigInput }
  >({
    mutationFn: ({ agentId, input }) => updateWebhookConfig(agentId, input),
    onSuccess: (_, { agentId }) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.config(agentId) });
      toast.success('Webhook configuration updated successfully');
    },
    onError: (error) => {
      toast.error(`Failed to update webhook config: ${error.message}`);
    },
  });

  return {
    updateConfig: async (agentId, input) => {
      await mutation.mutateAsync({ agentId, input });
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
  };
}

// ============================================================================
// useWebhookDeliveries Hook
// ============================================================================

export interface UseWebhookDeliveriesResult {
  deliveries: WebhookDeliveriesResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useWebhookDeliveries(agentId: string): UseWebhookDeliveriesResult {
  const { data, isLoading, error, refetch } = useQuery<WebhookDeliveriesResponse, Error>({
    queryKey: webhookKeys.deliveries(agentId),
    queryFn: () => getWebhookDeliveries(agentId),
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    enabled: !!agentId,
  });

  if (error) {
    toast.error(`Failed to load webhook deliveries: ${error.message}`);
  }

  return {
    deliveries: data || null,
    isLoading,
    error: error || null,
    refetch,
  };
}

// ============================================================================
// useTestWebhook Hook
// ============================================================================

export interface UseTestWebhookResult {
  sendTest: (agentId: string, input?: TestWebhookInput) => Promise<WebhookTestResponse | null>;
  isPending: boolean;
  error: Error | null;
  data: WebhookTestResponse | null;
  reset: () => void;
}

export function useTestWebhook(): UseTestWebhookResult {
  const mutation = useMutation<WebhookTestResponse, Error, { agentId: string; input?: TestWebhookInput }>({
    mutationFn: ({ agentId, input }) => sendTestWebhook(agentId, input),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(data.message);
      } else {
        toast.error(data.message);
      }
    },
    onError: (error) => {
      toast.error(`Failed to send test webhook: ${error.message}`);
    },
  });

  return {
    sendTest: async (agentId, input) => {
      const result = await mutation.mutateAsync({ agentId, input });
      return result;
    },
    isPending: mutation.isPending,
    error: mutation.error || null,
    data: mutation.data || null,
    reset: mutation.reset,
  };
}
