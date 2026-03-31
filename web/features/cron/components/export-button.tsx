'use client';

import { useCronJobs } from '../hooks';
import { ExportDialog } from '@/shared/components/export/export-dialog';
import { exportCronJobs, ExportFormat, DateRange } from '@/shared/lib/export';

export function ExportCronJobsButton() {
  const { data: jobs } = useCronJobs();

  const handleExport = (format: ExportFormat, dateRange: DateRange) => {
    if (jobs) {
      exportCronJobs(jobs, format, dateRange);
    }
  };

  return (
    <ExportDialog
      entity="cron"
      entityName="Cron Jobs"
      onExport={handleExport}
    />
  );
}

ExportCronJobsButton.displayName = 'ExportCronJobsButton';
