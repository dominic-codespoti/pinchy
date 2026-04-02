/**
 * Logs feature API functions
 */

import { fetchApi, isNotFoundError } from '@/shared/api/client';
import { LogEntry, RawLogEntry } from '@/shared/types/common';

function transformLogEntry(raw: RawLogEntry): LogEntry {
  return {
    id: raw.id,
    timestamp: raw.timestamp,
    level: raw.level,
    agentId: raw.agent_id,
    message: raw.message,
    metadata: raw.metadata,
  };
}

// Backend has agent-specific logs endpoint
export async function getAgentLogs(agentId: string, limit?: number): Promise<LogEntry[]> {
  try {
    const response = await fetchApi<{ logs: RawLogEntry[] }>(
      `/api/agents/${encodeURIComponent(agentId)}/logs?limit=${limit || 100}`
    );
    return (response.logs || []).map(transformLogEntry);
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}

// Backend does not have system logs endpoint
export async function getSystemLogs(limit?: number): Promise<LogEntry[]> {
  try {
    // Backend doesn't have a system logs endpoint
    // Return empty array for now
    return [];
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }
    throw error;
  }
}
