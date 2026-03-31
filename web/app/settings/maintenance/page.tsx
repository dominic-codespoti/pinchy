import { NotAvailable } from '@/shared/components/not-available';

// Thin shell - feature requires backend support
export default function MaintenancePage() {
  return (
    <NotAvailable
      feature="Maintenance Mode"
      description="Maintenance mode management requires backend support for system-wide maintenance windows."
      returnHref="/settings"
      returnLabel="Back to Settings"
    />
  );
}
