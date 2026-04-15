'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/shared/components/page-container';
import {
  useCronJobs,
  useCronAgents,
  useCreateCronJob,
  useUpdateCronJob,
  useDeleteCronJob,
  useToggleCronJob,
  useTriggerCronJob,
} from '../hooks';
import { CronJob } from '../types';
import { JobsTable } from './jobs-table';
import { JobDialog, JobFormData } from './job-dialog';
import { CronEmptyState } from './empty-state';
import { ExportCronJobsButton } from './export-button';

export function CronPage() {
  const { data: jobs, isLoading } = useCronJobs();
  const { data: agents } = useCronAgents();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<CronJob | null>(null);

  const createCronJob = useCreateCronJob();
  const updateCronJob = useUpdateCronJob();
  const deleteCronJob = useDeleteCronJob();
  const toggleCronJob = useToggleCronJob();
  const triggerCronJob = useTriggerCronJob();

  const handleNewJob = () => {
    setEditingJob(null);
    setDialogOpen(true);
  };

  const handleEditJob = (job: CronJob) => {
    setEditingJob(job);
    setDialogOpen(true);
  };

  const handleSave = async (formData: JobFormData) => {
    if (editingJob) {
      await updateCronJob.mutateAsync({
        id: editingJob.id,
        data: {
          schedule: formData.schedule,
          message: formData.message,
        },
      });
    } else {
      await createCronJob.mutateAsync({
        agent_id: formData.agentId,
        schedule: formData.schedule,
        message: formData.message,
      });
    }
    setDialogOpen(false);
  };

  const handleToggleStatus = async (job: CronJob) => {
    await toggleCronJob.mutateAsync({ id: job.id, enabled: !job.lastStatus });
  };

  const handleTrigger = async (job: CronJob) => {
    await triggerCronJob.mutateAsync(job.id);
  };

  const handleDelete = async (job: CronJob) => {
    await deleteCronJob.mutateAsync(job.id);
  };

  const isEmpty = !isLoading && (jobs?.length === 0);

  return (
    <PageContainer className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Cron Jobs</h1>
          <p className="text-muted-foreground mt-1 text-sm sm:text-base">
            Schedule automated tasks for your agents
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <ExportCronJobsButton />
          <Button onClick={handleNewJob} className="w-full sm:w-auto touch-target">
            <Plus className="h-4 w-4 mr-2" />
            New Job
          </Button>
        </div>
      </div>

      {isEmpty ? (
        <CronEmptyState onCreate={handleNewJob} />
      ) : (
        <JobsTable
          jobs={jobs || []}
          agents={agents}
          loading={isLoading}
          onEdit={handleEditJob}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
          onTrigger={handleTrigger}
        />
      )}

      <JobDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        job={editingJob}
        agents={agents}
        onSave={handleSave}
      />
    </PageContainer>
  );
}
