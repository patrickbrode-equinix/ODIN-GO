import { api, asArray } from "./api";

export interface ShiftChangeLog {
    id: number;
    employee_name: string;
    date: string;
    old_value: string | null;
    new_value: string | null;
    changed_by: string;
    changed_at: string;
    source: string;
}

export async function fetchShiftHistory(params: {
    year?: number;
    month?: number;
    employee_name?: string;
    limit?: number;
}): Promise<ShiftChangeLog[]> {
    const q = new URLSearchParams();
    if (params.year) q.append("year", String(params.year));
    if (params.month) q.append("month", String(params.month));
    if (params.employee_name) q.append("employee_name", params.employee_name);
    if (params.limit) q.append("limit", String(params.limit));

    const res = await api.get(`/schedules/history?${q.toString()}`);
    return asArray(res.data, "fetchShiftHistory");
}
