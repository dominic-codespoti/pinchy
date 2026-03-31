import { NotAvailable } from '@/shared/components/not-available';

// Thin shell - feature requires backend support
export default function AgentLogsPage() {
  return (
    <NotAvailable 
      feature="Agent Logs" 
      description="Agent log viewing requires backend support for log storage and retrieval."
      returnHref="/agents"
      returnLabel="Back to Agents"
    />
  );
}
