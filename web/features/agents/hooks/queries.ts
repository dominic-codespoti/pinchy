import { useQuery } from '@tanstack/react-query';
import {
  getAgents,
  getAgent,
  getAgentSessions,
  getAgentMemories,
  getAgentFiles,
} from '../api';
import { Agent, Session, Memory, AgentFile } from '../types';

export function useAgents() {
  return useQuery<Agent[], Error>({
    queryKey: ['agents'],
    queryFn: getAgents,
    staleTime: 5000,
  });
}

export function useAgent(id: string) {
  return useQuery<Agent, Error>({
    queryKey: ['agents', id],
    queryFn: () => getAgent(id),
    staleTime: 5000,
    enabled: !!id,
  });
}

export function useAgentSessions(agentId: string) {
  return useQuery<Session[], Error>({
    queryKey: ['agents', agentId, 'sessions'],
    queryFn: () => getAgentSessions(agentId),
    staleTime: 5000,
    enabled: !!agentId,
  });
}

export function useAgentMemories(agentId: string, search?: string) {
  return useQuery<Memory[], Error>({
    queryKey: ['agents', agentId, 'memories', search],
    queryFn: () => getAgentMemories(agentId, search),
    staleTime: 5000,
    enabled: !!agentId,
  });
}

export function useAgentFiles(agentId: string) {
  return useQuery<AgentFile[], Error>({
    queryKey: ['agents', agentId, 'files'],
    queryFn: () => getAgentFiles(agentId),
    staleTime: 5000,
    enabled: !!agentId,
  });
}
