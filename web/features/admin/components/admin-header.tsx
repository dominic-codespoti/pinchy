'use client';

import { Badge } from '@/components/ui/badge';
import { Server } from 'lucide-react';

export function AdminHeader() {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold">Administration</h1>
        <p className="text-sm text-muted-foreground mt-1">
          System management and maintenance
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="gap-1">
          <Server className="h-3 w-3" />
          v1.0.0
        </Badge>
      </div>
    </div>
  );
}
