'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { TIMEOUTS, RETRY } from '@/lib/config/timeouts';
import { getGatewayWebSocketUrl } from '@/lib/config/ports';

export type WebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error' | 'max_retries_exceeded';

interface WebSocketContextType {
  status: WebSocketStatus;
  send: (message: unknown) => boolean;
  lastMessage: unknown | null;
  lastMessages: unknown[];
  reconnectAttempts: number;
  connect: () => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

// Configuration constants
const MAX_RECONNECT_ATTEMPTS = RETRY.MAX_RECONNECT_ATTEMPTS;
const RECONNECT_DELAY_BASE = TIMEOUTS.WEBSOCKET_RECONNECT_BASE; // Increases with backoff
const MIN_INVALIDATION_INTERVAL = TIMEOUTS.MIN_INVALIDATION_INTERVAL; // Max 1 invalidation per second
const MESSAGE_BATCH_INTERVAL = TIMEOUTS.MESSAGE_BATCH_INTERVAL; // Batch messages for 100ms

interface WebSocketProviderProps {
  children: React.ReactNode;
  autoConnect?: boolean;
}

export function WebSocketProvider({ children, autoConnect = true }: WebSocketProviderProps) {
  const [status, setStatus] = useState<WebSocketStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<unknown | null>(null);
  const [lastMessages, setLastMessages] = useState<unknown[]>([]);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const lastInvalidationRef = useRef<number>(0);
  const messageQueueRef = useRef<unknown[]>([]);
  const batchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ref to hold the latest connect function (avoids circular dependency in useEffect)
  const connectRef = useRef<() => void>(() => {});

  const queryClient = useQueryClient();

  // Debounced query invalidation - max once per second
  const debouncedInvalidate = useCallback((type: string, agentId?: string) => {
    const now = Date.now();
    const timeSinceLastInvalidation = now - lastInvalidationRef.current;

    if (timeSinceLastInvalidation < MIN_INVALIDATION_INTERVAL) {
      // Skip this invalidation - too soon
      if (process.env.NODE_ENV === 'development') {
        console.debug('[WebSocket] Skipping invalidation, too soon:', type);
      }
      return;
    }

    lastInvalidationRef.current = now;

    if (process.env.NODE_ENV === 'development') {
      console.debug('[WebSocket] Invalidating queries for:', type, agentId);
    }

    if (type === 'agent_status_changed' || type === 'heartbeat') {
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      if (agentId) {
        queryClient.invalidateQueries({ queryKey: ['agents', agentId] });
      }
    }
  }, [queryClient]);

  // Process batched messages
  const processMessageBatch = useCallback(() => {
    const messages = messageQueueRef.current;
    messageQueueRef.current = [];

    if (messages.length === 0) return;

    // Update state with ALL messages (not just the last one)
    // This ensures all event types are received by the hook
    setLastMessages(messages);
    
    // Also set the lastMessage (most recent)
    setLastMessage(messages[messages.length - 1]);

    // Process all messages for invalidation logic
    const processedTypes = new Set<string>();

    for (const data of messages) {
      if (!data || typeof data !== 'object') continue;
      const msg = data as Record<string, unknown>;
      const type = msg.type as string;
      const agentId = msg.agent_id as string | undefined;

      // Only process each unique type once per batch
      const cacheKey = `${type}-${agentId ?? 'all'}`;
      if (processedTypes.has(cacheKey)) continue;
      processedTypes.add(cacheKey);

      // Debounced invalidation
      debouncedInvalidate(type, agentId);
    }
  }, [debouncedInvalidate]);

  // Queue message for batch processing
  const queueMessage = useCallback((data: unknown) => {
    messageQueueRef.current.push(data);

    // Clear existing batch timeout
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }

    // Set new batch timeout
    batchTimeoutRef.current = setTimeout(() => {
      processMessageBatch();
    }, MESSAGE_BATCH_INTERVAL);
  }, [processMessageBatch]);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');

    // Use centralized port configuration
    const wsUrl = getGatewayWebSocketUrl();

    if (process.env.NODE_ENV === 'development') {
      console.debug('[WebSocket] Connecting to:', wsUrl, 'attempt:', reconnectAttemptsRef.current + 1);
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[WebSocket] Connected');
        }
        setStatus('connected');
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Queue for batch processing instead of immediate state update
          queueMessage(data);
        } catch {
          // Ignore non-JSON messages
        }
      };

      ws.onclose = (event) => {
        if (process.env.NODE_ENV === 'development') {
          console.debug('[WebSocket] Closed:', event.code, event.reason);
        }

        wsRef.current = null;

        // Only auto-reconnect if not a normal closure and we haven't exceeded max attempts
        if (autoConnect && !event.wasClean) {
          if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
            const nextAttempt = reconnectAttemptsRef.current + 1;
            const backoffDelay = RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttemptsRef.current);

            if (process.env.NODE_ENV === 'development') {
              console.debug(`[WebSocket] Reconnecting in ${backoffDelay}ms (attempt ${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})`);
            }

            reconnectTimeoutRef.current = setTimeout(() => {
              reconnectAttemptsRef.current = nextAttempt;
              setReconnectAttempts(nextAttempt);
              connectRef.current();
            }, backoffDelay);
          } else {
            console.error('[WebSocket] Max reconnection attempts reached, giving up');
            setStatus('max_retries_exceeded');
          }
        } else {
          setStatus('disconnected');
        }
      };

      ws.onerror = () => {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[WebSocket] Connection error (backend may not be ready)');
        }
        setStatus('error');
      };
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[WebSocket] Connection error:', error instanceof Error ? error.message : 'Unknown error');
      }
      setStatus('error');
    }
  }, [autoConnect, queueMessage]);

  const disconnect = useCallback(() => {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[WebSocket] Disconnecting');
    }

    // Clear all timeouts
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }

    // Close WebSocket cleanly
    if (wsRef.current) {
      // Set wasClean to prevent auto-reconnect
      const ws = wsRef.current;
      wsRef.current = null;
      ws.close(1000, 'Manual disconnect');
    }

    setStatus('disconnected');
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
  }, []);

  const send = useCallback((message: unknown): boolean => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('[WebSocket] Cannot send message, WebSocket is not open. readyState:', wsRef.current?.readyState);
      return false;
    }
  }, []);

  // Manual reconnect function
  const manualReconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    connect();
  }, [connect]);

  // Keep connectRef.current in sync with the latest connect function
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    if (autoConnect) {
      connectRef.current();
    }

    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConnect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{
      status,
      send,
      lastMessage,
      lastMessages,
      reconnectAttempts,
      connect: manualReconnect,
      disconnect
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}
