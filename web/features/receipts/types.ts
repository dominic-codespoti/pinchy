import { z } from 'zod';

// ============================================================================
// Receipt Item Schema (for list endpoint - just file info)
// ============================================================================

export const ReceiptItemSchema = z.object({
  file: z.string(),
});

// ============================================================================
// Receipts List Response Schema
// GET /api/agents/:id/receipts
// ============================================================================

export const ReceiptsListResponseSchema = z.object({
  receipts: z.array(ReceiptItemSchema),
});

// ============================================================================
// Tool Call Record Schema (Individual tool execution within a turn)
// ============================================================================

export const ToolCallRecordSchema = z.object({
  tool: z.string(),
  args_summary: z.string(),
  success: z.boolean(),
  duration_ms: z.number(),
  error: z.string().optional(),
});

// ============================================================================
// Token Info Schema
// ============================================================================

export const TokenInfoSchema = z.object({
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  total_tokens: z.number(),
  cached_tokens: z.number().default(0),
  reasoning_tokens: z.number().default(0),
});

// ============================================================================
// Model Call Detail Schema
// ============================================================================

export const ModelCallDetailSchema = z.object({
  model: z.string(),
  prompt_tokens: z.number(),
  completion_tokens: z.number(),
  cached_tokens: z.number(),
  reasoning_tokens: z.number(),
  cost_usd: z.number().optional(),
  latency_ms: z.number(),
});

// ============================================================================
// Turn Receipt Schema (Full turn with tool calls)
// This is the actual receipt data structure from the database
// ============================================================================

export const TurnReceiptSchema = z.object({
  agent: z.string(),
  session: z.string().optional(),
  started_at: z.number(),
  duration_ms: z.number(),
  user_prompt: z.string(),
  tool_calls: z.array(ToolCallRecordSchema).default([]),
  tokens: TokenInfoSchema,
  model_calls: z.number(),
  reply_summary: z.string(),
  model_id: z.string(),
  estimated_cost_usd: z.number().optional(),
  call_details: z.array(ModelCallDetailSchema).default([]),
});

// ============================================================================
// Receipt Get Response Schema
// GET /api/agents/:id/receipts/:session_id
// ============================================================================

export const ReceiptGetResponseSchema = z.object({
  file: z.string(),
  receipts: z.array(TurnReceiptSchema),
});

// ============================================================================
// Export inferred types
// ============================================================================

export type ReceiptItem = z.infer<typeof ReceiptItemSchema>;
export type ToolCallRecord = z.infer<typeof ToolCallRecordSchema>;
export type TokenInfo = z.infer<typeof TokenInfoSchema>;
export type ModelCallDetail = z.infer<typeof ModelCallDetailSchema>;
export type TurnReceipt = z.infer<typeof TurnReceiptSchema>;
export type ReceiptsListResponse = z.infer<typeof ReceiptsListResponseSchema>;
export type ReceiptGetResponse = z.infer<typeof ReceiptGetResponseSchema>;

// Alias for backwards compatibility
export type ReceiptsBySessionResponse = ReceiptGetResponse;
