import { LucideIcon } from 'lucide-react';
import type { AgentListItem } from '@/src/lib/bindings';

export type { AgentListItem } from '@/src/lib/bindings';

export interface StatItem {
  id: string;
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

// Health check response from backend - re-export from canonical source
export type { HealthResponse } from '@/src/lib/bindings';

// Dashboard-specific Agent type (minimal fields needed)
export interface DashboardAgent {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  hasHeartbeat?: boolean;
  lastHeartbeatAt?: string;
  config: { model?: string };
}

// Dashboard-specific CronJob type (minimal fields needed)
export interface DashboardCronJob {
  id: string;
  agentId: string;
  schedule: string;
  message: string;
  lastStatus: boolean;
}

// RawCronJob type - re-export from cron feature for consistency
export type { RawCronJob } from '@/features/cron/types';

// Dashboard session type for activity feed
export interface DashboardSession {
  id: string;
  agent_id: string;
  title?: string;
  message_count: number;
  updated_at: number; // epoch milliseconds
}
