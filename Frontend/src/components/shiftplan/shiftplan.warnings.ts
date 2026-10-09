/* ------------------------------------------------ */
/* SHIFTPLAN – UNDERSTAFFING WARNINGS (LOGIC)       */
/* ------------------------------------------------ */

import { EARLY_SHIFT_CODES, LATE_SHIFT_CODES, type Schedule } from "../../store/shiftStore";

export type UnderstaffSeverity = "warning" | "critical";
export type UnderstaffShiftType = "night" | "late" | "early";

export type UnderstaffWarning = {
  dateKey: string; // YYYY-MM-DD
  day: number;
  kind: UnderstaffShiftType;
  shiftType: UnderstaffShiftType;
  count: number;
  threshold: number;
  label: string;
  actual: number;
  target: number; // = max in config mode
  max: number;
  missing: number;
  severity: UnderstaffSeverity;
};

/** Minimal shape of a shift definition as returned by GET /shift-config/definitions. */
export type StaffingDefinitionLike = {
  code?: string | null;
  shift_type?: string | null;
  max_staff?: number | string | null;
  applicable_days?: number[] | string | null;
  is_active?: boolean | null;
};

/** Minimal shape of a staffing rule as returned by GET /shift-config/staffing-rules. */
export type StaffingRuleLike = {
  shift_type?: string | null;
  min_count?: number | null;
  max_count?: number | null;
};

/** Saturday / Sunday / holiday limits (early/late) as returned by GET /shift-config/staffing-rules. */
export type StaffingDayLimitLike = {
  day_context?: string | null;
  shift_type?: string | null;
  min_count?: number | null;
  max_count?: number | null;
};

