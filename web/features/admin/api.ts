import { fetchApi } from '@/shared/api/client';
import { SystemStats } from './types';

export async function getSystemStats(): Promise<SystemStats> {
  return fetchApi<SystemStats>('/api/admin/stats');
}
