'use client';

import { Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function SettingsLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-32" />
      <Skeleton className="h-48" />
      <Skeleton className="h-32" />
    </div>
  );
}

interface SettingsPageProps {
  children?: React.ReactNode;
  isLoading?: boolean;
}

export function SettingsPage({ children, isLoading }: SettingsPageProps) {
  if (isLoading) {
    return (
      <>
        <div className="flex items-center gap-3">
          <Settings className="h-6 w-6 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-bold">General Settings</h1>
            <p className="text-sm text-muted-foreground">Configure basic application settings</p>
          </div>
        </div>
        <SettingsLoading />
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-bold">General Settings</h1>
          <p className="text-sm text-muted-foreground">Configure basic application settings</p>
        </div>
      </div>

      {/* Content */}
      {children}
    </>
  );
}
