'use client';

import { Bell, CheckCircle, XCircle, AlertTriangle, Info, Save, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface NotificationSettings {
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

interface NotificationsPageProps {
  settings: NotificationSettings;
  localDuration: number;
  hasChanges: boolean;
  isSaving: boolean;
  onEnabledChange: (checked: boolean) => void;
  onBrowserNotificationsChange: (checked: boolean) => void;
  onAutoDismissChange: (checked: boolean) => void;
  onDurationChange: (value: number[]) => void;
  onDurationCommit: () => void;
  onNotifyOnSuccessChange: (checked: boolean) => void;
  onNotifyOnErrorChange: (checked: boolean) => void;
  onNotifyOnWarningChange: (checked: boolean) => void;
  onNotifyOnInfoChange: (checked: boolean) => void;
  onNotifyOnAgentStatusChange: (checked: boolean) => void;
  onNotifyOnNewLogChange: (checked: boolean) => void;
  onSave: () => void;
  onReset: () => void;
  onClearAll: () => void;
  onTestNotification: (type: 'info' | 'success' | 'warning' | 'error') => void;
}

export function NotificationsPage({
  settings,
  localDuration,
  hasChanges,
  isSaving,
  onEnabledChange,
  onBrowserNotificationsChange,
  onAutoDismissChange,
  onDurationChange,
  onDurationCommit,
  onNotifyOnSuccessChange,
  onNotifyOnErrorChange,
  onNotifyOnWarningChange,
  onNotifyOnInfoChange,
  onNotifyOnAgentStatusChange,
  onNotifyOnNewLogChange,
  onSave,
  onReset,
  onClearAll,
  onTestNotification,
}: NotificationsPageProps) {
  return (
    <>
      {/* Enable Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Enable Notifications
          </CardTitle>
          <CardDescription>Toggle notifications on or off</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="notifications-enabled">Enable notifications</Label>
              <p className="text-sm text-muted-foreground">Show in-app notifications for events</p>
            </div>
            <Switch id="notifications-enabled" checked={settings.enabled} onCheckedChange={onEnabledChange} />
          </div>

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="browser-notifications">Browser notifications</Label>
              <p className="text-sm text-muted-foreground">Show system notifications even when tab is not active</p>
            </div>
            <Switch
              id="browser-notifications"
              checked={settings.browserNotifications}
              onCheckedChange={onBrowserNotificationsChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Auto-dismiss Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Auto-Dismiss</CardTitle>
          <CardDescription>Configure when notifications automatically dismiss</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="auto-dismiss">Enable auto-dismiss</Label>
              <p className="text-sm text-muted-foreground">Automatically mark notifications as read after a delay</p>
            </div>
            <Switch id="auto-dismiss" checked={settings.autoDismiss} onCheckedChange={onAutoDismissChange} />
          </div>

          {settings.autoDismiss && (
            <div className="space-y-3">
              <div className="flex justify-between">
                <Label>Auto-dismiss delay</Label>
                <span className="text-sm text-muted-foreground">{localDuration / 1000}s</span>
              </div>
              <Slider
                value={[localDuration]}
                onValueChange={onDurationChange}
                onValueCommit={onDurationCommit}
                min={1000}
                max={30000}
                step={1000}
                disabled={!settings.autoDismiss}
              />
              <p className="text-xs text-muted-foreground">How long to wait before auto-dismissing notifications</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Types */}
      <Card>
        <CardHeader>
          <CardTitle>Event Types</CardTitle>
          <CardDescription>Choose which types of events trigger notifications</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="flex items-start space-x-3">
              <Checkbox
                id="notify-success"
                checked={settings.notifyOnSuccess}
                onCheckedChange={(checked) => onNotifyOnSuccessChange(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="notify-success" className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Success events
                </Label>
                <p className="text-xs text-muted-foreground">Agent online, cron job completed, etc.</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="notify-error"
                checked={settings.notifyOnError}
                onCheckedChange={(checked) => onNotifyOnErrorChange(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="notify-error" className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  Error events
                </Label>
                <p className="text-xs text-muted-foreground">Agent offline, job failures, high error rates</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="notify-warning"
                checked={settings.notifyOnWarning}
                onCheckedChange={(checked) => onNotifyOnWarningChange(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="notify-warning" className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Warning events
                </Label>
                <p className="text-xs text-muted-foreground">Slow responses, resource warnings</p>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <Checkbox
                id="notify-info"
                checked={settings.notifyOnInfo}
                onCheckedChange={(checked) => onNotifyOnInfoChange(checked as boolean)}
              />
              <div className="space-y-1">
                <Label htmlFor="notify-info" className="flex items-center gap-2">
                  <Info className="h-4 w-4 text-blue-500" />
                  Info events
                </Label>
                <p className="text-xs text-muted-foreground">Skill activations, session events</p>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex items-start space-x-3">
            <Checkbox
              id="notify-agent-status"
              checked={settings.notifyOnAgentStatusChange}
              onCheckedChange={(checked) => onNotifyOnAgentStatusChange(checked as boolean)}
            />
            <div className="space-y-1">
              <Label htmlFor="notify-agent-status">Agent status changes</Label>
              <p className="text-xs text-muted-foreground">Get notified when agents go online or offline</p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="notify-new-log"
              checked={settings.notifyOnNewLog}
              onCheckedChange={(checked) => onNotifyOnNewLogChange(checked as boolean)}
            />
            <div className="space-y-1">
              <Label htmlFor="notify-new-log">New log entries</Label>
              <p className="text-xs text-muted-foreground">Get notified for new error and warning logs</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Notifications */}
      <Card>
        <CardHeader>
          <CardTitle>Test Notifications</CardTitle>
          <CardDescription>Send test notifications to verify your settings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => onTestNotification('success')}>
              <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
              Success
            </Button>
            <Button variant="outline" size="sm" onClick={() => onTestNotification('error')}>
              <XCircle className="h-4 w-4 mr-1 text-red-500" />
              Error
            </Button>
            <Button variant="outline" size="sm" onClick={() => onTestNotification('warning')}>
              <AlertTriangle className="h-4 w-4 mr-1 text-amber-500" />
              Warning
            </Button>
            <Button variant="outline" size="sm" onClick={() => onTestNotification('info')}>
              <Info className="h-4 w-4 mr-1 text-blue-500" />
              Info
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Clear History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Clear History
          </CardTitle>
          <CardDescription>Remove all notification history</CardDescription>
        </CardHeader>
        <CardContent>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive">
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Notifications
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Clear all notifications?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete all notification history. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onClearAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Clear All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onReset} disabled={!hasChanges || isSaving}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset
        </Button>
        <Button onClick={onSave} disabled={!hasChanges || isSaving}>
          <Save className="mr-2 h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </>
  );
}

export type { NotificationSettings };
