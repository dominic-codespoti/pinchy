/**
 * Auth feature types
 */

// OAuth Providers supported by the application
export type OAuthProvider = 'openai' | 'github' | 'anthropic' | 'copilot';

// API Key provider (for non-OAuth authentication)
export type AuthProviderType = OAuthProvider | 'apikey';

// Connected account information
export interface ConnectedAccount {
  provider: OAuthProvider;
  connectedAt: string;
  email?: string;
}

// User information
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider: AuthProviderType;
  connectedAccounts: ConnectedAccount[];
}

// Auth session stored in localStorage
export interface AuthSession {
  user: User;
  expiresAt: number;
}

// Provider authentication state (mirrors backend data)
export interface ProviderAuthState {
  provider: string;
  name: string;
  configured: boolean;
  hasApiKey: boolean;
  envVar?: string;
  details?: string;
  source?: string;
}

// ChatGPT Auth types
export interface ChatGptAuthSession {
  login_id: string;
  status: 'pending' | 'complete' | 'error';
  auth_url: string;
  interval?: number;
  error?: string;
}

export interface ChatGptAuthStatus {
  authenticated: boolean;
  needs_refresh: boolean;
  account_id?: string;
}

// Auth context type for React context
export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  loginWithOAuth: (provider: OAuthProvider) => Promise<void>;
  loginWithApiKey: (apiKey: string) => Promise<void>;
  logout: () => void;
  disconnectAccount: (provider: OAuthProvider) => Promise<void>;
  connectAccount: (provider: OAuthProvider) => Promise<void>;
  error: string | null;
  clearError: () => void;
}

// Auth error response
export interface AuthError {
  message: string;
  code?: string;
  status?: number;
}

// OAuth dialog types
export type AuthMethod = 'oauth_browser' | 'oauth_device' | 'api_key';

export type DialogState =
  | { type: 'select_method' }
  | { type: 'oauth_browser'; authUrl: string; message: string }
  | {
      type: 'oauth_device';
      verificationUri: string;
      userCode: string;
      message: string;
    }
  | { type: 'api_key' }
  | { type: 'pending' }
  | { type: 'success' }
  | { type: 'error'; message: string };

export interface ProviderConfig {
  icon: React.ReactNode;
  bgColor: string;
  methods: AuthMethod[];
}
