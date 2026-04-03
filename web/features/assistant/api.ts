import { fetchApi } from '@/shared/api/client';
import {
  PinchyChatRequest,
  PinchyChatResponse,
} from './types';

/**
 * Send a chat message to the Pinchy agent
 * Uses the real agent runtime via /api/pinchy/chat
 */
export async function pinchyChat(
  request: PinchyChatRequest
): Promise<PinchyChatResponse> {
  return fetchApi<PinchyChatResponse>('/api/pinchy/chat', {
    method: 'POST',
    body: JSON.stringify(request),
  });
}

/** @deprecated Use pinchyChat instead */
export const assistantChat = pinchyChat;
