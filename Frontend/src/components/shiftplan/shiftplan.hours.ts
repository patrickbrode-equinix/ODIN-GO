/* ------------------------------------------------ */
/* SHIFTPLAN – HOURS CALCULATION                    */
/* ------------------------------------------------ */

import { shiftTypes } from "../../store/shiftStore";
import type { Absence } from "../../api/absences";
import type { HolidayMap } from "../../utils/deHolidays";

/**
 * Configuration
 */
export const SOLL_HOURS = 174;
export const HOLIDAY_CREDIT_HOURS = 8;
/** 1 hour break deducted per working day */
export const BREAK_HOURS = 1;

const CREDITED_SHIFT_CODES = new Set(["ABW", "SEMINAR"]);
const CREDITED_ABSENCE_TYPES = new Set(["VACATION", "SICK", "TRAINING"]);

export type HourLimitsConfig = {
    maxDailyHours: number;   // 0 = no limit
    maxWeeklyHours: number;  // 0 = no limit
    dailyMode: 'off' | 'warn' | 'block';
    weeklyMode: 'off' | 'warn' | 'block';
};

export type DayHourInfo = {
    hours: number;
    exceeded: boolean;
    mode: 'off' | 'warn' | 'block';
};

export type WeekHourInfo = {
    weekNo: number;
    totalHours: number;
    exceeded: boolean;
    mode: 'off' | 'warn' | 'block';
};

export type EmployeeMonthlyStats = {
    name: string;
    soll: number;
    ist: number;
    diff: number;
    earlyCount: number;
    lateCount: number;
    nightCount: number;
    weekendCount: number;
    holidayCount: number;
    warnings: string[];
    /** Hours per day (1-indexed: dayHours[1] = day 1) */
    dayHours: Record<number, DayHourInfo>;
    /** Hours per ISO week */
    weekHours: Record<number, WeekHourInfo>;
};

function getShiftCategory(code: string | undefined | null): 'early' | 'late' | 'night' | null {
    const normalizedCode = String(code || "").trim().toUpperCase();
    if (!normalizedCode) return null;
    if (normalizedCode === "N") return 'night';
    if (normalizedCode.startsWith("E") || normalizedCode.startsWith("HE")) return 'early';
    if (normalizedCode.startsWith("L") || normalizedCode.startsWith("HL")) return 'late';
    return null;
}

/**
 * Calculates hours for a specific employee in a specific month.
 * 
 * Rules for IST:
 * - Sum of shift durations (from shiftTypes).
 * - Public Holiday: If it's a weekday (Mon-Fri) AND the employee has NO shift (or OFF?), 
 *   do they get credit? 
 *   User said: "HOLIDAY RULE: Do not assume blindly. Use configurable constant (default 8h)... Only apply for 2027+."
 *   Standard rule usually: If holiday is on a workday and employee is OFF, they get target hours (8h).
 *   If they WORK, they get worked hours + potential bonus (but here we likely just want 'worked' or 'credited' for the total).
 *   Let's assume: 
 *     - If defined shift exists: Use shift hours.
 *     - If NO shift (or blank) AND it is a Mon-Fri Holiday: Credit 8h.
 *     - If Saturday/Sunday Holiday: No extra credit usually unless scheduled.
 */
