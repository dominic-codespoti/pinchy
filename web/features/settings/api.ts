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
import { fetchApi, ApiError } from '@/shared/api/client';

const API_BASE_URL = '';

// ============================================================================
// Models Registry API (models.dev integration)
// ============================================================================

export async function fetchModelsRegistry(): Promise<ModelsDevProvider[]> {
  const response = await fetch(`${API_BASE_URL}/api/models/registry`);
  if (!response.ok) throw new Error(`Failed to fetch models registry: ${response.statusText}`);
  const data = await response.json();
  return data.providers || [];
}

// ============================================================================
// Models API
// ============================================================================

export async function fetchModels(): Promise<ModelInfo[]> {
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
    }> }>(`${API_BASE_URL}/api/models`);
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
    const response = await fetchApi<{ providers: Array<{ provider: string; configured: boolean; has_api_key: boolean; source?: string; details?: string }> }>(`${API_BASE_URL}/api/providers/status`);
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
          ...extra,
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
  await fetchApi<void>(`${API_BASE_URL}/api/auth/${providerId}`, {
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
