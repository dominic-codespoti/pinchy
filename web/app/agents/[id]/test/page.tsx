import { AgentTestPage } from '@/features/agents';

export default function Page({ params }: { params: { id: string } }) {
  return <AgentTestPage id={params.id} />;
}
