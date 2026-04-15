'use client';

import { Suspense } from 'react';
import { ChatPage } from '@/features/chat';
import { useAgents } from '@/features/agents';

function ChatPageContent() {
  const { agents, isLoading: agentsLoading } = useAgents();
  return <ChatPage agents={agents} agentsLoading={agentsLoading} />;
}

export default function ChatPageWrapper() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center">Loading chat...</div>}>
      <ChatPageContent />
    </Suspense>
  );
}
