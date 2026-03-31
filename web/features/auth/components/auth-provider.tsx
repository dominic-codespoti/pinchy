'use client';

import * as React from 'react';
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OAuthProvider, User, ConnectedAccount, AuthContextType } from '../types';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'pinchy-auth-session';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const router = useRouter();

  // Load session from storage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const session = JSON.parse(stored);
        if (session.user && session.expiresAt > Date.now()) {
          setUser(session.user);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        localStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsInitialized(true);
  }, []);

  // Persist session to storage
  useEffect(() => {
    if (user) {
      const session = {
        user,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    }
  }, [user]);

  const clearError = useCallback(() => setError(null), []);

  const loginWithOAuth = useCallback(
    async (provider: OAuthProvider) => {
      setIsLoading(true);
      setError(null);

      try {
        // Simulate OAuth flow - replace with actual API call
        await new Promise((resolve) => setTimeout(resolve, 1500));

        // Mock successful OAuth login
        const mockUser: User = {
          id: `user-${Date.now()}`,
          email: `user@${provider}.com`,
          name: 'Test User',
          provider,
          connectedAccounts: [
            {
              provider,
              connectedAt: new Date().toISOString(),
              email: `user@${provider}.com`,
            },
          ],
        };

        setUser(mockUser);
        router.push('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to authenticate');
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const loginWithApiKey = useCallback(
    async (apiKey: string) => {
      setIsLoading(true);
      setError(null);

      try {
        // Validate API key format
        if (!apiKey.startsWith('sk-') && !apiKey.startsWith('sk-ant-')) {
          throw new Error('Invalid API key format');
        }

        // Simulate API key validation - replace with actual API call
        await new Promise((resolve) => setTimeout(resolve, 1000));

        // Determine provider from key prefix
        const provider = apiKey.startsWith('sk-ant-') ? 'anthropic' : 'openai';

        const mockUser: User = {
          id: `user-${Date.now()}`,
          email: 'api-key-user@local',
          provider: 'apikey',
          connectedAccounts: [
            {
              provider,
              connectedAt: new Date().toISOString(),
            },
          ],
        };

        setUser(mockUser);
        router.push('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to authenticate');
      } finally {
        setIsLoading(false);
      }
    },
    [router]
  );

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem(STORAGE_KEY);
    router.push('/login');
  }, [router]);

  const disconnectAccount = useCallback(async (provider: OAuthProvider) => {
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      setUser((prev) => {
        if (!prev) return null;
        const updated = {
          ...prev,
          connectedAccounts: prev.connectedAccounts.filter((acc) => acc.provider !== provider),
        };
        return updated.connectedAccounts.length > 0 ? updated : null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const connectAccount = useCallback(async (provider: OAuthProvider) => {
    setIsLoading(true);
    try {
      // Simulate OAuth flow
      await new Promise((resolve) => setTimeout(resolve, 1500));

      setUser((prev) => {
        if (!prev) return null;
        const exists = prev.connectedAccounts.some((acc) => acc.provider === provider);
        if (exists) return prev;
        return {
          ...prev,
          connectedAccounts: [
            ...prev.connectedAccounts,
            {
              provider,
              connectedAt: new Date().toISOString(),
              email: `user@${provider}.com`,
            },
          ],
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    } finally {
      setIsLoading(false);
    }
  }, []);

  if (!isInitialized) {
    return null;
  }

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export type { User, ConnectedAccount, OAuthProvider };
