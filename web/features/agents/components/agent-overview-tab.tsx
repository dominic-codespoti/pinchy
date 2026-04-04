'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Bot,
  Heart,
  Clock,
  Zap,
  Wrench,
  Calendar,
  Play,
  Pencil,
  Copy,
  Trash2,
  MessageSquare,
} from 'lucide-react';
import { Agent, Session } from '../types';
import { getAgentSessions, deleteAgent, cloneAgent } from '../api';
import { STALE_TIME } from '@/lib/query-config';
import { cn } from '@/shared/lib/utils';
import { getRelativeTime } from '@/shared/lib/date-utils';
import { FALLBACKS } from '@/lib/constants/fallbacks';
import { DeleteAgentDialog } from './delete-agent-dialog';
import { CloneAgentDialog } from './clone-agent-dialog';
import { EditAgentSheet } from './edit-agent-sheet';
import { updateAgent } from '../api/agents';
import { toast } from 'sonner';

interface AgentOverviewTabProps {
  agent: Agent;
  isLoading?: boolean;
  onSwitchTab?: (tab: string) => void;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse TOOLS.md markdown to extract actual tool names
 * Tool names typically follow patterns like: read_file, write_file, save_memory, exec_shell
 */
function parseToolsMarkdown(toolsContent: string | undefined): string[] {
  if (!toolsContent) return [];

  const tools: string[] = [];
  const seen = new Set<string>();
  
  // Match content in backticks - tool names are usually in backticks in TOOLS.md
  const backtickPattern = /`([a-z_][a-z0-9_]*)`/g;
  let match;
  
  while ((match = backtickPattern.exec(toolsContent)) !== null) {
    const name = match[1];
    
    // Tool names should:
    // 1. Be at least 4 characters
    // 2. Either contain an underscore (e.g., read_file) OR match known tool patterns
    // 3. Not be common English words
    if (name.length >= 4 && !seen.has(name)) {
      // Check if it looks like a tool name
      if (name.includes('_') || isLikelyToolName(name)) {
        if (!isCommonWord(name)) {
          tools.push(name);
          seen.add(name);
        }
      }
    }
  }

  return tools.sort();
}

/**
 * Check if a word matches known tool name patterns
 */
function isLikelyToolName(word: string): boolean {
  // Tool names often start with these action verbs
  const toolVerbs = [
    'read', 'write', 'edit', 'exec', 'run', 'list', 'get', 'set',
    'save', 'recall', 'forget', 'activate', 'create', 'delete', 'update',
    'search', 'find', 'fetch', 'load', 'store', 'send', 'process',
    'handle', 'manage', 'check', 'test', 'validate', 'parse', 'format',
    'convert', 'encode', 'decode', 'encrypt', 'backup', 'restore',
    'import', 'export', 'install', 'deploy', 'build', 'render', 'query',
    'scan', 'extract', 'generate', 'filter', 'sort', 'clone', 'sync',
    'schedule', 'notify', 'log', 'trace', 'debug', 'inspect', 'analyze',
    'explore', 'display', 'show', 'explain', 'record', 'catalog',
    'index', 'classify', 'tag', 'evaluate', 'measure', 'count',
    'collect', 'compile', 'construct', 'produce', 'design', 'execute',
    'perform', 'conduct', 'implement', 'apply', 'invoke', 'trigger'
  ];
  
  return toolVerbs.some(verb => 
    word.startsWith(verb) && word.length > verb.length
  );
}

/**
 * Check if a word is a common English word (not a tool name)
 */
function isCommonWord(word: string): boolean {
  const lower = word.toLowerCase();
  // Only check most common words that might appear in backticks in documentation
  const commonWords = [
    'that', 'with', 'have', 'this', 'will', 'your', 'from', 'they', 'been',
    'were', 'said', 'time', 'than', 'them', 'into', 'just', 'also', 'back',
    'only', 'know', 'take', 'year', 'good', 'some', 'come', 'make', 'well',
    'very', 'when', 'much', 'over', 'such', 'even', 'most', 'should', 'still',
    'before', 'being', 'after', 'other', 'many', 'work', 'life', 'without',
    'through', 'between', 'under', 'within', 'during', 'here', 'there',
    'where', 'what', 'which', 'who', 'how', 'all', 'any', 'both', 'each',
    'few', 'more', 'some', 'than', 'too', 'use', 'using', 'used', 'can',
    'could', 'would', 'should', 'may', 'might', 'must', 'shall', 'will',
    'about', 'above', 'across', 'after', 'against', 'along', 'among',
    'around', 'before', 'behind', 'below', 'beneath', 'beside', 'besides',
    'beyond', 'despite', 'down', 'except', 'inside', 'instead', 'near',
    'off', 'onto', 'outside', 'since', 'throughout', 'till', 'toward',
    'towards', 'upon', 'versus', 'via', 'worth', 'the', 'and', 'for',
    'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was', 'one', 'our',
    'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new',
    'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use',
    'her', 'way', 'own', 'say', 'too', 'old', 'tell', 'very', 'when',
    'come', 'here', 'look', 'make', 'time', 'than', 'them', 'well', 'were'
  ];
  return commonWords.includes(lower);
}

function StatCard({ icon, label, value, subtext }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
            {icon}
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-lg font-semibold">{value}</p>
            {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function QuickActions({ 
  agent, 
  onSwitchTab 
}: { 
  agent: Agent; 
  onSwitchTab?: (tab: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCloning, setIsCloning] = useState(false);

  const handleTest = () => {
    onSwitchTab?.('test');
  };

  const handleDelete = async (agentId: string) => {
    setIsDeleting(true);
    try {
      await deleteAgent(agentId);
      toast.success('Agent deleted successfully');
      // Invalidate and refetch agents list
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      // Navigate back to agents list
      router.push('/agents');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete agent');
      throw error;
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClone = async (
    sourceId: string,
    newId: string,
    options: {
      cloneSettings: boolean;
      cloneFiles: boolean;
      cloneMemories: boolean;
    }
  ) => {
    setIsCloning(true);
    try {
      const result = await cloneAgent(sourceId, newId);
      if (result.success) {
        toast.success(`Agent cloned successfully as ${newId}`);
        // Invalidate agents list to show the new agent
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      } else {
        throw new Error(result.errors[0] || 'Failed to clone agent');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to clone agent');
      throw error;
    } finally {
      setIsCloning(false);
    }
  };

  const handleEditSave = async (agentId: string, data: Partial<Agent>) => {
    try {
      await updateAgent(agentId, {
        model: data.config?.model,
        heartbeat_secs: data.heartbeatInterval,
      });
      toast.success('Agent updated successfully');
      // Invalidate agent query to refresh data
      queryClient.invalidateQueries({ queryKey: ['agents', agentId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update agent');
      throw error;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common operations for this agent</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleTest}
          >
            <Play className="h-4 w-4" />
            Test Agent
          </Button>
          
          <EditAgentSheet 
            agent={agent} 
            onSave={handleEditSave}
            trigger={
              <Button variant="outline" className="gap-2">
                <Pencil className="h-4 w-4" />
                Edit
              </Button>
            }
          />
          
          <CloneAgentDialog 
            sourceAgent={agent}
            onClone={handleClone}
            trigger={
              <Button 
                variant="outline" 
                className="gap-2"
                disabled={isCloning}
              >
                <Copy className="h-4 w-4" />
                Clone
              </Button>
            }
          />
          
          <DeleteAgentDialog 
            agent={agent}
            onDelete={handleDelete}
            trigger={
              <Button 
                variant="outline" 
                className="gap-2 hover:text-destructive"
                disabled={isDeleting}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function AgentInfo({ agent }: { agent: Agent }) {
  // Parse tools from the raw TOOLS.md content instead of using the broken comma-split
  const parsedTools = useMemo(() => {
    if (agent.tools) {
      return parseToolsMarkdown(agent.tools);
    }
    return agent.config.toolsEnabled || [];
  }, [agent.tools, agent.config.toolsEnabled]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuration</CardTitle>
        <CardDescription>Current agent settings</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Agent ID</p>
            <p className="text-sm font-mono">{agent.id}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Provider</p>
            <Badge variant="outline">{agent.config.provider}</Badge>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Model</p>
            <p className="text-sm">{agent.config.model || FALLBACKS.MODEL}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Timezone</p>
            <p className="text-sm">{agent.timezone || FALLBACKS.TIMEZONE}</p>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Enabled Tools</p>
          <div className="flex flex-wrap gap-1">
            {parsedTools.length > 0 ? (
              parsedTools.map((tool) => (
                <Badge key={tool} variant="secondary">
                  {tool}
                </Badge>
              ))
            ) : (
              <span className="text-sm text-muted-foreground">No tools enabled</span>
            )}
          </div>
        </div>

        {agent.enabledSkills && agent.enabledSkills.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-2">Enabled Skills</p>
              <div className="flex flex-wrap gap-1">
                {agent.enabledSkills.map((skill) => (
                  <Badge key={skill} variant="outline">
                    {skill}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function useAgentSessions(agentId: string) {
  return useQuery<Session[], Error>({
    queryKey: ['agents', agentId, 'sessions'],
    queryFn: () => getAgentSessions(agentId),
    staleTime: STALE_TIME.SHORT,
    enabled: !!agentId,
  });
}

function ActivityItem({ session }: { session: Session }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-primary">
          <Bot className="size-4" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">
            {session.title || `Session ${session.id.slice(0, 8)}`}
          </p>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {getRelativeTime(new Date(session.updatedAt).getTime())}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs font-normal">
            <MessageSquare className="size-3 mr-1" />
            {session.messageCount} messages
          </Badge>
        </div>
      </div>
    </div>
  );
}

function EmptyActivityState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <MessageSquare className="size-8 text-muted-foreground/50" />
      <p className="mt-2 text-sm text-muted-foreground">No recent activity</p>
      <p className="text-xs text-muted-foreground">
        Sessions will appear here when this agent has conversations
      </p>
    </div>
  );
}

function RecentActivity({ agentId }: { agentId: string }) {
  const { data: sessions, isLoading } = useAgentSessions(agentId);

  const sortedSessions = useMemo(() => {
    return (sessions || [])
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [sessions]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest sessions for this agent</CardDescription>
        </div>
        <Badge variant="secondary">{sortedSessions.length} sessions</Badge>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : (
          <ScrollArea className="h-[300px]">
            <div className="space-y-3">
              {sortedSessions.length === 0 ? (
                <EmptyActivityState />
              ) : (
                sortedSessions.map((session) => (
                  <ActivityItem key={session.id} session={session} />
                ))
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

export function AgentOverviewTab({ agent, isLoading, onSwitchTab }: AgentOverviewTabProps) {
  // Parse tools for the stat card count
  const parsedTools = useMemo(() => {
    if (agent.tools) {
      return parseToolsMarkdown(agent.tools);
    }
    return agent.config.toolsEnabled || [];
  }, [agent.tools, agent.config.toolsEnabled]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<Zap className="h-4 w-4 text-primary" />}
          label="Sessions"
          value={agent.sessionCount || 0}
          subtext="Total conversations"
        />
        <StatCard
          icon={<Bot className="h-4 w-4 text-primary" />}
          label="Provider"
          value={agent.config.provider || 'Not set'}
          subtext={agent.config.model || FALLBACKS.MODEL}
        />
        <StatCard
          icon={<Wrench className="h-4 w-4 text-primary" />}
          label="Tools"
          value={parsedTools.length}
          subtext="Enabled capabilities"
        />
        <StatCard
          icon={<Heart className="h-4 w-4 text-primary" />}
          label="Heartbeat"
          value={agent.hasHeartbeat ? 'On' : 'Off'}
          subtext={agent.heartbeatInterval ? `${agent.heartbeatInterval}s interval` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AgentInfo agent={agent} />
        <RecentActivity agentId={agent.id} />
      </div>

      <QuickActions agent={agent} onSwitchTab={onSwitchTab} />
    </div>
  );
}
