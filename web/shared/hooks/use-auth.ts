'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  startChatGptAuth,
  logoutChatGpt,
  getChatGptAuthStatus,
  authenticateWithApiKey,
  startCopilotAuth,
} from '../api/auth';
import type { ChatGptAuthSession, ChatGptAuthStatus } from '../types/auth';

const AUTH_QUERY_KEY = ['auth', 'chatgpt'];
const COPILOT_AUTH_QUERY_KEY = ['auth', 'copilot'];

export function useChatGptAuthStatus() {
  const { data, isLoading, error } = useQuery<ChatGptAuthStatus, Error>({
    queryKey: AUTH_QUERY_KEY,
    queryFn: getChatGptAuthStatus,
    staleTime: 30000,
  });

  useEffect(() => {
    if (error) {
      toast.error(`Failed to load auth status: ${error.message}`);
    }
  }, [error]);

  return { data, isLoading, error };
}

export function useStartChatGptAuth() {
  return useMutation<ChatGptAuthSession, Error, void>({
    mutationFn: startChatGptAuth,
    onSuccess: (data) => {
      if (data.auth_url) {
        window.open(data.auth_url, '_blank', 'width=600,height=700,popup=true');
      }
    },
    onError: (error) => {
      toast.error(`Failed to start ChatGPT auth: ${error.message}`);
    },
  });
}

export function useStartCopilotAuth() {
  return useMutation({
    mutationFn: startCopilotAuth,
    onError: (error: Error) => {
      toast.error(`Failed to start Copilot auth: ${error.message}`);
    },
  });
}

export function useLogoutChatGpt() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, void>({
    mutationFn: logoutChatGpt,
    onSuccess: () => {
      toast.success('Logged out from ChatGPT');
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
    onError: (error) => {
      toast.error(`Failed to logout: ${error.message}`);
    },
  });
}

export function useAuthenticateWithApiKey() {
  return useMutation<{ success: boolean; message?: string }, Error, { provider: string; apiKey: string }>({
    mutationFn: ({ provider, apiKey }) => authenticateWithApiKey(provider, apiKey),
    onError: (error) => {
      toast.error(`Authentication failed: ${error.message}`);
    },
  });
}
