import type { ModelsDevProvider, ModelsDevModel } from '../types';
import { fetchApi } from '@/shared/api/client';
import type { ModelInfo } from '@/src/lib/bindings';

export type { ModelInfo };

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  endpointUrl?: string;
  enabled: boolean;
}

// API response type - matches the actual /api/models endpoint response
export interface ModelsApiResponse {
  models: Array<{
    id: string;
    name: string;
    provider_id: string;
    config_id: string;
    vendor?: string;
    supported_endpoints?: string[];
    is_default?: boolean;
    input_price?: number;
    output_price?: number;
    description?: string;
    max_tokens?: number;
  }>;
}

export async function fetchModels(): Promise<ModelInfo[]> {
  const response = await fetchApi<ModelsApiResponse>(
    '/api/models',
    undefined
  );
  return response.models.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider_id,
    description: m.description ?? null,
    input_price: m.input_price ?? null,
    output_price: m.output_price ?? null,
    context_window: m.max_tokens ? BigInt(m.max_tokens) : null,
    max_output: null,
    tool_call: false,
    reasoning: false,
    attachment: false,
    family: null,
    cache_read_price: null,
    cache_write_price: null,
    modalities: null,
  }));
}

export const PROVIDERS = [
  { id: 'openai', name: 'OpenAI', requiresApiKey: true, requiresEndpoint: false },
  { id: 'azure', name: 'Azure OpenAI', requiresApiKey: true, requiresEndpoint: true },
  { id: 'copilot', name: 'Copilot', requiresApiKey: false, requiresEndpoint: false, requiresOAuth: true },
  { id: 'anthropic', name: 'Anthropic', requiresApiKey: true, requiresEndpoint: false },
  { id: 'google', name: 'Google Gemini', requiresApiKey: true, requiresEndpoint: false },
  { id: 'bedrock', name: 'Amazon Bedrock', requiresApiKey: true, requiresEndpoint: false },
  { id: 'cohere', name: 'Cohere', requiresApiKey: true, requiresEndpoint: false },
  { id: 'cerebras', name: 'Cerebras', requiresApiKey: true, requiresEndpoint: false },
  { id: 'groq', name: 'Groq', requiresApiKey: true, requiresEndpoint: false },
  { id: 'together', name: 'Together AI', requiresApiKey: true, requiresEndpoint: false },
  { id: 'xai', name: 'xAI (Grok)', requiresApiKey: true, requiresEndpoint: false },
  { id: 'mistral', name: 'Mistral AI', requiresApiKey: true, requiresEndpoint: false },
] as const;

export function formatPrice(price: number): string {
  if (price === 0) return 'Free';
  // Format with appropriate precision based on price magnitude
  if (price < 0.001) {
    return `$${price.toFixed(5)}/1K`;
  } else if (price < 0.01) {
    return `$${price.toFixed(4)}/1K`;
  } else if (price < 0.1) {
    return `$${price.toFixed(3)}/1K`;
  } else {
    return `$${price.toFixed(2)}/1K`;
  }
}

export function getProviderBadgeColor(provider: string): string {
  switch (provider) {
    case 'openai':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100';
    case 'azure':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100';
    case 'copilot':
      return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100';
    case 'anthropic':
      return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100';
    case 'google':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200';
    case 'bedrock':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100';
    case 'cohere':
      return 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-100';
    case 'cerebras':
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100';
    case 'together':
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-100';
    case 'xai':
      return 'bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100';
    case 'groq':
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-100';
    case 'mistral':
      return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-100';
    default:
      return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-100';
  }
}

// Re-export from settings feature
export {
  setProviderAuth,
  removeProviderAuth,
  testProviderConnection,
  getAllProvidersStatus,
  fetchModelsRegistry,
} from '../api';

export type {
  ProviderTestResult,
  UIProviderStatusItem,
  SetProviderAuthResult,
  ProviderStatus,
  ModelsDevProvider,
  ModelsDevModel,
} from '../types';
// Re-export with old name for backward compatibility
export type { UIProviderStatusItem as ProviderStatusItem } from '../types';
