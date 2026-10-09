import { api } from './api';
import type { Absence } from './absences';

export interface VacationAccount {
  entries: Absence[];
  allowance: number;
  used: number;
  remaining: number;
  monthlyDays: number[];
}

export async function fetchVacations(userId: number, year: number): Promise<VacationAccount> {
  return (await api.get(`/admin/users/${userId}/vacations`, { params: { year } })).data;
}

export async function addVacation(userId: number, start_date: string, end_date: string, note: string) {
  return (await api.post(`/admin/users/${userId}/vacations`, { start_date, end_date, note })).data;
}

export async function removeVacation(userId: number, absenceId: number) {
  return (await api.delete(`/admin/users/${userId}/vacations/${absenceId}`)).data;
}

/** All vacations of the employee from one year back (wishes of the employee and entries by the management). */
export async function fetchAllVacations(userId: number): Promise<Absence[]> {
  const data = (await api.get(`/admin/users/${userId}/vacations/upcoming`)).data;
  return Array.isArray(data?.entries) ? data.entries : [];
}
