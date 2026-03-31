/**
 * OAuth / Provider Auth types for shared components
 */

// OAuth Providers supported by the application
export type OAuthProvider = 'openai' | 'github' | 'anthropic' | 'copilot';

// API Key provider (for non-OAuth authentication)
export type AuthProviderType = OAuthProvider | 'apikey';

// Auth method options for the dialog
export type AuthMethod = 'oauth_browser' | 'oauth_device' | 'api_key';

// Dialog state machine
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

// Provider configuration for UI rendering
export interface ProviderConfig {
  icon: React.ReactNode;
  bgColor: string;
  methods: AuthMethod[];
}

// ChatGPT Auth types
export interface ChatGptAuthSession {
  login_id: string;
  status: 'pending' | 'complete' | 'error';
  auth_url: string;
  error?: string;
}

export interface ChatGptAuthStatus {
  authenticated: boolean;
  needs_refresh: boolean;
  account_id?: string;
}

// Copilot device flow
export interface CopilotAuthSession {
  login_id: string;
  status: 'pending' | 'complete' | 'error' | 'warning';
  verification_uri: string;
  user_code: string;
  error?: string;
}

// API key auth result
export interface ApiKeyAuthResult {
  success: boolean;
  message?: string;
}
