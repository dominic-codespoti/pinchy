/**
 * Settings feature API client
 * All API calls for the settings module
 */

import {
  ModelInfo,
  ProviderTestResult,
  SetProviderAuthResult,
  ProviderStatusItem,
  ModelsDevProvider,
} from './types';
import { fetchApi, fetchApiEmpty, ApiError } from '@/shared/api/client';
import { z } from 'zod';
import {
  ModelsListResponseSchema,
  ProviderStatusResponseSchema,
} from '@/lib/validation/schemas';

const API_BASE_URL = '';

// ============================================================================
// Models Registry API (models.dev integration)
// ============================================================================

// Schema for models registry response
const ModelsRegistryResponseSchema = z.object({
  providers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    env: z.array(z.string()).default([]),
    api: z.string().nullable().optional(),
    doc: z.string().nullable().optional(),
    models: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable().optional(),
    })).default([]),
  })),
});

export async function fetchModelsRegistry(): Promise<ModelsDevProvider[]> {
  const response = await fetchApi(
    `${API_BASE_URL}/api/models/registry`,
    undefined,
    ModelsRegistryResponseSchema
  );
  return response.providers || [];
}

// ============================================================================
// Models API
// ============================================================================

export async function fetchModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetchApi(
      `${API_BASE_URL}/api/models`,
      undefined,
      ModelsListResponseSchema
    );
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
    console.error('[settings] Failed to fetch models:', error);
    return [];
  }
}

export async function getAllProvidersStatus(): Promise<ProviderStatusItem[]> {
  try {
    const response = await fetchApi(
      `${API_BASE_URL}/api/providers/status`,
      undefined,
      ProviderStatusResponseSchema
    );
    return response.providers.map((p) => ({
      id: p.provider,
      configured: p.configured,
      method: p.source || (p.has_api_key ? 'api_key' : undefined),
      tested: p.configured,
    }));
  } catch (error) {
    console.error('[settings] Failed to fetch providers status:', error);
    return [];
  }
}

export async function setProviderAuth(
  providerId: string,
  apiKey: string,
  endpoint?: string,
  extra?: Record<string, string>
): Promise<SetProviderAuthResult> {
  try {
    const result = await fetchApi<{ success?: boolean; status?: string; message?: string }>(
      `${API_BASE_URL}/api/auth/${providerId}`,
      {
        method: 'POST',
        body: JSON.stringify({
          api_key: apiKey,
          endpoint,
          ...Object.fromEntries(Object.entries(extra || {}).filter(([, v]) => v !== undefined)),
        }),
      }
    );
    return {
      success: result.success ?? (result.status === 'saved'),
      message: result.message ?? (result.status === 'saved' ? `${providerId} connected` : 'Unknown error'),
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to set provider auth',
    };
  }
}

export async function testProviderConnection(providerId: string): Promise<ProviderTestResult> {
  const startTime = performance.now();

  try {
    const result = await fetchApi<{ success: boolean; message: string }>(
      `${API_BASE_URL}/api/providers/${providerId}/test`,
      {
        method: 'POST',
      }
    );
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      ...result,
      latencyMs,
    };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
}

export async function removeProviderAuth(providerId: string): Promise<void> {
  return fetchApiEmpty(`${API_BASE_URL}/api/auth/${providerId}`, {
    method: 'DELETE',
  });
}

export type { ApiError };

// ============================================================================
// Config API
// ============================================================================

export async function getConfig(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`${API_BASE_URL}/api/config`);
}

export async function updateConfig(config: Record<string, unknown>): Promise<void> {
  await fetchApi(`${API_BASE_URL}/api/config`, {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

export async function getConfigSchema(): Promise<Record<string, unknown>> {
  return fetchApi<Record<string, unknown>>(`${API_BASE_URL}/api/config/schema`);
}
