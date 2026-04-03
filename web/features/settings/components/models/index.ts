/**
 * Models settings feature barrel exports
 *
 * Note: Component implementations are currently inline in models-page.tsx.
 * This barrel exports only the page component and shared types.
 */

export { ModelsPage } from './models-page';

// Type exports (shared types used by the active implementation)
export type {
  CatalogModel,
  EnhancedProviderStatus,
  ModelSettings,
  CapabilityBadgeProps,
  ModelCapabilities,
  ModelPricingProps,
  ModelContextWindowProps,
  DefaultModelCardProps,
  ConnectedProviderRowProps,
  ConnectedProvidersCardProps,
  AddProviderDialogProps,
  ModelPickerSheetProps,
  FlattenedModel,
  ModelRowProps,
  ApiKeyDialogProps,
} from './types';
