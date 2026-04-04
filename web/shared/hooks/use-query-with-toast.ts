/**
 * useQueryWithToast Hook
 *
 * A wrapper around useQuery that automatically shows error toast notifications.
 * Eliminates the need to manually add useEffect error handling boilerplate in every hook.
 *
 * @example
 * // Before
 * export function useAgents() {
 *   const { data, error, isLoading } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents });
 *   useEffect(() => {
 *     if (error) {
 *       toast.error(`Failed to load agents: ${error.message}`);
 *     }
 *   }, [error]);
 *   return { data, error, isLoading };
 * }
 *
 * // After
 * export function useAgents() {
 *   return useQueryWithToast(['agents'], fetchAgents, 'Failed to load agents');
 * }
 */

'use client';

import { useEffect } from 'react';
import {
  useQuery,
  type QueryKey,
  type QueryFunction,
  type UseQueryOptions,
  type UseQueryResult,
} from '@tanstack/react-query';
import { toast } from 'sonner';

export interface UseQueryWithToastOptions<T>
  extends Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'> {
  /** Custom error message prefix (e.g., "Failed to load agents") */
  errorMessage: string;
  /** Whether to show toast on error. Defaults to true. */
  showToastOnError?: boolean;
}

export function useQueryWithToast<T>(
  queryKey: QueryKey,
  queryFn: QueryFunction<T>,
  errorMessage: string,
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'>
): UseQueryResult<T, Error> {
  const query = useQuery<T, Error, T, QueryKey>({
    queryKey,
    queryFn,
    ...options,
  });

  useEffect(() => {
    if (query.error) {
      toast.error(`${errorMessage}: ${query.error.message}`);
    }
  }, [query.error, errorMessage]);

  return query;
}

/**
 * Simplified version that returns a custom object instead of full UseQueryResult
 * Useful when you need to remap field names (e.g., data -> agents)
 */
export interface UseQueryWithToastMappedResult<T> {
  data: T | undefined;
  isLoading: boolean;
  error: Error | null;
}

export function useQueryWithToastMapped<T>(
  queryKey: QueryKey,
  queryFn: QueryFunction<T>,
  errorMessage: string,
  options?: Omit<UseQueryOptions<T, Error, T, QueryKey>, 'queryKey' | 'queryFn'>
): UseQueryWithToastMappedResult<T> {
  const query = useQueryWithToast(queryKey, queryFn, errorMessage, options);

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error || null,
  };
}
