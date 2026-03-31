'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAgent, useDeleteAgent, useDeleteMemory } from '../hooks';
import { useAgentSessions } from '../hooks/queries';
import { useAgentFiles } from '../hooks/queries';
import { useAgentMemories } from '../hooks/queries';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageContainer } from '@/shared/components/page-container';
import { OverviewTab, OverviewTabSkeleton } from './agent-overview-tab';
import { FilesTab, FilesTabSkeleton } from './agent-files-tab';
import { MemoryTab, MemoryTabSkeleton } from './agent-memory-tab';
import { SessionsTab, SessionsTabSkeleton } from './agent-sessions-tab';
import { TestAgentPanel } from './agent-test-tab';
import { EditDialog } from './edit-dialog';
import { getHeartbeatStatus } from '@/shared/components/heartbeat-badge';
import { ArrowLeft, Sparkles, MoreVertical, Trash2, Bot, AlertCircle } from 'lucide-react';

interface AgentDetailPageProps {
  id: string;
}

// Error boundary wrapper for tabs
class TabErrorBoundary extends React.Component<
  { children: React.ReactNode; tabName: string },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; tabName: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{this.props.tabName} tab failed to load</AlertTitle>
          <AlertDescription>
            {this.state.error?.message || 'An error occurred'}
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

export function AgentDetailPage({ id }: AgentDetailPageProps) {
  const router = useRouter();
  const {
    data: agent,
    isLoading: agentLoading,
    error: agentError,
  } = useAgent(id);
  const deleteAgent = useDeleteAgent();
  const { data: files, isLoading: filesLoading } = useAgentFiles(id);
  const { data: memories, isLoading: memoriesLoading } = useAgentMemories(id);
  const { data: sessions, isLoading: sessionsLoading } = useAgentSessions(id);
  const deleteMemoryMutation = useDeleteMemory(id);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Handle delete
  const handleDelete = async () => {
    await deleteAgent.mutateAsync(id);
    router.push('/agents');
  };

  // 404 / Not Found State
  if (!agentLoading && !agent && !agentError) {
    return (
      <PageContainer className="space-y-6">
        <Link href="/agents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Agents
          </Button>
        </Link>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Agent not found</AlertTitle>
          <AlertDescription>
            The agent you&apos;re looking for doesn&apos;t exist or has been deleted.
            <div className="mt-4">
              <Link href="/agents">
                <Button variant="outline" size="sm">
                  Return to agents list
                </Button>
              </Link>
            </div>
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  // Error State
  if (agentError) {
    return (
      <PageContainer className="space-y-6">
        <Link href="/agents">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Agents
          </Button>
        </Link>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load agent</AlertTitle>
          <AlertDescription>
            {agentError.message}
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  const heartbeatStatus = agent
    ? getHeartbeatStatus(agent.hasHeartbeat, agent.lastHeartbeatAt)
    : 'unknown';

  return (
    <TooltipProvider>
      <PageContainer className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Link href="/agents">
              <Button variant="ghost" size="icon" className="shrink-0">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            {agentLoading ? (
              <Skeleton className="h-8 w-48" />
            ) : (
              <div className="flex items-center gap-3 min-w-0">
                <h1 className="text-xl md:text-2xl font-bold truncate">
                  {agent?.name}
                </h1>
                {agent && (
                  <Badge
                    variant={heartbeatStatus === 'online' ? 'default' : heartbeatStatus === 'offline' ? 'destructive' : 'secondary'}
                    className="shrink-0 capitalize"
                  >
                    {heartbeatStatus}
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Desktop: Full buttons, Mobile: Icons + Dropdown */}
          <div className="flex items-center gap-2">
            {/* Desktop full buttons */}
            <div className="hidden sm:flex items-center gap-2">
              <Link href={`/agents/${id}/test`}>
                <Button variant="outline" size="sm">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Test
                </Button>
              </Link>
            </div>

            {/* Mobile: Icon-only with tooltips */}
            <div className="flex sm:hidden items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/agents/${id}/test`}>
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Test Agent</TooltipContent>
              </Tooltip>
            </div>

            {/* More actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Agent
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="flex items-center gap-2">
                        <Bot className="h-5 w-5 text-destructive" />
                        Delete Agent
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete <strong>{agent?.name}</strong>?
                        This action cannot be undone. All associated data including
                        memories, files, and sessions will be permanently removed.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setDeleteDialogOpen(false)}>
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={deleteAgent.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleteAgent.isPending ? 'Deleting...' : 'Delete Agent'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Tabs with error boundaries */}
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="overview" className="flex-1 sm:flex-none">
              Overview
            </TabsTrigger>
            <TabsTrigger value="files" className="flex-1 sm:flex-none">
              Files
            </TabsTrigger>
            <TabsTrigger value="memory" className="flex-1 sm:flex-none">
              Memory
            </TabsTrigger>
            <TabsTrigger value="sessions" className="flex-1 sm:flex-none">
              Sessions
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <TabErrorBoundary tabName="Overview">
              {agentLoading ? (
                <OverviewTabSkeleton />
              ) : agent ? (
                <>
                  <OverviewTab agent={agent} onEdit={() => setEditOpen(true)} />
                  <TestAgentPanel agentId={id} agentName={agent.name} defaultOpen={false} />
                </>
              ) : null}
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="files" className="space-y-4">
            <TabErrorBoundary tabName="Files">
              {filesLoading ? (
                <FilesTabSkeleton />
              ) : (
                <FilesTab agentId={id} files={files ?? []} />
              )}
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="memory" className="space-y-4">
            <TabErrorBoundary tabName="Memory">
              {memoriesLoading ? (
                <MemoryTabSkeleton />
              ) : (
                <MemoryTab
                  memories={memories ?? []}
                  onDeleteMemory={async (memoryId: string) => {
                    await deleteMemoryMutation.mutateAsync(memoryId);
                  }}
                />
              )}
            </TabErrorBoundary>
          </TabsContent>

          <TabsContent value="sessions" className="space-y-4">
            <TabErrorBoundary tabName="Sessions">
              {sessionsLoading ? (
                <SessionsTabSkeleton />
              ) : (
                <SessionsTab sessions={sessions ?? []} />
              )}
            </TabErrorBoundary>
          </TabsContent>
        </Tabs>

        {agent && (
          <EditDialog agent={agent} open={editOpen} onOpenChange={setEditOpen} />
        )}
      </PageContainer>
    </TooltipProvider>
  );
}
