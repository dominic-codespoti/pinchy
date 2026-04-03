'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Clock, MessageSquare, ExternalLink, Receipt } from 'lucide-react';
import Link from 'next/link';
import { Agent } from '../types';
import { useAgentSessions } from '@/features/sessions/hooks';

interface AgentSessionsTabProps {
  agent: Agent;
}

export function AgentSessionsTab({ agent }: AgentSessionsTabProps) {
  const { data: sessions, isLoading } = useAgentSessions(agent.id);

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                <CardTitle>Sessions</CardTitle>
              </div>
              <CardDescription>
                {sessions?.length ?? 0} conversation sessions with this agent
              </CardDescription>
            </div>
            <Link href={`/chat?agent=${agent.id}`}>
              <Button>
                <MessageSquare className="mr-2 h-4 w-4" />
                New Session
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {(sessions?.length ?? 0) === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center">
              <MessageSquare className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No sessions yet. Start a conversation to create your first session.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sessions?.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{session.title || 'Untitled session'}</p>
                    <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(session.createdAt).toLocaleDateString()}
                      </span>
                      <Badge variant="secondary">{session.messageCount} messages</Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/agents/${agent.id}?tab=receipts&session=${session.id}`}>
                      <Button variant="ghost" size="sm">
                        <Receipt className="mr-2 h-4 w-4" />
                        Receipts
                      </Button>
                    </Link>
                    <Link href={`/chat?agent=${agent.id}&session=${session.id}`}>
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Open
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
