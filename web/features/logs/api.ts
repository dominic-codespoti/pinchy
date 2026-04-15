/**
 * Logs feature API functions
 */

import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { LogEntry, LogLevel } from '@/shared/types/common';
import { PAGINATION } from '@/lib/query-config';

// Backend response types for persisted logs (from SQLite)
interface PersistedLogEntry {
  id: number;
  type: string;
  level: string;
  target: string;
  message: string;
  fields?: Record<string, unknown>;
  ts: string;
  timestamp: number;
}

interface PersistedLogsResponse {
  logs: PersistedLogEntry[];
  total: number;
  has_more: boolean;
  next_offset: number;
  retention: string;
}

// Backend response types for recent logs (in-memory buffer)
interface RecentLogEntry {
  type: string;
  level: string;
  target: string;
  message: string;
  fields?: Record<string, unknown>;
  ts: string;
}

interface RecentLogsResponse {
  logs: RecentLogEntry[];
  has_more: boolean;
  buffer_capacity: number;
  retention: string;
}

/**
 * Transform backend log level to frontend LogLevel.
 * Backend: ERROR, WARN, INFO, DEBUG, TRACE
 * Frontend: 'error' | 'warn' | 'info'
 */
function normalizeLevel(level: string): LogLevel {
  const normalized = level.toLowerCase();
  if (normalized === 'error' || normalized === 'warn' || normalized === 'info') {
    return normalized as LogLevel;
  }
  // Default to info for DEBUG, TRACE, or unknown levels
  return 'info';
}

function transformPersistedLogEntry(raw: PersistedLogEntry): LogEntry {
  return {
    id: String(raw.id),
    timestamp: raw.ts,
    level: normalizeLevel(raw.level),
    agentId: raw.target,
    message: raw.message,
    metadata: raw.fields,
  };
}

function transformRecentLogEntry(raw: RecentLogEntry, index: number): LogEntry {
  return {
    id: `recent-${index}-${raw.ts}`,
    timestamp: raw.ts,
    level: normalizeLevel(raw.level),
    agentId: raw.target,
    message: raw.message,
    metadata: raw.fields,
  };
}

// Backend has agent-specific logs endpoint
export async function getAgentLogs(agentId: string, limit?: number): Promise<LogEntry[]> {
  try {
    const response = await fetchApi<{ logs: unknown[] }>(
      `/api/agents/${encodeURIComponent(agentId)}/logs?limit=${limit || PAGINATION.DEFAULT_LIMIT}`
    );
    return (response.logs || []).map((log: unknown, index: number) => ({
      id: `agent-${agentId}-${index}`,
      timestamp: new Date().toISOString(),
      level: 'info' as LogLevel,
      agentId,
      message: typeof log === 'string' ? log : JSON.stringify(log),
    }));
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Get system logs from the backend.
 * Supports filtering by level and pagination.
 */
export async function getSystemLogs(
  limit?: number,
  level?: 'ERROR' | 'WARN' | 'INFO' | 'DEBUG' | 'TRACE'
): Promise<LogEntry[]> {
  try {
    const params = new URLSearchParams();
    if (limit) {
      params.set('limit', String(limit));
    }
    if (level) {
      params.set('level', level);
    }

    const queryString = params.toString();
    const url = `/api/logs${queryString ? `?${queryString}` : ''}`;

    const response = await fetchApi<PersistedLogsResponse>(url);
    return (response.logs || []).map(transformPersistedLogEntry);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

/**
 * Get recent system logs from in-memory buffer (faster, but lost on restart).
 * Good for real-time log streaming.
 */
export async function getRecentSystemLogs(limit?: number): Promise<LogEntry[]> {
  try {
    const params = new URLSearchParams();
    if (limit) {
      params.set('limit', String(limit));
    }

    const queryString = params.toString();
    const url = `/api/logs/recent${queryString ? `?${queryString}` : ''}`;

    const response = await fetchApi<RecentLogsResponse>(url);
    return (response.logs || []).map(transformRecentLogEntry);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}
