import Link from 'next/link';
import { Session } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, ExternalLink, History } from 'lucide-react';

interface SessionsTabProps {
  sessions: Session[];
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function SessionsTab({ sessions }: SessionsTabProps) {
  // Empty state - compact with icon
  if (sessions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <History className="h-10 w-10 text-muted-foreground/50 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">
            No sessions yet
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Sessions are created when you chat with this agent
          </p>
        </CardContent>
      </Card>
    );
  }

  const content = (
    <div className="space-y-1">
      {sessions.map((session) => (
        <div
          key={session.id}
          className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/50 transition-colors"
        >
          <div className="flex-1 min-w-0 mr-3">
            <p className="font-medium text-sm truncate">
              {session.title || 'Untitled Session'}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="secondary" className="text-xs h-5 px-1.5">
                <MessageSquare className="h-3 w-3 mr-1" />
                {session.messageCount || 0}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(session.updatedAt)}
              </span>
            </div>
          </div>
          <Link href={`/chat?session=${session.id}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ExternalLink className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      ))}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          Sessions ({sessions.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {sessions.length > 10 ? (
          <ScrollArea className="max-h-[300px] pr-2">
            {content}
          </ScrollArea>
        ) : (
          content
        )}
      </CardContent>
    </Card>
  );
}

export function SessionsTabSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-24" />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2">
            <div className="flex-1 mr-3">
              <Skeleton className="h-4 w-40" />
              <div className="flex items-center gap-2 mt-1">
                <Skeleton className="h-3.5 w-16" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </div>
            <Skeleton className="h-8 w-8" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
