import { useState, useCallback } from 'react';
import { pinchyChat } from './api';
import {
  PinchyContext,
  PinchyConversationContext,
  PinchyMessage,
  ChatMessage,
} from './types';

export interface UsePinchyChatOptions {
  context: PinchyContext;
}

export interface UsePinchyChatReturn {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  sessionId: string | null;
  sendMessage: (content: string) => Promise<void>;
  clearMessages: () => void;
}

function buildContext(
  context: PinchyContext
): PinchyConversationContext | undefined {
  if (context.type === 'agent') {
    return {
      scope_type: 'agent',
      agent_id: context.agentId,
    };
  }
  if (context.type === 'group') {
    return {
      scope_type: 'group',
      group_id: context.groupId,
      group_name: context.groupName,
      group_agent_ids: context.agentIds,
    };
  }
  // For global context, return undefined (no specific context)
  return undefined;
}

export function usePinchyChat({
  context,
}: UsePinchyChatOptions): UsePinchyChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;

      setIsLoading(true);
      setError(null);

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}-user`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);

      try {
        const conversationContext = buildContext(context);
        const response = await pinchyChat({
          message: content.trim(),
          context: conversationContext,
          session_id: sessionId || undefined,
        });

        // Store the session ID for continuing the conversation
        setSessionId(response.session_id);

        const assistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-assistant`,
          role: 'assistant',
          content: response.reply,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMessage);

        const errorAssistantMessage: ChatMessage = {
          id: `msg-${Date.now()}-assistant-error`,
          role: 'assistant',
          content: `Sorry, I encountered an error: ${errorMessage}`,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, errorAssistantMessage]);
      } finally {
        setIsLoading(false);
      }
    },
    [context, sessionId]
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setSessionId(null);
  }, []);

  return {
    messages,
    isLoading,
    error,
    sessionId,
    sendMessage,
    clearMessages,
  };
}

/** @deprecated Use usePinchyChat instead */
export const useAssistant = usePinchyChat;
/** @deprecated Use UsePinchyChatOptions instead */
export type UseAssistantOptions = UsePinchyChatOptions;
/** @deprecated Use UsePinchyChatReturn instead */
export type UseAssistantReturn = UsePinchyChatReturn;
