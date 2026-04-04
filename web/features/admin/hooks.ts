"use client";

import { useQuery } from '@tanstack/react-query';
import { ModelRequestsResponse, ModelRequestDetail } from './types/model-requests';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || '';

async function fetchModelRequests(): Promise<ModelRequestsResponse> {
  const res = await fetch(`${API_BASE}/api/debug/model-requests`);
  if (!res.ok) {
    throw new Error('Failed to fetch model requests');
  }
  return res.json();
}

async function fetchModelRequestDetail(requestId: string): Promise<ModelRequestDetail> {
  const res = await fetch(`${API_BASE}/api/debug/model-requests/${requestId}`);
  if (!res.ok) {
    throw new Error('Failed to fetch model request detail');
  }
  return res.json();
}

export function useModelRequests() {
  const { data, isLoading, error } = useQuery<ModelRequestsResponse, Error>({
    queryKey: ['model-requests'],
    queryFn: fetchModelRequests,
    refetchInterval: 5000, // Refetch every 5 seconds
  });

  return {
    data,
    isLoading,
    error,
  };
}

export function useModelRequestDetail(requestId: string) {
  const { data, isLoading, error } = useQuery<ModelRequestDetail, Error>({
    queryKey: ['model-request', requestId],
    queryFn: () => fetchModelRequestDetail(requestId),
    enabled: !!requestId,
  });

  return {
    data,
    isLoading,
    error,
  };
}