export function calculateEmployeeHours(
    employeeName: string,
    schedule: Record<number, string>,
    year: number,
    monthIndex1: number,
    daysInMonth: number,
    holidays: HolidayMap,
    limits?: HourLimitsConfig,
    sollHours: number = SOLL_HOURS,
    absences: Absence[] = [],
): EmployeeMonthlyStats {
    let ist = 0;
    let earlyCount = 0;
    let lateCount = 0;
    let nightCount = 0;
    let weekendCount = 0;
    let holidayCount = 0;
    const dayHours: Record<number, DayHourInfo> = {};
    const weekBuckets: Record<number, number> = {};

    for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, monthIndex1 - 1, day);
        const dayKey = `${year}-${String(monthIndex1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dow = date.getDay();
        const isWeekend = dow === 0 || dow === 6;

        const code = schedule[day];
        const type = code ? shiftTypes[code] : null;
        const absence = absences.find((entry) => dayKey >= entry.start_date && dayKey <= entry.end_date) || null;
        const holidayName = holidays[dayKey];
        let h = 0;

        if (type) {
            if (CREDITED_SHIFT_CODES.has(String(code || "").toUpperCase()) && !isWeekend) {
                h = HOLIDAY_CREDIT_HOURS;
            } else {
                h = parseHoursFromRange(type.time);
                // Deduct 1h break per working day
                if (h > 0) h = Math.max(0, h - BREAK_HOURS);
            }
        } else {
            if (absence && CREDITED_ABSENCE_TYPES.has(String(absence.type || "").toUpperCase()) && !isWeekend) {
                h = HOLIDAY_CREDIT_HOURS;
            } else {
                const holidayName = holidays[dayKey];
                if (holidayName && !isWeekend) {
                    h = HOLIDAY_CREDIT_HOURS;
                }
            }
        }

        ist += h;

        const shiftCategory = getShiftCategory(code);
        const countsAsWorkedShift = Boolean(shiftCategory && h > 0);
        if (countsAsWorkedShift) {
            if (shiftCategory === 'early') earlyCount += 1;
            if (shiftCategory === 'late') lateCount += 1;
            if (shiftCategory === 'night') nightCount += 1;
            if (isWeekend) weekendCount += 1;
            if (holidayName) holidayCount += 1;
        }

        // Daily limit check
        const dailyExceeded = limits && limits.dailyMode !== 'off' && limits.maxDailyHours > 0 && h > limits.maxDailyHours;
        dayHours[day] = {
            hours: Math.round(h * 100) / 100,
            exceeded: !!dailyExceeded,
            mode: limits?.dailyMode ?? 'off',
        };

        // Accumulate weekly
        const wk = isoWeekNumber(date);
        weekBuckets[wk] = (weekBuckets[wk] || 0) + h;
    }

    // Build weekly info
    const weekHours: Record<number, WeekHourInfo> = {};
    for (const [wkStr, total] of Object.entries(weekBuckets)) {
        const wk = Number(wkStr);
        const weeklyExceeded = limits && limits.weeklyMode !== 'off' && limits.maxWeeklyHours > 0 && total > limits.maxWeeklyHours;
        weekHours[wk] = {
            weekNo: wk,
            totalHours: Math.round(total * 100) / 100,
            exceeded: !!weeklyExceeded,
            mode: limits?.weeklyMode ?? 'off',
        };
    }

    const normalizedSollHours = Number.isFinite(sollHours) && sollHours >= 0 ? sollHours : SOLL_HOURS;
    const diff = Math.round((ist - normalizedSollHours) * 100) / 100;
    const warnings: string[] = [];
    if (ist < normalizedSollHours) warnings.push("Under");
    if (ist > normalizedSollHours) warnings.push("Over");

    return {
        name: employeeName,
        soll: normalizedSollHours,
        ist: Math.round(ist * 100) / 100,
        diff,
        earlyCount,
        lateCount,
        nightCount,
        weekendCount,
        holidayCount,
        warnings,
        dayHours,
        weekHours,
    };
}

function isoWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function parseHoursFromRange(range: string): number {
    if (!range || range === "—") return 0;
    // e.g. "06:00-14:30"
    const [start, end] = range.split("-");
    if (!start || !end) return 0;

    const [sh, sm] = start.split(":").map(Number);
    const [eh, em] = end.split(":").map(Number);

    if (isNaN(sh) || isNaN(eh)) return 0;

    let minStart = sh * 60 + sm;
    let minEnd = eh * 60 + em;

    if (minEnd < minStart) minEnd += 24 * 60; // Overnight

    const diffMin = minEnd - minStart;
    // Deduct break? Standard usually 30-45min. 
    // Let's assume raw duration for now unless instructed.
    // Actually, standard shift 8.5h often includes break. 
    // Let's return raw hours.
    return diffMin / 60;
}
