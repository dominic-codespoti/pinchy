'use client';

import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Bot, Heart, Clock, Zap, Settings, FileText, Brain, MessageSquare, Receipt, Webhook } from 'lucide-react';
import { useAgent } from '../hooks/use-agent';
import { Agent } from '../types';
import { sendTestMessage as sendTestMessageApi } from '../api';
import { AgentOverviewTab } from './agent-overview-tab';

/**
 * Wrapper to adapt the API function to the component's expected interface
 * The component expects Promise<string>, the API returns Promise<SendTestMessageResponse>
 */
async function sendTestMessage(agentId: string, message: string): Promise<string> {
  const response = await sendTestMessageApi(agentId, message);
  return response.response || response.content || 'No response';
}
import { AgentFilesTab } from './agent-files-tab';
import { AgentMemoryTab } from './agent-memory-tab';
import { AgentSessionsTab } from './agent-sessions-tab';
import { AgentTestTab } from './agent-test-tab';
import { AgentSettingsTab } from './agent-settings-tab';
import { AgentWebhookTab } from './agent-webhook-tab';
import { ReceiptsTab } from '@/features/receipts/components/receipts-tab';

interface AgentDetailProps {
  id: string;
}

function getStatusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'active':
      return 'default';
    case 'error':
      return 'destructive';
    case 'inactive':
    default:
      return 'secondary';
  }
}

function HeroSection({ agent }: { agent: Agent }) {
  return (
    <Card className="mb-6">
      <CardContent className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Bot className="h-6 w-6 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <Badge variant={getStatusVariant(agent.status)}>
                  {agent.status}
                </Badge>
              </div>
              <p className="text-muted-foreground max-w-xl">
                {agent.config.model || 'Default model'} via {agent.config.provider}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Zap className="h-4 w-4" />
              <span>{agent.sessionCount || 0} sessions</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Heart className="h-4 w-4" />
              <span>{agent.hasHeartbeat ? 'Heartbeat on' : 'No heartbeat'}</span>
            </div>
            {agent.heartbeatInterval && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{agent.heartbeatInterval}s interval</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentDetail({ id }: AgentDetailProps) {
  const { agent, isLoading, error } = useAgent(id);
  const [activeTab, setActiveTab] = useState('overview');

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <Skeleton className="mb-6 h-32 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (error || !agent) {
    return (
      <div className="container mx-auto p-6">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Agent not found</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error?.message || `Could not load agent with ID: ${id}`}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      <HeroSection agent={agent} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-2">
            <Zap className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="files" className="gap-2">
            <FileText className="h-4 w-4" />
            Files
          </TabsTrigger>
          <TabsTrigger value="memory" className="gap-2">
            <Brain className="h-4 w-4" />
            Memory
          </TabsTrigger>
          <TabsTrigger value="sessions" className="gap-2">
            <Clock className="h-4 w-4" />
            Sessions
          </TabsTrigger>
          <TabsTrigger value="receipts" className="gap-2">
            <Receipt className="h-4 w-4" />
            Receipts
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Test
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="webhooks" className="gap-2">
            <Webhook className="h-4 w-4" />
            Webhooks
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-0">
          <AgentOverviewTab agent={agent} onSwitchTab={setActiveTab} />
        </TabsContent>

        <TabsContent value="files" className="mt-0">
          <AgentFilesTab agent={agent} />
        </TabsContent>

        <TabsContent value="memory" className="mt-0">
          <AgentMemoryTab agent={agent} />
        </TabsContent>

        <TabsContent value="sessions" className="mt-0">
          <AgentSessionsTab agent={agent} />
        </TabsContent>

        <TabsContent value="receipts" className="mt-0">
          <ReceiptsTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="test" className="mt-0">
          <AgentTestTab 
            agent={agent} 
            onSendMessage={(msg) => sendTestMessage(agent.id, msg)}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          <AgentSettingsTab agent={agent} />
        </TabsContent>

        <TabsContent value="webhooks" className="mt-0">
          <AgentWebhookTab agentId={agent.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
