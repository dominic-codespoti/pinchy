import { Agent } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Edit, Clock, Calendar, Activity } from "lucide-react";
import { getHeartbeatStatus } from "@/shared/components/heartbeat-badge";

interface OverviewTabProps {
  agent: Agent;
  onEdit: () => void;
}

export function OverviewTab({ agent, onEdit }: OverviewTabProps) {
  const statusVariant = agent.status === 'active' ? 'default' : 'secondary';
  const heartbeatStatus = getHeartbeatStatus(agent.hasHeartbeat, agent.lastHeartbeatAt);
  const heartbeatVariant = heartbeatStatus === 'online' ? 'default' : heartbeatStatus === 'offline' ? 'destructive' : 'secondary';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Agent Overview</CardTitle>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Section 1: Agent Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="flex items-center gap-2">
            <Badge variant={statusVariant} className="capitalize text-xs">
              {agent.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            <Badge variant={heartbeatVariant} className="capitalize text-xs">
              {heartbeatStatus}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{new Date(agent.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {agent.lastHeartbeatAt
                ? new Date(agent.lastHeartbeatAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
                : 'Never'}
            </span>
          </div>
        </div>

        {agent.description && (
          <p className="text-sm text-muted-foreground">{agent.description}</p>
        )}

        {agent.heartbeatInterval && (
          <p className="text-xs text-muted-foreground">
            Heartbeat interval: {agent.heartbeatInterval}s
          </p>
        )}

        <Separator />

        {/* Section 2: Configuration */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Model</span>
              <span className="font-medium">{agent.config.model || 'Default'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Provider</span>
              <span className="font-medium">{agent.config.provider}</span>
            </div>
            {agent.maxTurns !== undefined && agent.maxTurns !== null && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Max Turns</span>
                <span className="font-medium">{agent.maxTurns}</span>
              </div>
            )}
          </div>

          {agent.enabledSkills && agent.enabledSkills.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Skills</span>
              {agent.enabledSkills.map((skill) => (
                <Badge key={skill} variant="outline" className="text-xs">
                  {skill}
                </Badge>
              ))}
            </div>
          )}

          {agent.watchPaths && agent.watchPaths.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Watch</span>
              {agent.watchPaths.map((path) => (
                <Badge key={path} variant="outline" className="text-xs font-mono">
                  {path}
                </Badge>
              ))}
            </div>
          )}

          {agent.config.toolsEnabled.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Tools</span>
              {agent.config.toolsEnabled.map((tool) => (
                <Badge key={tool} variant="secondary" className="text-xs">
                  {tool}
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Section 3: System Prompt */}
        {agent.config.systemPrompt && (
          <>
            <Separator />
            <div className="space-y-2">
              <span className="text-sm text-muted-foreground">System Prompt</span>
              <div className="text-sm bg-muted p-3 rounded-md line-clamp-4">
                {agent.config.systemPrompt}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function OverviewTabSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-16" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-5 w-20" />
          ))}
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-px w-full" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
          <Skeleton className="h-5 w-16" />
        </div>
      </CardContent>
    </Card>
  );
}
