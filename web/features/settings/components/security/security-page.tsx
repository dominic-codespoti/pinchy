'use client';

import { Shield, CheckCircle, XCircle, Loader2, Plus, Key, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface SecurityPageProps {
  children?: React.ReactNode;
  connectedAccounts?: Array<{
    provider: string;
    email?: string;
    connectedAt: string;
  }>;
  isLoading?: boolean;
  onDisconnect?: (provider: string) => void;
  onConnect?: () => void;
}

// Provider API key management info
const providerKeyInfo = [
  {
    id: 'openai',
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    description: 'API key for GPT models',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    description: 'API key for Claude models',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'azure',
    name: 'Azure OpenAI',
    envVar: 'AZURE_OPENAI_API_KEY',
    description: 'API key for Azure OpenAI service',
    docsUrl: 'https://portal.azure.com',
  },
  {
    id: 'copilot',
    name: 'GitHub Copilot',
    envVar: 'COPILOT_TOKEN',
    description: 'Token for GitHub Copilot API',
    docsUrl: 'https://github.com/settings/tokens',
  },
];

export function SecurityPage({
  children,
  connectedAccounts = [],
  isLoading = false,
  onDisconnect,
  onConnect,
}: SecurityPageProps) {
  return (
    <div className="space-y-6">
      {/* API Keys Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            <CardTitle>Provider API Keys</CardTitle>
          </div>
          <CardDescription>
            API keys are configured via environment variables. Pinchy reads these from your shell or config file.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {providerKeyInfo.map((provider) => (
            <div key={provider.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="space-y-1">
                <p className="font-medium">{provider.name}</p>
                <p className="text-sm text-muted-foreground">{provider.description}</p>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{provider.envVar}</code>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1" />
                  Get Key
                </a>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Connected Accounts */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Connected Accounts</CardTitle>
              <CardDescription>Manage your linked authentication providers</CardDescription>
            </div>
            <Badge variant="outline" className="font-mono">
              {connectedAccounts.length} connected
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {connectedAccounts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <p>No accounts connected yet.</p>
              <p className="text-sm mt-2">Use the Models settings to connect providers.</p>
            </div>
          ) : (
            <>
              {connectedAccounts.map((account) => (
                <div
                  key={account.provider}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-md bg-muted">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium capitalize">{account.provider}</p>
                      {account.email && (
                        <p className="text-sm text-muted-foreground">{account.email}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Connected {new Date(account.connectedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Active
                    </Badge>
                    {onDisconnect && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onDisconnect(account.provider)}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                        <span className="ml-2 hidden sm:inline">Disconnect</span>
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </CardContent>
      </Card>

      <Separator />

      {/* Security Tips */}
      <Card>
        <CardHeader>
          <CardTitle>Security Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 text-primary" />
              Use OAuth when possible - it&apos;s more secure than API keys
            </li>
            <li className="flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 text-primary" />
              Regularly review and disconnect unused accounts
            </li>
            <li className="flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 text-primary" />
              Never share your API keys or authentication tokens
            </li>
            <li className="flex items-start gap-2">
              <Shield className="h-4 w-4 mt-0.5 text-primary" />
              API keys are stored securely by the Pinchy daemon
            </li>
          </ul>
        </CardContent>
      </Card>

      {children}
    </div>
  );
}
