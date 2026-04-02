import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { ReceiptGetResponseSchema } from '@/lib/validation/schemas';
import { Message, ToolCall, ToolResult, TurnReceipt } from '@/shared/types/common';
import { ChatSession, RawChatSession } from './types';

interface SessionsListResponse {
  sessions: RawChatSession[];
}

interface MessagesResponse {
  messages: unknown[];
}

interface ReceiptGetResponse {
  file: string;
  receipts: TurnReceipt[];
}

interface RawSessionMessage {
  timestamp?: number | string;
  role?: string;
  content?: string;
  tool_calls?: RawToolCall[];
  tool_call_id?: string;
}

interface RawToolCall {
  id?: string;
  function?: {
    name?: string;
    arguments?: string | Record<string, unknown>;
  };
}

function transformSession(raw: RawChatSession): ChatSession {
  return {
    id: raw.session_id,
    agentId: raw.agent_id,
    title: raw.title ?? undefined,
    messageCount: raw.message_count ?? 0,
    createdAt: new Date(raw.created_at).toISOString(),
    updatedAt: new Date(raw.modified * 1000).toISOString(),
  };
}

function normalizeRole(role: string | undefined): Message['role'] {
  if (role === 'user' || role === 'assistant' || role === 'system') {
    return role;
  }

  return 'system';
}

function normalizeTimestamp(timestamp: number | string | undefined): string {
  if (typeof timestamp === 'number') {
    return new Date(timestamp).toISOString();
  }

  if (typeof timestamp === 'string') {
    const parsedTimestamp = Number(timestamp);
    if (!Number.isNaN(parsedTimestamp)) {
      return new Date(parsedTimestamp).toISOString();
    }

    const parsedDate = new Date(timestamp);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }
  }

  return new Date().toISOString();
}

function parseToolArguments(argumentsValue: string | Record<string, unknown> | undefined): Record<string, unknown> {
  if (!argumentsValue) {
    return {};
  }

  if (typeof argumentsValue === 'string') {
    try {
      const parsed = JSON.parse(argumentsValue) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : { value: parsed };
    } catch {
      return { raw: argumentsValue };
    }
  }

  return argumentsValue;
}

