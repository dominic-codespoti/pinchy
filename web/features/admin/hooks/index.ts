"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/shared/api/client";

export interface ModelRequest {
  id: string;
  model: string;
  provider: string;
  timestamp: string | number;
  estimated_tokens: number;
  message_count: number;
  function_count: number;
}

export interface ModelRequestDetail extends ModelRequest {
  messages: unknown[];
  functions: unknown[];
}

export function useModelRequests() {
  return useQuery({
    queryKey: ["model-requests"],
    queryFn: async () => {
      const data = await fetchApi("/debug/model-requests");
      return data as { requests: ModelRequest[] };
    },
  });
}

export function useModelRequestDetail(requestId: string) {
  return useQuery({
    queryKey: ["model-requests", requestId],
    queryFn: async () => {
      const data = await fetchApi(`/debug/model-requests/${requestId}`);
      return data as ModelRequestDetail;
    },
  });
}
