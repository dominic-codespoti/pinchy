/**
 * Auth API functions for shared components
 * This is the canonical auth API - all auth calls must use this module
 */

import { fetchApi, fetchApiEmpty } from '@/shared/api/client';
import { z } from 'zod';
import type {
  ChatGptAuthSession,
  ChatGptAuthStatus,
  CopilotAuthSession,
  ApiKeyAuthResult,
} from '@/features/auth/types';
import {
  ApiKeyAuthResponseSchema,
  CopilotPollResponseSchema,
} from '@/lib/validation/schemas';

const API_BASE_URL = '';

export async function startChatGptAuth(): Promise<ChatGptAuthSession> {
  return fetchApi<ChatGptAuthSession>(`${API_BASE_URL}/api/auth/chatgpt`, {
    method: 'POST',
  });
}

export async function getChatGptAuthStatus(): Promise<ChatGptAuthStatus> {
  return fetchApi<ChatGptAuthStatus>(`${API_BASE_URL}/api/auth/providers`);
}

// ChatGPT OAuth status polling
const ChatGptPollStatusSchema = z.object({
  status: z.enum(['pending', 'success', 'error']),
  message: z.string().optional(),
});

export interface ChatGptPollStatus {
  status: 'pending' | 'success' | 'error';
  message?: string;
}

export async function pollChatGptAuthStatus(): Promise<ChatGptPollStatus> {
  return fetchApi<ChatGptPollStatus>(
    `${API_BASE_URL}/api/auth/chatgpt/status`,
    undefined,
    ChatGptPollStatusSchema
  );
}

export async function logoutChatGpt(): Promise<void> {
  return fetchApiEmpty(`${API_BASE_URL}/api/auth/chatgpt/logout`, {
    method: 'POST',
  });
}

// Provider-specific API key auth
export async function authenticateWithApiKey(
  provider: string,
  apiKey: string
): Promise<ApiKeyAuthResult> {
  return fetchApi<ApiKeyAuthResult>(
    `${API_BASE_URL}/api/providers/${provider}/auth`,
    {
      method: 'POST',
      body: JSON.stringify({ api_key: apiKey }),
    },
    ApiKeyAuthResponseSchema
  );
}

// Copilot device flow
export async function startCopilotAuth(): Promise<CopilotAuthSession> {
  return fetchApi<CopilotAuthSession>(`${API_BASE_URL}/api/auth/copilot/start`, {
    method: 'POST',
  });
}

export interface CopilotPollResponse {
  status: 'pending' | 'complete' | 'failed' | 'timeout';
  interval?: number;
  error?: string;
}

export async function pollCopilotAuth(): Promise<CopilotPollResponse> {
  return fetchApi<CopilotPollResponse>(
    `${API_BASE_URL}/api/auth/copilot/poll`,
    {
      method: 'POST',
    },
    CopilotPollResponseSchema
  );
}
