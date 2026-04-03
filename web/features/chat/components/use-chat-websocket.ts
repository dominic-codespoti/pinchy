'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useWebSocket } from '@/shared/providers/websocket';
import { Message } from '@/shared/types/common';
import {
  isWebSocketMessage,
  isSessionCreatedMessage,
  isTypingStartMessage,
  isTypingStopMessage,
  isSessionMessage,
  isStreamDeltaMessage,
  isAgentReplyMessage,
  isSlashResponseMessage,
  isSlashErrorMessage,
  isErrorMessage,
} from '@/shared/types/websocket';

export interface UseChatWebSocketReturn {
  /** Local messages accumulated from WebSocket */
  localMessages: Message[];
  /** Current streaming content being received */
  streamingContent: string;
  /** Whether the agent is currently streaming a response */
  isStreaming: boolean;
  /** When streaming started */
  streamingStartTime: Date;
  /** WebSocket connection status */
  isWsConnected: boolean;
  /** Send function from WebSocket */
  send: (message: Record<string, unknown>) => void;
  /** Clear all local state (call when switching sessions) */
  clearState: () => void;
  /** Handle streaming stop */
  handleStopStreaming: (agentId: string) => void;
  /** Add a local message optimistically */
  addLocalMessage: (message: Message) => void;
}

export function useChatWebSocket(
  selectedAgentId: string,
  sessionIdFromUrl: string | null,
  onSessionCreated?: (sessionId: string, agentId: string) => void
): UseChatWebSocketReturn {
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingStartTime, setStreamingStartTime] = useState<Date>(new Date());

  const currentSessionIdRef = useRef<string | null>(null);
  const seenMessageIdsRef = useRef<Set<string>>(new Set());
  const { send, lastMessage, status } = useWebSocket();

  const isWsConnected = status === 'connected';

  // Update current session ref when URL changes
  useEffect(() => {
    currentSessionIdRef.current = sessionIdFromUrl;
    seenMessageIdsRef.current.clear();
    setLocalMessages([]);
    setStreamingContent('');
    setIsStreaming(false);
  }, [sessionIdFromUrl]);

  // WebSocket message handling
  useEffect(() => {
    if (!lastMessage) return;
    if (!isWebSocketMessage(lastMessage)) return;

    // Handle session_created
    if (isSessionCreatedMessage(lastMessage)) {
      const sessionId = lastMessage.session;
      const agentId = lastMessage.agent;
      if (sessionId && agentId === selectedAgentId && !sessionIdFromUrl) {
        onSessionCreated?.(sessionId, agentId);
      }
      return;
    }

    // Handle typing_start
    if (isTypingStartMessage(lastMessage)) {
      if (lastMessage.agent === selectedAgentId) {
        setIsStreaming(true);
        setStreamingStartTime(new Date());
      }
      return;
    }

    // Handle typing_stop
    if (isTypingStopMessage(lastMessage)) {
      if (lastMessage.agent === selectedAgentId) {
        setIsStreaming(false);
      }
      return;
    }

    // Handle session_message
    if (isSessionMessage(lastMessage)) {
      const { role, content, session: sessionId, agent: agentId, id } = lastMessage;

      const isForCurrentSession = sessionId && sessionId === currentSessionIdRef.current;
      const isForOurAgent = agentId === selectedAgentId;

      if (isForCurrentSession || (isForOurAgent && !currentSessionIdRef.current)) {
        // Use server-provided ID or derive a stable dedup key from role+content
        const messageId = id || `msg-${role}-${content.slice(0, 100)}-${Date.now()}`;
        const dedupKey = id || `${role}:${content}`;

        if (seenMessageIdsRef.current.has(dedupKey)) return;
        seenMessageIdsRef.current.add(dedupKey);

        const newMessage: Message = {
          id: messageId,
          role: role as 'user' | 'assistant' | 'system',
          content,
          timestamp: new Date().toISOString(),
        };

        setLocalMessages(prev => [...prev, newMessage]);
      }
      return;
    }

    // Handle stream_delta (streaming chunks)
    if (isStreamDeltaMessage(lastMessage)) {
      const { delta, agent } = lastMessage;
      if (agent === selectedAgentId) {
        setStreamingContent(prev => prev + delta);
        setIsStreaming(true);
      }
      return;
    }

    // Handle agent_reply
    if (isAgentReplyMessage(lastMessage)) {
      const { agent } = lastMessage;
      if (agent === selectedAgentId) {
        setStreamingContent('');
        setIsStreaming(false);
      }
      return;
    }

    // Handle slash_response
    if (isSlashResponseMessage(lastMessage)) {
      const { response, agent } = lastMessage;
      if (agent === selectedAgentId && response) {
        const newMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        };
        setLocalMessages(prev => [...prev, newMessage]);
      }
      return;
    }

    // Handle slash_error
    if (isSlashErrorMessage(lastMessage)) {
      const errorMsg = lastMessage.error;

      if (errorMsg?.toLowerCase().includes('auth') || errorMsg?.toLowerCase().includes('token')) {
        toast.error('Authentication failed. Please check your provider credentials.', {
          description: errorMsg,
          duration: 10000,
        });
      } else {
        toast.error(errorMsg || 'An error occurred');
      }

      if (lastMessage.agent === selectedAgentId || !lastMessage.agent) {
        setIsStreaming(false);
        setStreamingContent('');
      }
      return;
    }

    // Handle generic error
    if (isErrorMessage(lastMessage)) {
      const errorMsg = lastMessage.message;

      if (errorMsg?.toLowerCase().includes('auth') || errorMsg?.toLowerCase().includes('token')) {
        toast.error('Authentication failed. Please check your provider credentials.', {
          description: errorMsg,
          duration: 10000,
        });
      } else {
        toast.error(errorMsg || 'An error occurred');
      }

      const agentId = lastMessage.agent || lastMessage.agent_id;
      if (agentId === selectedAgentId || !agentId) {
        setIsStreaming(false);
        setStreamingContent('');
      }
      return;
    }
  }, [lastMessage, selectedAgentId, sessionIdFromUrl, onSessionCreated]);

  // Safety timeout: clear streaming state if stuck
  useEffect(() => {
    if (!isStreaming) return;

    const timeout = setTimeout(() => {
      setIsStreaming(false);
      setStreamingContent('');
      toast.warning('Response timed out. The agent may be experiencing issues.', {
        description: 'Check that your provider (Copilot/GitHub) is authenticated.',
      });
    }, 120000);

    return () => clearTimeout(timeout);
  }, [isStreaming]);

  const clearState = useCallback(() => {
    setLocalMessages([]);
    setStreamingContent('');
    setIsStreaming(false);
    seenMessageIdsRef.current.clear();
  }, []);

  const handleStopStreaming = useCallback((agentId: string) => {
    send({
      type: 'stop',
      target_agent: agentId,
    });
    setIsStreaming(false);
    setStreamingContent('');
  }, [send]);

  const addLocalMessage = useCallback((message: Message) => {
    setLocalMessages(prev => [...prev, message]);
  }, []);

  return {
    localMessages,
    streamingContent,
    isStreaming,
    streamingStartTime,
    isWsConnected,
    send,
    clearState,
    handleStopStreaming,
    addLocalMessage,
  };
}
