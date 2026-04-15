/**
 * Webhook API functions
 */

import { fetchApi } from '@/shared/api/client';
import type {
  WebhookConfigResponse,
  WebhookDeliveriesResponse,
  WebhookTestResponse,
} from '@/src/lib/bindings';
import {
  UpdateWebhookConfigInput,
  TestWebhookInput,
} from '../types';

/**
 * Get webhook configuration for an agent
 */
export async function getWebhookConfig(agentId: string): Promise<WebhookConfigResponse> {
  return fetchApi<WebhookConfigResponse>(`/api/agents/${agentId}/webhook/config`);
}

/**
 * Update webhook configuration for an agent
 */
export async function updateWebhookConfig(
  agentId: string,
  input: UpdateWebhookConfigInput
): Promise<{ agent_id: string; updated: boolean }> {
  return fetchApi<{ agent_id: string; updated: boolean }>(
    `/api/agents/${agentId}/webhook/config`,
    {
      method: 'PUT',
      body: JSON.stringify({
        enabled: input.enabled,
        secret: input.secret,
        event_types: input.event_types ?? ['*'],
      }),
    }
  );
}

/**
 * Get webhook delivery history for an agent
 */
export async function getWebhookDeliveries(agentId: string): Promise<WebhookDeliveriesResponse> {
  return fetchApi<WebhookDeliveriesResponse>(`/api/agents/${agentId}/webhook/deliveries`);
}

/**
 * Send a test webhook to an agent
 */
export async function sendTestWebhook(
  agentId: string,
  input?: TestWebhookInput
): Promise<WebhookTestResponse> {
  return fetchApi<WebhookTestResponse>(`/api/agents/${agentId}/webhook/test`, {
    method: 'POST',
    body: JSON.stringify({
      event_type: input?.event_type ?? 'test',
      payload: input?.payload,
    }),
  });
}
