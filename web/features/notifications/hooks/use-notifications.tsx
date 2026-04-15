'use client';

import { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { 
  Notification, 
  NotificationSettings, 
  NotificationActions 
} from '@/features/notifications/types';

const NOTIFICATIONS_STORAGE_KEY = 'pinchy-notifications';
const NOTIFICATION_SETTINGS_KEY = 'pinchy-notification-settings';
const MAX_NOTIFICATIONS = 50;

export const defaultSettings: NotificationSettings = {
  enabled: true,
  browserNotifications: false,
  autoDismiss: true,
  autoDismissDuration: 5000,
  notifyOnSuccess: true,
  notifyOnError: true,
  notifyOnWarning: true,
  notifyOnInfo: false,
  notifyOnAgentStatusChange: true,
  notifyOnNewLog: false,
};

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  settings: NotificationSettings;
  isLoaded: boolean;
  defaultSettings: NotificationSettings;
  addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  removeNotification: (id: string) => void;
  updateSettings: (settings: Partial<NotificationSettings>) => void;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}

interface NotificationProviderProps {
  children: React.ReactNode;
}

export function NotificationProvider({ children }: NotificationProviderProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const stored = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (stored) {
        setNotifications(JSON.parse(stored));
      }
    } catch {
      // Ignore localStorage errors
    }

    try {
      const storedSettings = localStorage.getItem(NOTIFICATION_SETTINGS_KEY);
      if (storedSettings) {
        setSettings({ ...defaultSettings, ...JSON.parse(storedSettings) });
      }
    } catch {
      // Ignore localStorage errors
    }

    setIsLoaded(true);
  }, []);

  // Persist to localStorage
  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return;

    try {
      localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(notifications));
    } catch {
      // Ignore localStorage errors
    }
  }, [notifications, isLoaded]);

  useEffect(() => {
    if (!isLoaded || typeof window === 'undefined') return;

    try {
      localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore localStorage errors
    }
  }, [settings, isLoaded]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const addNotification = useCallback((notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: Notification = {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      read: false,
    };

    setNotifications(prev => {
      const updated = [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS);
      return updated;
    });

    // Show toast if enabled for this type
    if (settings.enabled && shouldShowToast(notification.type, settings)) {
      const duration = notification.autoDismiss ? notification.duration || settings.autoDismissDuration : Infinity;
      
      const toastOptions = {
        id: newNotification.id,
        duration: duration === Infinity ? undefined : duration,
      };

      switch (notification.type) {
        case 'success':
          toast.success(notification.title, {
            ...toastOptions,
            description: notification.message,
          });
          break;
        case 'error':
          toast.error(notification.title, {
            ...toastOptions,
            description: notification.message,
          });
          break;
        case 'warning':
          toast.warning(notification.title, {
            ...toastOptions,
            description: notification.message,
          });
          break;
        default:
          toast.info(notification.title, {
            ...toastOptions,
            description: notification.message,
          });
      }
    }

    // Browser notification
    if (settings.browserNotifications && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/favicon.ico',
        });
      }
    }

    // Auto-dismiss
    if (notification.autoDismiss && settings.autoDismiss) {
      setTimeout(() => {
        markAsRead(newNotification.id);
      }, notification.duration || settings.autoDismissDuration);
    }
  }, [settings]);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications(prev =>
      prev.map(n => ({ ...n, read: true }))
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const updateSettings = useCallback((updates: Partial<NotificationSettings>) => {
    setSettings(prev => ({ ...prev, ...updates }));

    // Request browser notification permission if enabling
    if (updates.browserNotifications && typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        settings,
        isLoaded,
        defaultSettings,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearNotifications,
        removeNotification,
        updateSettings,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

function shouldShowToast(type: string, settings: NotificationSettings): boolean {
  switch (type) {
    case 'success':
      return settings.notifyOnSuccess;
    case 'error':
      return settings.notifyOnError;
    case 'warning':
      return settings.notifyOnWarning;
    case 'info':
      return settings.notifyOnInfo;
    default:
      return false;
  }
}
