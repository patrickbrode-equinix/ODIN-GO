
/* ------------------------------------------------ */
/* COVERAGE & SKILLS API CLIENT                     */
/* ------------------------------------------------ */

import { api, asArray } from "./api";

export type EmployeeSkills = {
    employee_name: string;
    can_sh: boolean;
    can_tt: boolean;
    can_cc: boolean;
    rated_skills?: Record<string, number>;
    updated_at: string;
};

export type CoverageRule = {
    shift_type: string;
    min_sh: number;
    min_tt: number;
    min_cc: number;
};

export type CoverageViolation = {
    id: number;
    date: string;
    shift_type: string;
    missing: {
        sh?: number;
        tt?: number;
        cc?: number;
    };
    created_at: string;
};

/* ------------------------------------------------ */
/* API CALLS                                        */
/* ------------------------------------------------ */

export const fetchSkills = async () => {
    const res = await api.get<EmployeeSkills[]>("/coverage/skills");
    return asArray(res.data, "fetchSkills");
};

export const updateSkills = async (data: Partial<EmployeeSkills>) => {
    const res = await api.post("/coverage/skills", data);
    return res.data;
};

export const fetchRules = async () => {
    const res = await api.get<CoverageRule[]>("/coverage/rules");
    return asArray(res.data, "fetchRules");
};

export const fetchCoverageViolations = async (year: number, month: number) => {
    const res = await api.get<CoverageViolation[]>(`/coverage/violations?year=${year}&month=${month}`);
    return asArray(res.data, "fetchCoverageViolations");
};

export const computeCoverage = async (year: number, month: number) => {
    const res = await api.post<{ success: true }>("/coverage/compute", { year, month });
    return res.data;
};
