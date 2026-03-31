import { AgentDetailPage } from '@/features/agents';

export default function Page({ params }: { params: { id: string } }) {
  return <AgentDetailPage id={params.id} />;
}
