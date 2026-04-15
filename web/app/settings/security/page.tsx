'use client';

import { useAuth } from '@/features/auth';
import { SecurityPage } from '@/features/settings';

export default function SecuritySettingsPage() {
  const { user } = useAuth();
  
  // Convert user connected accounts to the format expected by SecurityPage
  const connectedAccounts = user?.connectedAccounts.map(acc => ({
    provider: acc.provider,
    email: acc.email,
    connectedAt: acc.connectedAt,
  })) || [];
  
  return (
    <SecurityPage 
      connectedAccounts={connectedAccounts}
    />
  );
}
