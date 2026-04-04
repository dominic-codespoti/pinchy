// Shared hooks exports
export * from '../providers/websocket';
export * from './use-search';
export * from './use-before-unload';
export * from './use-unsaved-changes-warning';
export * from './use-keyboard-shortcuts';
export * from './use-query-with-toast';
export * from './create-mutation-hook';

// Re-export auth hooks from features/auth
export {
  useChatGptAuthStatus,
  useStartChatGptAuth,
  useStartCopilotAuth,
  useLogoutChatGpt,
  useAuthenticateWithApiKey,
} from '@/features/auth/hooks';
