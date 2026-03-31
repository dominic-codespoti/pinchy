'use client';

import { ChatPage } from '@/features/chat';
import { useAgents } from '@/features/agents/hooks';

export default function ChatPageWrapper() {
  const { data: agents, isLoading: agentsLoading } = useAgents();

  return <ChatPage agents={agents} agentsLoading={agentsLoading} />;
}
