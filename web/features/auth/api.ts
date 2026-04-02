/**
 * @deprecated Use `web/shared/api/auth.ts` instead.
 * This file is kept for backward compatibility and re-exports from the canonical location.
 */

export {
  startChatGptAuth,
  getChatGptAuthStatus,
  logoutChatGpt,
  authenticateWithApiKey,
  startCopilotAuth,
  pollCopilotAuth,
  pollChatGptAuthStatus,
  type CopilotPollResponse,
  type ChatGptPollStatus,
} from '@/shared/api/auth';

// Re-export types from shared types
export type {
  ChatGptAuthSession,
  ChatGptAuthStatus,
  CopilotAuthSession,
} from '@/shared/types/auth';
