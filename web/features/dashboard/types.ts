import { LucideIcon } from 'lucide-react';
import { RawAgent } from '@/lib/validation/schemas';

export type { RawAgent } from '@/lib/validation/schemas';

export interface StatItem {
  id: string;
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

// Health check response from backend
export interface HealthResponse {
  status: string;
  version: string;
  uptime_secs: number;
  agents: number;
}

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

export interface RawCronJob {
  id: string;
  agent_id: string;
  name: string;
  schedule: string;
  message?: string;
  last_status?: string | null;
}

// Dashboard session type for activity feed
export interface DashboardSession {
  id: string;
  agent_id: string;
  title?: string;
  message_count: number;
  updated_at: number; // epoch milliseconds
}
