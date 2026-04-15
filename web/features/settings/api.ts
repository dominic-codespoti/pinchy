/**
 * Settings feature API client
 * All API calls for the settings module
 */

import {
  ModelInfo,
  AgentModelOptionsResponse,
  ProviderTestResult,
  SetProviderAuthResult,
  UIProviderStatusItem,
  ModelsDevProvider,
} from './types';
import { fetchApi, fetchApiEmpty, ApiError } from '@/shared/api/client';

const API_BASE_URL = '';

// ============================================================================
// Models Registry API (models.dev integration)
// ============================================================================

export async function fetchModelsRegistry(): Promise<ModelsDevProvider[]> {
  const response = await fetchApi<{
    providers: {
      id: string;
      name: string;
      env: string[];
      api?: string | null;
      doc?: string | null;
      models: {
        id: string;
        name: string;
        description?: string | null;
      }[];
    }[];
  }>(
    `${API_BASE_URL}/api/models/registry`,
    undefined
  );
  return response.providers || [];
}

// ============================================================================
// Models API
// ============================================================================

export async function fetchModels(): Promise<ModelInfo[]> {
  try {
    const response = await fetchApi<{
      models?: Array<{
        id: string;
        name?: string;
        provider: string;
        description?: string | null;
        input_price?: number | null;
        output_price?: number | null;
        context_window?: number | null;
        max_output?: number | null;
        tool_call?: boolean;
        reasoning?: boolean;
        attachment?: boolean;
        family?: string | null;
        cache_read_price?: number | null;
        cache_write_price?: number | null;
        modalities?: string[] | null;
      }> | null;
    }>(
      `${API_BASE_URL}/api/models`,
      undefined
    );
    return (response.models || []).map(m => ({
      id: m.id,
      name: m.name || m.id,
      provider: m.provider,
      description: m.description ?? null,
      input_price: m.input_price ?? null,
      output_price: m.output_price ?? null,
      context_window: m.context_window !== undefined && m.context_window !== null
        ? BigInt(m.context_window)
        : null,
      max_output: m.max_output !== undefined && m.max_output !== null
        ? BigInt(m.max_output)
        : null,
      tool_call: m.tool_call ?? false,
      reasoning: m.reasoning ?? false,
      attachment: m.attachment ?? false,
      family: m.family ?? null,
      cache_read_price: m.cache_read_price ?? null,
      cache_write_price: m.cache_write_price ?? null,
      modalities: m.modalities ?? null,
    }));
  } catch (error) {
    console.error('[settings] Failed to fetch models:', error);
    return [];
  }
}

export async function fetchAgentModelOptions() {
  const response = await fetchApi<AgentModelOptionsResponse>(`${API_BASE_URL}/api/config/models`, undefined);
  return response.models || [];
}

export async function getAllProvidersStatus(): Promise<UIProviderStatusItem[]> {
  try {
    const response = await fetchApi<{
      providers: Array<{
        provider: string;
        name: string;
        configured: boolean;
        source?: string;
        has_api_key: boolean;
      }>;
    }>(
      `${API_BASE_URL}/api/providers/status`,
      undefined
    );
    return response.providers.map((p) => ({
      id: p.provider,
      name: p.name,
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
