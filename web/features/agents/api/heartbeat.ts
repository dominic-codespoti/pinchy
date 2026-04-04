/**
 * Heartbeat API - Agent heartbeat status operations
 * Endpoints from src/gateway/handlers/heartbeat.rs
 */

import { fetchApi } from '@/shared/api/client';
import type { HeartbeatStatusResponse, HeartbeatStatusItem } from '@/src/lib/bindings';
import type { HeartbeatStatusData } from '../types';

const API_BASE = '/api/heartbeat';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Transform raw heartbeat status to frontend format
 */
function transformHeartbeatStatus(raw: HeartbeatStatusItem): HeartbeatStatusData {
  return {
    agentId: raw.agent_id,
    enabled: raw.enabled,
    health: raw.health as 'OK' | 'MISSED',
    lastTick: raw.last_tick ? new Date(Number(raw.last_tick) * 1000).toISOString() : null,
    nextTick: raw.next_tick ? new Date(Number(raw.next_tick) * 1000).toISOString() : null,
    intervalSecs: raw.interval_secs ? Number(raw.interval_secs) : null,
    messagePreview: raw.message_preview ?? undefined,
    latestSession: typeof raw.latest_session === 'string' && raw.latest_session
      ? { id: raw.latest_session }
      : undefined,
  };
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get heartbeat status for a single agent
 * GET /api/heartbeat/status/:agent_id
 */
export async function getAgentHeartbeat(agentId: string): Promise<HeartbeatStatusData> {
  const response = await fetchApi<HeartbeatStatusItem>(
    `${API_BASE}/status/${encodeURIComponent(agentId)}`
  );
  return transformHeartbeatStatus(response);
}

/**
 * Get heartbeat status for all agents
 * GET /api/heartbeat/status
 */
export async function getAllAgentsHeartbeat(): Promise<HeartbeatStatusData[]> {
  const response = await fetchApi<HeartbeatStatusResponse>(`${API_BASE}/status`);
  return response.agents.map(transformHeartbeatStatus);
}

/**
 * Get heartbeat status for multiple specific agents
 * Helper function to batch fetch heartbeats
 */
export async function getAgentsHeartbeat(
  agentIds: string[]
): Promise<Map<string, HeartbeatStatusData>> {
  const allHeartbeats = await getAllAgentsHeartbeat();
  const result = new Map<string, HeartbeatStatusData>();

  for (const hb of allHeartbeats) {
    if (agentIds.includes(hb.agentId)) {
      result.set(hb.agentId, hb);
    }
  }

  return result;
}

/**
 * Check if an agent's heartbeat is healthy
 */
export function isHeartbeatHealthy(status: HeartbeatStatusData): boolean {
  return status.enabled && status.health === 'OK';
}

/**
 * Check if an agent's heartbeat has issues
 */
export function isHeartbeatMissed(status: HeartbeatStatusData): boolean {
  return status.enabled && status.health === 'MISSED';
}

/**
 * Get time until next heartbeat
 * Returns null if heartbeat is not enabled or next tick unknown
 */
export function getTimeToNextHeartbeat(status: HeartbeatStatusData): number | null {
  if (!status.enabled || !status.nextTick) {
    return null;
  }

  const nextTick = new Date(status.nextTick).getTime();
  const now = Date.now();
  const diff = nextTick - now;

  return Math.max(0, diff);
}

/**
 * Format heartbeat interval for display
 */
export function formatHeartbeatInterval(seconds: number | null): string {
  if (seconds === null || seconds === undefined) {
    return 'Disabled';
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
}
