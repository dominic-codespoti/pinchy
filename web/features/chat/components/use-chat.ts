'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { TurnReceiptSchema } from '@/lib/validation/schemas';
import { attachReceiptsToMessages, dedupeReceipts, getSessionMessages, getSessionReceipts } from '@/features/chat/api';
import { useWebSocket } from '@/shared/providers/websocket';
import { Agent } from '@/features/agents/types';
import { Message, TurnReceipt } from '@/shared/types/common';
import { useAgentSessions } from '../hooks';
import { ChatSession, Mention } from '../types';

export interface UseChatReturn {
  selectedAgentId: string;
  setSelectedAgentId: (id: string) => void;
  localMessages: Message[];
  displayMessages: Message[];
  isStreaming: boolean;
  streamingContent: string;
  streamingStartTime: Date;
  isWsConnected: boolean;
  sessions: ChatSession[] | undefined;
  sessionsLoading: boolean;
  filteredSessions: ChatSession[];
  currentSession: ChatSession | undefined;
  sessionIdFromUrl: string | null;
  agentIdFromUrl: string | null;
  availableMentions: Mention[];
  mobileSidebarOpen: boolean;
  setMobileSidebarOpen: (open: boolean) => void;
  isCreatingSession: boolean;
  isSessionHydrating: boolean;
  isMessagesHydrating: boolean;
  handleSendMessage: (content: string) => void;
  handleNewChat: () => void;
  handleStopStreaming: () => void;
  navigateToSession: (sessionId: string) => void;
  navigateToAgent: (agentId: string) => void;
}