function normalizeToolCalls(toolCalls: RawToolCall[] | undefined): ToolCall[] | undefined {
  const normalized = (toolCalls ?? [])
    .map((toolCall, index) => {
      if (!toolCall.function?.name) {
        return null;
      }

      return {
        id: toolCall.id ?? `tool-call-${index}`,
        name: toolCall.function.name,
        arguments: parseToolArguments(toolCall.function.arguments),
      } satisfies ToolCall;
    })
    .filter((toolCall): toolCall is ToolCall => toolCall !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function transformMessage(raw: RawSessionMessage, index: number): Message | null {
  const timestamp = normalizeTimestamp(raw.timestamp);
  const role = normalizeRole(raw.role);
  const toolCalls = normalizeToolCalls(raw.tool_calls);
  const hasContent = typeof raw.content === 'string' && raw.content.length > 0;

  if (!hasContent && !toolCalls) {
    return null;
  }

  return {
    id: `history-${raw.timestamp ?? 'unknown'}-${index}-${role}`,
    role,
    content: hasContent ? raw.content ?? '' : '',
    timestamp,
    tool_calls: toolCalls,
  };
}

function normalizeToolResult(raw: RawSessionMessage): ToolResult | null {
  if (!raw.tool_call_id || typeof raw.content !== 'string' || raw.content.length === 0) {
    return null;
  }

  return {
    tool_call_id: raw.tool_call_id,
    content: raw.content,
  };
}

export function normalizeSessionMessages(messages: unknown[]): Message[] {
  const normalizedMessages: Message[] = [];

  messages.forEach((message, index) => {
    if (!message || typeof message !== 'object') {
      return;
    }

    const rawMessage = message as RawSessionMessage;

    if (rawMessage.role === 'tool') {
      const toolResult = normalizeToolResult(rawMessage);
      if (!toolResult) {
        return;
      }

      const targetMessage = [...normalizedMessages]
        .reverse()
        .find((candidate) => candidate.tool_calls?.some((toolCall) => toolCall.id === toolResult.tool_call_id));

      if (targetMessage) {
        targetMessage.tool_results = [...(targetMessage.tool_results ?? []), toolResult];
      }

      return;
    }

    const normalizedMessage = transformMessage(rawMessage, index);
    if (normalizedMessage) {
      normalizedMessages.push(normalizedMessage);
    }
  });

  return mergeToolOnlyAssistantMessages(normalizedMessages);
}

function mergeToolOnlyAssistantMessages(messages: Message[]): Message[] {
  const mergedMessages: Message[] = [];
  let pendingToolOnlyAssistantMessages: Message[] = [];

  const flushPendingToolOnlyMessages = () => {
    if (pendingToolOnlyAssistantMessages.length === 0) {
      return;
    }

    mergedMessages.push(...pendingToolOnlyAssistantMessages);
    pendingToolOnlyAssistantMessages = [];
  };

  for (const message of messages) {
    const isAssistant = message.role === 'assistant';
    const hasContent = message.content.trim().length > 0;
    const hasToolCalls = Boolean(message.tool_calls?.length);

    if (isAssistant && !hasContent && hasToolCalls) {
      pendingToolOnlyAssistantMessages.push(message);
      continue;
    }

    if (isAssistant && hasContent && pendingToolOnlyAssistantMessages.length > 0) {
      const mergedToolCalls = pendingToolOnlyAssistantMessages.flatMap((pendingMessage) => pendingMessage.tool_calls ?? []);
      const mergedToolResults = pendingToolOnlyAssistantMessages.flatMap((pendingMessage) => pendingMessage.tool_results ?? []);

      mergedMessages.push({
        ...message,
        tool_calls: [...mergedToolCalls, ...(message.tool_calls ?? [])],
        tool_results: [...mergedToolResults, ...(message.tool_results ?? [])],
      });
      pendingToolOnlyAssistantMessages = [];
      continue;
    }

    flushPendingToolOnlyMessages();
    mergedMessages.push(message);
  }

  flushPendingToolOnlyMessages();

  return mergedMessages;
}

function getMessageTimestampMs(message: Message): number | null {
  const parsed = Date.parse(message.timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function receiptSummaryMatchesMessage(message: Message, receipt: TurnReceipt): boolean {
  if (!receipt.reply_summary) {
    return false;
  }

  const summary = normalizeComparableText(receipt.reply_summary);
  const content = normalizeComparableText(message.content);

  if (summary.length < 24 || content.length === 0) {
    return false;
  }

  return content.includes(summary) || summary.includes(content.slice(0, Math.min(content.length, summary.length)));
}

function getReceiptKey(receipt: TurnReceipt): string {
  return [
    receipt.session ?? 'no-session',
    receipt.started_at,
    receipt.model_id,
    receipt.reply_summary,
  ].join(':');
}

export function dedupeReceipts(receipts: TurnReceipt[]): TurnReceipt[] {
  const seen = new Set<string>();

  return receipts
    .slice()
    .sort((a, b) => a.started_at - b.started_at)
    .filter((receipt) => {
      const key = getReceiptKey(receipt);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

export function attachReceiptsToMessages(messages: Message[], receipts: TurnReceipt[]): Message[] {
  if (messages.length === 0 || receipts.length === 0) {
    return messages;
  }

  const nextMessages: Message[] = messages.map((message) => ({
    ...message,
    turn_receipt: undefined,
  }));

  const contentCandidates = nextMessages
    .map((message, index) => ({ message, index }))
    .filter(({ message }) => message.role === 'assistant' && message.content.trim().length > 0);

  const candidateIndexes = contentCandidates.length > 0
    ? contentCandidates
    : nextMessages
      .map((message, index) => ({ message, index }))
      .filter(({ message }) => message.role === 'assistant' && Boolean(message.tool_calls?.length));

  if (candidateIndexes.length === 0) {
    return nextMessages;
  }

  let nextCandidatePointer = 0;

  for (const receipt of dedupeReceipts(receipts)) {
    let matchedIndex = -1;

    for (let pointer = nextCandidatePointer; pointer < candidateIndexes.length; pointer += 1) {
      const candidate = candidateIndexes[pointer];

      if (receiptSummaryMatchesMessage(candidate.message, receipt)) {
        matchedIndex = pointer;
        break;
      }
    }

    if (matchedIndex === -1) {
      for (let pointer = nextCandidatePointer; pointer < candidateIndexes.length; pointer += 1) {
        const candidate = candidateIndexes[pointer];
        const candidateTimestamp = getMessageTimestampMs(candidate.message);

        if (candidateTimestamp !== null && candidateTimestamp + 1000 >= receipt.started_at) {
          matchedIndex = pointer;
          break;
        }
      }
    }

    if (matchedIndex === -1 && nextCandidatePointer < candidateIndexes.length) {
      matchedIndex = nextCandidatePointer;
    }

    if (matchedIndex === -1) {
      continue;
    }

    const messageIndex = candidateIndexes[matchedIndex].index;
    nextMessages[messageIndex] = {
      ...nextMessages[messageIndex],
      turn_receipt: receipt,
    };
    nextCandidatePointer = matchedIndex + 1;
  }

  return nextMessages;
}

export async function getAgentSessions(agentId: string): Promise<ChatSession[]> {
  try {
    const response = await fetchApi<SessionsListResponse>(`/api/agents/${agentId}/sessions`);
    const rawSessions = response.sessions ?? [];
    return rawSessions.map((raw) => transformSession(raw));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getSessionMessages(sessionId: string, agentId: string): Promise<Message[]> {
  try {
    const sessionFile = `${sessionId}.jsonl`;
    const response = await fetchApi<MessagesResponse>(`/api/agents/${agentId}/sessions/${sessionFile}`);
    return normalizeSessionMessages(response.messages);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

export async function getSessionReceipts(sessionId: string, agentId: string): Promise<TurnReceipt[]> {
  try {
    const sessionFile = `${sessionId}.receipts.jsonl`;
    const response = await fetchApi<ReceiptGetResponse>(
      `/api/agents/${agentId}/receipts/${sessionFile}`,
      undefined,
      ReceiptGetResponseSchema
    );

    return dedupeReceipts(response.receipts ?? []);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  }
}

export async function createSession(agentId: string): Promise<ChatSession> {
  // Sessions are now created lazily by the backend when the first message is sent.
  // This function is kept for API compatibility but the actual session creation
  // happens via WebSocket when handleSendMessage is called without a session_id.
  // The backend will send a `session_created` event with the real session ID.
  throw new Error(
    'Sessions are now created automatically when sending your first message. ' +
    'Please type a message to start a new session.'
  );
}

export async function deleteSession(sessionId: string, agentId: string): Promise<void> {
  const sessionFile = `${sessionId}.jsonl`;
  await fetchApi<{ session_id: string; deleted: boolean }>(`/api/agents/${agentId}/sessions/${sessionFile}`, {
    method: 'DELETE',
  });
}
