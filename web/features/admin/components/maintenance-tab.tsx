'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Settings,
  CheckCircle,
  AlertCircle,
  XCircle,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { useSetMaintenanceMode } from '../hooks';
import { maintenanceModeOptions } from '../utils';
import { MaintenanceMode } from '../types';

export function MaintenanceTab() {
  const [maintenanceMode, setMaintenanceMode] = useState<MaintenanceMode>('off');
  const setMaintenanceModeMutation = useSetMaintenanceMode();

  const handleMaintenanceModeChange = (value: MaintenanceMode) => {
    setMaintenanceMode(value);
    setMaintenanceModeMutation.mutate(value);
  };

  const IconComponent = {
    CheckCircle,
    AlertCircle,
    XCircle,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base sm:text-lg flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Maintenance Mode
        </CardTitle>
        <CardDescription>Control system availability and maintenance status</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Maintenance Status</Label>
              <p className="text-sm text-muted-foreground">Control system availability</p>
            </div>
            <Select
              value={maintenanceMode}
              onValueChange={(v) => handleMaintenanceModeChange(v as MaintenanceMode)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {maintenanceModeOptions.map((option) => {
                  const Icon = IconComponent[option.icon as keyof typeof IconComponent];
                  return (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${option.color}`} />
                        {option.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {maintenanceMode !== 'off' && (
            <div className="p-4 border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm text-amber-900 dark:text-amber-100">
                  Maintenance Mode Active
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  {maintenanceMode === 'full'
                    ? 'All non-admin access is disabled. Only administrators can access the system.'
                    : 'Some features may be unavailable. API endpoints are operating in read-only mode.'}
                </p>
              </div>
            </div>
          )}
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="font-medium text-sm">Version Information</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm text-muted-foreground">Application Version</span>
              <Badge variant="secondary">v1.0.0</Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm text-muted-foreground">Build Date</span>
              <span className="text-sm font-medium">2025-03-29</span>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm text-muted-foreground">Node Version</span>
              <Badge variant="outline">v20.11.0</Badge>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <span className="text-sm text-muted-foreground">Rust Version</span>
              <Badge variant="outline">v1.75.0</Badge>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <h4 className="font-medium text-sm text-destructive">Danger Zone</h4>
          <div className="border border-destructive/20 rounded-lg p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="font-medium text-sm">Reset System</p>
                <p className="text-xs text-muted-foreground">
                  Clear all data and restore factory defaults
                </p>
              </div>
              <Button variant="destructive" size="sm" className="gap-2">
                <Trash2 className="h-4 w-4" />
                Reset System
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
