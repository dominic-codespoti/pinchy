import { Agent } from "../types";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit } from "lucide-react";
import { getHeartbeatStatus } from "@/shared/components/heartbeat-badge";

interface OverviewTabProps {
  agent: Agent;
  onEdit: () => void;
}

export function OverviewTab({ agent, onEdit }: OverviewTabProps) {
  const statusVariant = agent.status === 'active' ? 'default' : 'secondary';
  const heartbeatStatus = getHeartbeatStatus(agent.hasHeartbeat, agent.lastHeartbeatAt);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Agent Information</CardTitle>
            <CardDescription>View and manage agent details</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <CardDescription className="text-sm">Status</CardDescription>
              <Badge variant={statusVariant} className="mt-1 capitalize">
                {agent.status}
              </Badge>
            </div>
            <div>
              <CardDescription className="text-sm">Heartbeat Status</CardDescription>
              <div className="mt-1">
                <Badge
                  variant={heartbeatStatus === 'online' ? 'default' : heartbeatStatus === 'offline' ? 'destructive' : 'secondary'}
                  className="capitalize"
                >
                  {heartbeatStatus}
                </Badge>
              </div>
            </div>
            <div>
              <CardDescription className="text-sm">Created</CardDescription>
              <p className="mt-1">{new Date(agent.createdAt).toLocaleDateString()}</p>
            </div>
            <div>
              <CardDescription className="text-sm">Last Seen</CardDescription>
              <p className="mt-1">
                {agent.lastHeartbeatAt
                  ? new Date(agent.lastHeartbeatAt).toLocaleString()
                  : 'Never'}
              </p>
            </div>
          </div>

          {agent.heartbeatInterval && (
            <div>
              <CardDescription className="text-sm">Heartbeat Interval</CardDescription>
              <p className="mt-1">{agent.heartbeatInterval}s</p>
            </div>
          )}

          {agent.description && (
            <div>
              <CardDescription className="text-sm">Description</CardDescription>
              <p className="mt-1">{agent.description}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <CardDescription className="text-sm">Model</CardDescription>
              <p className="mt-1 font-medium">{agent.config.model || 'Default'}</p>
            </div>
            <div>
              <CardDescription className="text-sm">Provider</CardDescription>
              <p className="mt-1 font-medium">{agent.config.provider}</p>
            </div>
          </div>

          {agent.config.systemPrompt && (
            <div>
              <CardDescription className="text-sm">System Prompt</CardDescription>
              <div className="mt-1 text-sm bg-muted p-3 rounded-md">
                {agent.config.systemPrompt}
              </div>
            </div>
          )}

          {agent.config.toolsEnabled.length > 0 && (
            <div>
              <CardDescription className="text-sm">Tools Enabled</CardDescription>
              <div className="mt-1 flex flex-wrap gap-2">
                {agent.config.toolsEnabled.map((tool) => (
                  <Badge key={tool} variant="outline">{tool}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function OverviewTabSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48 mt-1" />
          </div>
          <Skeleton className="h-9 w-20" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(4)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-6 w-20 mt-1" />
              </div>
            ))}
          </div>
          <div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-20 w-full mt-1" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-24" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {[...Array(2)].map((_, i) => (
              <div key={i}>
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-6 w-24 mt-1" />
              </div>
            ))}
          </div>
          <div>
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-24 w-full mt-1" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
