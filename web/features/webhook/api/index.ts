/**
 * Webhook API functions
 */

import { fetchApi } from '@/shared/api/client';
import {
  WebhookConfigResponseSchema,
  WebhookDeliveriesResponseSchema,
  WebhookTestResponseSchema,
} from '@/lib/validation/schemas';
import {
  WebhookConfigResponse,
  WebhookDeliveriesResponse,
  WebhookTestResponse,
  UpdateWebhookConfigInput,
  TestWebhookInput,
} from '../types';

/**
 * Get webhook configuration for an agent
 */
export async function getWebhookConfig(agentId: string): Promise<WebhookConfigResponse> {
  const response = await fetchApi<unknown>(`/api/agents/${agentId}/webhook/config`);
  const parsed = WebhookConfigResponseSchema.parse(response);
  return parsed as WebhookConfigResponse;
}

/**
 * Update webhook configuration for an agent
 */
export async function updateWebhookConfig(
  agentId: string,
  input: UpdateWebhookConfigInput
): Promise<{ agent_id: string; updated: boolean }> {
  const response = await fetchApi<{ agent_id: string; updated: boolean }>(
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
  return response;
}

/**
 * Get webhook delivery history for an agent
 */
export async function getWebhookDeliveries(agentId: string): Promise<WebhookDeliveriesResponse> {
  const response = await fetchApi<unknown>(`/api/agents/${agentId}/webhook/deliveries`);
  const parsed = WebhookDeliveriesResponseSchema.parse(response);
  return parsed as WebhookDeliveriesResponse;
}

/**
 * Send a test webhook to an agent
 */
export async function sendTestWebhook(
  agentId: string,
  input?: TestWebhookInput
): Promise<WebhookTestResponse> {
  const response = await fetchApi<unknown>(`/api/agents/${agentId}/webhook/test`, {
    method: 'POST',
    body: JSON.stringify({
      event_type: input?.event_type ?? 'test',
      payload: input?.payload,
    }),
  });
  const parsed = WebhookTestResponseSchema.parse(response);
  return parsed as WebhookTestResponse;
}
