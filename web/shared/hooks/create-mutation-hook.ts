/**
 * Mutation hook factory for eliminating boilerplate
 * Provides consistent toast notifications and query invalidation
 */

import {
  useMutation as useTanStackMutation,
  useQueryClient,
  QueryKey,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import { MutationOptions } from '@/shared/types/mutation';

export interface CreateMutationOptions<TData, TError, TVariables> {
  /** The mutation function to call */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /** Toast message on success */
  successMessage: string;
  /** Error prefix for toast message */
  errorPrefix: string;
  /** Query keys to invalidate on success */
  queryKeysToInvalidate?: QueryKey[];
}

/**
 * Factory function to create standardized mutation hooks.
 * Eliminates duplicate boilerplate for toast notifications and query invalidation.
 *
 * @example
 * ```typescript
 * export const useDeleteAgent = createMutationHook({
 *   mutationFn: deleteAgent,
 *   successMessage: 'Agent deleted successfully',
 *   errorPrefix: 'Failed to delete agent',
 *   queryKeysToInvalidate: [agentsKeys.all()],
 * });
 * ```
 */
export function createMutationHook<TData, TError extends Error, TVariables>(
  options: CreateMutationOptions<TData, TError, TVariables>
) {
  return function useMutation(userOptions?: MutationOptions<TData, TError>) {
    const queryClient = useQueryClient();

    return useTanStackMutation<TData, TError, TVariables>({
      mutationFn: options.mutationFn,
      onSuccess: (data) => {
        toast.success(options.successMessage);

        if (options.queryKeysToInvalidate) {
          options.queryKeysToInvalidate.forEach((key) => {
            queryClient.invalidateQueries({ queryKey: key });
          });
        }

        userOptions?.onSuccess?.(data);
      },
      onError: (error) => {
        toast.error(`${options.errorPrefix}: ${error.message}`);
        userOptions?.onError?.(error);
      },
    });
  };
}
