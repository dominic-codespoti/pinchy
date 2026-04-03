export { usePinchyChat, useAssistant } from './hooks';
export { pinchyChat, assistantChat } from './api';
export type {
  // New naming
  PinchyContext,
  PinchyConversationContext,
  PinchyMessage,
  PinchyChatRequest,
  PinchyChatResponse,
  // Legacy naming (for backward compatibility)
  AssistantContext,
  AssistantScope,
  AssistantMessage,
  AssistantChatRequest,
  AssistantChatResponse,
  // UI types
  ChatMessage,
  // Deprecated action types (kept for compatibility)
  ProposedAction,
  ActionResult,
  ActionRequest,
  AssistantApplyRequest,
  AssistantApplyResponse,
} from './types';
export type {
  UsePinchyChatOptions,
  UsePinchyChatReturn,
  UseAssistantOptions,
  UseAssistantReturn,
} from './hooks';
