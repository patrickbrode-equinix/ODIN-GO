import { api, asArray } from "./api";

export interface StaffingRule {
    shift_type: string;
    min_count: number;
}

export interface StaffingResult {
    date: string; // YYYY-MM-DD
    shift_type: string;
    actual: number;
    min: number;
    status: "OK" | "WARN" | "FAIL";
}

export const fetchStaffingRules = async (): Promise<StaffingRule[]> => {
    const res = await api.get<StaffingRule[]>("/staffing/rules");
    return asArray(res.data, "fetchStaffingRules");
};

export const saveStaffingRule = async (rule: StaffingRule) => {
    const res = await api.post("/staffing/rules", rule);
    return res.data;
};

export const fetchStaffingResults = async (year: number, month: number): Promise<StaffingResult[]> => {
    const res = await api.get<StaffingResult[]>(`/staffing/results?year=${year}&month=${month}`);
    return asArray(res.data, "fetchStaffingResults");
};

export const recomputeStaffing = async (year: number, month: number) => {
    const res = await api.post("/staffing/recompute", { year, month });
    return res.data;
};
