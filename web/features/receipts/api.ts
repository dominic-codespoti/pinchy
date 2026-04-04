/**
 * Receipts API - Tool call receipt operations
 * Endpoints from src/gateway/handlers/receipts.rs
 */

import { fetchApi } from '@/shared/api/client';
import {
  ReceiptsListResponse,
  ReceiptGetResponse,
} from './types';

const API_BASE = '/api/agents';

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get list of receipt files for an agent
 * GET /api/agents/:id/receipts
 * Returns list of receipt file references, not the actual receipt data
 */
export async function getAgentReceipts(agentId: string): Promise<ReceiptsListResponse> {
  return await fetchApi<ReceiptsListResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/receipts`,
    undefined
  );
}

/**
 * Get actual receipt data for a specific session
 * GET /api/agents/:id/receipts/:session_id
 * Returns the full TurnReceipt data
 */
export async function getSessionReceipts(
  agentId: string,
  sessionId: string
): Promise<ReceiptGetResponse> {
  // Remove file extension if present
  const cleanSessionId = sessionId
    .replace(/\.receipts\.jsonl$/, '')
    .replace(/\.jsonl$/, '');

  return await fetchApi<ReceiptGetResponse>(
    `${API_BASE}/${encodeURIComponent(agentId)}/receipts/${encodeURIComponent(cleanSessionId)}`,
    undefined
  );
}

/**
 * Get all receipt data for an agent by fetching each session's receipts
 * This aggregates all receipt data across all sessions
 */
export async function getAllAgentReceipts(agentId: string): Promise<ReceiptGetResponse> {
  // First get the list of receipt files
  const listResponse = await getAgentReceipts(agentId);
  
  // If no receipts, return empty result
  if (listResponse.receipts.length === 0) {
    return { file: '', receipts: [] };
  }

  // Fetch receipts for each session and aggregate
  const allReceipts: ReceiptGetResponse['receipts'] = [];
  
  for (const receiptItem of listResponse.receipts) {
    try {
      // Extract session ID from filename (e.g., "session-id.receipts.jsonl" -> "session-id")
      const sessionId = receiptItem.file.replace(/\.receipts\.jsonl$/, '');
      const sessionReceipts = await getSessionReceipts(agentId, sessionId);
      allReceipts.push(...sessionReceipts.receipts);
    } catch (error) {
      // Skip sessions that fail to load
      console.warn(`Failed to load receipts for session ${receiptItem.file}:`, error);
    }
  }

  // Sort by started_at descending (most recent first)
  allReceipts.sort((a, b) => b.started_at - a.started_at);

  return {
    file: 'aggregated',
    receipts: allReceipts,
  };
}