export function useChat(agents: Agent[] = [], agentsLoading = false): UseChatReturn {
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('session');
  const agentIdFromUrl = searchParams.get('agent');

  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingStartTime, setStreamingStartTime] = useState<Date>(new Date());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);
  const [pendingSessionId, setPendingSessionId] = useState<string | null>(null);
  const [isMessagesHydrating, setIsMessagesHydrating] = useState(false);
  const [sessionReceipts, setSessionReceipts] = useState<TurnReceipt[]>([]);

  const currentSessionIdRef = useRef<string | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  const messageIdCounterRef = useRef(0);
  const seenMessagesRef = useRef<Set<string>>(new Set());

  const generateMessageId = useCallback(() => {
    messageIdCounterRef.current += 1;
    return `msg-${Date.now()}-${messageIdCounterRef.current}`;
  }, []);
  
  const getMessageSignature = useCallback((role: string, content: string) => {
    return `${role}:${content}`;
  }, []);

  const normalizeBackendTimestamp = useCallback((value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }

      const parsedDate = Date.parse(value);
      if (Number.isFinite(parsedDate)) {
        return parsedDate;
      }
    }

    return null;
  }, []);

  const appendReceipts = useCallback((incomingReceipts: TurnReceipt[]) => {
    if (incomingReceipts.length === 0) {
      return;
    }

    setSessionReceipts((previous) => dedupeReceipts([...previous, ...incomingReceipts]));
  }, []);

  const getPersistedMessageKey = useCallback((sessionId: string, role: string, content: string, timestamp: unknown) => {
    const normalizedTimestamp = normalizeBackendTimestamp(timestamp);
    return normalizedTimestamp === null
      ? null
      : `${sessionId}:${normalizedTimestamp}:${role}:${content}`;
  }, [normalizeBackendTimestamp]);

  const createPersistedMessage = useCallback((sessionId: string, role: string, content: string, timestamp: unknown): Message => {
    const normalizedTimestamp = normalizeBackendTimestamp(timestamp);
    const isoTimestamp = normalizedTimestamp === null
      ? new Date().toISOString()
      : new Date(normalizedTimestamp).toISOString();

    return {
      id: normalizedTimestamp === null
        ? generateMessageId()
        : `persisted-${sessionId}-${normalizedTimestamp}-${role}`,
      role: role as 'user' | 'assistant' | 'system',
      content,
      timestamp: isoTimestamp,
    };
  }, [generateMessageId, normalizeBackendTimestamp]);

  const updateChatUrl = useCallback(
    (nextAgentId: string, nextSessionId?: string | null, mode: 'push' | 'replace' = 'push') => {
      if (typeof window === 'undefined') {
        return;
      }

      const params = new URLSearchParams();
      params.set('agent', nextAgentId);

      if (nextSessionId) {
        params.set('session', nextSessionId);
      }

      const nextUrl = `/chat?${params.toString()}`;

      if (`${window.location.pathname}${window.location.search}` === nextUrl) {
        return;
      }

      const method = mode === 'replace' ? 'replaceState' : 'pushState';
      window.history[method](null, '', nextUrl);
      window.dispatchEvent(new PopStateEvent('popstate'));
    },
    []
  );

  const { send, lastMessages, status } = useWebSocket();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading: sessionsLoading } = useAgentSessions(selectedAgentId);

  const isWsConnected = status === 'connected';

  // Set initial agent from URL or first agent
  useEffect(() => {
    if (agents.length > 0) {
      if (agentIdFromUrl && agents.find(a => a.id === agentIdFromUrl)) {
        setSelectedAgentId(agentIdFromUrl);
      } else if (!selectedAgentId) {
        setSelectedAgentId(agents[0].id);
      }
    }
  }, [agents, agentIdFromUrl, selectedAgentId]);

  // Get current session from URL
  const currentSession = useMemo(() => {
    if (!sessionIdFromUrl || !sessions) return undefined;
    return sessions.find(s => s.id === sessionIdFromUrl);
  }, [sessionIdFromUrl, sessions]);

  // WebSocket message handling
  useEffect(() => {
    if (!lastMessages || lastMessages.length === 0) return;

    // Process ALL messages in the batch, not just the last one
    for (const lastMessage of lastMessages) {
      if (!lastMessage || typeof lastMessage !== 'object') continue;

      const msg = lastMessage as Record<string, unknown>;
      const msgType = msg.type as string;

      if (msgType === 'session_created') {
        const sessionId = msg.session as string;
        const agentId = msg.agent as string;
        
        // Always clear the creating session flag first - this stops the spinner
        setIsCreatingSession(false);
        
        if (agentId === selectedAgentId) {
          // Update ref IMMEDIATELY before async navigation to prevent race condition
          currentSessionIdRef.current = sessionId;
          setPendingSessionId(sessionId);
          // Always navigate to the new session - this allows clicking "New Chat"
          // even when already viewing an existing session
          updateChatUrl(agentId, sessionId, 'replace');
          toast.success('New session created');
        }
        // Invalidate and refetch sessions query to refresh sidebar immediately
        queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'sessions'] });
        continue;
      }

      if (msgType === 'typing_start') {
        const agentId = msg.agent as string;
        if (agentId === selectedAgentId) {
          setIsStreaming(true);
          setStreamingStartTime(new Date());
        }
        continue;
      }

      if (msgType === 'typing_stop') {
        const agentId = msg.agent as string;
        if (agentId === selectedAgentId) {
          setIsStreaming(false);
        }
        continue;
      }

      if (msgType === 'session_message') {
        const role = msg.role as string;
        const content = msg.content as string;
        const sessionId = msg.session as string;
        const agentId = msg.agent as string;

        const isForCurrentSession = sessionId && sessionId === currentSessionIdRef.current;
        const isForOurAgent = agentId === selectedAgentId;

        if (isForCurrentSession || (isForOurAgent && !currentSessionIdRef.current)) {
          // Skip raw JSON/memory content that shouldn't be displayed
          if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
            // This is likely raw memory/context JSON, skip it
            continue;
          }
          
          const persistedKey = getPersistedMessageKey(sessionId, role, content, msg.timestamp);

          if (persistedKey && seenMessagesRef.current.has(persistedKey)) {
            continue;
          }

          const persistedMessage = createPersistedMessage(sessionId, role, content, msg.timestamp);
          const optimisticSignature = getMessageSignature(role, content);

          setLocalMessages(prev => {
            const optimisticIndex = prev.findIndex((candidate) => (
              candidate.id.startsWith('msg-') &&
              getMessageSignature(candidate.role, candidate.content) === optimisticSignature
            ));

            if (optimisticIndex >= 0) {
              const next = [...prev];
              next[optimisticIndex] = persistedMessage;
              return next;
            }

            return [...prev, persistedMessage];
          });

          if (persistedKey) {
            seenMessagesRef.current.add(persistedKey);
          }

          // Clear streaming content since we now have the persisted message
          if (role === 'assistant') {
            setStreamingContent('');
          }
        }
        continue;
      }

      if (msgType === 'turn_receipt') {
        const parsedReceipt = TurnReceiptSchema.safeParse(msg);
        if (!parsedReceipt.success) {
          continue;
        }

        const receipt = parsedReceipt.data;
        const agentId = receipt.agent;
        const receiptSessionId = receipt.session ?? null;
        const currentSessionId = currentSessionIdRef.current;
        const isForCurrentSession = Boolean(receiptSessionId && receiptSessionId === currentSessionId);
        const isForOurAgentWithoutSession = agentId === selectedAgentId && !currentSessionId;

        if (isForCurrentSession || isForOurAgentWithoutSession) {
          appendReceipts([receipt]);
        }

        continue;
      }

      if (msgType === 'agent_chunk' || msgType === 'stream_delta') {
        const delta = (msg.delta ?? msg.content) as string;
        const agentId = msg.agent as string;
        if (agentId === selectedAgentId) {
          setStreamingContent(prev => prev + delta);
          setIsStreaming(true);
        }
        continue;
      }

      if (msgType === 'agent_response' || msgType === 'message_complete') {
        const agentId = msg.agent as string;
        if (agentId === selectedAgentId) {
          setIsStreaming(false);
          // NOTE: We intentionally do NOT clear streamingContent here.
          // The streamed content remains visible until the session_message
          // arrives with the persisted assistant message.
        }
        continue;
      }

      if (msgType === 'error' || msgType === 'slash_error') {
        const errorMsg = msg.error as string || msg.message as string;

        if (errorMsg?.toLowerCase().includes('auth') || errorMsg?.toLowerCase().includes('token')) {
          toast.error('Authentication failed. Please check your provider credentials.', {
            description: errorMsg,
            duration: 10000,
          });
        } else {
          toast.error(errorMsg || 'An error occurred');
        }

        const agentId = msg.agent as string;
        if (agentId === selectedAgentId || !agentId) {
          setIsStreaming(false);
          setStreamingContent('');
          // Also clear creating session state on error
          setIsCreatingSession(false);
        }
        continue;
      }

      if (msgType === 'slash_response') {
        const response = msg.response as string;
        const agentId = msg.agent as string;
        if (agentId === selectedAgentId && response) {
          const newMessage: Message = {
            id: generateMessageId(),
            role: 'assistant',
            content: response,
            timestamp: new Date().toISOString(),
          };
          setLocalMessages(prev => [...prev, newMessage]);
        }
        continue;
      }
    }
  }, [
    createPersistedMessage,
    generateMessageId,
    getMessageSignature,
    getPersistedMessageKey,
    lastMessages,
    appendReceipts,
    queryClient,
    selectedAgentId,
    updateChatUrl,
  ]);

  // Update current session ref when URL changes
  useEffect(() => {
    const previousId = previousSessionIdRef.current;
    const newId = sessionIdFromUrl;
    
    // Update refs to track the transition
    previousSessionIdRef.current = newId;
    currentSessionIdRef.current = newId;
    
    // Only clear messages/streaming state when navigating to a different EXISTING session.
    // When creating a new session, sessionIdFromUrl changes from null to a new ID,
    // and we must NOT clear localMessages because the user just sent a message
    // and we're waiting for the response.
    const isNavigatingBetweenSessions = previousId && newId && previousId !== newId;
    const isNavigatingToEmpty = previousId && !newId;
    
    if (isNavigatingBetweenSessions || isNavigatingToEmpty) {
      setLocalMessages([]);
      setSessionReceipts([]);
      setStreamingContent('');
      setIsStreaming(false);
      // Clear seen messages cache when changing sessions
      seenMessagesRef.current.clear();
    }
  }, [sessionIdFromUrl]);

  useEffect(() => {
    if (!pendingSessionId) {
      return;
    }

    if (!sessionIdFromUrl || currentSession?.id === pendingSessionId) {
      setPendingSessionId(null);
    }
  }, [currentSession?.id, pendingSessionId, sessionIdFromUrl]);

  // Load session messages when session changes
  useEffect(() => {
    // Only fetch when both values are present. Don't clear messages here -
    // clearing is handled by the session navigation effect above.
    if (!sessionIdFromUrl || !selectedAgentId) {
      setIsMessagesHydrating(false);
      setSessionReceipts([]);
      return;
    }

    let cancelled = false;
    setIsMessagesHydrating(true);

    Promise.all([
      getSessionMessages(sessionIdFromUrl, selectedAgentId),
      getSessionReceipts(sessionIdFromUrl, selectedAgentId),
    ])
      .then(([messages, receipts]) => {
        if (cancelled) {
          return;
        }

        setLocalMessages(messages);
        setSessionReceipts(receipts);
        seenMessagesRef.current.clear();
        messages.forEach((msg) => {
          const persistedKey = getPersistedMessageKey(sessionIdFromUrl, msg.role, msg.content, msg.timestamp);
          if (persistedKey) {
            seenMessagesRef.current.add(persistedKey);
          }
        });
        setIsMessagesHydrating(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsMessagesHydrating(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionIdFromUrl, selectedAgentId, getPersistedMessageKey]);

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

  // Safety: Clear streaming content after a delay when streaming completes
  // This handles cases where session_message might not arrive
  useEffect(() => {
    if (isStreaming || !streamingContent) return;

    const timeout = setTimeout(() => {
      setStreamingContent('');
    }, 5000); // 5 second grace period

    return () => clearTimeout(timeout);
  }, [isStreaming, streamingContent]);

  // Safety timeout: clear creating session state if stuck
  useEffect(() => {
    if (!isCreatingSession) return;

    const timeout = setTimeout(() => {
      setIsCreatingSession(false);
      toast.error('Session creation timed out. Please try again.');
    }, 30000); // 30 second timeout for session creation

    return () => clearTimeout(timeout);
  }, [isCreatingSession]);

  const handleSendMessage = useCallback((content: string) => {
    if (!selectedAgentId || status !== 'connected') {
      toast.error('Not connected to server');
      return;
    }

    const userMessage: Message = {
      id: generateMessageId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };

    setLocalMessages(prev => [...prev, userMessage]);
    setStreamingStartTime(new Date());
    setIsStreaming(true);
    setStreamingContent('');

    send({
      command: content,
      target_agent: selectedAgentId,
      // Don't send session_id for new chats - let backend create the session
      // and it will notify us via session_created event
      ...(sessionIdFromUrl && { session_id: sessionIdFromUrl }),
    });
  }, [selectedAgentId, sessionIdFromUrl, status, send]);

  const handleNewChat = useCallback(() => {
    if (!selectedAgentId) {
      toast.error('Please select an agent first');
      return;
    }

    if (status !== 'connected') {
      toast.error('Not connected to server');
      return;
    }

    // Prevent duplicate session creation requests
    if (isCreatingSession) {
      return;
    }

    // Set flag to prevent duplicate sends
    setIsCreatingSession(true);

    // Always clear local state to ensure a fresh chat context
    setLocalMessages([]);
    setSessionReceipts([]);
    setStreamingContent('');
    setIsStreaming(false);
    setPendingSessionId(null);
    setIsMessagesHydrating(false);

    // Send /new command via WebSocket to create session
    const message = {
      command: '/new',
      target_agent: selectedAgentId,
    };
    const sent = send(message);
    
    if (!sent) {
      toast.error('Connection lost. Please try again.');
      setIsCreatingSession(false);
      return;
    }

    // Clear current session ref (navigation will happen when session_created is received)
    currentSessionIdRef.current = null;

    toast.success('Creating new chat...');
    setMobileSidebarOpen(false);
  }, [selectedAgentId, status, send, isCreatingSession]);

  const handleStopStreaming = useCallback(() => {
    send({
      type: 'stop',
      target_agent: selectedAgentId,
    });
    setIsStreaming(false);
    setStreamingContent('');
  }, [send, selectedAgentId]);

  const navigateToSession = useCallback((sessionId: string) => {
    setPendingSessionId(null);
    updateChatUrl(selectedAgentId, sessionId);
  }, [selectedAgentId, updateChatUrl]);

  const navigateToAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    setPendingSessionId(null);
    updateChatUrl(agentId);
  }, [updateChatUrl]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter(s => s.agentId === selectedAgentId);
  }, [sessions, selectedAgentId]);

  const displayMessages = useMemo(() => {
    const hydratedMessages = attachReceiptsToMessages(localMessages, sessionReceipts);

    if (!isStreaming || !streamingContent) {
      return hydratedMessages;
    }

    const streamingMessage: Message = {
      id: `streaming-${streamingStartTime.getTime()}`,
      role: 'assistant',
      content: streamingContent,
      timestamp: new Date().toISOString(),
    };

    return [...hydratedMessages, streamingMessage];
  }, [localMessages, sessionReceipts, streamingContent, isStreaming, streamingStartTime]);

  const availableMentions = useMemo(() => {
    const mentions: Mention[] = [];
    agents.forEach(agent => {
      if (agent.id !== selectedAgentId) {
        mentions.push({ type: 'agent', id: agent.id, name: agent.name });
      }
    });
    return mentions;
  }, [agents, selectedAgentId]);

  const isSessionHydrating = Boolean(
    sessionIdFromUrl && !currentSession && pendingSessionId === sessionIdFromUrl
  );

  return {
    selectedAgentId,
    setSelectedAgentId,
    localMessages,
    displayMessages,
    isStreaming,
    streamingContent,
    streamingStartTime,
    isWsConnected,
    sessions,
    sessionsLoading,
    filteredSessions,
    currentSession,
    sessionIdFromUrl,
    agentIdFromUrl,
    availableMentions,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    isCreatingSession,
    isSessionHydrating,
    isMessagesHydrating,
    handleSendMessage,
    handleNewChat,
    handleStopStreaming,
    navigateToSession,
    navigateToAgent,
  };
}
