import { LucideIcon } from 'lucide-react';

export interface StatItem {
  id: string;
  title: string;
  value: string | number;
  description: string;
  icon: LucideIcon;
  tone?: 'default' | 'success' | 'warning' | 'danger';
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

// Raw API response shapes from backend
export interface RawAgent {
  id: string;
  model?: string;
  has_heartbeat?: boolean;
  heartbeat_secs?: number | null;
}

export interface RawCronJob {
  id: string;
  agent_id: string;
  name: string;
  schedule: string;
  message?: string;
  last_status?: string | null;
}
