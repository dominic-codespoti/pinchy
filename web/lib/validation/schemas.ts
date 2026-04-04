import { z } from 'zod';

// ============================================================================
// Re-exports from Rust bindings
// ============================================================================

export type { SessionItem as RawSession } from '@/src/lib/bindings/SessionItem';
export type { ModelInfo } from '@/src/lib/bindings/ModelInfo';
export type { CronJobItem as BackendCronJob } from '@/src/lib/bindings/CronJobItem';
export type { CronRunItem } from '@/src/lib/bindings/CronRunItem';
export type { UsageResponse as UsageApiResponse } from '@/src/lib/bindings/UsageResponse';
export type { UsageRow } from '@/src/lib/bindings/UsageRow';
export type { WebhookConfigResponse } from '@/src/lib/bindings/WebhookConfigResponse';
export type { WebhookDeliveriesResponse } from '@/src/lib/bindings/WebhookDeliveriesResponse';
export type { WebhookTestResponse } from '@/src/lib/bindings/WebhookTestResponse';
export type { WebhookDeliveryItem } from '@/src/lib/bindings/WebhookDeliveryItem';
export type { ReceiptsListResponse } from '@/src/lib/bindings/ReceiptsListResponse';
export type { ReceiptItem } from '@/src/lib/bindings/ReceiptItem';

// ============================================================================
// Session Types
// ============================================================================

export interface Session {
  id: string;
  agentId: string;
  title?: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

// RawSession is SessionItem from bindings - exported above

// ============================================================================
// Turn Receipt Schemas (for runtime validation)
// ============================================================================

export const ToolCallRecordSchema = z.object({
  tool: z.string(),
  args_summary: z.string(),
  success: z.boolean(),
  duration_ms: z.number(),
  error: z.string().optional(),
});

export const TokenUsageSummarySchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  cached_tokens: z.number(),
  reasoning_tokens: z.number(),
});

export const ModelCallDetailSchema = z.object({
  model: z.string(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cached_tokens: z.number(),
  reasoning_tokens: z.number(),
  cost_usd: z.number().optional(),
  latency_ms: z.number(),
});

export const TurnReceiptSchema = z.object({
  agent: z.string(),
  session: z.string().optional(),
  started_at: z.number(),
  duration_ms: z.number(),
  user_prompt: z.string(),
  tool_calls: z.array(ToolCallRecordSchema),
  tokens: TokenUsageSummarySchema,
  model_calls: z.number(),
  reply_summary: z.string(),
  model_id: z.string(),
  estimated_cost_usd: z.number().optional(),
  call_details: z.array(ModelCallDetailSchema),
});

export const ReceiptGetResponseSchema = z.object({
  file: z.string(),
  receipts: z.array(TurnReceiptSchema),
});

// ============================================================================
// Webhook Schemas (for runtime validation)
// ============================================================================

export const WebhookDeliveryItemSchema = z.object({
  id: z.string(),
  timestamp: z.bigint(),
  event_type: z.string(),
  status: z.string(),
  status_code: z.number().nullable(),
  error: z.string().nullable(),
  duration_ms: z.bigint().nullable(),
  payload_preview: z.string().nullable(),
});

export const WebhookConfigResponseSchema = z.object({
  agent_id: z.string(),
  enabled: z.boolean(),
  secret: z.string().nullable(),
  event_types: z.array(z.string()),
  url: z.string(),
});

export const WebhookDeliveriesResponseSchema = z.object({
  agent_id: z.string(),
  deliveries: z.array(WebhookDeliveryItemSchema),
});

export const WebhookTestResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  delivery_id: z.string().nullable(),
});

// ============================================================================
// Legacy type aliases for backward compatibility
// ============================================================================

/** @deprecated Use AgentListItem from @/src/lib/bindings */
export type RawAgent = never;
