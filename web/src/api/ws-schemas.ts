import { Schema as S } from "effect";

// ── WebSocket incoming event schemas ─────────────────
//
// The gateway sends JSON frames over /ws. Each frame has a "type"
// discriminator. We model these as individual schemas and create
// a union parser.

const WsAgentMessageSchema = S.Struct({
  type: S.Literal("agent_message"),
  agent_id: S.String,
  session_id: S.optional(S.String),
  content: S.String,
  timestamp: S.optional(S.Number),
});

const WsAgentChunkSchema = S.Struct({
  type: S.Literal("agent_chunk"),
  agent_id: S.String,
  session_id: S.optional(S.String),
  content: S.String,
  done: S.optional(S.Boolean),
});

const WsToolActivitySchema = S.Struct({
  type: S.Literal("tool_activity"),
  agent_id: S.String,
  session_id: S.optional(S.String),
  tool: S.String,
  status: S.String,
  args_summary: S.optional(S.String),
  result_summary: S.optional(S.String),
  error: S.optional(S.String),
  duration_ms: S.optional(S.Number),
});

const WsTypingSchema = S.Struct({
  type: S.Literal("typing"),
  agent_id: S.String,
  is_typing: S.Boolean,
});

const WsSessionEventSchema = S.Struct({
  type: S.Literal("session_event"),
  agent_id: S.String,
  event: S.String,
  session_id: S.optional(S.String),
});

const WsReceiptSchema = S.Struct({
  type: S.Literal("receipt"),
  agent_id: S.String,
  session_id: S.optional(S.String),
  receipt: S.Record({ key: S.String, value: S.Unknown }),
});

const WsErrorSchema = S.Struct({
  type: S.Literal("error"),
  message: S.String,
  agent_id: S.optional(S.String),
});

const WsPongSchema = S.Struct({
  type: S.Literal("pong"),
});

const WsConnectedSchema = S.Struct({
  type: S.Literal("connected"),
  message: S.optional(S.String),
});

const WsCopilotAuthStartedSchema = S.Struct({
  type: S.Literal("copilot_auth_started"),
  login: S.Struct({
    login_id: S.String,
    status: S.String,
    verification_uri: S.optional(S.String),
    user_code: S.optional(S.String),
    error: S.optional(S.NullOr(S.String)),
  }),
});

const WsCopilotAuthUpdateSchema = S.Struct({
  type: S.Literal("copilot_auth_update"),
  login: S.Struct({
    login_id: S.String,
    status: S.String,
    verification_uri: S.optional(S.String),
    user_code: S.optional(S.String),
    error: S.optional(S.NullOr(S.String)),
  }),
});

const WsChatGptAuthStartedSchema = S.Struct({
  type: S.Literal("chatgpt_auth_started"),
  login: S.Struct({
    login_id: S.String,
    status: S.String,
    auth_url: S.optional(S.String),
    error: S.optional(S.NullOr(S.String)),
  }),
});

const WsChatGptAuthUpdateSchema = S.Struct({
  type: S.Literal("chatgpt_auth_update"),
  login: S.Struct({
    login_id: S.String,
    status: S.String,
    error: S.optional(S.NullOr(S.String)),
  }),
});

// ── Union type (discriminated by "type" field) ───────

const WsEventSchema = S.Union(
  WsAgentMessageSchema,
  WsAgentChunkSchema,
  WsToolActivitySchema,
  WsTypingSchema,
  WsSessionEventSchema,
  WsReceiptSchema,
  WsErrorSchema,
  WsPongSchema,
  WsConnectedSchema,
  WsCopilotAuthStartedSchema,
  WsCopilotAuthUpdateSchema,
  WsChatGptAuthStartedSchema,
  WsChatGptAuthUpdateSchema,
);

export type WsEvent = S.Schema.Type<typeof WsEventSchema>;
export type WsAgentMessage = S.Schema.Type<typeof WsAgentMessageSchema>;
export type WsAgentChunk = S.Schema.Type<typeof WsAgentChunkSchema>;
export type WsToolActivity = S.Schema.Type<typeof WsToolActivitySchema>;
export type WsTyping = S.Schema.Type<typeof WsTypingSchema>;
export type WsSessionEvent = S.Schema.Type<typeof WsSessionEventSchema>;

const decodeWsEvent = S.decodeUnknownOption(WsEventSchema);

/** Safely parse an incoming WS frame. Returns null for unknown shapes. */
export function parseWsEvent(data: unknown): WsEvent | null {
  const result = decodeWsEvent(data);
  return result._tag === "Some" ? result.value : null;
}
