'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from './auth-provider';
import { OAuthButton } from './oauth-button';
import { OAuthProvider } from '../types';

interface LoginPageProps {
  onSuccessRedirect?: string;
}

export function LoginPage({ onSuccessRedirect = '/' }: LoginPageProps) {
  const router = useRouter();
  const { loginWithOAuth, loginWithApiKey, isLoading, error, clearError, isAuthenticated } = useAuth();
  const [apiKey, setApiKey] = useState('');
  const [activeTab, setActiveTab] = useState('oauth');

  // Redirect if already authenticated
  if (isAuthenticated) {
    router.push(onSuccessRedirect);
    return null;
  }

  const handleOAuthLogin = async (provider: OAuthProvider) => {
    clearError();
    try {
      await loginWithOAuth(provider);
    } catch {
      // Error is handled by auth context
    }
  };

  const handleApiKeyLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    if (!apiKey.trim()) return;

    try {
      await loginWithApiKey(apiKey);
    } catch {
      // Error is handled by auth context
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Welcome to Pinchy</CardTitle>
          <CardDescription>Sign in to manage your agents</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="oauth">OAuth</TabsTrigger>
              <TabsTrigger value="apikey">API Key</TabsTrigger>
            </TabsList>

            <TabsContent value="oauth" className="space-y-4 mt-4">
              <div className="space-y-3">
                <OAuthButton provider="openai" onClick={handleOAuthLogin} isLoading={isLoading} />
                <OAuthButton provider="github" onClick={handleOAuthLogin} isLoading={isLoading} />
                <OAuthButton provider="anthropic" onClick={handleOAuthLogin} isLoading={isLoading} />
              </div>
            </TabsContent>

            <TabsContent value="apikey" className="space-y-4 mt-4">
              <form onSubmit={handleApiKeyLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input
                    id="api-key"
                    type="password"
                    placeholder="sk-... or sk-ant-..."
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={isLoading}
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Your API key is stored locally and never shared.
                  </p>
                </div>

                {error && <p className="text-sm text-destructive">{error}</p>}

                <Button type="submit" className="w-full" disabled={!apiKey.trim() || isLoading}>
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            By authenticating, you agree to our{' '}
            <a href="#" className="underline underline-offset-4 hover:text-primary">
              Terms of Service
            </a>{' '}
            and{' '}
            <a href="#" className="underline underline-offset-4 hover:text-primary">
              Privacy Policy
            </a>
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
