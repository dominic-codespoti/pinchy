'use client';

import { QueryClient, QueryClientProvider, QueryCache, MutationCache } from '@tanstack/react-query';
import { useState, ReactNode } from 'react';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const [queryClient] = useState(() => new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        console.error(`[Query Error] Query key: ${query.queryKey}`, {
          error,
          timestamp: new Date().toISOString(),
        });
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, variables, context, mutation) => {
        console.error(`[Mutation Error]`, {
          error,
          variables,
          context,
          mutationKey: mutation.options.mutationKey,
          timestamp: new Date().toISOString(),
        });
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 5000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const err = error as Error;
          const message = err.message.toLowerCase();
          // Don't retry on 4xx errors
          if (message.includes('404') || message.includes('403') || message.includes('401')) {
            return false;
          }
          // Retry up to 3 times for network/server errors
          return failureCount < 3;
        },
        retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      },
      mutations: {
        retry: 1,
        retryDelay: 1000,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
