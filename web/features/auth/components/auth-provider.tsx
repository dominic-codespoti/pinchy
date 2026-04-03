'use client';

import * as React from 'react';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { fetchApi, fetchApiEmpty } from '@/shared/api/client';
import { z } from 'zod';
import {
  OAuthProvider,
  User,
  ConnectedAccount,
  AuthContextType,
  ProviderAuthState,
} from '../types';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'pinchy-auth-session';
const AUTH_QUERY_KEY = ['auth', 'providers'];

// ============================================================================
// API Types and Schemas
// ============================================================================

const ProviderStatusSchema = z.object({
  provider: z.string(),
  name: z.string(),
  configured: z.boolean(),
  has_api_key: z.boolean(),
  env_var: z.string().optional(),
  env_vars: z.array(z.string()),
  details: z.string().optional(),
  source: z.string().optional(),
  api: z.string().nullable().optional(),
  model_count: z.number(),
});

const ProviderStatusListResponseSchema = z.object({
  providers: z.array(ProviderStatusSchema),
});

type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

// ============================================================================
// API Functions
// ============================================================================

async function getProviderAuthStatus(): Promise<ProviderStatus[]> {
  const data = await fetchApi<unknown>('/api/providers/status');
  const parsed = ProviderStatusListResponseSchema.parse(data);
  return parsed.providers;
}

async function disconnectProvider(provider: string): Promise<void> {
  return fetchApiEmpty(`/api/auth/${provider}`, {
    method: 'DELETE',
  });
}

