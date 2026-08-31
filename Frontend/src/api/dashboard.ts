import { api } from "./api"; // Assuming axios instance is here

export interface DashboardInfo {
    id: number;
    content: string;
    is_visible: boolean;
    updated_at: string;
    updated_by: string;
}

export interface FeatureToggles {
    [key: string]: boolean;
}

export interface DashboardOperationalConfig {
    criticalTicketWindowHours: number;
}

export async function getDashboardInfo(): Promise<DashboardInfo | null> {
    const res = await api.get("/dashboard/info");
    return res.data?.data ?? null;
}

export async function updateDashboardInfo(content: string, is_visible: boolean): Promise<DashboardInfo> {
    const res = await api.put("/dashboard/info", { content, is_visible });
    return res.data?.data;
}

export async function getFeatureToggles(): Promise<FeatureToggles> {
    const res = await api.get("/dashboard/toggles");
    return res.data?.data ?? {};
}

export async function getDashboardOperationalConfig(): Promise<DashboardOperationalConfig> {
    const res = await api.get("/dashboard/config");
    return res.data?.data ?? { criticalTicketWindowHours: 72 };
}

export async function updateFeatureToggle(key: string, is_enabled: boolean): Promise<{ key: string, is_enabled: boolean }> {
    const res = await api.put(`/dashboard/toggles/${key}`, { is_enabled });
    return res.data?.data;
}

/* ------------------------------------------------ */
/* INFO ENTRIES (multi-entry)                       */
/* ------------------------------------------------ */

export interface DashboardInfoEntry {
    id: number;
    content: string;
    created_at: string;
    is_active: boolean;
    delete_at?: string;
    type: 'info' | 'instruction';
}

export async function getInfoEntries(): Promise<DashboardInfoEntry[]> {
    const res = await api.get("/dashboard/info-entries");
    return res.data?.data ?? [];
}

export async function createInfoEntry(content: string, type: 'info' | 'instruction' = 'info'): Promise<DashboardInfoEntry> {
    const res = await api.post("/dashboard/info-entries", { content, type });
    return res.data?.data;
}

export async function deleteInfoEntry(id: number): Promise<void> {
    await api.delete(`/dashboard/info-entries/${id}`);
}

export async function updateInfoEntry(id: number, updates: { deleteAt?: string | null, type?: 'info' | 'instruction' }): Promise<DashboardInfoEntry> {
    const res = await api.patch(`/dashboard/info-entries/${id}`, updates);
    return res.data?.data;
}
