import { z } from 'zod';

// ============================================================================
// Re-exports from Rust bindings
// ============================================================================

export type { SessionItem as RawSession } from '@/src/lib/bindings';
export type { ModelInfo } from '@/src/lib/bindings';
export type { CronJobItem as BackendCronJob } from '@/src/lib/bindings';
export type { CronRunItem } from '@/src/lib/bindings';
export type { UsageResponse as UsageApiResponse } from '@/src/lib/bindings';
export type { UsageRow } from '@/src/lib/bindings';
export type { WebhookConfigResponse } from '@/src/lib/bindings';
export type { WebhookDeliveriesResponse } from '@/src/lib/bindings';
export type { WebhookTestResponse } from '@/src/lib/bindings';
export type { WebhookDeliveryItem } from '@/src/lib/bindings';
export type { ReceiptsListResponse } from '@/src/lib/bindings';
export type { ReceiptItem } from '@/src/lib/bindings';

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
  call_index: z.number().default(0),
  model: z.string(),
  provider: z.string().default(''),
  api_surface: z.string().optional(),
  request_kind: z.string().optional(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cached_tokens: z.number(),
  reasoning_tokens: z.number(),
  cost_usd: z.number().optional(),
  latency_ms: z.number(),
});

export const PromptSnapshotSectionSchema = z.object({
  key: z.string(),
  title: z.string(),
  content: z.string(),
  truncated: z.boolean(),
  original_char_count: z.number().optional(),
  note: z.string().optional(),
});

export const PromptSnapshotToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
});

export const PromptSnapshotSchema = z.object({
  sections: z.array(PromptSnapshotSectionSchema).default([]),
  available_tools: z.array(PromptSnapshotToolSchema).default([]),
});

export const TurnReceiptReasoningTextStatusSchema = z.enum([
  'captured',
  'provider_did_not_expose',
]);

export const TurnReceiptSchema = z.object({
  receipt_id: z.number().optional(),
  agent: z.string(),
  session: z.string().optional(),
  assistant_exchange_id: z.number().optional(),
  started_at: z.number(),
  duration_ms: z.number(),
  user_prompt: z.string(),
  tool_calls: z.array(ToolCallRecordSchema).default([]),
  tokens: TokenUsageSummarySchema,
  model_calls: z.number(),
  reply_summary: z.string(),
  model_id: z.string(),
  estimated_cost_usd: z.number().optional(),
  call_details: z.array(ModelCallDetailSchema).default([]),
  has_model_call_traces: z.boolean().default(false),
  prompt_snapshot: PromptSnapshotSchema.optional(),
  reasoning_text: z.string().optional(),
  reasoning_text_status: TurnReceiptReasoningTextStatusSchema.optional(),
});

export const ReceiptGetResponseSchema = z.object({
  file: z.string(),
  receipts: z.array(TurnReceiptSchema),
});

// ============================================================================
// Dashboard Diagnostics Schemas (for runtime validation)
// ============================================================================

export const DashboardSessionDiagnosticsSessionSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  title: z.string().optional(),
  message_count: z.number(),
  updated_at: z.number(),
});

export const DashboardSessionDiagnosticsSummarySchema = z.object({
  total_turns: z.number(),
  assistant_turns: z.number(),
  tool_call_count: z.number(),
  total_tokens: z.number(),
  reasoning_tokens: z.number(),
  estimated_cost_usd: z.number(),
});

export const DashboardSessionDiagnosticsRawTurnSchema = z.object({
  id: z.string(),
  exchange_id: z.number().optional(),
  timestamp: z.number(),
  role: z.string(),
  content: z.string(),
  tool_calls: z.array(z.unknown()).nullable().optional(),
  tool_call_id: z.string().optional(),
  turn_receipt: TurnReceiptSchema.optional(),
});

export const DashboardSessionDiagnosticsReasoningTextStatusSchema = z.enum([
  'captured',
  'provider_did_not_expose',
  'legacy_not_recorded',
]);

export const DashboardSessionDiagnosticsModelCallTraceSchema = z.object({
  call_index: z.number(),
  provider: z.string(),
  model_id: z.string(),
  api_surface: z.string().optional(),
  request_kind: z.string().optional(),
  started_at: z.number(),
  latency_ms: z.number(),
  normalized_messages: z.array(z.unknown()),
  normalized_tools: z.array(z.unknown()),
  reasoning_effort: z.string().optional(),
  function_call_mode: z.string().optional(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cached_tokens: z.number(),
  reasoning_tokens: z.number(),
  cost_usd: z.number().optional(),
  reasoning_text: z.string().optional(),
  reasoning_text_status: DashboardSessionDiagnosticsReasoningTextStatusSchema,
});

export const DashboardSessionDiagnosticsReceiptModelCallsResponseSchema = z.object({
  session_id: z.string(),
  receipt_id: z.number(),
  model_calls: z.array(DashboardSessionDiagnosticsModelCallTraceSchema).optional(),
});

export const DashboardSessionDiagnosticsApiResponseSchema = z.object({
  session: DashboardSessionDiagnosticsSessionSchema,
  summary: DashboardSessionDiagnosticsSummarySchema,
  turns: z.array(DashboardSessionDiagnosticsRawTurnSchema),
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

export type DashboardSessionDiagnosticsSession = z.infer<typeof DashboardSessionDiagnosticsSessionSchema>;
export type DashboardSessionDiagnosticsSummary = z.infer<typeof DashboardSessionDiagnosticsSummarySchema>;
export type DashboardSessionDiagnosticsRawTurn = z.infer<typeof DashboardSessionDiagnosticsRawTurnSchema>;
export type DashboardSessionDiagnosticsApiResponse = z.infer<typeof DashboardSessionDiagnosticsApiResponseSchema>;
export type DashboardSessionDiagnosticsModelCallTrace = z.infer<typeof DashboardSessionDiagnosticsModelCallTraceSchema>;
export type DashboardSessionDiagnosticsReceiptModelCallsResponse = z.infer<typeof DashboardSessionDiagnosticsReceiptModelCallsResponseSchema>;

// ============================================================================
// Legacy type aliases for backward compatibility
// ============================================================================

/** @deprecated Use AgentListItem from @/src/lib/bindings */
export type RawAgent = never;
