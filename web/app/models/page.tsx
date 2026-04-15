'use client';

import { PageContainer } from '@/shared/components/page-container';
import { ModelsPage } from '@/features/settings';

export default function ModelsRoute() {
  return (
    <PageContainer className="space-y-6">
      <ModelsPage />
    </PageContainer>
  );
}
