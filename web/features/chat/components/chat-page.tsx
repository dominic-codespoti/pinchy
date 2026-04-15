'use client';

import { useChat } from './use-chat';
import { ChatSidebar } from './chat-sidebar';
import { ChatHeader } from './chat-header';
import { ChatMessageList } from './chat-message-list';
import { Agent } from '@/features/agents/types';

interface ChatPageProps {
  agents?: Agent[];
  agentsLoading?: boolean;
}

export function ChatPage({ agents = [], agentsLoading = false }: ChatPageProps) {
  const {
    selectedAgentId,
    setSelectedAgentId,
    displayMessages,
    isStreaming,
    streamingContent,
    streamingStartTime,
    isWsConnected,
    sessions,
    sessionsLoading,
    filteredSessions,
    currentSession,
    sessionIdFromUrl,
    mobileSidebarOpen,
    setMobileSidebarOpen,
    isCreatingSession,
    isSessionHydrating,
    isMessagesHydrating,
    handleSendMessage,
    handleNewChat,
    handleStopStreaming,
    navigateToSession,
    navigateToAgent,
  } = useChat(agents, agentsLoading);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col border-r bg-background">
        <ChatSidebar
          agents={agents}
          selectedAgentId={selectedAgentId}
          onAgentSelect={navigateToAgent}
          agentsLoading={agentsLoading}
          sessions={filteredSessions}
          sessionsLoading={sessionsLoading}
          currentSessionId={sessionIdFromUrl}
          onSessionClick={navigateToSession}
          onNewChat={handleNewChat}
          isWsConnected={isWsConnected}
          isCreatingSession={isCreatingSession}
        />
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col min-w-0 bg-background">
        <ChatHeader
          currentSession={currentSession}
          selectedAgentId={selectedAgentId}
          agents={agents}
          isWsConnected={isWsConnected}
          mobileSidebarOpen={mobileSidebarOpen}
          setMobileSidebarOpen={setMobileSidebarOpen}
          agentsLoading={agentsLoading}
          sessionsLoading={sessionsLoading}
          filteredSessions={filteredSessions}
          currentSessionId={sessionIdFromUrl}
          onSessionClick={navigateToSession}
          onAgentSelect={(id) => {
            setSelectedAgentId(id);
            navigateToAgent(id);
          }}
          onNewChat={handleNewChat}
          isCreatingSession={isCreatingSession}
        />

        <ChatMessageList
          messages={displayMessages}
          isStreaming={isStreaming}
          streamingContent={streamingContent}
          streamingStartTime={streamingStartTime}
          isWsConnected={isWsConnected}
          selectedAgentId={selectedAgentId}
          sessionsLoading={sessionsLoading}
          currentSession={currentSession}
          sessionIdFromUrl={sessionIdFromUrl}
          isSessionHydrating={isSessionHydrating}
          isMessagesHydrating={isMessagesHydrating}
          agents={agents}
          onSendMessage={handleSendMessage}
          onStopStreaming={handleStopStreaming}
          onNewChat={handleNewChat}
          agentsLoading={agentsLoading}
          isCreatingSession={isCreatingSession}
        />
      </main>
    </div>
  );
}
