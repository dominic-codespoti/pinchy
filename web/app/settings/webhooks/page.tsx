import { NotAvailable } from '@/shared/components/not-available';

// Thin shell - feature requires backend support
export default function WebhooksPage() {
  return (
    <NotAvailable
      feature="Webhooks"
      description="Webhook management requires backend support for webhook registration and delivery."
      returnHref="/settings"
      returnLabel="Back to Settings"
    />
  );
}
