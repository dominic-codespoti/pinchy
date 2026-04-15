/**
 * Logs feature types
 */

import { LogEntry, LogLevel, RawLogEntry } from '@/shared/types/common';

export type { LogEntry, LogLevel, RawLogEntry };

export interface LogFilters {
  search: string;
  level: LogLevel | 'all';
  agentId: string | 'all';
  startDate?: Date;
  endDate?: Date;
}
