export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  link?: string;
  autoDismiss?: boolean;
  duration?: number;
}

export interface NotificationSettings {
  enabled: boolean;
  browserNotifications: boolean;
  autoDismiss: boolean;
  autoDismissDuration: number;
  notifyOnSuccess: boolean;
  notifyOnError: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;
  notifyOnAgentStatusChange: boolean;
  notifyOnNewLog: boolean;
}

export interface NotificationActions {
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;
  updateSettings: (settings: Partial<NotificationSettings>) => void;
}
