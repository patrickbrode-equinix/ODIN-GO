/* ------------------------------------------------ */
/* SHIFT VALIDATION API                             */
/* ------------------------------------------------ */

import { api, asArray } from "./api";

export type ViolationType = "REST_TIME" | "HARD_CHANGE";

export interface ShiftViolation {
    id: number;
    employee_name: string;
    date: string; // YYYY-MM-DD
    violation_type: ViolationType;
    details: {
        prev: string;
        curr: string;
        gap?: number;
        msg: string;
    };
    created_at: string;
}

export const fetchViolations = async (year: number, month: number) => {
    const res = await api.get<ShiftViolation[]>(`/shiftValidation/violations?year=${year}&month=${month}`);
    return asArray(res.data, "fetchViolations");
};

export const validateShiftplan = async (year: number, month: number) => {
    const res = await api.post<{ success: true; count: number; violations: ShiftViolation[] }>(
        "/shiftValidation/validate",
        { year, month }
    );
    return res.data;
};
