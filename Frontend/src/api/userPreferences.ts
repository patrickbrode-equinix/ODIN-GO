import { api, asObject } from "./api";

export interface ShiftplanPreferences {
    searchTerm?: string;
    showNightOnly?: boolean;
    showWeekendOnly?: boolean;
    showWarningsOnly?: boolean;
    showUnderstaffedOnly?: boolean;
}

export async function getShiftplanPreferences(): Promise<ShiftplanPreferences> {
    const res = await api.get("/user/preferences/shiftplan");
    return asObject(res.data, "getShiftplanPreferences") as ShiftplanPreferences;
}

export async function updateShiftplanPreferences(prefs: ShiftplanPreferences): Promise<ShiftplanPreferences> {
    const res = await api.put("/user/preferences/shiftplan", prefs);
    return asObject(res.data, "updateShiftplanPreferences") as ShiftplanPreferences;
}