async function saveApiKey(provider: string, apiKey: string): Promise<void> {
  await fetchApi('/api/auth/' + provider, {
    method: 'POST',
    body: JSON.stringify({ api_key: apiKey }),
  });
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Build a User object from provider status data.
 * Since Pinchy uses provider-token auth (not user-identity auth),
 * we construct a minimal user representation from connected providers.
 */
function buildUserFromProviders(providers: ProviderStatus[]): User | null {
  const connectedProviders = providers.filter(
    (p): p is ProviderStatus & { configured: true } => p.configured
  );

  if (connectedProviders.length === 0) {
    return null;
  }

  // Build connected accounts list
  const connectedAccounts: ConnectedAccount[] = connectedProviders.map((p) => ({
    provider: p.provider as OAuthProvider,
    connectedAt: new Date().toISOString(), // We don't have actual connection time from API
    email: p.details?.includes('@') ? p.details : undefined,
  }));

  // Determine primary provider (prefer copilot/github, then first available)
  const primaryProvider =
    connectedProviders.find((p) => p.provider === 'copilot') ||
    connectedProviders.find((p) => p.provider === 'github') ||
    connectedProviders[0];

  // Build user with real provider data - no mock names/emails
  return {
    id: `user-${primaryProvider.provider}`,
    email: connectedAccounts.find((a) => a.email)?.email || `${primaryProvider.provider}@local`,
    name: primaryProvider.name, // Use the actual provider display name
    provider: primaryProvider.provider as OAuthProvider,
    connectedAccounts,
  };
}

// ============================================================================
// Auth Provider Component
// ============================================================================

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Query for provider auth status - this is the source of truth
  const {
    data: providers = [],
    isLoading: isLoadingProviders,
    error: providersError,
    refetch: refetchProviders,
  } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: getProviderAuthStatus,
    staleTime: 30000, // 30 seconds
    retry: 2,
  });

  // Build user from provider data
  const user = React.useMemo(() => buildUserFromProviders(providers), [providers]);

  // Load persisted session on mount (for session tracking only)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored);
        // Only restore if not expired - actual auth state comes from API
        if (session.expiresAt < Date.now()) {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsInitialized(true);
  }, []);

  // Persist session when user changes
  useEffect(() => {
    if (user) {
      const session = {
        user,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  }, [user]);

  const clearError = useCallback(() => {
    setLocalError(null);
  }, []);

  // OAuth login mutation
  const loginWithOAuthMutation = useMutation({
    mutationFn: async (provider: OAuthProvider) => {
      if (provider === 'copilot') {
        // Use device flow for Copilot
        const response = await fetchApi<{
          device_code: string;
          user_code: string;
          verification_uri: string;
          interval: number;
        }>('/api/auth/copilot/start', { method: 'POST' });
        return { type: 'device_flow' as const, ...response };
      }
      // For other providers, we use API key auth via the settings
      throw new Error(
        `${provider} authentication requires API key. Please use the Settings > AI Providers page to configure your API key.`
      );
    },
    onSuccess: () => {
      // Refetch provider status after successful auth
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
    },
    onError: (error: Error) => {
      setLocalError(error.message);
      toast.error(`Authentication failed: ${error.message}`);
    },
  });

  const loginWithOAuth = useCallback(
    async (provider: OAuthProvider) => {
      setLocalError(null);
      try {
        await loginWithOAuthMutation.mutateAsync(provider);
        // The actual auth state will be updated via the providers query
        router.push('/');
      } catch {
        // Error handled by mutation
      }
    },
    [loginWithOAuthMutation, router]
  );

  // API Key login mutation
  const loginWithApiKeyMutation = useMutation({
    mutationFn: async ({
      provider,
      apiKey,
    }: {
      provider: string;
      apiKey: string;
    }) => {
      // Validate API key format
      if (apiKey.startsWith('sk-ant-')) {
        await saveApiKey('anthropic', apiKey);
        return { provider: 'anthropic' as const };
      } else if (apiKey.startsWith('sk-')) {
        await saveApiKey('openai', apiKey);
        return { provider: 'openai' as const };
      }
      throw new Error('Invalid API key format. Expected sk-... (OpenAI) or sk-ant-... (Anthropic)');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      toast.success('API key saved successfully');
    },
    onError: (error: Error) => {
      setLocalError(error.message);
      toast.error(`Authentication failed: ${error.message}`);
    },
  });

  const loginWithApiKey = useCallback(
    async (apiKey: string) => {
      setLocalError(null);
      try {
        // Determine provider from key prefix
        const provider = apiKey.startsWith('sk-ant-') ? 'anthropic' : 'openai';
        await loginWithApiKeyMutation.mutateAsync({ provider, apiKey });
        router.push('/');
      } catch {
        // Error handled by mutation
      }
    },
    [loginWithApiKeyMutation, router]
  );

  // Logout
  const logout = useCallback(() => {
    // Clear local storage
    localStorage.removeItem(STORAGE_KEY);
    // Note: We don't clear provider tokens on logout - user must explicitly disconnect
    router.push('/login');
  }, [router]);

  // Disconnect account mutation
  const disconnectAccountMutation = useMutation({
    mutationFn: disconnectProvider,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      toast.success('Provider disconnected');
    },
    onError: (error: Error) => {
      toast.error(`Failed to disconnect: ${error.message}`);
    },
  });

  const disconnectAccount = useCallback(
    async (provider: OAuthProvider) => {
      await disconnectAccountMutation.mutateAsync(provider);
    },
    [disconnectAccountMutation]
  );

  // Connect account (for adding additional providers)
  const connectAccount = useCallback(
    async (provider: OAuthProvider) => {
      // For now, redirect to settings where they can add API keys
      if (provider === 'copilot') {
        await loginWithOAuth(provider);
      } else {
        router.push('/settings/providers');
      }
    },
    [loginWithOAuth, router]
  );

  // Combined loading state
  const isLoading = isLoadingProviders || loginWithOAuthMutation.isPending || loginWithApiKeyMutation.isPending;

  // Combined error state
  const error = localError || (providersError ? (providersError as Error).message : null);

  if (!isInitialized) {
    return null;
  }

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    isLoading,
    loginWithOAuth,
    loginWithApiKey,
    logout,
    disconnectAccount,
    connectAccount,
    error,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Re-export types
export type { User, ConnectedAccount, OAuthProvider, ProviderAuthState };
