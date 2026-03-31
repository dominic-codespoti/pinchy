'use client';

import { NotAvailable } from '@/shared/components/not-available';

interface MaintenancePageProps {
  isAvailable?: boolean;
}

export function MaintenancePage({ isAvailable = false }: MaintenancePageProps) {
  if (!isAvailable) {
    return (
      <NotAvailable
        feature="Maintenance Mode"
        description="Maintenance mode management requires backend support for system-wide maintenance windows."
        returnHref="/settings"
        returnLabel="Back to Settings"
      />
    );
  }

  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Maintenance</h1>
        <p className="text-sm text-muted-foreground">Manage system maintenance windows</p>
      </div>
      {/* Maintenance configuration UI would go here */}
    </>
  );
}
