'use client';

import { PageContainer } from '@/shared/components/page-container';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Database,
  HardDrive,
  Activity,
  Settings,
} from 'lucide-react';
import { AdminHeader } from './admin-header';
import { SystemStats } from './system-stats';
import { DatabaseTab } from './database-tab';
import { BackupsTab } from './backups-tab';
import { LogsTab } from './logs-tab';
import { MaintenanceTab } from './maintenance-tab';

export function AdminPage() {
  return (
    <PageContainer className="space-y-6">
      <AdminHeader />

      <SystemStats />

      <Tabs defaultValue="database" className="space-y-4">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="database" className="gap-2">
            <Database className="h-4 w-4" />
            Database
          </TabsTrigger>
          <TabsTrigger value="backups" className="gap-2">
            <HardDrive className="h-4 w-4" />
            Backups
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Activity className="h-4 w-4" />
            Logs
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="gap-2">
            <Settings className="h-4 w-4" />
            Maintenance
          </TabsTrigger>
        </TabsList>

        <TabsContent value="database" className="space-y-4">
          <DatabaseTab />
        </TabsContent>

        <TabsContent value="backups" className="space-y-4">
          <BackupsTab />
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          <LogsTab />
        </TabsContent>

        <TabsContent value="maintenance" className="space-y-4">
          <MaintenanceTab />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
