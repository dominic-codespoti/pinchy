/**
 * Cron feature types
 */

import type { CronJobItem, CronRunItem } from '@/src/lib/bindings';

// Re-export bindings types for consistency with backend
export type BackendCronJob = CronJobItem;
export type JobRun = CronRunItem;

export interface CronJob {
  id: string;
  agentId: string;
  schedule: string;
  message: string;
  lastStatus: boolean;
  lastRun?: string;
  nextRun?: string;
}

export interface RawCronJob {
  id: string;
  agent_id: string;
  name: string;
  schedule: string;
  message?: string;
  kind?: 'Recurring' | 'OneShot';
  depends_on?: string[];
  max_retries?: number;
  retry_delay_secs?: number;
  retry_count?: number;
  last_status?: string | null;
}

export interface CreateCronJobInput {
  agent_id: string;
  name?: string;
  schedule: string;
  message: string;
  one_shot?: boolean;
  depends_on?: string[];
  max_retries?: number;
  retry_delay_secs?: number;
}

export interface UpdateCronJobInput {
  name?: string;
  schedule?: string;
  message?: string;
  one_shot?: boolean;
  depends_on?: string[];
  max_retries?: number;
  retry_delay_secs?: number;
  enabled?: boolean;
}

// Minimal agent info for cron feature
export interface CronAgent {
  id: string;
  name: string;
}
