'use client';

import { useState, useCallback } from 'react';
import { toast } from 'sonner';
import { NotificationsPage } from '@/features/settings';
import { useNotifications } from '@/features/notifications/hooks/use-notifications';

const defaultSettings = {
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

export default function NotificationsSettingsPage() {
  const { settings, updateSettings, clearNotifications, addNotification } = useNotifications();
  const [localDuration, setLocalDuration] = useState(settings.autoDismissDuration);
  const [hasChanges, setHasChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleEnabledChange = useCallback((checked: boolean) => {
    updateSettings({ enabled: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleBrowserNotificationsChange = useCallback((checked: boolean) => {
    updateSettings({ browserNotifications: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleAutoDismissChange = useCallback((checked: boolean) => {
    updateSettings({ autoDismiss: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleDurationChange = useCallback((value: number[]) => {
    setLocalDuration(value[0]);
  }, []);

  const handleDurationCommit = useCallback(() => {
    updateSettings({ autoDismissDuration: localDuration });
    setHasChanges(true);
  }, [updateSettings, localDuration]);

  const handleNotifyOnSuccessChange = useCallback((checked: boolean) => {
    updateSettings({ notifyOnSuccess: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleNotifyOnErrorChange = useCallback((checked: boolean) => {
    updateSettings({ notifyOnError: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleNotifyOnWarningChange = useCallback((checked: boolean) => {
    updateSettings({ notifyOnWarning: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleNotifyOnInfoChange = useCallback((checked: boolean) => {
    updateSettings({ notifyOnInfo: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleNotifyOnAgentStatusChange = useCallback((checked: boolean) => {
    updateSettings({ notifyOnAgentStatusChange: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleNotifyOnNewLogChange = useCallback((checked: boolean) => {
    updateSettings({ notifyOnNewLog: checked });
    setHasChanges(true);
  }, [updateSettings]);

  const handleSave = useCallback(() => {
    setIsSaving(true);
    // Settings are already updated via updateSettings, just show toast
    toast.success('Settings saved');
    setHasChanges(false);
    setIsSaving(false);
  }, []);

  const handleReset = useCallback(() => {
    updateSettings(defaultSettings);
    setLocalDuration(defaultSettings.autoDismissDuration);
    setHasChanges(false);
  }, [updateSettings]);

  const handleClearAll = useCallback(() => {
    clearNotifications();
  }, [clearNotifications]);

  const handleTestNotification = useCallback((type: 'info' | 'success' | 'warning' | 'error') => {
    addNotification({
      type,
      title: `Test ${type}`,
      message: `This is a test ${type} notification`,
      autoDismiss: true,
    });
  }, [addNotification]);

  return (
    <NotificationsPage
      settings={settings}
      localDuration={localDuration}
      hasChanges={hasChanges}
      isSaving={isSaving}
      onEnabledChange={handleEnabledChange}
      onBrowserNotificationsChange={handleBrowserNotificationsChange}
      onAutoDismissChange={handleAutoDismissChange}
      onDurationChange={handleDurationChange}
      onDurationCommit={handleDurationCommit}
      onNotifyOnSuccessChange={handleNotifyOnSuccessChange}
      onNotifyOnErrorChange={handleNotifyOnErrorChange}
      onNotifyOnWarningChange={handleNotifyOnWarningChange}
      onNotifyOnInfoChange={handleNotifyOnInfoChange}
      onNotifyOnAgentStatusChange={handleNotifyOnAgentStatusChange}
      onNotifyOnNewLogChange={handleNotifyOnNewLogChange}
      onSave={handleSave}
      onReset={handleReset}
      onClearAll={handleClearAll}
      onTestNotification={handleTestNotification}
    />
  );
}
