'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME, GC_TIME } from '@/lib/query-config';
import { getAllAgentReceipts, getSessionReceipts } from './api';
import { ReceiptGetResponse } from './types';

// ============================================================================
// Query Keys
// ============================================================================

export const receiptKeys = {
  all: ['receipts'] as const,
  agent: (agentId: string) => [...receiptKeys.all, 'agent', agentId] as const,
  session: (agentId: string, sessionId: string) =>
    [...receiptKeys.all, 'session', agentId, sessionId] as const,
};

// ============================================================================
// Hook Results
// ============================================================================

export interface UseAgentReceiptsResult {
  data: ReceiptGetResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseSessionReceiptsResult {
  data: ReceiptGetResponse | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to fetch all receipts for an agent (aggregated across all sessions)
 */
export function useAgentReceipts(agentId: string): UseAgentReceiptsResult {
  const { data, isLoading, error, refetch } = useQuery<ReceiptGetResponse, Error>({
    queryKey: receiptKeys.agent(agentId),
    queryFn: () => getAllAgentReceipts(agentId),
    staleTime: STALE_TIME.MEDIUM,
    gcTime: GC_TIME.SHORT,
    enabled: !!agentId,
  });

  // Show toast for errors
  useEffect(() => {
    if (error) {
      toast.error(`Failed to load receipts: ${error.message}`);
    }
  }, [error]);

  return {
    data: data || null,
    isLoading,
    error: error || null,
    refetch,
  };
}

/**
 * Hook to fetch receipts for a specific session
 */
export function useSessionReceipts(
  agentId: string,
  sessionId: string
): UseSessionReceiptsResult {
  const { data, isLoading, error, refetch } = useQuery<ReceiptGetResponse, Error>({
    queryKey: receiptKeys.session(agentId, sessionId),
    queryFn: () => getSessionReceipts(agentId, sessionId),
    staleTime: STALE_TIME.MEDIUM,
    gcTime: GC_TIME.SHORT,
    enabled: !!agentId && !!sessionId,
  });

  // Show toast for errors
  useEffect(() => {
    if (error) {
      toast.error(`Failed to load session receipts: ${error.message}`);
    }
  }, [error]);

  return {
    data: data || null,
    isLoading,
    error: error || null,
    refetch,
  };
}
