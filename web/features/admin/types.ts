export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type MaintenanceMode = 'off' | 'partial' | 'full';
export type BackupStatus = 'complete' | 'pending' | 'failed';
export type BackupType = 'automatic' | 'manual';

export interface DatabaseTable {
  name: string;
  rows: number;
  size: number;
}

export interface DatabaseStats {
  size: number;
  tables: DatabaseTable[];
  lastVacuumed: string;
}

export interface Backup {
  id: string;
  createdAt: string;
  size: number;
  status: BackupStatus;
  type: BackupType;
}

export interface SystemStats {
  totalAgents: number;
  totalSessions: number;
  totalMessages: number;
  storageUsage: number;
  uptime: number;
}

export interface LogLevelOption {
  value: LogLevel;
  label: string;
  description: string;
  color: string;
}

export interface MaintenanceModeOption {
  value: MaintenanceMode;
  label: string;
  icon: string;
  color: string;
}
