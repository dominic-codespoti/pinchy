/**
 * Settings feature exports
 * Clean barrel export for all settings-related modules
 */

// Types
export type {
  ModelInfo,
  ProviderConfig,
  ModelsApiResponse,
  ProviderStatus,
  ProviderTestResult,
  ProviderStatusItem,
  SetProviderAuthResult,
  ProviderId,
  ProviderMetadata,
  ModelSettings,
  NotificationSettings,
  ApiSettings,
  AdvancedSettings,
  GeneralSettings,
} from './types';

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
