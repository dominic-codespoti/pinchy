'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Database, RefreshCw, Trash2 } from 'lucide-react';
import { useSystemStats, useVacuumDatabase, useClearCache } from '../hooks';
import { mockDatabaseStats } from '../utils';
import { formatBytes, formatDate } from '@/shared/lib/format';

export function DatabaseTab() {
  const { isLoading: statsLoading } = useSystemStats();
  const vacuumMutation = useVacuumDatabase();
  const clearCacheMutation = useClearCache();

  const isProcessing = vacuumMutation.isPending || clearCacheMutation.isPending;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Overview
          </CardTitle>
          <CardDescription>Current database size and statistics</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {statsLoading ? (
            <>
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-48" />
            </>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Size</span>
                <span className="text-lg font-semibold">
                  {formatBytes(mockDatabaseStats.size)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Tables</span>
                <span className="font-medium">{mockDatabaseStats.tables.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Last Optimized</span>
                <span className="font-medium">
                  {formatDate(mockDatabaseStats.lastVacuumed)}
                </span>
              </div>
              <Separator />
              <div className="flex gap-2">
                <Button
                  onClick={() => vacuumMutation.mutate()}
                  disabled={isProcessing}
                  className="gap-2"
                >
                  <RefreshCw className={`h-4 w-4 ${vacuumMutation.isPending ? 'animate-spin' : ''}`} />
                  Optimize
                </Button>
                <Button
                  variant="outline"
                  onClick={() => clearCacheMutation.mutate()}
                  disabled={isProcessing}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Clear Cache
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base sm:text-lg">Table Details</CardTitle>
          <CardDescription>Storage breakdown by table</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {mockDatabaseStats.tables.map((table) => (
              <div
                key={table.name}
                className="flex items-center justify-between py-2 border-b last:border-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium capitalize">{table.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    {table.rows.toLocaleString()} rows
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">
                  {formatBytes(table.size)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
