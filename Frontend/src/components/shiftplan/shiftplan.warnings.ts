/* ------------------------------------------------ */
/* SHIFTPLAN – UNDERSTAFFING WARNINGS (LOGIC)       */
/* ------------------------------------------------ */

import { EARLY_SHIFT_CODES, LATE_SHIFT_CODES, type Schedule } from "../../store/shiftStore";

export type UnderstaffWarning = {
  dateKey: string; // YYYY-MM-DD
  day: number;
  kind: "night" | "late" | "early";
  count: number;
  threshold: number;
  label: string;
  actual: number; // [NEW]
  target: number; // [NEW]
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m1: number, d: number) {
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

/**
 * Rules (copied from the Brode/OES Dienstplan warnings):
 * - Weekdays (Mon–Fri): Night shift (N) warning when < 4
 * - Every day: Late shift (L1/L2) warning when < 3
 * - Saturday: Early (E1/E2) < 3, Late (L1/L2) < 3
 * - Sunday: Early (E1/E2) < 2, Late (L1/L2) < 2
 */
export function computeUnderstaffWarnings(
  schedule: Schedule,
  year: number,
  monthIndex1: number,
  daysInMonth: number
): UnderstaffWarning[] {
  const warnings: UnderstaffWarning[] = [];

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex1 - 1, day);
    const dow = date.getDay(); // 0=Sun..6=Sat

    let early = 0;
    let late = 0;
    let night = 0;

    for (const days of Object.values(schedule || {})) {
      const code = String((days as any)?.[day] || "")
        .trim()
        .toUpperCase();
      if (!code) continue;

      if (EARLY_SHIFT_CODES.includes(code as (typeof EARLY_SHIFT_CODES)[number])) early++;
      if (LATE_SHIFT_CODES.includes(code as (typeof LATE_SHIFT_CODES)[number])) late++;
      if (code === "N") night++;
    }

    const dateKey = ymd(year, monthIndex1, day);

    // Weekday night shift rule
    const isWeekday = dow >= 1 && dow <= 5;
    if (isWeekday && night < 4) {
      warnings.push({
        dateKey,
        day,
        kind: "night",
        count: night,
        threshold: 4,
        label: `Nachtschicht: ${night}/4`,
        actual: night,
        target: 4,
      });
    }

    // Late shift rule (default <3, Sunday <2)
    const lateThreshold = dow === 0 ? 2 : 3;
    if (late < lateThreshold) {
      const suffix = dow === 6 ? " (Sa)" : dow === 0 ? " (So)" : "";
      warnings.push({
        dateKey,
        day,
        kind: "late",
        count: late,
        threshold: lateThreshold,
        label: `Spätschicht${suffix}: ${late}/${lateThreshold}`,
        actual: late,
        target: lateThreshold,
      });
    }

    // Weekend rules (early shift only)
    if (dow === 6) {
      // Saturday
      if (early < 3) {
        warnings.push({
          dateKey,
          day,
          kind: "early",
          count: early,
          threshold: 3,
          label: `Frühschicht (Sa): ${early}/3`,
          actual: early,
          target: 3,
        });
      }
    }

    if (dow === 0) {
      // Sunday
      if (early < 2) {
        warnings.push({
          dateKey,
          day,
          kind: "early",
          count: early,
          threshold: 2,
          label: `Frühschicht (So): ${early}/2`,
          actual: early,
          target: 2,
        });
      }
    }
  }

  return warnings;
}
