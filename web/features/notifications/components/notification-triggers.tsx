'use client';

import { useNotificationTriggers } from '@/features/notifications/hooks/use-notification-triggers';

export function NotificationTriggers() {
  // This component just initializes the WebSocket notification listeners
  useNotificationTriggers();
  return null;
}
