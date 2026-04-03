'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
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
} from 'lucide-react';
import { Agent } from '../types';

interface AgentOverviewTabProps {
  agent: Agent;
  isLoading?: boolean;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
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

function QuickActions({ agent }: { agent: Agent }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quick Actions</CardTitle>
        <CardDescription>Common operations for this agent</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="gap-2">
            <Play className="h-4 w-4" />
            Test Agent
          </Button>
          <Button variant="outline" className="gap-2">
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button variant="outline" className="gap-2">
            <Copy className="h-4 w-4" />
            Clone
          </Button>
          <Button variant="outline" className="gap-2 hover:text-destructive">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AgentInfo({ agent }: { agent: Agent }) {
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
            <p className="text-sm">{agent.config.model || 'Default'}</p>
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">Timezone</p>
            <p className="text-sm">{agent.timezone || 'UTC'}</p>
          </div>
        </div>

        <Separator />

        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Enabled Tools</p>
          <div className="flex flex-wrap gap-1">
            {agent.config.toolsEnabled.length > 0 ? (
              agent.config.toolsEnabled.map((tool) => (
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

function RecentActivity() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Latest sessions and events</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Session completed</p>
              <p className="text-xs text-muted-foreground">Processed 5 tool calls</p>
            </div>
            <span className="text-xs text-muted-foreground">2m ago</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <Heart className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Heartbeat triggered</p>
              <p className="text-xs text-muted-foreground">Ran scheduled check</p>
            </div>
            <span className="text-xs text-muted-foreground">1h ago</span>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
              <Wrench className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Configuration updated</p>
              <p className="text-xs text-muted-foreground">Changed model settings</p>
            </div>
            <span className="text-xs text-muted-foreground">3h ago</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentOverviewTab({ agent, isLoading }: AgentOverviewTabProps) {
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
          value={agent.config.provider}
          subtext={agent.config.model || 'Default model'}
        />
        <StatCard
          icon={<Wrench className="h-4 w-4 text-primary" />}
          label="Tools"
          value={agent.config.toolsEnabled.length}
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
        <RecentActivity />
      </div>

      <QuickActions agent={agent} />
    </div>
  );
}
