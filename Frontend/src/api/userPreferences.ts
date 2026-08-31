import { api, asObject } from "./api";
import { areEquivalentEmployeeNames, dedupeEmployeeNames, normalizeEmployeeName, toEmployeeDedupeKey } from "../utils/employeeNames";

export interface ShiftplanPreferences {
    searchTerm?: string;
    showNightOnly?: boolean;
    showWeekendOnly?: boolean;
    showWarningsOnly?: boolean;
    showUnderstaffedOnly?: boolean;
}

export interface EligibleColleague {
    name: string;
    hasLoggedIn: boolean;
    lastLogin: string | null;
}

function normalizeEligibleColleagues(value: unknown): EligibleColleague[] {
    if (!Array.isArray(value)) return [];

    const normalizedEntries = value
        .map((entry) => {
            if (typeof entry === "string") {
                const name = normalizeEmployeeName(entry);
                return name ? { name, hasLoggedIn: false, lastLogin: null } : null;
            }

            if (!entry || typeof entry !== "object") return null;

            const name = normalizeEmployeeName((entry as { name?: unknown }).name);
            if (!name) return null;

            return {
                name,
                hasLoggedIn: (entry as { hasLoggedIn?: unknown }).hasLoggedIn === true,
                lastLogin: typeof (entry as { lastLogin?: unknown }).lastLogin === "string"
                    ? (entry as { lastLogin: string }).lastLogin
                    : null,
            };
        })
        .filter((entry): entry is EligibleColleague => entry !== null);

    const dedupedNames = dedupeEmployeeNames(normalizedEntries.map((entry) => entry.name));

    const uniqueEntries = new Map<string, EligibleColleague>();
    for (const entry of normalizedEntries) {
        const canonicalName = dedupedNames.find((name) => areEquivalentEmployeeNames(name, entry.name))
            || dedupedNames.find((name) => toEmployeeDedupeKey(name) === toEmployeeDedupeKey(entry.name));
        if (!canonicalName) continue;
        const key = toEmployeeDedupeKey(canonicalName);
        const existing = uniqueEntries.get(key);
        if (!existing) {
            uniqueEntries.set(key, { ...entry, name: canonicalName });
            continue;
        }

        uniqueEntries.set(key, {
            name: canonicalName,
            hasLoggedIn: existing.hasLoggedIn || entry.hasLoggedIn,
            lastLogin: existing.lastLogin && entry.lastLogin
                ? (new Date(existing.lastLogin).getTime() >= new Date(entry.lastLogin).getTime() ? existing.lastLogin : entry.lastLogin)
                : existing.lastLogin || entry.lastLogin,
        });
    }

    return Array.from(uniqueEntries.values()).sort((left, right) => left.name.localeCompare(right.name, "de"));
}

export async function getShiftplanPreferences(): Promise<ShiftplanPreferences> {
    const res = await api.get("/user/preferences/shiftplan");
    return asObject(res.data, "getShiftplanPreferences") as ShiftplanPreferences;
}

export async function updateShiftplanPreferences(prefs: ShiftplanPreferences): Promise<ShiftplanPreferences> {
    const res = await api.put("/user/preferences/shiftplan", prefs);
    return asObject(res.data, "updateShiftplanPreferences") as ShiftplanPreferences;
}

/* ------------------------------------------------ */
/* PREFERRED COLLEAGUES (Wunschkollegen)            */
/* ------------------------------------------------ */

export async function getPreferredColleagues(): Promise<string[]> {
    const res = await api.get("/user/preferred-colleagues");
    return dedupeEmployeeNames(Array.isArray(res.data) ? res.data : []);
}

export async function updatePreferredColleagues(names: string[]): Promise<string[]> {
    const normalizedNames = dedupeEmployeeNames(names);
    const res = await api.put("/user/preferred-colleagues", { names: normalizedNames });
    return dedupeEmployeeNames(Array.isArray(res.data) ? res.data : []);
}

export async function getEligibleColleagues(): Promise<EligibleColleague[]> {
    const res = await api.get("/user/eligible-colleagues");
    return normalizeEligibleColleagues(res.data);
}
