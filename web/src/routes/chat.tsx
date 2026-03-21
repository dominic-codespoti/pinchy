import { useCallback, useEffect, useRef } from "react";
import { useParams, useSearch, useNavigate } from "@tanstack/react-router";
import { Bot, Sparkles } from "lucide-react";

import {
  useAgentQuery,
  useCurrentSessionQuery,
  useSessionMessagesQuery,
} from "@/api/queries";
import { useAgentChat } from "@/hooks/use-agent-chat";
import { SessionSidebar } from "@/components/session-sidebar";
import { MessageList } from "@/components/chat/message-list";
import { ChatInput } from "@/components/chat/chat-input";
import { ToolActivity } from "@/components/chat/tool-activity";
import { Skeleton } from "@/components/ui";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export function ChatRoute() {
  const params: Record<string, unknown> = useParams({ strict: false });
  const searchParams: Record<string, unknown> = useSearch({ strict: false });
  const agentId = typeof params["agentId"] === "string" ? params["agentId"] : "default";
  const sessionIdFromSearch = typeof searchParams["session"] === "string" ? searchParams["session"] : "";
  const navigate = useNavigate();

  const agentQuery = useAgentQuery(agentId);
  const currentSessionQuery = useCurrentSessionQuery(agentId);
  const activeSessionId =
    sessionIdFromSearch.length > 0
      ? sessionIdFromSearch
      : (currentSessionQuery.data?.session_id ?? "");
  const messagesQuery = useSessionMessagesQuery(agentId, activeSessionId);
  const { streamingContent, isTyping, toolCalls, send } = useAgentChat(agentId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messages = messagesQuery.data?.messages ?? [];

  // If the active session errored (e.g. deleted / 404), clear the session param
  useEffect(() => {
    if (
      messagesQuery.isError &&
      sessionIdFromSearch.length > 0
    ) {
      void navigate({
        to: "/chat/$agentId",
        params: { agentId },
        search: {},
        replace: true,
      });
    }
  }, [messagesQuery.isError, sessionIdFromSearch, agentId, navigate]);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, streamingContent, isTyping, scrollToBottom]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      void navigate({
        to: "/chat/$agentId",
        params: { agentId },
        search: { session: sessionId },
      });
    },
    [agentId, navigate],
  );

  const handleSessionCleared = useCallback(() => {
    void navigate({
      to: "/chat/$agentId",
      params: { agentId },
      search: {},
      replace: true,
    });
  }, [agentId, navigate]);

  const isLoading = agentQuery.isLoading || messagesQuery.isLoading;
  const agentLabel = agentQuery.data?.id ?? agentId;
  const modelLabel = agentQuery.data?.model ?? null;

  return (
    <div className="flex h-full">
      <SessionSidebar
        agentId={agentId}
        currentSessionId={activeSessionId.length > 0 ? activeSessionId : null}
        onSelectSession={handleSelectSession}
        onSessionCleared={handleSessionCleared}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="flex h-11 shrink-0 items-center gap-3 border-b border-border bg-muted px-4">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10">
            <Sparkles className="h-3 w-3 text-primary" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold text-foreground">{agentLabel}</h1>
            {modelLabel !== null && (
              <p className="truncate text-[10px] leading-none text-muted-foreground">{modelLabel}</p>
            )}
          </div>
          {activeSessionId.length > 0 && (
            <span className="ml-auto truncate text-[10px] tabular-nums text-muted-foreground opacity-60">
              {activeSessionId.slice(0, 24)}
            </span>
          )}
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden" role="log" aria-live="polite">
          {isLoading ? (
            <div className="space-y-4 p-6">
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-8 w-1/2" />
              <Skeleton className="h-16 w-5/6" />
            </div>
          ) : messages.length === 0 && !streamingContent && !isTyping ? (
            <EmptyState agentLabel={agentLabel} />
          ) : (
            <div className="mx-auto max-w-3xl px-4">
              <MessageList messages={messages} />

              {streamingContent.length > 0 && (
                <StreamingMessage content={streamingContent} />
              )}

              {isTyping && streamingContent.length === 0 && <TypingIndicator />}

              {toolCalls.length > 0 && (
                <div className="py-2">
                  <ToolActivity toolCalls={toolCalls} isTyping={isTyping} />
                </div>
              )}

              <div ref={bottomRef} className="h-4" />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-muted">
          <div className="mx-auto max-w-3xl px-4 py-2.5">
            <ChatInput onSend={send} disabled={isTyping} />
            <p className="mt-1 px-1 text-[10px] text-muted-foreground opacity-60">
              <kbd className="font-mono">Enter</kbd> send
              {" / "}
              <kbd className="font-mono">Shift+Enter</kbd> newline
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StreamingMessage({ content }: { readonly content: string }) {
  return (
    <div className="flex gap-3 py-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <Sparkles className="h-3 w-3 animate-pulse text-primary" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex items-center gap-2">
          <span className="text-xs font-medium text-primary">Agent</span>
          <span className="text-[10px] text-primary/50">streaming...</span>
        </div>
        <MarkdownRenderer content={content} className="text-sm leading-relaxed text-foreground" />
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 py-3">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted">
        <Bot className="h-3 w-3 text-muted-foreground" />
      </div>
      <div className="flex items-center gap-1.5 py-1">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/70 [animation-delay:300ms]" />
        <span className="ml-1 text-xs text-muted-foreground">Thinking...</span>
      </div>
    </div>
  );
}

function EmptyState({ agentLabel }: { readonly agentLabel: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
          <Sparkles className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-1 text-lg font-semibold text-foreground">Chat with {agentLabel}</h2>
        <p className="text-sm text-muted-foreground">Send a message to start a conversation.</p>
      </div>
    </div>
  );
}
