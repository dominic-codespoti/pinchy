/**
 * Auth feature exports
 */

// Types
export type {
  OAuthProvider,
  AuthProviderType,
  ConnectedAccount,
  User,
  AuthSession,
  ChatGptAuthSession,
  ChatGptAuthStatus,
  AuthContextType,
  AuthError,
  AuthMethod,
  DialogState,
} from './types';

// API
export {
  startChatGptAuth,
  getChatGptAuthStatus,
  logoutChatGpt,
  authenticateWithApiKey,
  startCopilotAuth,
} from './api';

// Hooks
export {
  useChatGptAuthStatus,
  useStartChatGptAuth,
  useStartCopilotAuth,
  useLogoutChatGpt,
  useAuthenticateWithApiKey,
} from './hooks';

// Components
export { LoginPage } from './components/login-page';
export { AuthProvider, useAuth } from './components/auth-provider';
export { OAuthDialog } from './components/oauth-dialog/oauth-dialog';
export { OAuthButton } from './components/oauth-button';
