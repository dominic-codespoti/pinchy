import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createAgent,
  updateAgent,
  deleteAgent,
  addMemory,
  updateMemory,
  deleteMemory,
  sendTestMessage,
} from '../api';
import { cloneAgent, CloneAgentOptions, CloneAgentResult } from '../api/clone-api';
import { Agent, Memory, CreateAgentInput, UpdateAgentInput, SendTestMessageResponse } from '../types';

interface MutationOptions<TData = unknown, TError = Error> {
  onSuccess?: (data: TData) => void;
  onError?: (error: TError) => void;
}

export function useCreateAgent(options?: MutationOptions<Agent, Error>) {
  const queryClient = useQueryClient();

  return useMutation<Agent, Error, CreateAgentInput>({
    mutationFn: createAgent,
    onSuccess: (data) => {
      toast.success(`Agent "${data.name}" created successfully`);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      const message = `Failed to create agent: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}

export function useUpdateAgent(options?: MutationOptions<Agent, Error>) {
  const queryClient = useQueryClient();

  return useMutation<Agent, Error, { id: string; data: UpdateAgentInput }>({
    mutationFn: ({ id, data }) => updateAgent(id, data),
    onSuccess: (data) => {
      toast.success(`Agent "${data.name}" updated successfully`);
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agents', data.id] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      const message = `Failed to update agent: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}

export function useDeleteAgent(options?: MutationOptions<void, Error>) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteAgent,
    onSuccess: () => {
      toast.success('Agent deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      const message = `Failed to delete agent: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}

interface UseCloneAgentVariables {
  sourceId: string;
  options: CloneAgentOptions;
  existingAgentNames: string[];
}

export function useCloneAgent(options?: MutationOptions<CloneAgentResult, Error>) {
  const queryClient = useQueryClient();

  return useMutation<CloneAgentResult, Error, UseCloneAgentVariables>({
    mutationFn: ({ sourceId, options: cloneOptions, existingAgentNames }) =>
      cloneAgent(sourceId, cloneOptions, existingAgentNames),
    onSuccess: (data, variables) => {
      if (data.success) {
        toast.success(`Agent cloned successfully as "${variables.options.newName || variables.sourceId + '-copy'}"`);
        queryClient.invalidateQueries({ queryKey: ['agents'] });
      } else {
        const errorCount = data.errors.length;
        if (errorCount > 0) {
          toast.warning(`Agent cloned with ${errorCount} warning${errorCount === 1 ? '' : 's'}`);
        }
      }
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      const message = `Failed to clone agent: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}

export function useAddMemory(agentId: string, options?: MutationOptions<Memory, Error>) {
  const queryClient = useQueryClient();

  return useMutation<Memory, Error, { content: string; category?: string }>({
    mutationFn: ({ content, category }) => addMemory(agentId, content, category),
    onSuccess: (data) => {
      toast.success('Memory added successfully');
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'memories'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      const message = `Failed to add memory: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}

export function useUpdateMemory(agentId: string, options?: MutationOptions<Memory, Error>) {
  const queryClient = useQueryClient();

  return useMutation<Memory, Error, { memoryId: string; content: string }>({
    mutationFn: ({ memoryId, content }) => updateMemory(memoryId, content),
    onSuccess: (data) => {
      toast.success('Memory updated successfully');
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'memories'] });
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      const message = `Failed to update memory: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}

export function useDeleteMemory(agentId: string, options?: MutationOptions<void, Error>) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: (memoryId) => deleteMemory(memoryId),
    onSuccess: () => {
      toast.success('Memory deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['agents', agentId, 'memories'] });
      options?.onSuccess?.();
    },
    onError: (error) => {
      const message = `Failed to delete memory: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}

export function useSendTestMessage(options?: MutationOptions<SendTestMessageResponse, Error>) {
  return useMutation<SendTestMessageResponse, Error, { agentId: string; content: string }>({
    mutationFn: ({ agentId, content }) => sendTestMessage(agentId, content),
    onSuccess: (data) => {
      options?.onSuccess?.(data);
    },
    onError: (error) => {
      const message = `Failed to send test message: ${error.message}`;
      toast.error(message);
      options?.onError?.(error);
    },
  });
}
