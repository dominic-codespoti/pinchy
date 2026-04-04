import { AgentDetail } from '@/features/agents';
import { Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

interface PageProps {
  params?: Promise<{ id: string }>;
}

function AgentDetailLoading() {
  return (
    <div className="container mx-auto p-6">
      <Skeleton className="mb-4 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96" />
      <Skeleton className="mb-4 h-10 w-full" />
      <Skeleton className="h-[400px] w-full" />
    </div>
  );
}

export function generateStaticParams() {
  return [{ id: 'placeholder' }];
}

export default async function AgentDetailPage({ params }: PageProps) {
  const { id } = await (params ?? Promise.resolve({ id: '' }));
  return (
    <Suspense fallback={<AgentDetailLoading />}>
      <AgentDetail id={id} />
    </Suspense>
  );
}
