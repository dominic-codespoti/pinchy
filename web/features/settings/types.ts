/**
 * Settings feature types
 * Domain-specific types for the settings module
 */

// ============================================================================
// models.dev Integration Types
// ============================================================================

export interface ModelsDevModel {
  id: string;
  name: string;
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
  modalities?: {
    input?: string[];
    output?: string[];
  };
}

export interface ModelsDevProvider {
  id: string;
  name: string;
  env: string[];
  api?: string;
  doc?: string;
  models: ModelsDevModel[];
}

// ============================================================================
// Model Configuration Types
// ============================================================================

export interface ModelInfo {
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
  modalities?: {
    input?: string[];
    output?: string[];
  };
}

export interface ProviderConfig {
  id: string;
  name: string;
  apiKey?: string;
  endpointUrl?: string;
  enabled: boolean;
}

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

export interface ProviderStatusItem {
  id: string;
  configured: boolean;
  method?: string;
  tested?: boolean;
}

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
