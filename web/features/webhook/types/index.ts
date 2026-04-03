/**
 * Webhook feature types
 */

// ============================================================================
// Core Webhook Types
// ============================================================================

export interface WebhookConfig {
  enabled: boolean;
  secret: string | null;
  event_types: string[];
  url: string;
}

export interface WebhookConfigResponse {
  agent_id: string;
  enabled: boolean;
  secret: string | null;
  event_types: string[];
  url: string;
}

export interface WebhookDelivery {
  id: string;
  timestamp: number;
  event_type: string;
  status: 'success' | 'failed' | 'pending' | string;
  status_code?: number | null;
  error?: string | null;
  duration_ms?: number | null;
  payload_preview?: string | null;
}

export interface WebhookDeliveriesResponse {
  agent_id: string;
  deliveries: WebhookDelivery[];
}

export interface WebhookTestResponse {
  success: boolean;
  message: string;
  delivery_id?: string | null;
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
