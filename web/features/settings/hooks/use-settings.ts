'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Settings {
  // API Configuration
  backendUrl: string;
  apiToken: string;
  authEnabled: boolean;

  // Notifications
  notificationsEnabled: boolean;
  notificationDuration: number;
  notifyOnSuccess: boolean;
  notifyOnError: boolean;
  notifyOnWarning: boolean;
  notifyOnInfo: boolean;

  // Advanced
  autoRefreshInterval: number;
  logRetentionDays: number;
  debugMode: boolean;
}

const STORAGE_KEY = 'pinchy-settings';

const defaultSettings: Settings = {
  backendUrl: 'localhost:3131',
  apiToken: '',
  authEnabled: false,
  notificationsEnabled: true,
  notificationDuration: 3000,
  notifyOnSuccess: true,
  notifyOnError: true,
  notifyOnWarning: true,
  notifyOnInfo: false,
  autoRefreshInterval: 30,
  logRetentionDays: 7,
  debugMode: false,
};

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings({ ...defaultSettings, ...parsed });
      }
    } catch {
      // Ignore localStorage errors
    }
    setIsLoaded(true);
  }, []);

  const updateSettings = useCallback((updates: Partial<Settings>) => {
    setSettings((prev) => {
      const newSettings = { ...prev, ...updates };
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
      }
      return newSettings;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings(defaultSettings);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSettings));
    }
  }, []);

  const testConnection = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const url = settings.backendUrl.startsWith('http') 
        ? settings.backendUrl 
        : `http://${settings.backendUrl}`;
      
      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        headers: settings.authEnabled && settings.apiToken 
          ? { 'Authorization': `Bearer ${settings.apiToken}` }
          : undefined,
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        return { success: true, message: 'Connection successful' };
      } else {
        return { success: false, message: `Server returned ${response.status}` };
      }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : 'Connection failed' };
    }
  }, [settings.backendUrl, settings.authEnabled, settings.apiToken]);

  return {
    settings,
    isLoaded,
    updateSettings,
    resetSettings,
    testConnection,
  };
}
