'use client';

import { NotAvailable } from '@/shared/components/not-available';

interface WebhooksPageProps {
  isAvailable?: boolean;
}

export function WebhooksPage({ isAvailable = false }: WebhooksPageProps) {
  if (!isAvailable) {
    return (
      <NotAvailable
        feature="Webhooks"
        description="Webhook management requires backend support for webhook registration and delivery."
        returnHref="/settings"
        returnLabel="Back to Settings"
      />
    );
  }

  return (
    <>
      <div>
        <h1 className="text-xl font-bold">Webhooks</h1>
        <p className="text-sm text-muted-foreground">Configure webhook endpoints and deliveries</p>
      </div>
      {/* Webhook configuration UI would go here */}
    </>
  );
}
