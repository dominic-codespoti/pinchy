/**
 * Auth API functions for shared components
 */

import { fetchApi } from '@/shared/api/client';
import type {
  ChatGptAuthSession,
  ChatGptAuthStatus,
  CopilotAuthSession,
  ApiKeyAuthResult,
} from '../types/auth';

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
): Promise<ApiKeyAuthResult> {
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
export async function startCopilotAuth(): Promise<CopilotAuthSession> {
  return fetchApi<CopilotAuthSession>(`${API_BASE_URL}/api/auth/copilot/login`, {
    method: 'POST',
  });
}
