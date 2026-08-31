import { api } from './api';
import type { CriticalWorkloadSnapshot } from '../types/criticalWorkload';

export async function fetchDashboardCriticalWorkload(): Promise<CriticalWorkloadSnapshot> {
  const response = await api.get<CriticalWorkloadSnapshot>('/dashboard/critical-workload');
  return response.data;
}

export async function fetchTvCriticalWorkload(): Promise<CriticalWorkloadSnapshot> {
  const response = await api.get<CriticalWorkloadSnapshot>('/tv/critical-workload');
  return response.data;
}