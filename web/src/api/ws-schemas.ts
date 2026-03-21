import { z } from "zod";

// ── WebSocket incoming event schemas ─────────────────
//
// The gateway sends JSON frames over /ws. Each frame has a "type"
// discriminator. We model this as a Zod discriminated union so every
// handler gets a fully typed event.

const wsAgentMessageSchema = z.object({
  type: z.literal("agent_message"),
  agent_id: z.string(),
  session_id: z.string().optional(),
  content: z.string(),
  timestamp: z.number().optional(),
});

const wsAgentChunkSchema = z.object({
  type: z.literal("agent_chunk"),
  agent_id: z.string(),
  session_id: z.string().optional(),
  content: z.string(),
  done: z.boolean().optional(),
});

const wsToolActivitySchema = z.object({
  type: z.literal("tool_activity"),
  agent_id: z.string(),
  session_id: z.string().optional(),
  tool: z.string(),
  status: z.string(),
  args_summary: z.string().optional(),
  result_summary: z.string().optional(),
  error: z.string().optional(),
  duration_ms: z.number().optional(),
});

const wsTypingSchema = z.object({
  type: z.literal("typing"),
  agent_id: z.string(),
  is_typing: z.boolean(),
});

const wsSessionEventSchema = z.object({
  type: z.literal("session_event"),
  agent_id: z.string(),
  event: z.string(),
  session_id: z.string().optional(),
});

const wsReceiptSchema = z.object({
  type: z.literal("receipt"),
  agent_id: z.string(),
  session_id: z.string().optional(),
  receipt: z.record(z.string(), z.unknown()),
});

const wsErrorSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  agent_id: z.string().optional(),
});

const wsPongSchema = z.object({
  type: z.literal("pong"),
});

const wsConnectedSchema = z.object({
  type: z.literal("connected"),
  message: z.string().optional(),
});

export const wsEventSchema = z.discriminatedUnion("type", [
  wsAgentMessageSchema,
  wsAgentChunkSchema,
  wsToolActivitySchema,
  wsTypingSchema,
  wsSessionEventSchema,
  wsReceiptSchema,
  wsErrorSchema,
  wsPongSchema,
  wsConnectedSchema,
]);

export type WsEvent = z.infer<typeof wsEventSchema>;

export type WsAgentMessage = z.infer<typeof wsAgentMessageSchema>;
export type WsAgentChunk = z.infer<typeof wsAgentChunkSchema>;
export type WsToolActivity = z.infer<typeof wsToolActivitySchema>;
export type WsTypingEvent = z.infer<typeof wsTypingSchema>;
export type WsSessionEvent = z.infer<typeof wsSessionEventSchema>;
export type WsReceiptEvent = z.infer<typeof wsReceiptSchema>;
export type WsErrorEvent = z.infer<typeof wsErrorSchema>;

// ── Outgoing commands ────────────────────────────────

export const wsClientCommandSchema = z.object({
  type: z.literal("client_command"),
  command: z.string(),
  target_agent: z.string(),
});

export type WsClientCommand = z.infer<typeof wsClientCommandSchema>;

/** Safely parse an incoming WS frame. Returns null for unknown shapes. */
export function parseWsEvent(data: unknown): WsEvent | null {
  const result = wsEventSchema.safeParse(data);
  return result.success ? result.data : null;
}
