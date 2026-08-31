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

export type WellbeingAnalyticsRow = {
    worker: string;
    nightCount: number;
    weekendCount: number;
    holidayCount: number;
    lateCount: number;
    earlyCount: number;
    absentCount: number;
    totalAssignments: number;
    totalSpecialShifts: number;
    maxStreak: number;
    burdenScore: number;
};

export type WellbeingAnalyticsResponse = {
    from: string;
    to: string;
    config: {
        nightThreshold: number;
        weekendThreshold: number;
        streakThreshold: number;
    };
    summary: {
        employeeCount: number;
        totalNight: number;
        totalWeekend: number;
        totalHoliday: number;
        totalLate: number;
        totalAbsent: number;
        averageBurden: number;
        maxBurden: number;
        highestBurdenWorker: string | null;
    };
    rows: WellbeingAnalyticsRow[];
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

export const fetchWellbeingAnalytics = async (params: { range: string; from?: string; to?: string; state?: string }) => {
    const searchParams = new URLSearchParams();
    searchParams.set("range", params.range);
    if (params.from) searchParams.set("from", params.from);
    if (params.to) searchParams.set("to", params.to);
    if (params.state) searchParams.set("state", params.state);

    const res = await api.get<WellbeingAnalyticsResponse>(`/stats/audit/wellbeing-analytics?${searchParams.toString()}`);
    return res.data;
};
