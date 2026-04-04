/**
 * Settings feature types
 * Domain-specific types for the settings module
 */

// Re-export ModelInfo from the generated bindings
import type { ModelInfo } from '@/src/lib/bindings';
export type { ModelInfo };

// ============================================================================
// Auth Prompt Types (for OAuth dialog)
// ============================================================================

export interface AuthPromptCondition {
  [key: string]: string;
}

export interface AuthPrompt {
  key: string;
  type: 'text' | 'select';
  label: string;
  description?: string;
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  condition?: AuthPromptCondition;
  secure?: boolean;
}

// ============================================================================
// Provider Catalog Types
// ============================================================================

export interface ProviderCatalogItem {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
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
}

export interface ConfigModelInfo {
  id: string;
  name: string;
  provider: string;
  catalogModel: string;
  reasoning?: boolean;
  enabled?: boolean;
}

// ============================================================================
// models.dev Integration Types
// ============================================================================

export interface ModelsDevModel {
  id: string;
  name: string;
  description?: string | null;
  family?: string;
  release_date?: string;
  attachment?: boolean;
  reasoning?: boolean;
  tool_call?: boolean;
  cost?: {
    input?: number;
    output?: number;
    cache_read?: number;
    cache_write?: number;
  };
  limit?: {
    context?: number;
    output?: number;
  };
  modalities?: string[];
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  env: string[];
  api?: string | null;
  doc?: string | null;
  models: ModelsDevModel[];
}

// ============================================================================
// Model Configuration Types
// ============================================================================

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  endpointUrl?: string;
  enabled: boolean;
}

// ModelsApiResponse is defined in api/models.ts (matches actual API response)

export interface ProviderStatus {
  provider: string;
  name: string;
  configured: boolean;
  has_api_key: boolean;
  env_var?: string;
  env_vars: string[];
  details?: string;
  source?: string;
  api?: string;
  model_count: number;
}

export interface ProviderTestResult {
  success: boolean;
  message: string;
  latencyMs?: number;
}

// UI-specific provider status for the settings UI
// Note: This is different from ApiProviderStatus which is the raw API response type from bindings
export interface UIProviderStatusItem {
  id: string;
  name: string;
  configured: boolean;
  method?: string;
  tested?: boolean;
}

// Re-export the API type from bindings with an alias for when the raw API type is needed
export type { ProviderStatusItem as ApiProviderStatus } from '@/src/lib/bindings';

export interface SetProviderAuthResult {
  success: boolean;
  message: string;
}

// Provider metadata constants
export type ProviderId = string;

export interface ProviderMetadata {
  id: ProviderId;
  name: string;
  requiresApiKey: boolean;
  requiresEndpoint: boolean;
  requiresOAuth?: boolean;
}

// ============================================================================
// Settings Form Types
// ============================================================================

export interface ModelSettings {
  defaultModel: string;
  providerConfigs: ProviderConfig[];
  apiKey?: string;
  endpointUrl?: string;
}

export interface NotificationSettings {
  enabled: boolean;
  browserNotifications: boolean;
  autoDismiss: boolean;
  autoDismissDuration: number;
  notifyOnSuccess: boolean;
  notifyOnError: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
  notifyOnAgentStatusChange: boolean;
  notifyOnNewLog: boolean;
}

export interface ApiSettings {
  backendUrl: string;
  apiToken: string;
  authEnabled: boolean;
}

export interface AdvancedSettings {
  autoRefreshInterval: number;
  logRetentionDays: number;
  debugMode: boolean;
}

// ============================================================================
// MCP Server Types
// ============================================================================

export type McpTransport = 'stdio' | 'sse' | 'streamablehttp';

export interface McpServerConfig {
  name?: string;
  transport?: McpTransport;
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  timeout?: number;
  max_concurrent?: number;
}

export type McpServers = Record<string, McpServerConfig>;

export interface GeneralSettings {
  api: ApiSettings;
  notifications: NotificationSettings;
  advanced: AdvancedSettings;
}
