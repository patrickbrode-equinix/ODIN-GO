/* ------------------------------------------------ */
/* WELLBEING API CLIENT                             */
/* ------------------------------------------------ */

import { api, asArray } from "./api";

export type WellbeingConfig = {
    id: number;
    scope: string;
    night_threshold: number;
    weekend_threshold: number;
    streak_threshold: number;
};

export type WellbeingMetric = {
    id: number;
    employee_name: string;
    year: number;
    month: number;
    night_count: number;
    weekend_count: number;
    early_count: number;
    late_count: number;
    max_streak: number;
    score: number;
    details: any;
    updated_at: string;
};

export const fetchWellbeingConfig = async () => {
    const res = await api.get<WellbeingConfig>("/wellbeing/config");
    return res.data;
};

export const updateWellbeingConfig = async (data: Partial<WellbeingConfig>) => {
    const res = await api.post("/wellbeing/config", data);
    return res.data;
};

export const fetchWellbeingMetrics = async (year: number, month: number) => {
    const res = await api.get<WellbeingMetric[]>(`/wellbeing/metrics?year=${year}&month=${month}`);
    return asArray(res.data, "fetchWellbeingMetrics");
};

export const computeWellbeingMetrics = async (year: number, month: number) => {
    const res = await api.post<{ success: true; count: number }>("/wellbeing/compute", { year, month });
    return res.data;
};
