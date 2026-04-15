/**
 * Settings feature exports
 * Clean barrel export for all settings-related modules
 */

// Types
export type { ModelInfo } from '@/src/lib/bindings';
export type {
  AgentModelOption,
  AgentModelOptionsResponse,
  ProviderConfig,
  ProviderStatus,
  ProviderTestResult,
  UIProviderStatusItem,
  SetProviderAuthResult,
  ProviderId,
  ProviderMetadata,
  ModelSettings,
  NotificationSettings,
  ApiSettings,
  AdvancedSettings,
  GeneralSettings,
  McpServerConfig,
  McpServers,
  McpTransport,
} from './types';
// Re-export with old name for backward compatibility
export type { UIProviderStatusItem as ProviderStatusItem } from './types';
export type { ModelsApiResponse } from './api/models';

// API
export {
  fetchModels,
  getAllProvidersStatus,
  setProviderAuth,
  testProviderConnection,
  removeProviderAuth,
  getConfig,
  updateConfig,
  getConfigSchema,
} from './api';

// Hooks
export {
  useAvailableModels,
  useAgentModels,
  useProvidersStatus,
  useTestProviderConnection,
  useSetProviderAuth,
  useRemoveProviderAuth,
  useConfig,
  useUpdateConfig,
  useConfigSchema,
} from './hooks';

// Components
export { SettingsPage } from './components/settings-page';
export { SettingsLayout, settingsNavItems } from './components/settings-layout';
export { ModelsPage } from './components/models/models-page';
export { AppearancePage } from './components/appearance/appearance-page';
export { SecurityPage } from './components/security/security-page';
export { NotificationsPage } from './components/notifications/notifications-page';
export { WebhooksPage } from './components/webhooks/webhooks-page';
export { MaintenancePage } from './components/maintenance/maintenance-page';
export { AdvancedPage } from './components/advanced/advanced-page';
export { McpPage } from './components/mcp/mcp-page';

// Model components
export { ProviderList } from './components/models/provider-list';
export { ProviderListItem } from './components/models/provider-list-item';
export { ModelSelector } from './components/models/model-selector';
export {
  PROVIDERS,
  providerIcons,
  getProviderBadgeColor,
  getProviderModels,
} from './components/models/provider-constants';
