'use client';

import Link from 'next/link';
import { MobileCard, MobileCardRow, MobileCardTitle } from '@/components/ui/mobile-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare, Trash2 } from 'lucide-react';
import { Session } from '../types';

interface SessionMobileCardProps {
  session: Session;
  agentName?: string;
  onDelete: (session: Session) => void;
  isDeleting?: boolean;
}

function formatRelativeDate(date: string): string {
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

export function SessionMobileCard({
  session,
  agentName,
  onDelete,
  isDeleting,
}: SessionMobileCardProps) {
  const chatHref = `/chat?agent=${session.agentId}&session=${session.id}`;

  return (
    <MobileCard>
      <div className="min-w-0">
        <Link href={chatHref} className="block hover:opacity-80 transition-opacity">
          <MobileCardTitle className="line-clamp-2">
            {session.title || 'Untitled Session'}
          </MobileCardTitle>
        </Link>
      </div>

      <MobileCardRow
        label="Agent"
        value={
          <Badge variant="secondary" className="truncate max-w-[140px]">
            {agentName || session.agentId}
          </Badge>
        }
      />

      <MobileCardRow
        label="Messages"
        value={<span className="text-sm">{session.messageCount}</span>}
      />

      <MobileCardRow
        label="Last Active"
        value={
          <span className="text-sm text-muted-foreground">
            {formatRelativeDate(session.updatedAt)}
          </span>
        }
      />

      <div className="flex items-center justify-end gap-2 pt-3 border-t">
        <Button variant="outline" size="sm" asChild>
          <Link href={chatHref}>
            <MessageSquare className="h-4 w-4 mr-1" />
            Open
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onDelete(session)}
          disabled={isDeleting}
          className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      </div>
    </MobileCard>
  );
}
