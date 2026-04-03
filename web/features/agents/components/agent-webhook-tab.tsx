/**
 * Agent Webhook Tab Component
 * 
 * Integrates the webhook configuration into the agent detail page.
 */

'use client';

import { WebhookConfig } from '@/features/webhook';

interface AgentWebhookTabProps {
  agentId: string;
}

export function AgentWebhookTab({ agentId }: AgentWebhookTabProps) {
  return <WebhookConfig agentId={agentId} />;
}
