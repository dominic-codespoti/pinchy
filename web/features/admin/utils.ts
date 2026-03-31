import { LogLevelOption, MaintenanceModeOption } from './types';

export const logLevelOptions: LogLevelOption[] = [
  { value: 'debug', label: 'Debug (Verbose)', description: 'Verbose logging', color: 'bg-blue-500' },
  { value: 'info', label: 'Info (Normal)', description: 'Normal logging', color: 'bg-green-500' },
  { value: 'warn', label: 'Warning (Issues only)', description: 'Warning logging', color: 'bg-amber-500' },
  { value: 'error', label: 'Error (Critical only)', description: 'Error logging', color: 'bg-red-500' },
];

export const maintenanceModeOptions: MaintenanceModeOption[] = [
  { value: 'off', label: 'Operational', icon: 'CheckCircle', color: 'text-green-500' },
  { value: 'partial', label: 'Partial Degraded', icon: 'AlertCircle', color: 'text-amber-500' },
  { value: 'full', label: 'Full Maintenance', icon: 'XCircle', color: 'text-red-500' },
];

export const mockDatabaseStats = {
  size: 1024 * 1024 * 150, // 150MB
  tables: [
    { name: 'agents', rows: 12, size: 1024 * 50 },
    { name: 'sessions', rows: 156, size: 1024 * 1024 * 2 },
    { name: 'messages', rows: 3420, size: 1024 * 1024 * 45 },
    { name: 'cron_jobs', rows: 8, size: 1024 * 10 },
    { name: 'memories', rows: 234, size: 1024 * 1024 * 15 },
    { name: 'skills', rows: 25, size: 1024 * 500 },
  ],
  lastVacuumed: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
};

export const mockBackups = [
  {
    id: 'backup-1',
    createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    size: 1024 * 1024 * 145,
    status: 'complete' as const,
    type: 'automatic' as const,
  },
  {
    id: 'backup-2',
    createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    size: 1024 * 1024 * 142,
    status: 'complete' as const,
    type: 'automatic' as const,
  },
];
