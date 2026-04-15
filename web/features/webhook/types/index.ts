/**
 * Webhook feature types
 */

import type {
  WebhookConfigResponse,
  WebhookDeliveriesResponse,
  WebhookTestResponse,
  WebhookDeliveryItem,
} from '@/src/lib/bindings';

export type { WebhookConfigResponse, WebhookDeliveriesResponse, WebhookTestResponse, WebhookDeliveryItem as WebhookDelivery };

// ============================================================================
// Core Webhook Types
// ============================================================================

export interface WebhookConfig {
  enabled: boolean;
  secret: string | null;
  event_types: string[];
  url: string;
}

// ============================================================================
// Update Types
// ============================================================================

export interface UpdateWebhookConfigInput {
  enabled: boolean;
  secret?: string;
  event_types?: string[];
}

export interface TestWebhookInput {
  event_type?: string;
  payload?: Record<string, unknown>;
}

// ============================================================================
// Event Type Options
// ============================================================================

export const WEBHOOK_EVENT_TYPES = [
  { value: '*', label: 'All Events', description: 'Receive all webhook events' },
  { value: 'message', label: 'Messages', description: 'Chat message events' },
  { value: 'task', label: 'Tasks', description: 'Task creation and completion' },
  { value: 'file', label: 'Files', description: 'File creation and modification' },
  { value: 'memory', label: 'Memory', description: 'Memory save and recall events' },
  { value: 'cron', label: 'Cron', description: 'Cron job execution events' },
] as const;
