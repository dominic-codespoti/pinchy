'use client';

import { ReceiptsList } from './receipts-list';
import { ReceiptDetail } from './receipt-detail';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Receipt, ArrowLeft, ExternalLink } from 'lucide-react';

interface ReceiptsTabProps {
  agentId: string;
}

export function ReceiptsTab({ agentId }: ReceiptsTabProps) {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  if (selectedSessionId) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => setSelectedSessionId(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to All Receipts
          </Button>
        </div>
        <ReceiptDetail agentId={agentId} sessionId={selectedSessionId} />
      </div>
    );
  }

  return (
    <ReceiptsList 
      agentId={agentId} 
      onBack={undefined}
    />
  );
}
