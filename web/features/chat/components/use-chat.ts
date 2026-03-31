'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useWebSocket } from '@/shared/providers/websocket';
import { Agent } from '@/features/agents/types';
import { Message } from '@/shared/types/common';
import { useAgentSessions, useSessionMessages } from '../hooks';
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
  handleSendMessage: (content: string) => void;
  handleNewChat: () => void;
  handleStopStreaming: () => void;
  navigateToSession: (sessionId: string) => void;
  navigateToAgent: (agentId: string) => void;
}

export function useChat(agents: Agent[] = [], agentsLoading = false): UseChatReturn {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionIdFromUrl = searchParams.get('session');
  const agentIdFromUrl = searchParams.get('agent');

  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingStartTime, setStreamingStartTime] = useState<Date>(new Date());
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const currentSessionIdRef = useRef<string | null>(null);
  const { send, lastMessage, status } = useWebSocket();

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
    if (!lastMessage || typeof lastMessage !== 'object') return;

    const msg = lastMessage as Record<string, unknown>;
    const msgType = msg.type as string;

    if (msgType === 'session_created') {
      const sessionId = msg.session as string;
      const agentId = msg.agent as string;
      if (agentId === selectedAgentId && !sessionIdFromUrl) {
        router.replace(`/chat?session=${sessionId}&agent=${agentId}`);
        toast.success('New session created');
      }
      return;
    }

    if (msgType === 'typing_start') {
      const agentId = msg.agent as string;
      if (agentId === selectedAgentId) {
        setIsStreaming(true);
        setStreamingStartTime(new Date());
      }
      return;
    }

    if (msgType === 'typing_stop') {
      const agentId = msg.agent as string;
      if (agentId === selectedAgentId) {
        setIsStreaming(false);
      }
      return;
    }

    if (msgType === 'session_message') {
      const role = msg.role as string;
      const content = msg.content as string;
      const sessionId = msg.session as string;
      const agentId = msg.agent as string;

      const isForCurrentSession = sessionId && sessionId === currentSessionIdRef.current;
      const isForOurAgent = agentId === selectedAgentId;

      if (isForCurrentSession || (isForOurAgent && !currentSessionIdRef.current)) {
        const newMessage: Message = {
          id: `msg-${Date.now()}`,
          role: role as 'user' | 'assistant' | 'system',
          content,
          timestamp: new Date().toISOString(),
        };

        setLocalMessages(prev => {
          const isDuplicate = prev.length > 0 &&
            prev[prev.length - 1].role === role &&
            prev[prev.length - 1].content === content;
          if (isDuplicate) return prev;
          return [...prev, newMessage];
        });
      }
    }

    if (msgType === 'agent_chunk') {
      const content = msg.content as string;
      const agentId = msg.agent as string;
      if (agentId === selectedAgentId) {
        setStreamingContent(prev => prev + content);
        setIsStreaming(true);
      }
    }

    if (msgType === 'agent_response' || msgType === 'message_complete') {
      const agentId = msg.agent as string;
      if (agentId === selectedAgentId) {
        setStreamingContent('');
        setIsStreaming(false);
      }
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
      }
    }

    if (msgType === 'slash_response') {
      const response = msg.response as string;
      const agentId = msg.agent as string;
      if (agentId === selectedAgentId && response) {
        const newMessage: Message = {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          content: response,
          timestamp: new Date().toISOString(),
        };
        setLocalMessages(prev => [...prev, newMessage]);
      }
    }
  }, [lastMessage, selectedAgentId, sessionIdFromUrl, router]);

  // Update current session ref when URL changes
  useEffect(() => {
    currentSessionIdRef.current = sessionIdFromUrl;
    setLocalMessages([]);
    setStreamingContent('');
    setIsStreaming(false);
  }, [sessionIdFromUrl]);

  // Load session messages when session changes
  useEffect(() => {
    if (!sessionIdFromUrl) {
      setLocalMessages([]);
      return;
    }

    const parts = sessionIdFromUrl.split('-');
    if (parts.length < 2) return;

    const agentId = parts.slice(0, -1).join('-');
    const sessionFile = `${sessionIdFromUrl}.jsonl`;

    fetch(`/api/agents/${agentId}/sessions/${sessionFile}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.messages) {
          setLocalMessages(data.messages);
        }
      })
      .catch(() => {});
  }, [sessionIdFromUrl]);

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

  const handleSendMessage = useCallback((content: string) => {
    if (!selectedAgentId || status !== 'connected') {
      toast.error('Not connected to server');
      return;
    }

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
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
      session_id: sessionIdFromUrl || undefined,
    });
  }, [selectedAgentId, sessionIdFromUrl, status, send]);

  const handleNewChat = useCallback(() => {
    if (!selectedAgentId) {
      toast.error('Please select an agent first');
      return;
    }

    router.push(`/chat?agent=${selectedAgentId}`);
    setMobileSidebarOpen(false);
    toast.success('New chat started');
  }, [selectedAgentId, router]);

  const handleStopStreaming = useCallback(() => {
    send({
      type: 'stop',
      target_agent: selectedAgentId,
    });
    setIsStreaming(false);
    setStreamingContent('');
  }, [send, selectedAgentId]);

  const navigateToSession = useCallback((sessionId: string) => {
    router.push(`/chat?session=${sessionId}&agent=${selectedAgentId}`);
  }, [router, selectedAgentId]);

  const navigateToAgent = useCallback((agentId: string) => {
    setSelectedAgentId(agentId);
    router.push(`/chat?agent=${agentId}`);
  }, [router]);

  const filteredSessions = useMemo(() => {
    if (!sessions) return [];
    return sessions.filter(s => s.agentId === selectedAgentId);
  }, [sessions, selectedAgentId]);

  const displayMessages = useMemo(() => {
    if (!isStreaming || !streamingContent) return localMessages;

    const streamingMessage: Message = {
      id: 'streaming',
      role: 'assistant',
      content: streamingContent,
      timestamp: new Date().toISOString(),
    };

    return [...localMessages, streamingMessage];
  }, [localMessages, streamingContent, isStreaming]);

  const availableMentions = useMemo(() => {
    const mentions: Mention[] = [];
    agents.forEach(agent => {
      if (agent.id !== selectedAgentId) {
        mentions.push({ type: 'agent', id: agent.id, name: agent.name });
      }
    });
    return mentions;
  }, [agents, selectedAgentId]);

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
    handleSendMessage,
    handleNewChat,
    handleStopStreaming,
    navigateToSession,
    navigateToAgent,
  };
}
