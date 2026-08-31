/* ------------------------------------------------ */
/* WELLBEING STORE (Zustand)                        */
/* ------------------------------------------------ */

import { create } from "zustand";
import { WellbeingConfig, WellbeingMetric, fetchWellbeingConfig, fetchWellbeingMetrics, computeWellbeingMetrics, updateWellbeingConfig } from "../api/wellbeing";

interface WellbeingStore {
    config: WellbeingConfig | null;
    metrics: Record<string, WellbeingMetric[]>; // Key: "yyyy-mm"
    loading: boolean;

    loadConfig: () => Promise<void>;
    updateConfig: (data: Partial<WellbeingConfig>) => Promise<void>;

    loadMetrics: (year: number, month: number) => Promise<void>;
    computeMetrics: (year: number, month: number) => Promise<void>;

    getMetricsForMonth: (year: number, month: number) => WellbeingMetric[];
}

export const useWellbeingStore = create<WellbeingStore>((set, get) => ({
    config: null,
    metrics: {},
    loading: false,

    loadConfig: async () => {
        try {
            const config = await fetchWellbeingConfig();
            set({ config });
        } catch (err) {
            console.error("Failed to load wellbeing config", err);
        }
    },

    updateConfig: async (data) => {
        try {
            await updateWellbeingConfig(data);
            await get().loadConfig();
        } catch (err) {
            console.error("Failed to update wellbeing config", err);
        }
    },

    loadMetrics: async (year, month) => {
        const key = `${year}-${month}`;

        set({ loading: true });
        try {
            let data = await fetchWellbeingMetrics(year, month);
            if (data.length === 0) {
                await computeWellbeingMetrics(year, month);
                data = await fetchWellbeingMetrics(year, month);
            }
            set((state) => ({
                metrics: {
                    ...state.metrics,
                    [key]: data,
                },
                loading: false,
            }));
        } catch (err) {
            console.error("Failed to load wellbeing metrics", err);
            set({ loading: false });
        }
    },

    computeMetrics: async (year, month) => {
        set({ loading: true });
        try {
            await computeWellbeingMetrics(year, month);
            // Reload to get fresh data
            await get().loadMetrics(year, month);
        } catch (err) {
            console.error("Failed to compute wellbeing metrics", err);
            set({ loading: false });
        }
    },

    getMetricsForMonth: (year, month) => {
        const key = `${year}-${month}`;
        return get().metrics[key] || [];
    },
}));
