'use client';

import * as React from 'react';
import { useMemo } from 'react';
import { MessageSquare, Clock, Bot } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/shared/lib/utils';
import { getRelativeTime } from '@/shared/lib/date-utils';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@/lib/query-config';
import { getDashboardSessions, DashboardSession } from '../api';

interface ActivityFeedProps extends React.HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
}

function useDashboardSessions() {
  return useQuery<DashboardSession[], Error>({
    queryKey: ['dashboard', 'sessions'],
    queryFn: getDashboardSessions,
    staleTime: STALE_TIME.SHORT,
  });
}

export const ActivityFeed = React.forwardRef<HTMLDivElement, ActivityFeedProps>(
  ({ loading: propLoading, className, ...props }, ref) => {
    const { data: sessions, isLoading: sessionsLoading } = useDashboardSessions();
    const loading = propLoading || sessionsLoading;

    const sortedSessions = useMemo(() => {
      return (sessions || [])
        .slice()
        .sort((a, b) => b.updated_at - a.updated_at)
        .slice(0, 5);
    }, [sessions]);

    return (
      <Card ref={ref} className={cn(className)} {...props}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest sessions across all agents</CardDescription>
          </div>
          <Badge variant="secondary">{sortedSessions.length} sessions</Badge>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {sortedSessions.length === 0 ? (
                  <EmptyState />
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
);

ActivityFeed.displayName = 'ActivityFeed';

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <MessageSquare className="size-8 text-muted-foreground/50" data-icon="inline-start" />
      <p className="mt-2 text-sm text-muted-foreground">No recent activity</p>
      <p className="text-xs text-muted-foreground">
        Sessions will appear here when agents start conversations
      </p>
    </div>
  );
}

function ActivityItem({ session }: { session: DashboardSession }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border p-3 hover:bg-muted/50 transition-colors">
      <Avatar className="size-8">
        <AvatarFallback className="bg-primary/10 text-primary">
          <Bot className="size-4" data-icon="inline-center" />
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium truncate">
            {session.title || `Session ${session.id.slice(0, 8)}`}
          </p>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {getRelativeTime(session.updated_at)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs font-normal">
            <MessageSquare className="size-3 mr-1" data-icon="inline-start" />
            {session.message_count} messages
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center">
            <Clock className="size-3 mr-1" data-icon="inline-start" />
            {session.agent_id.slice(0, 8)}
          </span>
        </div>
      </div>
    </div>
  );
}
