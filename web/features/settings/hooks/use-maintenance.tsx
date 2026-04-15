'use client';

import { createContext, useContext, useCallback, useState, ReactNode } from 'react';
import { toast } from 'sonner';

// Simplified maintenance context - backend does not support maintenance windows
// This provides a stub implementation to prevent component errors

interface MaintenanceSettings {
  enabled: boolean;
  defaultSeverity: string;
  defaultAutoResume: boolean;
  defaultAutoResumeDelayMinutes: number;
  showUpcomingNotice: boolean;
  upcomingNoticeMinutes: number;
}

interface MaintenanceContextType {
  windows: unknown[];
  currentWindow: null;
  nextWindow: null;
  settings: MaintenanceSettings;
  isLoaded: boolean;
  createWindow: () => Promise<void>;
  updateWindow: () => Promise<void>;
  cancelWindow: () => Promise<void>;
  deleteWindow: () => Promise<void>;
  completeWindow: () => Promise<void>;
  getWindowById: () => undefined;
  getWindowsByStatus: () => unknown[];
  getFilteredWindows: () => unknown[];
  updateSettings: (_settings: Partial<MaintenanceSettings>) => void;
  exportToJson: () => string;
  importFromJson: (_json: string) => void;
}

const MaintenanceContext = createContext<MaintenanceContextType | null>(null);

export function useMaintenance() {
  const context = useContext(MaintenanceContext);
  if (!context) {
    throw new Error('useMaintenance must be used within a MaintenanceProvider');
  }
  return context;
}

interface MaintenanceProviderProps {
  children: ReactNode;
}

export function MaintenanceProvider({ children }: MaintenanceProviderProps) {
  const [settings, setSettings] = useState<MaintenanceSettings>({
    enabled: false,
    defaultSeverity: 'warning',
    defaultAutoResume: true,
    defaultAutoResumeDelayMinutes: 5,
    showUpcomingNotice: true,
    upcomingNoticeMinutes: 30,
  });

  const createWindow = useCallback(async () => {
    toast.error('Maintenance windows are not supported by the backend');
  }, []);

  const updateWindow = useCallback(async () => {
    toast.error('Maintenance windows are not supported by the backend');
  }, []);

  const cancelWindow = useCallback(async () => {
    toast.error('Maintenance windows are not supported by the backend');
  }, []);

  const deleteWindow = useCallback(async () => {
    toast.error('Maintenance windows are not supported by the backend');
  }, []);

  const completeWindow = useCallback(async () => {
    toast.error('Maintenance windows are not supported by the backend');
  }, []);

  const getWindowById = useCallback(() => undefined, []);
  const getWindowsByStatus = useCallback(() => [], []);
  const getFilteredWindows = useCallback(() => [], []);

  const updateSettings = useCallback((newSettings: Partial<MaintenanceSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    toast.error('Maintenance settings are not supported by the backend');
  }, []);

  const exportToJson = useCallback(() => '[]', []);
  const importFromJson = useCallback((_json: string) => {
    toast.error('Maintenance import is not supported by the backend');
  }, []);

  const value: MaintenanceContextType = {
    windows: [],
    currentWindow: null,
    nextWindow: null,
    settings,
    isLoaded: true,
    createWindow,
    updateWindow,
    cancelWindow,
    deleteWindow,
    completeWindow,
    getWindowById,
    getWindowsByStatus,
    getFilteredWindows,
    updateSettings,
    exportToJson,
    importFromJson,
  };

  return (
    <MaintenanceContext.Provider value={value}>
      {children}
    </MaintenanceContext.Provider>
  );
}
