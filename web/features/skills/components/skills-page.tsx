'use client';

import { useState } from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { PageContainer } from '@/shared/components/page-container';
import { Button } from '@/components/ui/button';
import { useSkills } from '../hooks';
import { SkillsList } from './skills-list';
import { CreateSkillDialog } from './create-skill-dialog';

export function SkillsPage() {
  const { data: skills, isLoading, refetch } = useSkills();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <PageContainer className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Lightbulb className="h-6 w-6" />
            Skills
          </h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Available skill modules for agents
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Skill
        </Button>
      </div>
      <SkillsList skills={skills} loading={isLoading} onRefetch={() => { refetch(); }} />
      <CreateSkillDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageContainer>
  );
}
