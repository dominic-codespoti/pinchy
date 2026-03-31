/**
 * Auth feature API client
 */

import { fetchApi } from '@/shared/api/client';
import { ChatGptAuthSession, ChatGptAuthStatus } from './types';

const API_BASE_URL = '';

export async function startChatGptAuth(): Promise<ChatGptAuthSession> {
  return fetchApi<ChatGptAuthSession>(`${API_BASE_URL}/api/auth/chatgpt`, {
    method: 'POST',
  });
}

export async function getChatGptAuthStatus(): Promise<ChatGptAuthStatus> {
  return fetchApi(`${API_BASE_URL}/api/auth/providers`);
}

export async function logoutChatGpt(): Promise<{ status: string }> {
  return fetchApi<{ status: string }>(`${API_BASE_URL}/api/auth/chatgpt/logout`, {
    method: 'POST',
  });
}

// Provider-specific API key auth
export async function authenticateWithApiKey(
  provider: string,
  apiKey: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/providers/${provider}/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return { success: false, message: error.message || 'Authentication failed' };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Failed to authenticate',
    };
  }
}

// Copilot device flow
export interface CopilotAuthSession {
  login_id: string;
  status: 'pending' | 'complete' | 'error' | 'warning';
  verification_uri: string;
  user_code: string;
  interval: number;
  error?: string;
}

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
  return fetchApi<CopilotPollResponse>(`${API_BASE_URL}/api/auth/copilot/poll`, {
    method: 'POST',
  });
}