export type UnderstaffConfig = {
  definitions?: StaffingDefinitionLike[] | null;
  staffingRules?: StaffingRuleLike[] | null;
  /** When given, the global per-day limits replace the per-shift max_staff values. */
  staffingDayLimits?: StaffingDayLimitLike[] | null;
  /** YYYY-MM-DD -> holiday name; a holiday uses the holiday limits. */
  holidays?: Record<string, string> | null;
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function ymd(y: number, m1: number, d: number) {
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

function parseApplicableDays(value: unknown): number[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => Number(entry)).filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
}

function isApplicableOnWeekday(definition: StaffingDefinitionLike, dow: number) {
  const days = parseApplicableDays(definition.applicable_days);
  return days.length === 0 || days.includes(dow);
}

function toNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const HALF_DAY_CODE_PATTERN = /^H[EL]\d+$/;
const NON_PLANNABLE_CODES = new Set(["FS", "ABW", "S", "SEMINAR", "DBS", "COLO"]);

/** Mirrors Backend isShiftDefinitionDraftPlannable: half shifts and non-draft codes never count towards staffing. */
function isDraftPlannableDefinition(definition: StaffingDefinitionLike) {
  const code = String(definition.code || "").trim().toUpperCase();
  if (!code) return false;
  if (HALF_DAY_CODE_PATTERN.test(code)) return false;
  if (NON_PLANNABLE_CODES.has(code)) return false;
  return true;
}

/** Maximum staffing for a shift type on a weekday (0=Sun..6=Sat). */
export function computeMaxStaffing(
  shiftType: UnderstaffShiftType,
  dow: number,
  definitions: StaffingDefinitionLike[],
  staffingRules?: StaffingRuleLike[] | null,
  globalLimits?: { dayLimits: StaffingDayLimitLike[]; isHoliday: boolean } | null,
): number {
  const applicable = definitions.filter(
    (definition) =>
      definition &&
      definition.is_active !== false &&
      isDraftPlannableDefinition(definition) &&
      String(definition.shift_type || "").toLowerCase() === shiftType &&
      isApplicableOnWeekday(definition, dow),
  );

  if (globalLimits) {
    // Global mode: the limits of the day type are the only source (early = E1+E2 ...).
    if (applicable.length === 0) return 0;
    const rules = Array.isArray(staffingRules) ? staffingRules : [];
    const context = globalLimits.isHoliday ? "holiday" : dow === 6 ? "saturday" : dow === 0 ? "sunday" : "weekday";
    const source = shiftType !== "night" && context !== "weekday"
      ? globalLimits.dayLimits.find((entry) => entry?.day_context === context && String(entry?.shift_type || "").toLowerCase() === shiftType)
      : rules.find((entry) => String(entry?.shift_type || "").toLowerCase() === shiftType);
    const min = toNumber(source?.min_count);
    const cap = toNumber(source?.max_count);
    // No maximum (unlimited) -> the minimum is the target.
    return cap > 0 ? Math.max(cap, min) : min;
  }

  let max = 0;
  if (shiftType === "night") {
    const primary = applicable.find((definition) => String(definition.code || "").trim().toUpperCase() === "N");
    max = primary
      ? toNumber(primary.max_staff)
      : applicable.reduce((best, definition) => Math.max(best, toNumber(definition.max_staff)), 0);
  } else {
    max = applicable.reduce((sum, definition) => sum + toNumber(definition.max_staff), 0);
  }

  const rule = (Array.isArray(staffingRules) ? staffingRules : []).find(
    (entry) => String(entry?.shift_type || "").toLowerCase() === shiftType,
  );
  const cap = rule ? toNumber(rule.max_count) : 0;
  if (cap > 0) max = Math.min(max, cap);

  return max;
}

function severityLabel(severity: UnderstaffSeverity) {
  return severity === "critical" ? "Kritische Unterbesetzung" : "Unterbesetzung";
}

/**
 * Config mode (definitions loaded): warns on deviation from the MAXIMUM staffing of a shift type.
 *   missing == 1 -> warning, missing >= 2 -> critical.
 *
 * Fallback mode (no definitions): legacy hardcoded minimums
 * - Weekdays (Mon–Fri): Night shift (N) warning when < 4
 * - Every day: Late shift (L1/L2) warning when < 3 (Sunday < 2)
 * - Saturday: Early < 3, Sunday: Early < 2
 * Severity by old delta rule: delta >= 2 or actual == 0 -> critical.
 */
export function computeUnderstaffWarnings(
  schedule: Schedule,
  year: number,
  monthIndex1: number,
  daysInMonth: number,
  referenceDate = new Date(),
  config?: UnderstaffConfig,
): UnderstaffWarning[] {
  const warnings: UnderstaffWarning[] = [];
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const definitions = Array.isArray(config?.definitions) ? config!.definitions! : [];
  const useConfig = definitions.length > 0;
  const staffingRules = config?.staffingRules ?? null;
  const dayLimits = Array.isArray(config?.staffingDayLimits) ? config!.staffingDayLimits! : null;

  const push = (
    dateKey: string,
    day: number,
    kind: UnderstaffShiftType,
    actual: number,
    max: number,
    legacyLabel?: string,
  ) => {
    const missing = max - actual;
    if (max <= 0 || missing <= 0) return;
    const severity: UnderstaffSeverity = useConfig
      ? missing >= 2
        ? "critical"
        : "warning"
      : missing >= 2 || actual === 0
        ? "critical"
        : "warning";
    warnings.push({
      dateKey,
      day,
      kind,
      shiftType: kind,
      count: actual,
      threshold: max,
      label: useConfig ? severityLabel(severity) : legacyLabel || severityLabel(severity),
      actual,
      target: max,
      max,
      missing,
      severity,
    });
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, monthIndex1 - 1, day);
    // Historical staffing gaps are informative in reports, but they are no
    // longer actionable warnings in the operational shift plan.
    if (date < today) continue;
    const dow = date.getDay(); // 0=Sun..6=Sat

    let early = 0;
    let late = 0;
    let night = 0;
    let nightLegacy = 0; // old behaviour counted only "N"

    for (const days of Object.values(schedule || {})) {
      const code = String((days as any)?.[day] || "")
        .trim()
        .toUpperCase();
      if (!code) continue;

      if (EARLY_SHIFT_CODES.includes(code as (typeof EARLY_SHIFT_CODES)[number])) early++;
      if (LATE_SHIFT_CODES.includes(code as (typeof LATE_SHIFT_CODES)[number])) late++;
      if (code === "N" || code === "NK") night++;
      if (code === "N") nightLegacy++;
    }

    const dateKey = ymd(year, monthIndex1, day);

    if (useConfig) {
      const globalLimits = dayLimits ? { dayLimits, isHoliday: Boolean(config?.holidays?.[dateKey]) } : null;
      push(dateKey, day, "night", night, computeMaxStaffing("night", dow, definitions, staffingRules, globalLimits));
      push(dateKey, day, "late", late, computeMaxStaffing("late", dow, definitions, staffingRules, globalLimits));
      push(dateKey, day, "early", early, computeMaxStaffing("early", dow, definitions, staffingRules, globalLimits));
      continue;
    }

    // ---- Legacy fallback (definitions not available) ----
    const legacyNight = nightLegacy;

    const isWeekday = dow >= 1 && dow <= 5;
    if (isWeekday) push(dateKey, day, "night", legacyNight, 4, `Nachtschicht: ${legacyNight}/4`);

    const lateThreshold = dow === 0 ? 2 : 3;
    const suffix = dow === 6 ? " (Sa)" : dow === 0 ? " (So)" : "";
    push(dateKey, day, "late", late, lateThreshold, `Spätschicht${suffix}: ${late}/${lateThreshold}`);

    if (dow === 6) push(dateKey, day, "early", early, 3, `Frühschicht (Sa): ${early}/3`);
    if (dow === 0) push(dateKey, day, "early", early, 2, `Frühschicht (So): ${early}/2`);
  }

  return warnings;
}
