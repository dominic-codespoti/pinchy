'use client';

import { Bell, CheckCircle, AlertTriangle, XCircle, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { formatRelativeTime } from '@/shared/lib/date-utils';
import type { Notification, NotificationType } from '@/features/notifications/types';

interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead: (id: string) => void;
  onRemove: (id: string) => void;
}

const iconMap: Record<NotificationType, React.ReactNode> = {
  info: <Bell className="h-4 w-4 text-blue-500" />,
  success: <CheckCircle className="h-4 w-4 text-green-500" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  error: <XCircle className="h-4 w-4 text-red-500" />,
};

const bgMap: Record<NotificationType, string> = {
  info: 'bg-blue-50 dark:bg-blue-950/20 border-l-blue-500',
  success: 'bg-green-50 dark:bg-green-950/20 border-l-green-500',
  warning: 'bg-amber-50 dark:bg-amber-950/20 border-l-amber-500',
  error: 'bg-red-50 dark:bg-red-950/20 border-l-red-500',
};

export function NotificationItem({ notification, onMarkAsRead, onRemove }: NotificationItemProps) {
  const router = useRouter();

  const handleClick = () => {
    if (!notification.read) {
      onMarkAsRead(notification.id);
    }
    if (notification.link) {
      router.push(notification.link);
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRemove(notification.id);
  };

  return (
    <div
      onClick={handleClick}
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors',
        'hover:bg-accent/50',
        !notification.read && bgMap[notification.type],
        !notification.read && 'border-l-2'
      )}
    >
      <div className="mt-0.5 shrink-0">
        {iconMap[notification.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn(
            'text-sm font-medium leading-none',
            !notification.read && 'font-semibold'
          )}>
            {notification.title}
          </p>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(notification.timestamp, { capitalize: true })}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
          {notification.message}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleRemove}
      >
        <X className="h-3 w-3" />
      </Button>
      {!notification.read && (
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary shrink-0" />
      )}
    </div>
  );
}
