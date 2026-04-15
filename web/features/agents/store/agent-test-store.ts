/**
 * Agent Test Store
 *
 * Zustand store for agent test interface state.
 * Manages test messages, input state, and streaming responses.
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { AgentTestStore, TestMessage, TestMessageRole } from './types';

// ============================================================================
// Helpers
// ============================================================================

function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateSessionId(): string {
  return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Initial State
// ============================================================================

const initialState = {
  messages: [] as TestMessage[],
  inputValue: '',
  inputMode: 'single' as const,
  isSubmitting: false,
  isLoading: false,
  error: null as string | null,
  streamingMessageId: null as string | null,
  sessionId: null as string | null,
  isSessionActive: false,
};

// ============================================================================
// Store Creation
// ============================================================================

export const useAgentTestStore = create<AgentTestStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // -------------------------------------------------------------------------
      // Actions - Messages
      // -------------------------------------------------------------------------
      addMessage: (message) => {
        const newMessage: TestMessage = {
          ...message,
          id: generateMessageId(),
          timestamp: new Date(),
        };

        set(
          (state) => ({
            messages: [...state.messages, newMessage],
          }),
          false,
          'test/addMessage'
        );

        return newMessage.id;
      },

      updateMessage: (id, updates) => {
        set(
          (state) => ({
            messages: state.messages.map((m) =>
              m.id === id ? { ...m, ...updates } : m
            ),
          }),
          false,
          'test/updateMessage'
        );
      },

      removeMessage: (id) => {
        set(
          (state) => ({
            messages: state.messages.filter((m) => m.id !== id),
          }),
          false,
          'test/removeMessage'
        );
      },

      clearMessages: () => {
        set({ messages: [] }, false, 'test/clearMessages');
      },

      setMessageStreaming: (id, isStreaming) => {
        set(
          (state) => ({
            messages: state.messages.map((m) =>
              m.id === id ? { ...m, isStreaming } : m
            ),
            streamingMessageId: isStreaming ? id : null,
          }),
          false,
          'test/setMessageStreaming'
        );
      },

      appendToMessage: (id, content) => {
        set(
          (state) => ({
            messages: state.messages.map((m) =>
              m.id === id ? { ...m, content: m.content + content } : m
            ),
          }),
          false,
          'test/appendToMessage'
        );
      },

      // -------------------------------------------------------------------------
      // Actions - Input
      // -------------------------------------------------------------------------
      setInputValue: (value) => {
        set({ inputValue: value }, false, 'test/setInputValue');
      },

      setInputMode: (mode) => {
        set({ inputMode: mode }, false, 'test/setInputMode');
      },

      submitInput: () => {
        const { inputValue, inputMode, addMessage, setInputValue } = get();

        if (!inputValue.trim()) return;

        // Add user message
        addMessage({
          role: 'user',
          content: inputValue.trim(),
        });

        // Clear input
        setInputValue('');

        // Set submitting state
        set({ isSubmitting: true }, false, 'test/submitInput');

        // In batch mode, don't auto-clear submitting
        // In single mode, submitting will be cleared when response arrives
        if (inputMode === 'batch') {
          // Keep submitting true for batch until explicitly ended
          set({ isSubmitting: true }, false, 'test/submitInput/batch');
        }
      },

      // -------------------------------------------------------------------------
      // Actions - State
      // -------------------------------------------------------------------------
      setIsLoading: (loading) => {
        set({ isLoading: loading }, false, 'test/setIsLoading');
      },

      setError: (error) => {
        set({ error }, false, 'test/setError');
      },

      setStreamingMessageId: (id) => {
        set({ streamingMessageId: id }, false, 'test/setStreamingMessageId');
      },

      setSessionId: (id) => {
        set({ sessionId: id }, false, 'test/setSessionId');
      },

      startSession: () => {
        const sessionId = generateSessionId();
        set(
          {
            sessionId,
            isSessionActive: true,
            messages: [],
            error: null,
          },
          false,
          'test/startSession'
        );
        return sessionId;
      },

      endSession: () => {
        set(
          {
            isSessionActive: false,
            isSubmitting: false,
            isLoading: false,
            streamingMessageId: null,
          },
          false,
          'test/endSession'
        );
      },

      reset: () => {
        set(initialState, false, 'test/reset');
      },
    }),
    {
      name: 'AgentTestStore',
      enabled: process.env.NODE_ENV === 'development',
    }
  )
);

// ============================================================================
// Convenience Hooks Selectors
// ============================================================================

export const selectTestMessages = (state: AgentTestStore) => state.messages;

export const selectTestInput = (state: AgentTestStore) => ({
  inputValue: state.inputValue,
  inputMode: state.inputMode,
  isSubmitting: state.isSubmitting,
});

export const selectTestStatus = (state: AgentTestStore) => ({
  isLoading: state.isLoading,
  error: state.error,
  isStreaming: !!state.streamingMessageId,
  streamingMessageId: state.streamingMessageId,
});

export const selectTestSession = (state: AgentTestStore) => ({
  sessionId: state.sessionId,
  isSessionActive: state.isSessionActive,
});

// ============================================================================
// Message Helpers
// ============================================================================

export function createUserMessage(content: string): Omit<TestMessage, 'id' | 'timestamp'> {
  return {
    role: 'user',
    content,
  };
}

export function createAgentMessage(
  content: string,
  options?: {
    isStreaming?: boolean;
    usage?: TestMessage['usage'];
    latencyMs?: number;
  }
): Omit<TestMessage, 'id' | 'timestamp'> {
  return {
    role: 'agent',
    content,
    isStreaming: options?.isStreaming,
    usage: options?.usage,
    latencyMs: options?.latencyMs,
  };
}

export function createSystemMessage(content: string): Omit<TestMessage, 'id' | 'timestamp'> {
  return {
    role: 'system',
    content,
  };
}

export function createErrorMessage(error: string): Omit<TestMessage, 'id' | 'timestamp'> {
  return {
    role: 'system',
    content: `Error: ${error}`,
    error,
  };
}

// ============================================================================
// Re-export types
// ============================================================================

export type { AgentTestStore, TestMessage, TestMessageRole };
