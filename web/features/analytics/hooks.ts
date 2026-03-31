import { useQuery } from '@tanstack/react-query';
import { getAgents } from './api';

export function useAgents() {
  return useQuery({
    queryKey: ['analytics', 'agents'],
    queryFn: getAgents,
    staleTime: 5000,
  });
}
