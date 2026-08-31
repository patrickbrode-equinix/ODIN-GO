import { api, asArray } from "./api";

export interface Absence {
    id: number;
    employee_name: string;
    employee_id?: number;
    start_date: string; // ISO Date YYYY-MM-DD
    end_date: string; // ISO Date YYYY-MM-DD
    type: 'VACATION' | 'SICK' | 'TRAINING' | 'OFFSITE';
    note?: string;
}

export interface AbsenceConflict {
    id: number;
    employee_name: string;
    date: string; // ISO Date YYYY-MM-DD
    conflict_type: string;
    details: {
        msg: string;
        shift_code: string;
    };
}

export async function fetchAbsences(year?: number, month?: number): Promise<Absence[]> {
    const params = new URLSearchParams();
    if (year) params.append("year", String(year));
    if (month) params.append("month", String(month));

    const res = await api.get(`/absences?${params.toString()}`);
    return asArray(res.data, "fetchAbsences");
}

export async function createAbsence(data: Omit<Absence, "id">): Promise<Absence> {
    const res = await api.post("/absences", data);
    return res.data;
}

export async function deleteAbsence(id: number): Promise<{ success: boolean }> {
    const res = await api.delete(`/absences/${id}`);
    return res.data;
}

export async function fetchAbsenceConflicts(year: number, month: number): Promise<AbsenceConflict[]> {
    const res = await api.get(`/absences/conflicts?year=${year}&month=${month}`);
    return asArray(res.data, "fetchAbsenceConflicts");
}
