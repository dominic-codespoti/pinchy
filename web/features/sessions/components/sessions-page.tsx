'use client';

import { PageContainer } from '@/shared/components/page-container';
import { SessionsTable } from './sessions-table';
import { useAllSessions } from '../hooks';
import { Agent } from '@/features/agents/types';

interface SessionsProps {
  agents?: Agent[];
}

export function SessionsPage({ agents = [] }: SessionsProps) {
  const { data: sessions, isLoading } = useAllSessions(agents);

  return (
    <PageContainer className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">
            Manage all chat sessions across your agents
          </p>
        </div>
      </div>

      <SessionsTable sessions={sessions} loading={isLoading} />
    </PageContainer>
  );
}
