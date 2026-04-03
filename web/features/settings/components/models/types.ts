/**
 * Types for the models settings feature
 *
 * Note: The model components use catalog-driven data where `ProviderCatalogItem`
 * provides model IDs and provider metadata. The `FlattenedModel` type represents
 * the unified view combining provider catalog data with connection status.
 */

import type {
  ProviderStatusItem,
  ProviderTestResult,
  ProviderCatalogItem,
} from '@/features/settings/types';

export interface EnhancedProviderStatus extends ProviderStatusItem {
  modelCount?: number;
  catalogData?: ProviderCatalogItem;
}

export interface ModelSettings {
  defaultModel: string;
}

export interface CapabilityBadgeProps {
  icon: React.ElementType;
  label: string;
  variant?: 'secondary' | 'outline' | 'default' | 'destructive';
}

/**
 * Model capability information - inline structure used by the active components
 * Matches the inline definition in models-page.tsx
 */
export interface ModelCapabilities {
  id: string;
  name: string;
  tool_call?: boolean;
  reasoning?: boolean;
  attachment?: boolean;
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
}

/**
 * Catalog model structure - matches the inline definition in models-page.tsx
 */
export interface CatalogModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  model: ModelCapabilities;
  isConnected: boolean;
}

export interface ModelCapabilitiesProps {
  model: ModelCapabilities;
}

export interface ModelPricingProps {
  model: ModelCapabilities;
}

export interface ModelContextWindowProps {
  model: ModelCapabilities;
}

export interface ApiKeyDialogProps {
  providerId: string;
  providerName: string;
  requiresEndpoint: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (apiKey: string, endpoint?: string, headers?: Record<string, string>) => void;
}

export interface DefaultModelCardProps {
  settings: ModelSettings;
  originalSettings: ModelSettings;
  hasChanges: boolean;
  isSaving: boolean;
  availableModels: FlattenedModel[];
  modelsLoading: boolean;
  onModelClick: () => void;
  onSave: () => void;
  onReset: () => void;
}

export interface ConnectedProviderRowProps {
  provider: EnhancedProviderStatus;
  onEdit: () => void;
  onTest: () => Promise<ProviderTestResult>;
  onDisconnect: () => void;
  onRemove: () => void;
}

export interface ConnectedProvidersCardProps {
  providers: EnhancedProviderStatus[];
  onConnect: (provider: EnhancedProviderStatus) => void;
  onDisconnect: (providerId: string) => void;
  onRemove: (providerId: string) => void;
  onTest: (providerId: string) => Promise<ProviderTestResult>;
  onAddProvider: () => void;
  isLoading: boolean;
  removedProviderIds: Set<string>;
}

export interface AddProviderDialogProps {
  isOpen: boolean;
  onClose: () => void;
  providers: EnhancedProviderStatus[];
  onSelectProvider: (provider: EnhancedProviderStatus) => void;
}

export interface ModelPickerSheetProps {
  isOpen: boolean;
  onClose: () => void;
  providers: EnhancedProviderStatus[];
  currentModel: string;
  onSelectModel: (modelId: string) => void;
}

/**
 * Flattened model representation combining catalog data with connection status
 * The `model` field contains capability metadata from the provider catalog
 */
export interface FlattenedModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  model: ModelCapabilities;
  isConnected: boolean;
}

export interface ModelRowProps {
  item: FlattenedModel;
  isSelected: boolean;
  onSelect: (modelId: string) => void;
}

// Import React for ElementType
import * as React from 'react';
