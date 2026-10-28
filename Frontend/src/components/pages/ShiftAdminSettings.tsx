/* ================================================ */
/* Shift Admin Settings                             */
/* Reusable panel for Admin Settings + legacy page  */
/* ================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../api/api';
import { EnterpriseFeatureHero, EnterpriseHeader, EnterprisePageShell } from '../layout/EnterpriseLayout';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  HelpCircle,
  Plus,
  RotateCcw,
  Save,
  Scale,
  Search,
  ShieldAlert,
  Settings2,
  Sliders,
  Timer,
  Trash2,
  UserX,
  Users,
} from 'lucide-react';
import type { TranslationKey } from '../../context/LanguageContext';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { dedupeEmployeeNames } from '../../utils/employeeNames';
import { PreferenceWeightSettings } from './PreferenceWeightSettings';

/* ── locale helpers ── */

function getWeekdayOptions(isGerman: boolean) {
  return [
    { value: 1, label: isGerman ? 'Mo' : 'Mon' },
    { value: 2, label: isGerman ? 'Di' : 'Tue' },
    { value: 3, label: isGerman ? 'Mi' : 'Wed' },
    { value: 4, label: isGerman ? 'Do' : 'Thu' },
    { value: 5, label: isGerman ? 'Fr' : 'Fri' },
    { value: 6, label: isGerman ? 'Sa' : 'Sat' },
    { value: 0, label: isGerman ? 'So' : 'Sun' },
  ] as const;
}

function getShiftDayOffsetOptions(isGerman: boolean) {
  return [
    { value: 0, label: isGerman ? 'Plan-Tag' : 'Planned day' },
    { value: 1, label: isGerman ? 'Folgetag' : 'Next day' },
  ] as const;
}

/* ── interfaces ── */

interface ShiftMode {
  id: number;
  label: string;
  start_time: string;
  end_time: string;
  duration_hours: number;
  free_days_after: number;
}

interface ShiftDayOverride {
  weekday: number;
  start_time: string;
  end_time: string;
  start_day_offset: number;
  end_day_offset: number;
  duration_hours: number;
}

interface ShiftDefinition {
  id: number;
  code: string;
  name: string;
  short_name: string;
  shift_type: string;
  start_time: string | null;
  end_time: string | null;
  start_day_offset: number;
  end_day_offset: number;
  duration_hours: number;
  series_days: number;
  min_staff: number;
  max_staff: number;
  color_hex: string;
  is_active: boolean;
  sort_order: number;
  applicable_days: number[];
  free_days_after?: number | null;
  modes?: ShiftMode[];
  day_overrides?: ShiftDayOverride[];
}

type PlanningAuditLevel = 'error' | 'warning';

interface PlanningAuditIssue {
  id: string;
  level: PlanningAuditLevel;
  messageDe: string;
  messageEn: string;
}

function normalizeShiftModes(definition: ShiftDefinition): ShiftMode[] {
  if (Array.isArray(definition.modes) && definition.modes.length > 0) return definition.modes;
  return [{ id: 1, label: 'Standard', start_time: definition.start_time || '00:00', end_time: definition.end_time || '00:00', duration_hours: definition.duration_hours || 0, free_days_after: 0 }];
}

/** Most Colo people needed on one weekday at the same time. */
function getMaxColoStaffPerDay(requirements: ColoRequirement[]): number {
  return Math.max(0, ...[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
    requirements.filter((entry) => entry.weekdays.includes(weekday)).reduce((sum, entry) => sum + entry.staff, 0)
  )));
}

function getPlanningAuditIssues({
  definitions,
  rotation,
  planConfig,
  exclusions,
  employees,
  dbsPool,
  dbsConfig,
  coloConfig,
  overtimeConfig,
  advancedSettings,
}: {
  definitions: ShiftDefinition[];
  rotation: RotationRules | null;
  planConfig: PlanningConfig | null;
  exclusions: ShiftplanExclusion[];
  employees: string[];
  dbsPool: SpecialPoolEntry[];
  dbsConfig: DbsConfig;
  coloConfig: ColoConfig;
  overtimeConfig: OvertimeConfig;
  advancedSettings: AdvancedPlanningSettings;
}): PlanningAuditIssue[] {
  const issues: PlanningAuditIssue[] = [];
  const activeDefinitions = definitions.filter((definition) => definition.is_active);
  const activeByType = new Set(activeDefinitions.map((definition) => definition.shift_type));
  const add = (id: string, level: PlanningAuditLevel, messageDe: string, messageEn: string) => issues.push({ id, level, messageDe, messageEn });

  if (activeDefinitions.length === 0) {
    add('no-active-shifts', 'error', 'Es ist keine aktive Schicht definiert. Der Generator kann keinen Dienstplan erstellen.', 'No active shift is defined. The generator cannot create a schedule.');
  }

  if (!activeByType.has('early') || !activeByType.has('late')) {
    add('missing-core-shift-type', 'warning', 'Mindestens eine Früh- oder Spätschicht fehlt. Prüfe, ob die gewünschte Grundversorgung damit noch möglich ist.', 'At least one early or late shift is missing. Check whether the intended base coverage is still possible.');
  }

  const codes = new Set<string>();
  for (const definition of activeDefinitions) {
    const code = String(definition.code || '').trim().toUpperCase();
    if (!code) add(`empty-code-${definition.id}`, 'error', 'Eine aktive Schicht hat keinen Code.', 'An active shift has no code.');
    if (code && codes.has(code)) add(`duplicate-code-${code}`, 'error', `Der Schichtcode „${code}" ist mehrfach aktiv.`, `The shift code "${code}" is active more than once.`);
    codes.add(code);
    if (Number(definition.duration_hours) <= 0) add(`invalid-duration-${definition.id}`, 'error', `Die Schicht „${definition.code}" hat keine gültige Dauer.`, `Shift "${definition.code}" has no valid duration.`);
    if (!GLOBAL_STAFFING_TYPES.has(definition.shift_type) && Number(definition.min_staff) > Number(definition.max_staff)) add(`invalid-staffing-${definition.id}`, 'error', `Bei „${definition.code}" ist die Mindestbesetzung höher als die Maximalbesetzung.`, `For "${definition.code}", minimum staffing is higher than maximum staffing.`);
    if (normalizeApplicableDays(definition.applicable_days).length === 0) add(`no-days-${definition.id}`, 'error', `Die aktive Schicht „${definition.code}" ist keinem Wochentag zugeordnet.`, `The active shift "${definition.code}" is not assigned to any weekday.`);
    if (overtimeConfig.dailyMode === 'block' && Number(overtimeConfig.maxDailyHours) > 0 && Number(definition.duration_hours) > Number(overtimeConfig.maxDailyHours)) {
      add(`daily-limit-${definition.id}`, 'error', `„${definition.code}" dauert länger als die als harte Grenze gesetzte tägliche Höchstarbeitszeit.`, `"${definition.code}" is longer than the hard daily maximum working-time limit.`);
    }
  }

  if (rotation) {
    const longestSeries = Math.max(1, ...activeDefinitions.map((definition) => normalizeSeriesDays(definition.series_days, 1)));
    const longestNightSeries = Math.max(0, ...activeDefinitions.filter((definition) => definition.shift_type === 'night').map((definition) => normalizeSeriesDays(definition.series_days, 1)));
    if (rotation.max_consecutive_workdays > 0 && rotation.max_consecutive_workdays < longestSeries) {
      add('workday-series-conflict', 'error', `Maximale Arbeitstage am Stück (${rotation.max_consecutive_workdays}) sind kürzer als ein aktiver Schichtblock (${longestSeries} Tage).`, `Maximum consecutive workdays (${rotation.max_consecutive_workdays}) are shorter than an active shift block (${longestSeries} days).`);
    }
    if (rotation.max_consecutive_same > 0 && rotation.max_consecutive_same < longestSeries) {
      add('same-shift-series-conflict', 'error', `Die Grenze für gleiche Schichten (${rotation.max_consecutive_same}) ist kürzer als ein aktiver Schichtblock (${longestSeries} Tage).`, `The consecutive same-shift limit (${rotation.max_consecutive_same}) is shorter than an active shift block (${longestSeries} days).`);
    }
    if (longestNightSeries > 0 && rotation.max_nights_per_month > 0 && rotation.max_nights_per_month < longestNightSeries) {
      add('night-limit-series-conflict', 'error', `Das Nachtlimit pro Monat (${rotation.max_nights_per_month}) ist kleiner als ein Nachtblock (${longestNightSeries} Tage).`, `The monthly night limit (${rotation.max_nights_per_month}) is shorter than a night block (${longestNightSeries} days).`);
    }
  }

  if (planConfig && planConfig.monthly_target_hours <= 0) {
    add('missing-target-hours', 'warning', 'Die monatliche Sollzeit ist 0. Eine verlässliche Stundenplanung ist damit nicht möglich.', 'Monthly target hours are 0. Reliable hour planning is not possible.');
  }

  for (const exclusion of exclusions.filter((entry) => entry.fixed_shift_type)) {
    if (!activeByType.has(String(exclusion.fixed_shift_type))) {
      add(`fixed-shift-missing-${exclusion.id}`, 'error', `${exclusion.employee_name} ist fest für „${formatFixedShiftType(exclusion.fixed_shift_type, true)}" vorgesehen, aber es gibt keine aktive Schicht dieses Typs.`, `${exclusion.employee_name} is fixed to "${formatFixedShiftType(exclusion.fixed_shift_type, false)}", but there is no active shift of that type.`);
    }
  }

  if (dbsConfig.enabled) {
    if (!activeDefinitions.some((definition) => definition.code === dbsConfig.shiftCode)) {
      add('dbs-shift-missing', 'error', `Die DBS-Schicht „${dbsConfig.shiftCode}" ist nicht aktiv definiert.`, `The DBS shift "${dbsConfig.shiftCode}" is not actively defined.`);
    }
    if (dbsPool.length === 0) {
      add('dbs-pool-empty', 'error', 'DBS ist aktiv und benötigt Personal, aber der DBS-Pool ist leer.', 'DBS is active and requires staffing, but the DBS pool is empty.');
    }
    if (dbsPool.some((entry) => !employees.includes(entry.employee_name))) {
      add('dbs-pool-unknown-employee', 'warning', 'Der DBS-Pool enthält Mitarbeitende, die nicht mehr in der aktuellen Mitarbeiterliste stehen.', 'The DBS pool contains employees who are no longer in the current employee list.');
    }
  }

  if (coloConfig.enabled) {
    const requiredPoolSize = getMaxColoStaffPerDay(coloConfig.requirements);
    if (requiredPoolSize > coloConfig.employeePool.length) {
      add('colo-pool-too-small', 'error', `Für die aktivierte Colo-Planung werden gleichzeitig bis zu ${requiredPoolSize} Mitarbeitende benötigt, im Pool sind aber nur ${coloConfig.employeePool.length}.`, `Enabled Colo planning needs up to ${requiredPoolSize} employees at the same time, but the pool only has ${coloConfig.employeePool.length}.`);
    }
    if (coloConfig.employeePool.some((employee) => !employees.includes(employee))) {
      add('colo-pool-unknown-employee', 'warning', 'Der Colo-Pool enthält Mitarbeitende, die nicht mehr in der aktuellen Mitarbeiterliste stehen.', 'The Colo pool contains employees who are no longer in the current employee list.');
    }
  }

  return issues;
}

interface RotationRules {
  max_consecutive_same: number;
  max_consecutive_workdays: number;
  min_free_after_streak: number;
  night_to_early_forbidden: boolean;
  late_to_early_forbidden: boolean;
  min_hours_between_shifts: number;
  max_nights_per_month: number;
  max_weekends_per_month: number;
  weekend_rule: string;
  free_days_after_night: number;
  free_days_after_weekend: number;
  night_next_workday: number;
  night_next_shift_code: string | null;
  late_before_night_required: boolean;
  stability_priority: number;
  max_shift_type_changes_per_month: number;
  min_free_weekends_per_month: number;
  min_recovery_days_after_shift_change: number;
  short_night_mode_enabled?: boolean;
  short_night_free_days_after?: number;
}

interface ShortNightOptions {
  mode: 'SEVEN_DAY_ONLY' | 'SHORT_ONLY' | 'MIXED';
  enabled: boolean;
  start_time: string;
  end_time: string;
  free_days_after: number;
  duration_hours?: number;
  series_days?: number;
}

interface FairnessRules {
  balance_nights: boolean;
  balance_weekends: boolean;
  balance_total_load: boolean;
  max_deviation_percent: number;
  fairness_vs_preference: string;
}

interface PlanningConfig {
  respect_employee_wishes: boolean;
  hard_rules_priority: number;
  soft_wishes_priority: number;
  fairness_priority: number;
  admin_override_priority: number;
  monthly_target_hours: number;
  annual_target_hours: number;
}

interface ShiftplanExclusion {
  id: number;
  employee_name: string;
  reason: string;
  reason_text: string | null;
  fixed_shift_type: string | null;
  weekdays?: number[] | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

const ALL_WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];

function normalizeExclusionWeekdays(value: unknown): number[] {
  const source = Array.isArray(value) ? value : ALL_WEEKDAYS;
  const weekdays = [...new Set(source.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];
  return weekdays.length > 0 ? weekdays : ALL_WEEKDAYS;
}

function formatExclusionWeekdays(value: unknown, isGerman: boolean): string {
  const weekdays = normalizeExclusionWeekdays(value);
  if (weekdays.length === 7) return isGerman ? 'Alle Wochentage' : 'All weekdays';
  return getWeekdayOptions(isGerman).filter((option) => weekdays.includes(option.value)).map((option) => option.label).join(', ');
}

/** Early/late/night staffing is set globally in the admin tab "Besetzung", not per shift. */
const GLOBAL_STAFFING_TYPES = new Set(["early", "late", "night"]);

interface StaffingRuleRow {
  shift_type: 'early' | 'late' | 'night';
  min_count: number;
  max_count: number | null;
}

interface SpecialPoolEntry {
  id?: number;
  shift_code: string;
  employee_name: string;
  monthly_max_assignments: number;
  sort_order: number;
  is_active: boolean;
  working_weekdays?: number[];
  free_days_after_block?: number;
  /** Shifts worked outside DBS (empty = like everybody else) and the day cap per month (null = unlimited). */
  other_shift_codes?: string[] | null;
  other_days_per_month?: number | null;
  /** Own times of this DBS employee (HH:MM); null = times of the DBS shift. */
  start_time?: string | null;
  end_time?: string | null;
  duration_hours?: number | null;
}

/** Wishes for the time outside DBS are stored as shift types (EARLY / LATE / NIGHT); legacy shift codes are converted. */
function toOutsideDbsTypes(value?: string[] | null): string[] {
  const types = new Set<string>();
  for (const raw of value || []) {
    const code = String(raw || "").trim().toUpperCase();
    if (code === "EARLY" || code === "LATE" || code === "NIGHT") types.add(code);
    else if (code.startsWith("E")) types.add("EARLY");
    else if (code.startsWith("L")) types.add("LATE");
    else if (code.startsWith("N")) types.add("NIGHT");
  }
  return ["EARLY", "LATE", "NIGHT"].filter((type) => types.has(type));
}

/** Paid hours for own DBS times: presence minus 1 h break from 6 h presence (mirrors the backend). */
function getDbsOwnPaidHours(start?: string | null, end?: string | null): number | null {
  const toMinutes = (value?: string | null) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const from = toMinutes(start);
  const to = toMinutes(end);
  if (from === null || to === null) return null;
  const presence = ((to <= from ? to + 1440 : to) - from) / 60;
  const paid = presence > 6 ? presence - 1 : presence;
  return Math.round(paid * 100) / 100;
}

interface AdminEmployeeFlag {
  id: number;
  employee_name: string;
  note: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface AdvancedPlanningSettings {
  issuePanelEnabled: boolean;
  issueShowSolutions: boolean;
  issuePriorityMode: 'staffing_first' | 'balanced' | 'fairness_first';
  adminFlagsEnabled: boolean;
  /** 0-100: how strongly the generator avoids repeating the same blocks (60 = default). */
  varietyPriority: number;
  /** Late+night wishers may work Thursday/Friday late shifts above the weekday maximum (marked in the draft). */
  lateOverflowThuFri: boolean;
}

type ColoShiftType = 'early' | 'late' | 'night';

/** "On these weekdays n pool employees of this shift type are needed for Colo." */
interface ColoRequirement {
  id: string;
  weekdays: number[];
  shift_type: ColoShiftType;
  staff: number;
  label?: string;
}

interface DbsConfig {
  enabled: boolean;
  shiftCode: string;
  freeDaysAfterBlock: number;
  fillGaps: boolean;
}

interface ColoConfig {
  enabled: boolean;
  employeePool: string[];
  requirements: ColoRequirement[];
}

interface PlanningHealthIssue {
  id: string;
  level: 'error' | 'warning' | 'info';
  area: string;
  messageDe: string;
  messageEn: string;
}

interface OvertimeConfig {
  /** true = the generator may plan days beyond the target hours without limit (adjustable). */
  unlimited: boolean;
  maxOvertimeHours: number;
  overtimeMode: 'show' | 'warn' | 'hard';
  maxDailyHours: number;
  maxWeeklyHours: number;
  dailyMode: 'off' | 'warn' | 'block';
  weeklyMode: 'off' | 'warn' | 'block';
}

/* ── defaults & constants ── */

const DEFAULT_ADVANCED_SETTINGS: AdvancedPlanningSettings = {
  issuePanelEnabled: true,
  issueShowSolutions: true,
  issuePriorityMode: 'balanced',
  adminFlagsEnabled: false,
  varietyPriority: 60,
  lateOverflowThuFri: false,
};

const DEFAULT_DBS_CONFIG: DbsConfig = {
  enabled: true,
  shiftCode: 'DBS',
  freeDaysAfterBlock: 2,
  fillGaps: false,
};

const DEFAULT_COLO_CONFIG: ColoConfig = {
  enabled: false,
  employeePool: [],
  requirements: [],
};

const COLO_SHIFT_TYPE_OPTIONS: Array<{ value: ColoShiftType; labelDe: string; labelEn: string }> = [
  { value: 'early', labelDe: 'Früh', labelEn: 'Early' },
  { value: 'late', labelDe: 'Spät', labelEn: 'Late' },
  { value: 'night', labelDe: 'Nacht', labelEn: 'Night' },
];

type WishStrengthKey = 'unwanted_shifts' | 'preferred_shifts' | 'holidays' | 'blocked_days' | 'max_nights' | 'max_weekends' | 'colleagues';
type WishStrengths = Record<WishStrengthKey, number>;

const WISH_STRENGTH_PREFIX = 'shiftplan.pref_strength.';
const DEFAULT_WISH_STRENGTHS: WishStrengths = {
  unwanted_shifts: 100,
  preferred_shifts: 100,
  holidays: 100,
  blocked_days: 100,
  max_nights: 100,
  max_weekends: 100,
  colleagues: 50,
};
const WISH_STRENGTH_KEYS = Object.keys(DEFAULT_WISH_STRENGTHS) as WishStrengthKey[];

function extractWishStrengths(settings: Record<string, string>): WishStrengths {
  const result = { ...DEFAULT_WISH_STRENGTHS };
  for (const key of WISH_STRENGTH_KEYS) {
    const raw = settings[`${WISH_STRENGTH_PREFIX}${key}`];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) result[key] = Math.min(100, Math.max(0, Math.round(parsed)));
  }
  return result;
}

/** Former three Colo counts as a requirement list (same rules as the backend). */
function legacyColoRequirements(settings: Record<string, string>): ColoRequirement[] {
  const count = (value: unknown) => Math.max(0, Math.trunc(parseNumberSetting(value, 1)));
  const entries: ColoRequirement[] = [
    { id: 'preparation', label: 'Colo Vorbereitung (Börse: E-Mail/Telefon)', weekdays: [1, 2, 3, 4, 5], shift_type: 'early', staff: count(settings['shiftplan.colo_weekday_preparation_staff']) },
    { id: 'night', label: 'Colo Nacht', weekdays: [0, 1, 2, 3, 4, 5, 6], shift_type: 'night', staff: count(settings['shiftplan.colo_night_staff']) },
    { id: 'weekend', label: 'Colo Wochenende (Arbeiten vor Ort)', weekdays: [0, 6], shift_type: 'early', staff: count(settings['shiftplan.colo_weekend_day_staff'] ?? settings['shiftplan.colo_weekend_installation_staff']) },
  ];
  return entries.filter((entry) => entry.staff > 0);
}

function normalizeColoWeekdays(value: unknown): number[] {
  const source = Array.isArray(value) ? value : [];
  return [...new Set(source.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((left, right) => left - right);
}

function parseColoRequirements(raw: unknown): ColoRequirement[] | null {
  let entries: unknown = raw;
  if (typeof raw === 'string') {
    try { entries = JSON.parse(raw); } catch { return null; }
  }
  if (!Array.isArray(entries)) return null;
  return entries.map((entry, index) => {
    const item = (entry || {}) as Partial<ColoRequirement>;
    const shiftType = (['early', 'late', 'night'].includes(String(item.shift_type)) ? item.shift_type : 'early') as ColoShiftType;
    return {
      id: String(item.id || `req-${index + 1}`),
      weekdays: normalizeColoWeekdays(item.weekdays),
      shift_type: shiftType,
      staff: Math.max(1, Math.trunc(Number(item.staff) || 1)),
      ...(item.label ? { label: String(item.label) } : {}),
    };
  });
}

function newColoRequirementId() {
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const DEFAULT_OVERTIME_CONFIG: OvertimeConfig = {
  unlimited: true,
  maxOvertimeHours: 0,
  overtimeMode: 'show',
  maxDailyHours: 10,
  maxWeeklyHours: 48,
  dailyMode: 'warn',
  weeklyMode: 'warn',
};

type FixedShiftTypeValue = '' | 'early' | 'late' | 'night';

const FIXED_SHIFT_TYPE_OPTIONS: Array<{ value: FixedShiftTypeValue; labelDe: string; labelEn: string }> = [
  { value: '', labelDe: 'Komplett ausschliessen', labelEn: 'Exclude completely' },
  { value: 'early', labelDe: 'Nur Fruehschicht', labelEn: 'Early only' },
  { value: 'late', labelDe: 'Nur Spaetschicht', labelEn: 'Late only' },
  { value: 'night', labelDe: 'Nur Nachtschicht', labelEn: 'Night only' },
];
const BUILT_IN_SHIFT_CODES = new Set(['E1', 'E2', 'E1SA', 'E1WE', 'E2SA', 'E2WE', 'L1', 'L2', 'L1WE', 'N', 'DBS', 'FS', 'ABW', 'S']);

function formatFixedShiftType(value: string | null | undefined, isGerman: boolean) {
  switch (String(value || '').trim().toLowerCase()) {
    case 'early':
      return isGerman ? 'Nur Fruehschicht' : 'Early only';
    case 'late':
      return isGerman ? 'Nur Spaetschicht' : 'Late only';
    case 'night':
      return isGerman ? 'Nur Nachtschicht' : 'Night only';
    default:
      return isGerman ? 'Komplett ausgeschlossen' : 'Fully excluded';
  }
}

/* ── parsers / normalizers ── */

function parseBooleanSetting(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === 'true') return true;
    if (value === 'false') return false;
  }
  return fallback;
}

function parseNumberSetting(value: unknown, fallback: number) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractAdvancedPlanningSettings(settings: Record<string, string>): AdvancedPlanningSettings {
  return {
    issuePanelEnabled: parseBooleanSetting(settings['shiftplan.issue_panel_enabled'], DEFAULT_ADVANCED_SETTINGS.issuePanelEnabled),
    issueShowSolutions: parseBooleanSetting(settings['shiftplan.issue_show_solutions'], DEFAULT_ADVANCED_SETTINGS.issueShowSolutions),
    issuePriorityMode: (settings['shiftplan.issue_priority_mode'] as AdvancedPlanningSettings['issuePriorityMode']) || DEFAULT_ADVANCED_SETTINGS.issuePriorityMode,
    adminFlagsEnabled: parseBooleanSetting(settings['shiftplan.admin_flags_enabled'], DEFAULT_ADVANCED_SETTINGS.adminFlagsEnabled),
    varietyPriority: Math.min(100, Math.max(0, parseNumberSetting(settings['shiftplan.variety_priority'], DEFAULT_ADVANCED_SETTINGS.varietyPriority))),
    lateOverflowThuFri: parseBooleanSetting(settings['shiftplan.late_overflow_thu_fri'], DEFAULT_ADVANCED_SETTINGS.lateOverflowThuFri),
  };
}

function extractDbsConfig(settings: Record<string, string>): DbsConfig {
  return {
    enabled: parseBooleanSetting(settings['shiftplan.dbs_enabled'], DEFAULT_DBS_CONFIG.enabled),
    shiftCode: settings['shiftplan.dbs_shift_code'] || DEFAULT_DBS_CONFIG.shiftCode,
    freeDaysAfterBlock: parseNumberSetting(settings['shiftplan.dbs_free_days_after_block'], DEFAULT_DBS_CONFIG.freeDaysAfterBlock),
    fillGaps: parseBooleanSetting(settings['shiftplan.dbs_fill_gaps'], DEFAULT_DBS_CONFIG.fillGaps),
  };
}

function parseEmployeePoolSetting(value: unknown): string[] {
  let entries = value;
  if (typeof value === 'string') {
    try {
      entries = JSON.parse(value);
    } catch {
      entries = value.split(',');
    }
  }
  if (!Array.isArray(entries)) return [];
  return dedupeEmployeeNames(entries.map((entry) => String(entry || '').trim()).filter(Boolean));
}

function extractColoConfig(settings: Record<string, string>): ColoConfig {
  return {
    enabled: parseBooleanSetting(settings['shiftplan.colo_enabled'], DEFAULT_COLO_CONFIG.enabled),
    employeePool: parseEmployeePoolSetting(settings['shiftplan.colo_pool']),
    requirements: parseColoRequirements(settings['shiftplan.colo_requirements']) ?? legacyColoRequirements(settings),
  };
}


function extractOvertimeConfig(settings: Record<string, string>): OvertimeConfig {
  const storedUnlimited = settings['shiftplan.overtime_unlimited'];
  return {
    unlimited: storedUnlimited === undefined || storedUnlimited === null || storedUnlimited === '' ? DEFAULT_OVERTIME_CONFIG.unlimited : String(storedUnlimited) === 'true',
    maxOvertimeHours: parseNumberSetting(settings['shiftplan.max_overtime_hours'], DEFAULT_OVERTIME_CONFIG.maxOvertimeHours),
    overtimeMode: (settings['shiftplan.overtime_mode'] as OvertimeConfig['overtimeMode']) || DEFAULT_OVERTIME_CONFIG.overtimeMode,
    maxDailyHours: parseNumberSetting(settings['shiftplan.max_daily_hours'], DEFAULT_OVERTIME_CONFIG.maxDailyHours),
    maxWeeklyHours: parseNumberSetting(settings['shiftplan.max_weekly_hours'], DEFAULT_OVERTIME_CONFIG.maxWeeklyHours),
    dailyMode: (settings['shiftplan.daily_mode'] as OvertimeConfig['dailyMode']) || DEFAULT_OVERTIME_CONFIG.dailyMode,
    weeklyMode: (settings['shiftplan.weekly_mode'] as OvertimeConfig['weeklyMode']) || DEFAULT_OVERTIME_CONFIG.weeklyMode,
  };
}

function normalizeApplicableDays(value: unknown): number[] {
  const fallback = [1, 2, 3, 4, 5, 6, 0];

  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => Number.parseInt(String(entry), 10))
      .filter((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 6);
    return normalized.length ? [...new Set(normalized)] : fallback;
  }

  if (typeof value === 'string') {
    try {
      return normalizeApplicableDays(JSON.parse(value));
    } catch {
      return fallback;
    }
  }

  return fallback;
}

function formatApplicableDays(days: number[], weekdayOptions: ReadonlyArray<{ value: number; label: string }>, isGerman: boolean) {
  const normalized = normalizeApplicableDays(days);
  if (normalized.length === weekdayOptions.length) return isGerman ? 'Mo bis So' : 'Mon to Sun';
  return weekdayOptions.filter((option) => normalized.includes(option.value)).map((option) => option.label).join(', ');
}

function normalizeShiftDayOffset(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 0) return fallback;
  return parsed;
}

function normalizeSeriesDays(value: unknown, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function isHalfDayShiftCode(code: string) {
  return /^H[EL]\d+$/i.test(String(code || '').trim());
}

function formatShiftSpanPreview(definition: ShiftDefinition, shiftDayOffsetOptions: ReadonlyArray<{ value: number; label: string }>, isGerman: boolean) {
  const fallbackLabel = isGerman ? 'Plan-Tag' : 'Planned day';
  const startLabel = shiftDayOffsetOptions.find((option) => option.value === normalizeShiftDayOffset(definition.start_day_offset))?.label || fallbackLabel;
  const endLabel = shiftDayOffsetOptions.find((option) => option.value === normalizeShiftDayOffset(definition.end_day_offset))?.label || fallbackLabel;
  return `${startLabel} ${definition.start_time || '—'} ${isGerman ? 'bis' : 'to'} ${endLabel} ${definition.end_time || '—'}`;
}

/* ── reusable sub-components ── */

function HelpTooltip({ textKey, t }: { textKey: TranslationKey; t: (key: TranslationKey) => string }) {
  const [show, setShow] = useState(false);

  return (
    <span className="relative inline-flex ml-1">
      <button
        type="button"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onClick={() => setShow((value) => !value)}
        className="text-muted-foreground hover:text-blue-400 transition"
        aria-label="Help"
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {show ? (
        <div className="theme-popover-surface absolute left-6 top-0 z-50 w-72 rounded-lg border border-blue-500/30 p-3 text-xs leading-relaxed text-muted-foreground shadow-xl">
          {t(textKey)}
        </div>
      ) : null}
    </span>
  );
}

function SectionHelp({ textKey, t }: { textKey: TranslationKey; t: (key: TranslationKey) => string }) {
  const [show, setShow] = useState(false);

  return (
    <button
      type="button"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}
      className="relative text-muted-foreground hover:text-blue-400 transition"
      aria-label="Help"
    >
      <HelpCircle className="w-4 h-4" />
      {show ? (
        <div className="theme-popover-surface absolute left-6 top-0 z-50 w-80 rounded-lg border border-blue-500/30 p-3 text-xs leading-relaxed text-left font-normal normal-case tracking-normal text-muted-foreground shadow-xl">
          {t(textKey)}
        </div>
      ) : null}
    </button>
  );
}

function Section({
  title,
  icon: Icon,
  children,
  defaultOpen = true,
  helpKey,
  t,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  helpKey?: TranslationKey;
  t?: (key: TranslationKey) => string;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="theme-glass-panel overflow-hidden rounded-3xl border shadow-[0_12px_40px_rgba(15,23,42,0.22)] backdrop-blur-sm">
      <div className="flex items-center gap-3 px-5 py-4 transition hover:bg-accent/60">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 text-sm font-semibold text-foreground">{title}</div>
          </div>
          {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
        </button>
        {helpKey && t ? <SectionHelp textKey={helpKey} t={t} /> : null}
      </div>
      {open ? <div className="border-t border-border/60 px-5 pb-5 pt-4">{children}</div> : null}
    </section>
  );
}

function getShiftDurationPreview(startTime: string, endTime: string, startOffset = 0, endOffset = 0) {
  const toMinutes = (value: string) => {
    const [hours, minutes] = String(value || '00:00').slice(0, 5).split(':').map(Number);
    return hours * 60 + minutes;
  };
  const start = toMinutes(startTime) + startOffset * 1440;
  let end = toMinutes(endTime) + endOffset * 1440;
  if (end <= start) end += 1440;
  const presence = (end - start) / 60;
  // Shifts longer than six hours contain an unpaid one-hour break.
  return presence > 6 ? presence - 1 : presence;
}

function SettingsGroup({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-border/60 px-1 pb-3 pt-4 sm:flex-row sm:items-end sm:justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-foreground">{title}</h2>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

/* ── helpers for the merged settings ── */

function wishStrengthPayload(strengths: WishStrengths): Record<string, number> {
  const payload: Record<string, number> = {};
  for (const key of WISH_STRENGTH_KEYS) payload[`${WISH_STRENGTH_PREFIX}${key}`] = strengths[key];
  return payload;
}

/** Entries without a weekday or without staff are dropped when saving. */
function cleanColoRequirements(requirements: ColoRequirement[]): ColoRequirement[] {
  return requirements
    .map((entry) => ({ ...entry, weekdays: normalizeColoWeekdays(entry.weekdays), staff: Math.max(0, Math.trunc(Number(entry.staff) || 0)) }))
    .filter((entry) => entry.weekdays.length > 0 && entry.staff > 0);
}

type SettingsGroupId = 'overview' | 'shifts' | 'rules' | 'wishes' | 'special' | 'exceptions';

const SETTINGS_GROUPS: Array<{ id: SettingsGroupId; icon: React.ElementType; labelDe: string; labelEn: string; descriptionDe: string; descriptionEn: string }> = [
  { id: 'overview', icon: ShieldAlert, labelDe: 'Überblick', labelEn: 'Overview', descriptionDe: 'Prüfung auf Widersprüche und Einstieg', descriptionEn: 'Contradiction check and getting started' },
  { id: 'shifts', icon: Clock, labelDe: 'Schichten & Zeiten', labelEn: 'Shifts & times', descriptionDe: 'Welche Schichten es gibt und wann sie laufen', descriptionEn: 'Which shifts exist and when they run' },
  { id: 'rules', icon: RotateCcw, labelDe: 'Regeln & Erholung', labelEn: 'Rules & recovery', descriptionDe: 'Ruhetage, Nächte, Wochenenden, Überstunden', descriptionEn: 'Days off, nights, weekends, overtime' },
  { id: 'wishes', icon: Scale, labelDe: 'Wünsche & Fairness', labelEn: 'Wishes & fairness', descriptionDe: 'Wie stark Wünsche zählen, Sollstunden', descriptionEn: 'How much wishes count, target hours' },
  { id: 'special', icon: Building2, labelDe: 'DBS & Colo', labelEn: 'DBS & Colo', descriptionDe: 'Sonderdienste und ihr Personal', descriptionEn: 'Special duties and their staff' },
  { id: 'exceptions', icon: UserX, labelDe: 'Ausnahmen & Hinweise', labelEn: 'Exceptions & hints', descriptionDe: 'Einzelne Personen, Hinweise im Plan', descriptionEn: 'Single people, hints in the plan' },
];

/* ── main panel ── */

export function ShiftPlanningSettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const { language, t } = useLanguage();
  const { user } = useAuth();
  const isGerman = language === 'de';
  const weekdayOptions = getWeekdayOptions(isGerman);
  const shiftDayOffsetOptions = getShiftDayOffsetOptions(isGerman);
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [rotation, setRotation] = useState<RotationRules | null>(null);
  const [shortNightOptions, setShortNightOptions] = useState<ShortNightOptions>({ mode: 'MIXED', enabled: true, start_time: '21:45', end_time: '06:45', free_days_after: 2, series_days: 3 });
  const [fairness, setFairness] = useState<FairnessRules | null>(null);
  const [planConfig, setPlanConfig] = useState<PlanningConfig | null>(null);
  const [exclusions, setExclusions] = useState<ShiftplanExclusion[]>([]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [dbsPool, setDbsPool] = useState<SpecialPoolEntry[]>([]);
  const [dbsConfig, setDbsConfig] = useState<DbsConfig>(DEFAULT_DBS_CONFIG);
  const [coloConfig, setColoConfig] = useState<ColoConfig>(DEFAULT_COLO_CONFIG);
  const [coloSearch, setColoSearch] = useState('');
  const [overtimeConfig, setOvertimeConfig] = useState<OvertimeConfig>(DEFAULT_OVERTIME_CONFIG);
  const [wishStrengths, setWishStrengths] = useState<WishStrengths>(DEFAULT_WISH_STRENGTHS);
  const [healthIssues, setHealthIssues] = useState<PlanningHealthIssue[]>([]);
  const [activeGroup, setActiveGroup] = useState<SettingsGroupId>('overview');
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedPlanningSettings>(DEFAULT_ADVANCED_SETTINGS);
  const [adminFlags, setAdminFlags] = useState<AdminEmployeeFlag[]>([]);
  const [newAdminFlagName, setNewAdminFlagName] = useState('');
  const [newAdminFlagNote, setNewAdminFlagNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [newExclusionName, setNewExclusionName] = useState('');
  const [newExclusionFixedShiftType, setNewExclusionFixedShiftType] = useState<FixedShiftTypeValue>('');
  const [newExclusionWeekdays, setNewExclusionWeekdays] = useState<number[]>(ALL_WEEKDAYS);
  const [staffingRules, setStaffingRules] = useState<StaffingRuleRow[]>([]);
  const [shiftDefaults, setShiftDefaults] = useState<Record<string, { start_time: string; end_time: string; duration_hours: number; min_staff: number; max_staff: number }>>({});
  const [newDbsEmployee, setNewDbsEmployee] = useState('');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [newDefinition, setNewDefinition] = useState({ code: '', name: '', shift_type: 'early', start_time: '06:30', end_time: '15:00', duration_hours: 8, min_staff: 1, max_staff: 5 });
  const [activeShiftModes, setActiveShiftModes] = useState<Record<string, number>>({});
  // Outside DBS an employee can be limited to shift types (multiple choice): early, late, night.
  const outsideDbsShiftOptions = ["EARLY", "LATE", "NIGHT"];
  const outsideDbsLabels: Record<string, string> = isGerman
    ? { EARLY: "Frühschicht", LATE: "Spätschicht", NIGHT: "Nachtschicht" }
    : { EARLY: "Early", LATE: "Late", NIGHT: "Night" };
  const normalNightStaffCap = useMemo(
    () => Math.max(0, Number(staffingRules.find((rule) => rule.shift_type === 'night')?.max_count || 0)),
    [staffingRules]
  );

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── data loading ── */

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [defRes, rotRes, fairRes, planRes, exclRes, basisRes, appSettingsRes, usersRes, flagRes, shortNightRes, staffingRes, defaultsRes, healthRes] = await Promise.all([
        api.get('/shift-config/definitions'),
        api.get('/shift-config/rotation-rules'),
        api.get('/shift-config/fairness-rules'),
        api.get('/shift-config/planning-config'),
        api.get('/shift-config/exclusions'),
        api.get('/shiftplan-control/planning-basis?month=' + new Date().toISOString().slice(0, 7)).catch(() => ({ data: { basis: { employees: [] } } })),
        api.get('/app-settings').catch(() => ({ data: {} })),
        api.get('/admin/users').catch(() => ({ data: [] })),
        api.get('/shift-config/admin-flags').catch(() => ({ data: { flags: [] } })),
        api.get('/shift-config/short-night-options').catch(() => ({ data: { options: null } })),
        api.get('/shift-config/staffing-rules').catch(() => ({ data: { rules: [] } })),
        api.get('/shift-config/defaults').catch(() => ({ data: { definitions: {} } })),
        api.get('/shift-config/planning-health').catch(() => ({ data: { issues: [] } })),
      ]);

      const userEmployees = (Array.isArray(usersRes.data) ? usersRes.data : [])
        .map((user: { provisionedEmployeeName?: string | null; firstName?: string | null; lastName?: string | null; approved?: boolean }) => {
          if (user.approved === false) return '';
          return user.provisionedEmployeeName || `${user.firstName || ''} ${user.lastName || ''}`.trim();
        })
        .filter(Boolean);
      const loadedEmployees = dedupeEmployeeNames([
        ...(basisRes.data.basis?.employees || []),
        ...userEmployees,
      ]);
      const nextDbsConfig = extractDbsConfig(appSettingsRes.data || {});
      const nextColoConfig = extractColoConfig(appSettingsRes.data || {});
      const poolRes = await api.get(`/shift-config/special-pools/${encodeURIComponent(nextDbsConfig.shiftCode)}`).catch(() => ({ data: { assignments: [] } }));

      setDefinitions((defRes.data.definitions || [])
        .filter((definition: ShiftDefinition) => !isHalfDayShiftCode(definition.code) && String(definition.code || '').toUpperCase() !== 'NK')
        .map((definition: ShiftDefinition) => ({
          ...definition,
          applicable_days: normalizeApplicableDays(definition.applicable_days),
          start_day_offset: normalizeShiftDayOffset(definition.start_day_offset, 0),
          end_day_offset: normalizeShiftDayOffset(definition.end_day_offset, definition.shift_type === 'night' ? 1 : 0),
          series_days: normalizeSeriesDays(definition.series_days, 1),
        })));
      setRotation(rotRes.data.rules || null);
      setStaffingRules(staffingRes.data?.rules || []);
      setShiftDefaults(defaultsRes.data?.definitions || {});
      if (shortNightRes.data?.options) setShortNightOptions(shortNightRes.data.options);
      setFairness(fairRes.data.rules || null);
      setPlanConfig(planRes.data.config || null);
      setExclusions((exclRes.data.exclusions || []).filter((entry: ShiftplanExclusion) => entry.is_active));
      setEmployees(loadedEmployees);
      setDbsPool((poolRes.data.assignments || []).map((entry: SpecialPoolEntry) => ({
        ...entry,
        working_weekdays: normalizeApplicableDays(entry.working_weekdays || [1, 2, 3, 4, 5]),
        free_days_after_block: Number(entry.free_days_after_block ?? nextDbsConfig.freeDaysAfterBlock),
      })));
      setDbsConfig(nextDbsConfig);
      setColoConfig({
        ...nextColoConfig,
        employeePool: nextColoConfig.employeePool.filter((employee) => loadedEmployees.includes(employee)),
      });
      setOvertimeConfig(extractOvertimeConfig(appSettingsRes.data || {}));
      setWishStrengths(extractWishStrengths(appSettingsRes.data || {}));
      setHealthIssues(Array.isArray(healthRes.data?.issues) ? healthRes.data.issues : []);
      setAdvancedSettings(extractAdvancedPlanningSettings(appSettingsRes.data || {}));
      setAdminFlags(flagRes.data.flags || []);
      try {
        const rawModes = appSettingsRes.data?.['shiftplan.active_shift_modes'];
        setActiveShiftModes(typeof rawModes === 'string' ? JSON.parse(rawModes) : (rawModes || {}));
      } catch { setActiveShiftModes({}); }
    } catch (error: any) {
      showToast(error?.response?.data?.error || error.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  /* ── save handlers ── */

  const saveDefinition = async (definition: ShiftDefinition) => {
    setSaving(`def-${definition.id}`);
    try {
      await api.put(`/shift-config/definitions/${definition.id}`, {
        ...definition,
        start_time: String(definition.start_time || '').slice(0, 5),
        end_time: String(definition.end_time || '').slice(0, 5),
        applicable_days: normalizeApplicableDays(definition.applicable_days),
      });
      showToast(t("shiftAdmin.toastDefSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveRotation = async () => {
    if (!rotation) return;
    setSaving('rotation');
    try {
      await api.put('/shift-config/rotation-rules', rotation);
      await api.put('/app-settings', {
        'shiftplan.overtime_unlimited': overtimeConfig.unlimited,
        'shiftplan.max_overtime_hours': overtimeConfig.maxOvertimeHours,
        'shiftplan.overtime_mode': overtimeConfig.overtimeMode,
        'shiftplan.max_daily_hours': overtimeConfig.maxDailyHours,
        'shiftplan.max_weekly_hours': overtimeConfig.maxWeeklyHours,
        'shiftplan.daily_mode': overtimeConfig.dailyMode,
        'shiftplan.weekly_mode': overtimeConfig.weeklyMode,
      });
      showToast(t("shiftAdmin.toastRotationSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveFairness = async () => {
    if (!fairness) return;
    setSaving('fairness');
    try {
      await api.put('/shift-config/fairness-rules', fairness);
      showToast(t("shiftAdmin.toastFairnessSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const savePlanConfig = async () => {
    if (!planConfig) return;
    setSaving('planconfig');
    try {
      await api.put('/shift-config/planning-config', planConfig);
      showToast(t("shiftAdmin.toastPlanSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveAdvancedSettings = async () => {
    setSaving('advanced');
    try {
      await api.put('/app-settings', {
        'shiftplan.issue_panel_enabled': advancedSettings.issuePanelEnabled,
        'shiftplan.issue_show_solutions': advancedSettings.issueShowSolutions,
        'shiftplan.issue_priority_mode': advancedSettings.issuePriorityMode,
        'shiftplan.admin_flags_enabled': advancedSettings.adminFlagsEnabled,
        'shiftplan.variety_priority': advancedSettings.varietyPriority,
        'shiftplan.late_overflow_thu_fri': advancedSettings.lateOverflowThuFri,
        ...wishStrengthPayload(wishStrengths),
      });
      showToast(t("shiftAdmin.toastAdvancedSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  /** One save for the whole DBS block: rotation settings and every employee profile. */
  const saveDbs = async () => {
    const incomplete = dbsPool.find((entry) => Boolean(entry.start_time) !== Boolean(entry.end_time));
    if (incomplete) {
      showToast(isGerman ? `Bei ${incomplete.employee_name} fehlt Beginn oder Ende.` : `${incomplete.employee_name} needs both start and end.`, 'err');
      return;
    }
    setSaving('dbs');
    try {
      await api.put('/app-settings', {
        'shiftplan.dbs_enabled': dbsConfig.enabled,
        'shiftplan.dbs_weekdays': JSON.stringify([1, 2, 3, 4, 5, 6, 0]),
        'shiftplan.dbs_shift_code': dbsConfig.shiftCode,
        'shiftplan.dbs_required_staff': 1,
        'shiftplan.dbs_free_days_after_block': dbsConfig.freeDaysAfterBlock,
        'shiftplan.dbs_fill_gaps': dbsConfig.fillGaps,
      });
      const shiftCode = String(dbsConfig.shiftCode || 'DBS').trim().toUpperCase() || 'DBS';
      const payload = dbsPool.map((entry, index) => ({
        employee_name: entry.employee_name,
        // DBS remains a single-person rotation; each profile controls its own working days, times and recovery.
        monthly_max_assignments: 31,
        sort_order: index,
        working_weekdays: normalizeApplicableDays(entry.working_weekdays),
        free_days_after_block: Math.max(0, Math.min(14, Number(entry.free_days_after_block ?? dbsConfig.freeDaysAfterBlock) || 0)),
        start_time: entry.start_time || null,
        end_time: entry.end_time || null,
        other_shift_codes: toOutsideDbsTypes(entry.other_shift_codes),
        other_days_per_month: entry.other_days_per_month ?? null,
      }));
      const { data } = await api.put(`/shift-config/special-pools/${shiftCode}`, { assignments: payload });
      setDbsPool(data.assignments || []);
      await loadAll();
      showToast(isGerman ? 'DBS gespeichert' : 'DBS saved');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveShortNightOptions = async (override?: Partial<ShortNightOptions>) => {
    setSaving('short-night');
    const payload = { ...shortNightOptions, ...override };
    try {
      const { data } = await api.put('/shift-config/short-night-options', payload);
      const next = data.options as ShortNightOptions;
      setShortNightOptions(next);
      setRotation((current) => current ? {
        ...current,
        short_night_mode_enabled: next.mode === 'SHORT_ONLY',
        short_night_free_days_after: next.free_days_after,
      } : current);
      showToast(isGerman ? 'Kurze Nachtschicht gespeichert' : 'Short night shift saved');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  const updateDayOverride = (definitionId: number, weekday: number, field: keyof ShiftDayOverride, value: string | number) => {
    setDefinitions((current) => current.map((definition) => {
      if (definition.id !== definitionId) return definition;
      const existing = (definition.day_overrides || []).find((entry) => Number(entry.weekday) === weekday);
      const fallback: ShiftDayOverride = {
        weekday,
        start_time: String(definition.start_time || '00:00').slice(0, 5),
        end_time: String(definition.end_time || '00:00').slice(0, 5),
        start_day_offset: normalizeShiftDayOffset(definition.start_day_offset),
        end_day_offset: normalizeShiftDayOffset(definition.end_day_offset, definition.shift_type === 'night' ? 1 : 0),
        duration_hours: Number(definition.duration_hours) || 0,
      };
      const nextOverride = { ...(existing || fallback), [field]: value } as ShiftDayOverride;
      return {
        ...definition,
        day_overrides: [...(definition.day_overrides || []).filter((entry) => Number(entry.weekday) !== weekday), nextOverride]
          .sort((left, right) => Number(left.weekday) - Number(right.weekday)),
      };
    }));
  };

  const saveDayOverride = async (definition: ShiftDefinition, weekday: number) => {
    const override = (definition.day_overrides || []).find((entry) => Number(entry.weekday) === weekday);
    if (!override) return;
    setSaving(`override-${definition.id}-${weekday}`);
    try {
      const { data } = await api.put(`/shift-config/definitions/${definition.id}/day-overrides/${weekday}`, {
        ...override,
        start_time: String(override.start_time).slice(0, 5),
        end_time: String(override.end_time).slice(0, 5),
      });
      setDefinitions((current) => current.map((item) => item.id !== definition.id ? item : ({
        ...item,
        day_overrides: [...(item.day_overrides || []).filter((entry) => Number(entry.weekday) !== weekday), data.override],
      })));
      showToast(isGerman ? 'Tageszeit gespeichert.' : 'Day-specific time saved.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  const removeDayOverride = async (definition: ShiftDefinition, weekday: number) => {
    setSaving(`override-${definition.id}-${weekday}`);
    try {
      await api.delete(`/shift-config/definitions/${definition.id}/day-overrides/${weekday}`);
      setDefinitions((current) => current.map((item) => item.id !== definition.id ? item : ({
        ...item,
        day_overrides: (item.day_overrides || []).filter((entry) => Number(entry.weekday) !== weekday),
      })));
      showToast(isGerman ? 'Tageszeit auf Standard zurückgesetzt.' : 'Day-specific time reset to default.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveAdminFlag = async () => {
    if (!newAdminFlagName.trim()) return;
    setSaving('admin-flag');
    try {
      const { data } = await api.put('/shift-config/admin-flags', {
        employee_name: newAdminFlagName.trim(),
        note: newAdminFlagNote.trim(),
        is_active: true,
      });
      setAdminFlags((current) => {
        const withoutCurrent = current.filter((entry) => entry.employee_name !== data.flag.employee_name);
        return [...withoutCurrent, data.flag].sort((left, right) => left.employee_name.localeCompare(right.employee_name, 'de'));
      });
      setNewAdminFlagName('');
      setNewAdminFlagNote('');
      showToast(isGerman ? 'Interner Admin-Hinweis gespeichert.' : 'Internal admin note saved.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  const removeAdminFlag = async (id: number) => {
    setSaving(`admin-flag-${id}`);
    try {
      await api.delete(`/shift-config/admin-flags/${id}`);
      setAdminFlags((current) => current.filter((entry) => entry.id !== id));
      showToast(isGerman ? 'Interner Admin-Hinweis entfernt.' : 'Internal admin note removed.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  const deleteDefinition = async (definition: ShiftDefinition) => {
    const confirmed = window.confirm(isGerman
      ? `Schichtdefinition "${definition.code}" wirklich löschen? Bereits gespeicherte Pläne bleiben unverändert.`
      : `Delete shift definition "${definition.code}"? Existing saved plans remain unchanged.`);
    if (!confirmed) return;
    setSaving(`delete-def-${definition.id}`);
    try {
      await api.delete(`/shift-config/definitions/${definition.id}`);
      setDefinitions((current) => current.filter((item) => item.id !== definition.id));
      showToast(isGerman ? 'Schichtdefinition gelöscht' : 'Shift definition deleted');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const createDefinition = async () => {
    if (!newDefinition.code.trim() || !newDefinition.name.trim()) { showToast('Code und Name sind erforderlich', 'err'); return; }
    setSaving('new-definition');
    try {
      await api.post('/shift-config/definitions', { ...newDefinition, code: newDefinition.code.trim().toUpperCase(), short_name: newDefinition.code.trim().toUpperCase(), color_hex: '#64748b', sort_order: definitions.length + 1, applicable_days: [0, 1, 2, 3, 4, 5, 6] });
      setNewDefinition({ code: '', name: '', shift_type: 'early', start_time: '06:30', end_time: '15:00', duration_hours: 8, min_staff: 1, max_staff: 5 });
      await loadAll();
      showToast('Schicht hinzugefügt');
    } catch (error: any) { showToast(error?.response?.data?.error || 'Schicht konnte nicht angelegt werden', 'err'); }
    finally { setSaving(''); }
  };

  const saveColoConfig = async () => {
    setSaving('colo-config');
    try {
      await api.put('/app-settings', {
        'shiftplan.colo_enabled': coloConfig.enabled,
        'shiftplan.colo_pool': JSON.stringify(coloConfig.employeePool),
        'shiftplan.colo_requirements': JSON.stringify(cleanColoRequirements(coloConfig.requirements)),
      });
      await api.put('/app-settings', { 'shiftplan.active_shift_modes': JSON.stringify(activeShiftModes) });
      showToast(isGerman ? 'Colo-Kompetenzplanung gespeichert.' : 'Colo competency planning saved.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  /** One central save for every section of this page. Reloads afterwards so the screen shows what is really stored. */
  const saveEverything = async () => {
    const incompleteDbs = dbsPool.find((entry) => Boolean(entry.start_time) !== Boolean(entry.end_time));
    if (incompleteDbs) {
      showToast(isGerman ? `Bei ${incompleteDbs.employee_name} fehlt Beginn oder Ende (DBS).` : `${incompleteDbs.employee_name} needs both start and end (DBS).`, 'err');
      return;
    }
    setSaving('all');
    try {
      for (const definition of definitions) {
        await api.put(`/shift-config/definitions/${definition.id}`, {
          ...definition,
          start_time: String(definition.start_time || '').slice(0, 5),
          end_time: String(definition.end_time || '').slice(0, 5),
          applicable_days: normalizeApplicableDays(definition.applicable_days),
        });
      }
      // One slider decides how much the plan changes between weeks: stability is its counterpart.
      if (rotation) await api.put('/shift-config/rotation-rules', { ...rotation, stability_priority: 100 - advancedSettings.varietyPriority });
      // The hour-fairness slider (planConfig.fairness_priority) is the only switch for levelling hours.
      if (fairness) await api.put('/shift-config/fairness-rules', { ...fairness, balance_total_load: (planConfig?.fairness_priority ?? 80) > 0 });
      if (planConfig) await api.put('/shift-config/planning-config', planConfig);
      await api.put('/shift-config/short-night-options', shortNightOptions);
      const shiftCode = String(dbsConfig.shiftCode || 'DBS').trim().toUpperCase() || 'DBS';
      await api.put('/app-settings', {
        'shiftplan.overtime_unlimited': overtimeConfig.unlimited,
        'shiftplan.max_overtime_hours': overtimeConfig.maxOvertimeHours,
        'shiftplan.overtime_mode': overtimeConfig.overtimeMode,
        'shiftplan.max_daily_hours': overtimeConfig.maxDailyHours,
        'shiftplan.max_weekly_hours': overtimeConfig.maxWeeklyHours,
        'shiftplan.daily_mode': overtimeConfig.dailyMode,
        'shiftplan.weekly_mode': overtimeConfig.weeklyMode,
        'shiftplan.issue_panel_enabled': advancedSettings.issuePanelEnabled,
        'shiftplan.issue_show_solutions': advancedSettings.issueShowSolutions,
        'shiftplan.issue_priority_mode': advancedSettings.issuePriorityMode,
        'shiftplan.admin_flags_enabled': advancedSettings.adminFlagsEnabled,
        'shiftplan.variety_priority': advancedSettings.varietyPriority,
        'shiftplan.late_overflow_thu_fri': advancedSettings.lateOverflowThuFri,
        ...wishStrengthPayload(wishStrengths),
        'shiftplan.dbs_enabled': dbsConfig.enabled,
        'shiftplan.dbs_weekdays': JSON.stringify([1, 2, 3, 4, 5, 6, 0]),
        'shiftplan.dbs_shift_code': shiftCode,
        'shiftplan.dbs_required_staff': 1,
        'shiftplan.dbs_free_days_after_block': dbsConfig.freeDaysAfterBlock,
        'shiftplan.dbs_fill_gaps': dbsConfig.fillGaps,
        'shiftplan.colo_enabled': coloConfig.enabled,
        'shiftplan.colo_pool': JSON.stringify(coloConfig.employeePool),
        'shiftplan.colo_requirements': JSON.stringify(cleanColoRequirements(coloConfig.requirements)),
        'shiftplan.active_shift_modes': JSON.stringify(activeShiftModes),
      });
      await api.put(`/shift-config/special-pools/${shiftCode}`, {
        assignments: dbsPool.map((entry, index) => ({
          employee_name: entry.employee_name,
          monthly_max_assignments: 31,
          sort_order: index,
          working_weekdays: normalizeApplicableDays(entry.working_weekdays),
          free_days_after_block: Math.max(0, Math.min(14, Number(entry.free_days_after_block ?? dbsConfig.freeDaysAfterBlock) || 0)),
          start_time: entry.start_time || null,
          end_time: entry.end_time || null,
          other_shift_codes: toOutsideDbsTypes(entry.other_shift_codes),
          other_days_per_month: entry.other_days_per_month ?? null,
        })),
      });
      await loadAll();
      setLastSavedAt(new Date());
      showToast(isGerman ? 'Alle Einstellungen gespeichert' : 'All settings saved');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  const addExclusion = async () => {
    if (!newExclusionName.trim()) return;
    setSaving('excl-new');
    try {
      const fixedShiftType = newExclusionFixedShiftType || null;
      await api.post('/shift-config/exclusions', {
        employee_name: newExclusionName.trim(),
        reason: fixedShiftType ? 'fixed_shift' : 'admin_override',
        fixed_shift_type: fixedShiftType,
        weekdays: newExclusionWeekdays,
      });
      setNewExclusionName('');
      setNewExclusionFixedShiftType('');
      setNewExclusionWeekdays(ALL_WEEKDAYS);
      showToast(fixedShiftType
        ? (isGerman ? 'Regel fuer feste Schicht gespeichert.' : 'Fixed shift rule saved.')
        : t("shiftAdmin.toastExclAdded"));
      await loadAll();
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const updateExclusionRule = async (exclusion: ShiftplanExclusion, fixedShiftType: FixedShiftTypeValue, weekdays: number[] = normalizeExclusionWeekdays(exclusion.weekdays)) => {
    setSaving(`excl-${exclusion.id}`);
    try {
      const { data } = await api.patch(`/shift-config/exclusions/${exclusion.id}`, {
        reason: fixedShiftType ? 'fixed_shift' : 'admin_override',
        reason_text: exclusion.reason_text,
        fixed_shift_type: fixedShiftType || null,
        weekdays,
      });
      setExclusions((current) => current.map((entry) => entry.id === exclusion.id ? data.exclusion : entry));
      showToast(isGerman ? 'Regel aktualisiert.' : 'Rule updated.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const removeExclusion = async (id: number) => {
    try {
      await api.delete(`/shift-config/exclusions/${id}`);
      showToast(t("shiftAdmin.toastExclRemoved"));
      await loadAll();
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    }
  };

  const toggleWeekdayInList = (weekdays: number[], weekday: number) => {
    const current = normalizeExclusionWeekdays(weekdays);
    const next = current.includes(weekday) ? current.filter((day) => day !== weekday) : [...current, weekday];
    return next.length > 0 ? next.sort((left, right) => left - right) : current;
  };


  const resetToDefaults = async (scope: 'all' | 'definitions' | 'staffing', code?: string) => {
    const label = code
      ? (isGerman ? `${code} auf Standardwerte zurücksetzen? Wochentagsabweichungen dieser Schicht werden entfernt.` : `Reset ${code} to defaults? Weekday exceptions of this shift are removed.`)
      : (isGerman ? 'Alle Standardwerte wiederherstellen? Eigene Zeiten und Besetzungen werden überschrieben.' : 'Restore all defaults? Custom times and staffing are overwritten.');
    if (!window.confirm(label)) return;
    setSaving(`reset-${scope}-${code || 'all'}`);
    try {
      await api.post('/shift-config/defaults/reset', { scope, code });
      showToast(isGerman ? 'Standardwerte wiederhergestellt' : 'Defaults restored');
      await loadAll();
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  /* ── field updaters ── */

  const updateDef = (id: number, field: keyof ShiftDefinition, value: unknown) => {
    setDefinitions((current) => current.map((definition) => definition.id === id ? { ...definition, [field]: value } : definition));
  };

  const toggleApplicableDay = (id: number, day: number) => {
    setDefinitions((current) => current.map((definition) => {
      if (definition.id !== id) return definition;
      const currentDays = normalizeApplicableDays(definition.applicable_days);
      const nextDays = currentDays.includes(day)
        ? currentDays.filter((entry) => entry !== day)
        : [...currentDays, day];
      return { ...definition, applicable_days: normalizeApplicableDays(nextDays) };
    }));
  };

  const addDbsEmployee = () => {
    const employeeName = newDbsEmployee.trim();
    if (!employeeName || dbsPool.some((entry) => entry.employee_name === employeeName)) return;
    setDbsPool((current) => [...current, {
      shift_code: 'DBS',
      employee_name: employeeName,
      monthly_max_assignments: 31,
      sort_order: current.length,
      is_active: true,
      working_weekdays: [1, 2, 3, 4, 5],
      free_days_after_block: dbsConfig.freeDaysAfterBlock,
    }]);
    setNewDbsEmployee('');
  };

  const removeDbsEmployee = (employeeName: string) => {
    setDbsPool((current) => current.filter((entry) => entry.employee_name !== employeeName));
  };

  const addColoEmployee = (employeeName: string) => {
    if (coloConfig.employeePool.includes(employeeName)) return;
    setColoConfig((current) => ({ ...current, employeePool: [...current.employeePool, employeeName] }));
  };

  const removeColoEmployee = (employeeName: string) => {
    setColoConfig((current) => ({ ...current, employeePool: current.employeePool.filter((entry) => entry !== employeeName) }));
  };

  const addColoRequirement = () => {
    setColoConfig((current) => ({
      ...current,
      requirements: [...current.requirements, { id: newColoRequirementId(), weekdays: [], shift_type: 'early', staff: 1 }],
    }));
  };

  const updateColoRequirement = (id: string, patch: Partial<ColoRequirement>) => {
    setColoConfig((current) => ({
      ...current,
      requirements: current.requirements.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  };

  const removeColoRequirement = (id: string) => {
    setColoConfig((current) => ({ ...current, requirements: current.requirements.filter((entry) => entry.id !== id) }));
  };

  const planningAuditIssues = useMemo(() => getPlanningAuditIssues({
    definitions,
    rotation,
    planConfig,
    exclusions,
    employees,
    dbsPool,
    dbsConfig,
    coloConfig,
    overtimeConfig,
    advancedSettings,
  }), [advancedSettings, coloConfig, dbsConfig, dbsPool, definitions, employees, exclusions, overtimeConfig, planConfig, rotation]);

  /* ── loading state ── */

  if (loading) {
    const loader = (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-500" />
      </div>
    );

    if (embedded) return loader;

    return <EnterprisePageShell style={{ maxWidth: 'none' }}>{loader}</EnterprisePageShell>;
  }

  /* ── shift type options (translated) ── */
  const shiftTypeOptions = [
    { value: 'early', label: t("shiftAdmin.typeEarly") },
    { value: 'late', label: t("shiftAdmin.typeLate") },
    { value: 'night', label: t("shiftAdmin.typeNight") },
    { value: 'special', label: t("shiftAdmin.typeSpecial") },
  ];

  /* ── shift code options for DBS ── */
  const shiftCodeOptions = definitions.filter((d) => d.is_active).map((d) => ({ value: d.code, label: `${d.code} – ${d.name}` }));
  const normalizedColoSearch = coloSearch.trim().toLocaleLowerCase('de');
  const availableColoEmployees = employees.filter((employee) => (
    !coloConfig.employeePool.includes(employee)
    && (!normalizedColoSearch || employee.toLocaleLowerCase('de').includes(normalizedColoSearch))
  ));
  const selectedColoEmployees = coloConfig.employeePool.filter((employee) => (
    !normalizedColoSearch || employee.toLocaleLowerCase('de').includes(normalizedColoSearch)
  ));
  const minimumColoPoolSize = getMaxColoStaffPerDay(coloConfig.requirements);
  // Local checks (what is on this screen) plus server checks (settings against employee wishes and staffing).
  const combinedAuditIssues: PlanningAuditIssue[] = [
    ...planningAuditIssues,
    ...healthIssues.map((issue) => ({
      id: `server-${issue.id}`,
      level: (issue.level === 'error' ? 'error' : 'warning') as PlanningAuditLevel,
      messageDe: issue.messageDe,
      messageEn: issue.messageEn,
    })),
  ];
  const planningAuditErrors = combinedAuditIssues.filter((issue) => issue.level === 'error');
  const planningAuditWarnings = combinedAuditIssues.filter((issue) => issue.level === 'warning');

  /* ── render ── */

  const content = (
    <div className="admin-enterprise-surface space-y-4">
      {toast ? (
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${toast.type === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      ) : null}

      <nav aria-label={isGerman ? 'Einstellungsbereiche' : 'Settings areas'} className="liquid-tabbar grid gap-2 rounded-xl border border-border p-2 sm:grid-cols-2 xl:grid-cols-6">
        {SETTINGS_GROUPS.map((group) => {
          const GroupIcon = group.icon;
          const active = activeGroup === group.id;
          const badge = group.id === 'overview' ? planningAuditErrors.length + planningAuditWarnings.length : 0;
          return (
            <button
              key={group.id}
              type="button"
              onClick={() => setActiveGroup(group.id)}
              aria-current={active ? 'page' : undefined}
              className={`liquid-tab flex items-start gap-3 px-4 py-3 text-left ${active ? 'is-active' : ''}`}
            >
              <GroupIcon className="mt-0.5 h-5 w-5 shrink-0 opacity-90" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {isGerman ? group.labelDe : group.labelEn}
                  {badge > 0 ? <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-200">{badge}</span> : null}
                </span>
                <span className="mt-0.5 block text-xs font-normal leading-4 opacity-80">{isGerman ? group.descriptionDe : group.descriptionEn}</span>
              </span>
            </button>
          );
        })}
      </nav>

      {activeGroup === 'overview' ? (
        <div className="space-y-4">
      <div className="rounded-3xl border border-sky-400/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-semibold text-foreground">{isGerman ? "Überblick und Prüfung" : "Overview and check"}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{isGerman ? "Die Prüfung zeigt Einstellungen, die sich widersprechen oder mit den Wünschen der Mitarbeitenden nicht zusammenpassen – bevor ein Plan erzeugt wird. Wähle oben den Bereich, den du ändern willst." : "The check shows settings that contradict each other or do not fit the wishes of the employees – before a plan is generated. Pick the area you want to change above."}</p>
      </div>

      <section className={`rounded-3xl border p-5 ${planningAuditErrors.length > 0 ? 'border-red-400/30 bg-red-500/10' : planningAuditWarnings.length > 0 ? 'border-amber-400/30 bg-amber-500/10' : 'border-emerald-400/30 bg-emerald-500/10'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${planningAuditErrors.length > 0 ? 'bg-red-500/20 text-red-200' : planningAuditWarnings.length > 0 ? 'bg-amber-500/20 text-amber-100' : 'bg-emerald-500/20 text-emerald-100'}`}>
              {planningAuditErrors.length > 0 || planningAuditWarnings.length > 0 ? <ShieldAlert className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-foreground">{isGerman ? 'Planungsprüfung' : 'Planning check'}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {combinedAuditIssues.length === 0
                  ? (isGerman ? 'Die aktuell geladenen Einstellungen sind logisch miteinander vereinbar.' : 'The currently loaded settings are logically consistent.')
                  : (isGerman ? 'Diese Einstellungen sollten vor der nächsten Generierung geprüft werden.' : 'Review these settings before the next generation.')}
              </p>
            </div>
          </div>
          <div className="flex gap-2 text-xs font-medium">
            <span className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-1 text-red-200">{planningAuditErrors.length} {isGerman ? 'kritisch' : 'critical'}</span>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-3 py-1 text-amber-100">{planningAuditWarnings.length} {isGerman ? 'Hinweise' : 'notes'}</span>
          </div>
        </div>
        {combinedAuditIssues.length > 0 ? (
          <div className="mt-4 grid gap-2 lg:grid-cols-2">
            {combinedAuditIssues.map((issue) => (
              <div key={issue.id} className={`rounded-2xl border px-4 py-3 text-sm ${issue.level === 'error' ? 'border-red-400/25 bg-red-950/20 text-red-100' : 'border-amber-400/25 bg-amber-950/15 text-amber-100'}`}>
                {isGerman ? issue.messageDe : issue.messageEn}
              </div>
            ))}
          </div>
        ) : null}
      </section>


      <section className="rounded-3xl border border-border/60 bg-card/40 p-5">
        <h2 className="text-base font-semibold text-foreground">{isGerman ? 'So funktioniert die Planung in vier Schritten' : 'How planning works in four steps'}</h2>
        <ol className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
          <li className="rounded-2xl border border-border/60 p-3"><span className="font-semibold text-foreground">1. {isGerman ? 'Schichten & Zeiten' : 'Shifts & times'}</span><br />{isGerman ? 'Welche Schichten es gibt, wann sie beginnen und enden. Wie viele Personen pro Schicht nötig sind, steht im Reiter „Besetzung“.' : 'Which shifts exist and when they start and end. How many people each shift needs is set in the "Staffing" tab.'}</li>
          <li className="rounded-2xl border border-border/60 p-3"><span className="font-semibold text-foreground">2. {isGerman ? 'Regeln & Erholung' : 'Rules & recovery'}</span><br />{isGerman ? 'Wie viele Tage am Stück gearbeitet werden darf und wie viel frei sein muss, besonders nach Nächten und Wochenenden.' : 'How many days in a row may be worked and how much time off is required, especially after nights and weekends.'}</li>
          <li className="rounded-2xl border border-border/60 p-3"><span className="font-semibold text-foreground">3. {isGerman ? 'Wünsche & Fairness' : 'Wishes & fairness'}</span><br />{isGerman ? 'Wie verbindlich Mitarbeiterwünsche sind, wie abwechslungsreich geplant wird und wie viele Stunden jemand leisten soll.' : 'How binding employee wishes are, how varied the plan is and how many hours somebody should work.'}</li>
          <li className="rounded-2xl border border-border/60 p-3"><span className="font-semibold text-foreground">4. {isGerman ? 'DBS, Colo & Ausnahmen' : 'DBS, Colo & exceptions'}</span><br />{isGerman ? 'Sonderdienste mit festem Personal und einzelne Personen, die anders geplant werden sollen.' : 'Special duties with fixed staff and single people who must be planned differently.'}</li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">{isGerman ? 'Unten rechts speichert „Alle Einstellungen speichern“ alle Bereiche auf einmal. Die Prüfung oben zeigt Widersprüche zwischen Einstellungen und Wünschen.' : '"Save all settings" at the bottom saves every area at once. The check above shows contradictions between settings and wishes.'}</p>
      </section>

      {/* ── Overview cards ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="theme-admin-hero rounded-3xl border border-sky-400/25 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.18)]">
          <div className="text-xs uppercase tracking-[0.2em] text-sky-700/80 dark:text-sky-200/70">{t("shiftAdmin.cardDefinitions")}</div>
          <div className="mt-3 text-3xl font-semibold text-foreground">{definitions.filter((definition) => definition.is_active).length}</div>
          <div className="mt-2 text-sm text-muted-foreground">{t("shiftAdmin.cardDefinitionsDesc")}</div>
        </div>
        <div className="theme-admin-hero rounded-3xl border border-fuchsia-400/25 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.18)]">
          <div className="text-xs uppercase tracking-[0.2em] text-fuchsia-700/80 dark:text-fuchsia-200/70">{t("shiftAdmin.cardDbsPool")}</div>
          <div className="mt-3 text-3xl font-semibold text-foreground">{dbsPool.length}</div>
          <div className="mt-2 text-sm text-muted-foreground">{t("shiftAdmin.cardDbsPoolDesc")}</div>
        </div>
        <div className="theme-admin-hero rounded-3xl border border-cyan-400/25 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.18)]">
          <div className="text-xs uppercase tracking-[0.2em] text-cyan-700/80 dark:text-cyan-200/70">Colo-Kompetenz</div>
          <div className="mt-3 text-3xl font-semibold text-foreground">{coloConfig.employeePool.length}</div>
          <div className="mt-2 text-sm text-muted-foreground">{isGerman ? 'Ausgewählte Mitarbeitende für Werktags-Vorbereitung, Nacht-Colo und Wochenend-Einsätze.' : 'Selected employees for weekday preparation, night Colo and weekend work.'}</div>
        </div>
        <div className="theme-admin-hero rounded-3xl border border-amber-400/25 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.18)]">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-200/70">{t("shiftAdmin.cardExclusions")}</div>
          <div className="mt-3 text-3xl font-semibold text-foreground">{exclusions.length}</div>
          <div className="mt-2 text-sm text-muted-foreground">{t("shiftAdmin.cardExclusionsDesc")}</div>
        </div>
      </div>


        </div>
      ) : null}
      {activeGroup === 'shifts' ? (
        <div className="space-y-4">
      <div className="rounded-3xl border border-sky-400/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-semibold text-foreground">{isGerman ? "Schichten und Zeiten" : "Shifts and times"}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{isGerman ? "Jede Schicht hat Code, Art (Früh, Spät, Nacht), Zeiten, Blocklänge und Wochentage. Wie viele Personen pro Schicht gebraucht werden, stellst du im Reiter „Besetzung“ ein – nicht hier." : "Every shift has a code, a type (early, late, night), times, block length and weekdays. How many people each shift needs is set in the \"Staffing\" tab, not here."}</p>
      </div>
      {/* ── Shift definitions ── */}
      <Section title={t("shiftAdmin.sectionDefinitions")} icon={Clock} helpKey="shiftAdmin.helpSectionDefinitions" t={t}>
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-sky-400/15 bg-sky-500/10 px-4 py-3 text-sm text-slate-200">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" />
          <div>{t("shiftAdmin.sectionDefinitionsInfo")}</div>
        </div>

        <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          {isGerman
            ? 'Halbtagsschichten werden hier bewusst ausgeblendet. Sie bleiben für spontane Anpassungen nutzbar, fließen aber nicht mehr in die automatische Draft-Planung ein.'
            : 'Half-day shifts are intentionally hidden here. They remain available for ad-hoc adjustments, but are no longer used for automatic draft planning.'}
        </div>

        <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-emerald-400/20 bg-emerald-500/5 p-4">
          <div className="text-xs text-slate-300">
            {isGerman
              ? 'Die Mindest- und Maximalbesetzung für Früh, Spät und Nacht (Werktag, Samstag, Sonntag, Feiertag) stellst du im Reiter „Besetzung“ ein. Hier gibt es sie nicht mehr je Schicht.'
              : 'Minimum and maximum staffing for early, late and night (weekday, Saturday, Sunday, holiday) is set in the "Staffing" tab. It is no longer set per shift here.'}
          </div>
          <button type="button" onClick={() => void resetToDefaults('all')} disabled={saving.startsWith('reset-')} className="inline-flex items-center gap-2 rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-50">
            <RotateCcw className="h-4 w-4" />
            {isGerman ? 'Alle Standardwerte wiederherstellen' : 'Restore all defaults'}
          </button>
        </div>

        <div className="space-y-4">
          {definitions.map((definition) => {
            const applicableDays = normalizeApplicableDays(definition.applicable_days);

            return (
              <div key={definition.id} className="rounded-3xl border border-white/10 bg-slate-900/55 p-4 shadow-[0_10px_30px_rgba(2,6,23,0.2)]">
                <div className="grid gap-3 xl:grid-cols-12">
                  <div className="xl:col-span-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defCode")}</label>
                    <input value={definition.code} disabled className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs text-slate-200" />
                  </div>
                  <div className="xl:col-span-3">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defName")}</label>
                    <input value={definition.name} onChange={(event) => updateDef(definition.id, 'name', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-sky-400/50" />
                  </div>
                  <div className="xl:col-span-2">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defType")}</label>
                    <select value={definition.shift_type} onChange={(event) => updateDef(definition.id, 'shift_type', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400/50">
                      {shiftTypeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <div className="xl:col-span-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defFrom")}</label>
                    <input type="time" value={definition.start_time || ''} onChange={(event) => updateDef(definition.id, 'start_time', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defTo")}</label>
                    <input type="time" value={definition.end_time || ''} onChange={(event) => updateDef(definition.id, 'end_time', event.target.value)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defHours")}</label>
                    <input type="number" min="0" step="0.5" value={definition.duration_hours} onChange={(event) => updateDef(definition.id, 'duration_hours', Number.parseFloat(event.target.value) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{isGerman ? 'Blocktage' : 'Block days'}</label>
                    <input type="number" min="1" max="31" value={definition.series_days} onChange={(event) => updateDef(definition.id, 'series_days', normalizeSeriesDays(event.target.value, 1))} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div className="xl:col-span-3">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{isGerman ? 'Freie Tage nach der Schicht' : 'Days off after the shift'}</label>
                    <input
                      type="number"
                      min="0"
                      max="14"
                      value={definition.free_days_after ?? ''}
                      placeholder={isGerman ? 'Standard (globale Regel)' : 'Default (global rule)'}
                      onChange={(event) => updateDef(definition.id, 'free_days_after', event.target.value === '' ? null : Math.max(0, Math.min(14, Number.parseInt(event.target.value, 10) || 0)))}
                      className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                    />
                    <p className="mt-1 text-[10px] text-slate-500">{isGerman ? 'Freie Tage nach einem abgeschlossenen Block dieser Schicht. Leer = globale Regeln (Nacht/Wochenende). Ein Schichtmodus mit eigenen freien Tagen hat Vorrang.' : 'Days off after a finished block of this shift. Empty = global rules (night/weekend). A shift mode with its own days off takes precedence.'}</p>
                  </div>
                  {!GLOBAL_STAFFING_TYPES.has(definition.shift_type) ? (<>
                  <div className="xl:col-span-1">
                    <label className="mb-1 flex items-center text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defMin")} <HelpTooltip textKey="shiftAdmin.helpDefMinMax" t={t} /></label>
                    <input type="number" min="0" value={definition.min_staff} onChange={(event) => updateDef(definition.id, 'min_staff', Number.parseInt(event.target.value, 10) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defMax")}</label>
                    <input type="number" min="0" value={definition.max_staff} onChange={(event) => updateDef(definition.id, 'max_staff', Number.parseInt(event.target.value, 10) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  </>) : null}
                  <div className="xl:col-span-2">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defColorStatus")}</label>
                    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2">
                      <input type="color" value={definition.color_hex} onChange={(event) => updateDef(definition.id, 'color_hex', event.target.value)} className="h-8 w-10 cursor-pointer rounded border-none bg-transparent" />
                      <label className="flex items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={definition.is_active} onChange={(event) => updateDef(definition.id, 'is_active', event.target.checked)} className="rounded border-white/20 bg-slate-950" />
                        {t("shiftAdmin.defActive")}
                      </label>
                    </div>
                  </div>
                </div>

                {definition.shift_type === 'night' ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div>
                      <label className="mb-1 flex items-center text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defStartDay")} <HelpTooltip textKey="shiftAdmin.helpDefDayOffset" t={t} /></label>
                      <select value={normalizeShiftDayOffset(definition.start_day_offset)} onChange={(event) => updateDef(definition.id, 'start_day_offset', Number.parseInt(event.target.value, 10) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400/50">
                        {shiftDayOffsetOptions.map((option) => (
                          <option key={`start-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defEndDay")}</label>
                      <select value={normalizeShiftDayOffset(definition.end_day_offset, 1)} onChange={(event) => updateDef(definition.id, 'end_day_offset', Number.parseInt(event.target.value, 10) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400/50">
                        {shiftDayOffsetOptions.map((option) => (
                          <option key={`end-${option.value}`} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-200">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defTimeWindow")}</div>
                      <div>{formatShiftSpanPreview(definition, shiftDayOffsetOptions, isGerman)}</div>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 rounded-2xl border border-violet-400/20 bg-violet-500/5 p-3">
                  <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-violet-200">
                    {isGerman ? 'Abweichende Zeiten nach Wochentag' : 'Weekday-specific time exceptions'}
                  </div>
                  <p className="mb-3 text-xs leading-relaxed text-slate-400">
                    {isGerman
                      ? 'Der Standard oben bleibt die Basis. Lege hier nur gezielt abweichende Zeiten fest, zum Beispiel Samstag von 06:30 bis 18:30. Die Dauer wird aus den Zeiten berechnet und bei neuen Drafts berücksichtigt.'
                      : 'The standard time above remains the baseline. Define exceptions only where needed, for example Saturday from 06:30 to 18:30. Duration is calculated from the times and used for new drafts.'}
                  </p>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {weekdayOptions.filter((option) => applicableDays.includes(option.value)).map((option) => {
                      const override = (definition.day_overrides || []).find((entry) => Number(entry.weekday) === option.value);
                      const fieldValue = override || null;
                      const busy = saving === `override-${definition.id}-${option.value}`;
                      return (
                        <div key={`${definition.id}-override-${option.value}`} className="rounded-xl border border-white/10 bg-slate-950/55 p-3">
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-200">{option.label}</span>
                            {override ? <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] text-violet-200">{isGerman ? 'Individuell' : 'Custom'}</span> : <span className="text-[10px] text-slate-500">{isGerman ? 'Standard' : 'Default'}</span>}
                          </div>
                          {fieldValue ? (
                            <>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[10px] text-slate-400">{isGerman ? 'Von' : 'From'}<input type="time" value={String(fieldValue.start_time).slice(0, 5)} onChange={(event) => updateDayOverride(definition.id, option.value, 'start_time', event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100" /></label>
                                <label className="text-[10px] text-slate-400">{isGerman ? 'Bis' : 'To'}<input type="time" value={String(fieldValue.end_time).slice(0, 5)} onChange={(event) => updateDayOverride(definition.id, option.value, 'end_time', event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1 text-xs text-slate-100" /></label>
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400"><span>{isGerman ? 'Dauer' : 'Duration'}: {getShiftDurationPreview(String(fieldValue.start_time), String(fieldValue.end_time), Number(fieldValue.start_day_offset || 0), Number(fieldValue.end_day_offset || 0)).toFixed(1)}h</span><span>{isGerman ? 'abzgl. 1h Pause' : 'minus 1h break'}</span></div>
                              <div className="mt-2 flex gap-2"><button type="button" onClick={() => void saveDayOverride(definition, option.value)} disabled={busy} className="rounded-lg bg-violet-400 px-2 py-1 text-xs font-medium text-slate-950 disabled:opacity-50">{busy ? '…' : (isGerman ? 'Speichern' : 'Save')}</button><button type="button" onClick={() => void removeDayOverride(definition, option.value)} disabled={busy} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/5 disabled:opacity-50">{isGerman ? 'Standard' : 'Default'}</button></div>
                            </>
                          ) : (
                            <button type="button" onClick={() => updateDayOverride(definition.id, option.value, 'weekday', option.value)} className="w-full rounded-lg border border-violet-300/25 px-2 py-2 text-xs text-violet-200 hover:bg-violet-400/10">{isGerman ? 'Zeit anpassen' : 'Adjust time'}</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-sky-400/15 bg-slate-950/35 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-medium uppercase tracking-[0.18em] text-sky-300">Schichtmodi</div>
                      <div className="mt-1 text-xs text-slate-400">Zeitfenster, Stunden und freie Tage je Modell. Der aktive Modus wird für neue Pläne verwendet.</div>
                    </div>
                    <select
                      value={activeShiftModes[definition.code] || normalizeShiftModes(definition)[0].id}
                      onChange={(event) => setActiveShiftModes((current) => ({ ...current, [definition.code]: Number(event.target.value) }))}
                      className="rounded-xl border border-sky-400/30 bg-slate-900 px-3 py-2 text-xs text-slate-100"
                    >
                      {normalizeShiftModes(definition).map((mode) => <option key={mode.id} value={mode.id}>Aktiv: {mode.label}</option>)}
                    </select>
                  </div>
                  <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                    {normalizeShiftModes(definition).map((mode, modeIndex) => (
                      <div key={`${definition.id}-mode-${mode.id}`} className="rounded-xl border border-white/10 bg-slate-900/70 p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <input value={mode.label} onChange={(event) => updateDef(definition.id, 'modes', normalizeShiftModes(definition).map((item, index) => index === modeIndex ? { ...item, label: event.target.value } : item))} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-100" />
                          {normalizeShiftModes(definition).length > 1 ? <button type="button" onClick={() => updateDef(definition.id, 'modes', normalizeShiftModes(definition).filter((_, index) => index !== modeIndex))} className="text-xs text-red-300 hover:text-red-200">Entfernen</button> : null}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-[10px] text-slate-400">Von<input type="time" value={mode.start_time} onChange={(event) => updateDef(definition.id, 'modes', normalizeShiftModes(definition).map((item, index) => index === modeIndex ? { ...item, start_time: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-100" /></label>
                          <label className="text-[10px] text-slate-400">Bis<input type="time" value={mode.end_time} onChange={(event) => updateDef(definition.id, 'modes', normalizeShiftModes(definition).map((item, index) => index === modeIndex ? { ...item, end_time: event.target.value } : item))} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-100" /></label>
                          <label className="text-[10px] text-slate-400">Stunden<input type="number" min="0" step="0.5" value={mode.duration_hours} onChange={(event) => updateDef(definition.id, 'modes', normalizeShiftModes(definition).map((item, index) => index === modeIndex ? { ...item, duration_hours: Number.parseFloat(event.target.value) || 0 } : item))} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-100" /></label>
                          <label className="text-[10px] text-slate-400">Freie Tage danach<input type="number" min="0" max="14" value={mode.free_days_after} onChange={(event) => updateDef(definition.id, 'modes', normalizeShiftModes(definition).map((item, index) => index === modeIndex ? { ...item, free_days_after: Number.parseInt(event.target.value, 10) || 0 } : item))} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs text-slate-100" /></label>
                        </div>
                      </div>
                    ))}
                  </div>
                  {normalizeShiftModes(definition).length < 5 ? <button type="button" onClick={() => { const modes = normalizeShiftModes(definition); updateDef(definition.id, 'modes', [...modes, { id: Math.max(...modes.map((item) => item.id), 0) + 1, label: `Modus ${modes.length + 1}`, start_time: definition.start_time || '00:00', end_time: definition.end_time || '00:00', duration_hours: definition.duration_hours || 0, free_days_after: 0 }]); }} className="mt-2 rounded-lg border border-sky-400/30 px-3 py-1.5 text-xs text-sky-300 hover:bg-sky-400/10">+ Modus hinzufügen</button> : null}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                  <div>
                    <div className="mb-2 flex items-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                      {t("shiftAdmin.defWeekdayPlanning")}
                      <HelpTooltip textKey="shiftAdmin.helpDefWeekdays" t={t} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {weekdayOptions.map((option) => {
                        const active = applicableDays.includes(option.value);
                        return (
                          <button
                            key={`${definition.id}-${option.value}`}
                            type="button"
                            onClick={() => toggleApplicableDay(definition.id, option.value)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-sky-400/20 text-sky-200 ring-1 ring-sky-300/30' : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10 hover:text-slate-200'}`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 text-xs text-slate-400">{t("shiftAdmin.activeOn")}: {formatApplicableDays(applicableDays, weekdayOptions, isGerman)}</div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    {shiftDefaults[String(definition.code || '').trim().toUpperCase()] ? (() => {
                      const defaults = shiftDefaults[String(definition.code || '').trim().toUpperCase()];
                      return (
                        <button type="button" onClick={() => void resetToDefaults('definitions', definition.code)} disabled={saving.startsWith('reset-')} title={`${isGerman ? 'Standard' : 'Default'}: ${defaults.start_time}–${defaults.end_time}, ${defaults.duration_hours}h`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:opacity-50">
                          <RotateCcw className="h-4 w-4" />
                          {isGerman ? `Standard (${defaults.start_time}–${defaults.end_time})` : `Default (${defaults.start_time}–${defaults.end_time})`}
                        </button>
                      );
                    })() : null}
                    {!BUILT_IN_SHIFT_CODES.has(String(definition.code || '').trim().toUpperCase()) ? (
                      <button type="button" onClick={() => void deleteDefinition(definition)} disabled={saving === `delete-def-${definition.id}`} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50">
                        <Trash2 className="h-4 w-4" />
                        {saving === `delete-def-${definition.id}` ? (isGerman ? 'Löscht…' : 'Deleting…') : (isGerman ? 'Löschen' : 'Delete')}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-2xl border border-slate-600/60 bg-slate-900/70 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{isGerman ? 'Zusätzliche Schicht anlegen' : 'Add custom shift'}</div>
          <div className="grid gap-2 md:grid-cols-4">
            <input placeholder="Code (z. B. S1)" value={newDefinition.code} onChange={(e) => setNewDefinition({ ...newDefinition, code: e.target.value })} className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
            <input placeholder={isGerman ? 'Bezeichnung' : 'Name'} value={newDefinition.name} onChange={(e) => setNewDefinition({ ...newDefinition, name: e.target.value })} className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
            <select value={newDefinition.shift_type} onChange={(e) => setNewDefinition({ ...newDefinition, shift_type: e.target.value })} className="rounded-xl border border-slate-600 bg-slate-950/80 px-3 py-2 text-sm text-slate-100"><option value="early">{isGerman ? 'Frühschicht' : 'Early shift'}</option><option value="late">{isGerman ? 'Spätschicht' : 'Late shift'}</option><option value="night">{isGerman ? 'Nachtschicht' : 'Night shift'}</option></select>
            <button type="button" onClick={() => void createDefinition()} disabled={saving === 'new-definition'} className="rounded-xl bg-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white disabled:opacity-50">{saving === 'new-definition' ? (isGerman ? 'Speichert…' : 'Saving…') : (isGerman ? 'Schicht anlegen' : 'Create shift')}</button>
          </div>
          <div className="mt-2 text-xs text-slate-400">{isGerman ? 'Nach dem Anlegen kann die Variante oben vollständig konfiguriert, aktiviert oder wieder gelöscht werden. Aktive Schichten fließen automatisch in User-Wünsche und den Generator ein.' : 'After creation, configure, activate, or delete the variant above. Active shifts are automatically available in employee preferences and the generator.'}</div>
        </div>
      </Section>


        </div>
      ) : null}
      {activeGroup === 'rules' ? (
        <div className="space-y-4">
      <div className="rounded-3xl border border-sky-400/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-semibold text-foreground">{isGerman ? "Regeln für Erholung und Grenzen" : "Rules for recovery and limits"}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{isGerman ? "Diese Regeln gelten für alle und werden vom Generator nie verletzt: Ruhezeiten, freie Tage nach Nächten und Wochenenden, Höchstgrenzen für Nächte und Wochenenden sowie Arbeitszeitgrenzen. Widersprüche zu Besetzung und Wünschen zeigt die Prüfung im Überblick." : "These rules apply to everyone and the generator never violates them: rest periods, days off after nights and weekends, limits for nights and weekends, and working time limits. The check in the overview shows contradictions with staffing and wishes."}</p>
      </div>

      {/* ── Rotation rules & overtime ── */}
      <Section title={t("shiftAdmin.sectionRotation")} icon={RotateCcw} helpKey="shiftAdmin.helpSectionRotation" t={t}>
        {rotation ? (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotMaxConsecutiveSame")} <HelpTooltip textKey="shiftAdmin.helpRotMaxConsecutiveSame" t={t} /></label>
                <input type="number" min="1" max="30" value={rotation.max_consecutive_same} onChange={(event) => setRotation({ ...rotation, max_consecutive_same: Number.parseInt(event.target.value, 10) || 1 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotMaxConsecutiveWorkdays")} <HelpTooltip textKey="shiftAdmin.helpRotMaxConsecutiveWorkdays" t={t} /></label>
                <input type="number" min="1" max="30" value={rotation.max_consecutive_workdays} onChange={(event) => setRotation({ ...rotation, max_consecutive_workdays: Number.parseInt(event.target.value, 10) || 1 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotMinFreeAfterStreak")} <HelpTooltip textKey="shiftAdmin.helpRotMinFreeAfterStreak" t={t} /></label>
                <input type="number" min="0" max="7" value={rotation.min_free_after_streak} onChange={(event) => setRotation({ ...rotation, min_free_after_streak: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotMinRestHours")} <HelpTooltip textKey="shiftAdmin.helpRotMinRestHours" t={t} /></label>
                <input type="number" min="8" max="24" value={rotation.min_hours_between_shifts} onChange={(event) => setRotation({ ...rotation, min_hours_between_shifts: Number.parseInt(event.target.value, 10) || 11 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotMaxNightsMonth")} <HelpTooltip textKey="shiftAdmin.helpRotMaxNightsMonth" t={t} /></label>
                <input type="number" min="0" max="31" value={rotation.max_nights_per_month} onChange={(event) => setRotation({ ...rotation, max_nights_per_month: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotMaxWeekendsMonth")} <HelpTooltip textKey="shiftAdmin.helpRotMaxWeekendsMonth" t={t} /></label>
                <input type="number" min="0" max="10" value={rotation.max_weekends_per_month} onChange={(event) => setRotation({ ...rotation, max_weekends_per_month: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotFreeDaysAfterNight")} <HelpTooltip textKey="shiftAdmin.helpRotFreeDaysAfterNight" t={t} /></label>
                <input type="number" min="0" max="7" value={rotation.free_days_after_night} onChange={(event) => setRotation({ ...rotation, free_days_after_night: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.rotFreeDaysAfterWeekend")} <HelpTooltip textKey="shiftAdmin.helpRotFreeDaysAfterWeekend" t={t} /></label>
                <input type="number" min="0" max="7" value={rotation.free_days_after_weekend} onChange={(event) => setRotation({ ...rotation, free_days_after_weekend: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="text-xs text-slate-400">{isGerman ? 'Erster Arbeitstag nach Nacht' : 'First workday after nights'}</label>
                <select value={rotation.night_next_workday ?? 4} onChange={(event) => setRotation({ ...rotation, night_next_workday: Number.parseInt(event.target.value, 10) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                  {weekdayOptions.map((option) => <option key={`night-next-${option.value}`} value={option.value}>{option.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">{isGerman ? 'Standard Donnerstag: Montag bis Mittwoch bleiben frei.' : 'Default Thursday: Monday through Wednesday remain free.'}</p>
              </div>
              <div>
                <label className="text-xs text-slate-400">{isGerman ? 'Feste Schicht nach Nacht' : 'Fixed shift after nights'}</label>
                <select value={rotation.night_next_shift_code || ''} onChange={(event) => setRotation({ ...rotation, night_next_shift_code: event.target.value || null })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                  <option value="">{isGerman ? 'Keine feste Folgeschicht' : 'No fixed follow-up shift'}</option>
                  {shiftCodeOptions.filter((option) => option.value !== 'N').map((option) => <option key={`night-shift-${option.value}`} value={option.value}>{option.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500">{isGerman ? 'Verhindert eine zufällige Schichtart nach dem Nachtblock.' : 'Prevents a random shift type after a night block.'}</p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={rotation.night_to_early_forbidden} onChange={(event) => setRotation({ ...rotation, night_to_early_forbidden: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span className="flex items-center">{t("shiftAdmin.rotNightToEarlyForbidden")} <HelpTooltip textKey="shiftAdmin.helpRotNightToEarlyForbidden" t={t} /></span>
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={rotation.late_to_early_forbidden} onChange={(event) => setRotation({ ...rotation, late_to_early_forbidden: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span className="flex items-center">{t("shiftAdmin.rotLateToEarlyForbidden")} <HelpTooltip textKey="shiftAdmin.helpRotLateToEarlyForbidden" t={t} /></span>
              </label>
              <div className="rounded-2xl border border-violet-300/25 bg-violet-500/10 px-4 py-3 text-sm text-slate-100">
                <label className="block">
                  <span className="block font-medium">{isGerman ? 'Nachtplanungsmodell' : 'Night planning model'}</span>
                  <select value={shortNightOptions.mode} disabled={saving === 'short-night'} onChange={(event) => { const mode = event.target.value as ShortNightOptions['mode']; setShortNightOptions({ ...shortNightOptions, mode, enabled: mode !== 'SEVEN_DAY_ONLY' }); void saveShortNightOptions({ mode, enabled: mode !== 'SEVEN_DAY_ONLY' }); }} className="mt-2 w-full rounded-lg border border-violet-300/25 bg-slate-950/80 px-3 py-2 text-xs text-slate-100">
                    <option value="SEVEN_DAY_ONLY">{isGerman ? 'Nur 7-Tage-Nachtblöcke' : 'Seven-night blocks only'}</option>
                    <option value="SHORT_ONLY">{isGerman ? 'Nur kurze Nachtblöcke' : 'Short night blocks only'}</option>
                    <option value="MIXED">{isGerman ? 'Beide Modelle parallel (7-Tage-Blöcke plus kurze Blöcke bis zur Maximalbesetzung)' : 'Both models in parallel (seven-night blocks plus short blocks up to the maximum staffing)'}</option>
                  </select>
                  <span className="mt-2 block text-xs text-slate-400">{isGerman
                    ? `Im Parallelmodus erhalten Mitarbeitende mit 7-Tage-Wunsch einen vollständigen Nachtblock. Zusätzlich werden Mitarbeitende mit Kurzblock-Wunsch in Blöcken von bis zu ${shortNightOptions.series_days ?? 3} Nächten geplant, bis die Maximalbesetzung der Nachtschicht erreicht ist.`
                    : `In parallel mode, employees preferring seven nights receive a full block. Employees preferring short blocks are additionally planned in blocks of up to ${shortNightOptions.series_days ?? 3} nights until the maximum night staffing is reached.`}</span>
                </label>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <label className="text-[10px] text-slate-400">{isGerman ? 'Start' : 'Start'}<input type="time" value={shortNightOptions.start_time} onChange={(event) => setShortNightOptions({ ...shortNightOptions, start_time: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-100" /></label>
                  <label className="text-[10px] text-slate-400">{isGerman ? 'Ende' : 'End'}<input type="time" value={shortNightOptions.end_time} onChange={(event) => setShortNightOptions({ ...shortNightOptions, end_time: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-100" /></label>
                  <label className="text-[10px] text-slate-400">{isGerman ? 'Frei danach' : 'Days off'}<input type="number" min="0" max="14" value={shortNightOptions.free_days_after} onChange={(event) => setShortNightOptions({ ...shortNightOptions, free_days_after: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-100" /></label>
                  <label className="text-[10px] text-slate-400">{isGerman ? 'Länge kurzer Nachtblöcke (Tage)' : 'Length of short night blocks (days)'}<input type="number" min="1" max="7" value={shortNightOptions.series_days ?? 3} onChange={(event) => setShortNightOptions({ ...shortNightOptions, series_days: Math.max(1, Math.min(7, Number.parseInt(event.target.value, 10) || 3)) })} className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950/70 px-2 py-1 text-xs text-slate-100" /></label>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-violet-100/75">{isGerman ? `N und NK teilen sich dieselbe Obergrenze: maximal ${normalNightStaffCap || '—'} Personen pro Nacht. Die Grenze änderst du bei der normalen Nachtschicht N.` : `N and NK share one cap: at most ${normalNightStaffCap || '—'} people per night. Change the cap on the regular N shift.`}</p>
              </div>
            </div>

            {/* ── Overtime sub-section ── */}
            <div className="grid gap-3 lg:grid-cols-3">
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={rotation.late_before_night_required ?? false} onChange={(event) => setRotation({ ...rotation, late_before_night_required: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span>{isGerman ? 'Spaetschicht vor Nachtschicht erzwingen' : 'Require late shift before night shift'}</span>
              </label>
            </div>
            <p className="text-xs text-slate-500">
              {isGerman
                ? 'Wenn aktiv, startet die Engine einen Nachtblock nur bei Mitarbeitern, die am Vortag eine Spaetschicht hatten. Das macht den Wechsel in die Nacht planbarer.'
                : 'When enabled, the engine starts a night block only for employees who worked a late shift on the previous day. This makes the transition into nights more predictable.'}
            </p>

            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/5 p-4">
              <div className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-200/90">
                {isGerman ? 'Work-Life-Balance' : 'Work-life balance'}
              </div>
              <p className="mb-4 text-xs leading-relaxed text-slate-400">
                {isGerman
                  ? 'Diese Regeln reduzieren belastende Schichtwechsel und schützen zusammenhängende Freizeit. Die verpflichtende Sollzeit bleibt vorrangig; unvereinbare Ziele werden als Konflikt angezeigt.'
                  : 'These rules reduce disruptive shift changes and protect coherent time off. Contracted target hours remain mandatory; incompatible goals are reported as conflicts.'}
              </p>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-slate-300">{isGerman ? 'Max. Schichtartwechsel / Monat' : 'Max shift-type changes / month'}</label>
                  <input type="number" min="0" max="12" value={rotation.max_shift_type_changes_per_month ?? 4} onChange={(event) => setRotation({ ...rotation, max_shift_type_changes_per_month: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  <div className="mt-1 text-xs text-slate-500">{isGerman ? '0 = unbegrenzt. Vermeidet häufiges Wechseln zwischen Früh, Spät und Nacht.' : '0 = unlimited. Avoids frequent switching between early, late and night.'}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300">{isGerman ? 'Mindestens freie Wochenenden' : 'Minimum free weekends'}</label>
                  <input type="number" min="0" max="5" value={rotation.min_free_weekends_per_month ?? 2} onChange={(event) => setRotation({ ...rotation, min_free_weekends_per_month: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  <div className="mt-1 text-xs text-slate-500">{isGerman ? 'Schützt vollständige Wochenenden ohne Samstag- oder Sonntagsdienst.' : 'Protects complete weekends without Saturday or Sunday duty.'}</div>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-300">{isGerman ? 'Freie Tage vor Schichtwechsel' : 'Days off before shift change'}</label>
                  <input type="number" min="0" max="3" value={rotation.min_recovery_days_after_shift_change ?? 1} onChange={(event) => setRotation({ ...rotation, min_recovery_days_after_shift_change: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  <div className="mt-1 text-xs text-slate-500">{isGerman ? 'Bevorzugte Erholung zwischen unterschiedlichen Schichtarten.' : 'Preferred recovery between different shift types.'}</div>
                </div>
              </div>
            </div>

            <div className="mt-2 rounded-2xl border border-amber-400/15 bg-amber-500/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200/80">
                <Timer className="h-4 w-4" />
                {t("shiftAdmin.overtimeTitle")}
              </div>
              <label className="mb-3 flex cursor-pointer items-start gap-3 rounded-2xl border border-amber-400/20 bg-slate-950/40 p-3 text-sm text-slate-200">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={overtimeConfig.unlimited} onChange={(event) => setOvertimeConfig({ ...overtimeConfig, unlimited: event.target.checked })} />
                <span>
                  <span className="font-semibold">{isGerman ? 'Überstunden unbegrenzt' : 'Unlimited overtime'}</span>
                  <span className="mt-1 block text-xs text-slate-400">{isGerman
                    ? 'Der Generator darf Tage auch nach Erreichen der Sollstunden planen (z. B. den Freitag nach einem Wochenend- oder Nachtblock), um Lücken zu schließen. Ohne Haken gilt das Maximum unten (0 = nur bis zum Soll). Jederzeit änderbar.'
                    : 'The generator may plan days after the target hours are reached (e.g. the Friday after a weekend or night block) to close gaps. Without the tick the maximum below applies (0 = only up to target). Can be changed at any time.'}</span>
                </span>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <div className={overtimeConfig.unlimited ? 'opacity-50' : ''}>
                  <label className="flex items-center text-xs text-slate-400">
                    {t("shiftAdmin.overtimeMax")}
                    <HelpTooltip textKey="shiftAdmin.helpOvertimeMax" t={t} />
                  </label>
                  <input type="number" min="0" max="200" disabled={overtimeConfig.unlimited} value={overtimeConfig.maxOvertimeHours} onChange={(event) => setOvertimeConfig({ ...overtimeConfig, maxOvertimeHours: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  <div className="mt-1 text-xs text-slate-500">{t("shiftAdmin.overtimeHint")}</div>
                </div>
                <div>
                  <label className="flex items-center text-xs text-slate-400">
                    {t("shiftAdmin.overtimeMode")}
                    <HelpTooltip textKey="shiftAdmin.helpOvertimeMode" t={t} />
                  </label>
                  <select value={overtimeConfig.overtimeMode} onChange={(event) => setOvertimeConfig({ ...overtimeConfig, overtimeMode: event.target.value as OvertimeConfig['overtimeMode'] })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                    <option value="show">{t("shiftAdmin.overtimeModeShow")}</option>
                    <option value="warn">{t("shiftAdmin.overtimeModeWarn")}</option>
                    <option value="hard">{t("shiftAdmin.overtimeModeHard")}</option>
                  </select>
                </div>
              </div>
            </div>

            {/* ── Daily / Weekly hour limits sub-section ── */}
            <div className="mt-2 rounded-2xl border border-sky-400/15 bg-sky-500/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                <Clock className="h-4 w-4" />
                {isGerman ? "Arbeitszeitgrenzen" : "Working Time Limits"}
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="text-xs text-slate-400">{isGerman ? "Max. Stunden / Tag" : "Max hours / day"}</label>
                  <input type="number" min="0" max="24" step="0.5" value={overtimeConfig.maxDailyHours} onChange={(e) => setOvertimeConfig({ ...overtimeConfig, maxDailyHours: Math.max(0, Math.min(24, parseFloat(e.target.value) || 0)) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  <div className="mt-1 text-xs text-slate-500">{isGerman ? "0 = kein Limit" : "0 = no limit"}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-400">{isGerman ? "Modus (Tag)" : "Mode (daily)"}</label>
                  <select value={overtimeConfig.dailyMode} onChange={(e) => setOvertimeConfig({ ...overtimeConfig, dailyMode: e.target.value as OvertimeConfig['dailyMode'] })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                    <option value="off">{isGerman ? "Aus" : "Off"}</option>
                    <option value="warn">{isGerman ? "Warnung" : "Warning"}</option>
                    <option value="block">{isGerman ? "Sperre" : "Block"}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-400">{isGerman ? "Max. Stunden / Woche" : "Max hours / week"}</label>
                  <input type="number" min="0" max="168" step="0.5" value={overtimeConfig.maxWeeklyHours} onChange={(e) => setOvertimeConfig({ ...overtimeConfig, maxWeeklyHours: Math.max(0, Math.min(168, parseFloat(e.target.value) || 0)) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  <div className="mt-1 text-xs text-slate-500">{isGerman ? "0 = kein Limit" : "0 = no limit"}</div>
                </div>
                <div>
                  <label className="text-xs text-slate-400">{isGerman ? "Modus (Woche)" : "Mode (weekly)"}</label>
                  <select value={overtimeConfig.weeklyMode} onChange={(e) => setOvertimeConfig({ ...overtimeConfig, weeklyMode: e.target.value as OvertimeConfig['weeklyMode'] })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                    <option value="off">{isGerman ? "Aus" : "Off"}</option>
                    <option value="warn">{isGerman ? "Warnung" : "Warning"}</option>
                    <option value="block">{isGerman ? "Sperre" : "Block"}</option>
                  </select>
                </div>
              </div>
            </div>

          </div>
        ) : null}
      </Section>


        </div>
      ) : null}
      {activeGroup === 'wishes' ? (
        <div className="space-y-4">
      <div className="rounded-3xl border border-sky-400/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-semibold text-foreground">{isGerman ? "Wünsche, Abwechslung und Sollstunden" : "Wishes, variety and target hours"}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{isGerman ? "Hier legst du fest, wie stark der Generator auf Wünsche der Mitarbeitenden Rücksicht nimmt und wie die Arbeitszeit verteilt wird. Pro Wunschart gibt es genau eine Einstellung: 100 % = verbindlich, 0 % = aus. Es gibt keine zweiten Schalter mehr, die sich mit diesen Werten widersprechen können." : "Set how much the generator respects employee wishes and how working time is distributed. Each wish type has exactly one setting: 100 % = binding, 0 % = off. There are no second switches any more that could contradict these values."}</p>
      </div>

      <Section title={isGerman ? 'Mitarbeiterwünsche: wie verbindlich?' : 'Employee wishes: how binding?'} icon={Scale}>
        {planConfig ? (
          <div className="space-y-4">
            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
              <input type="checkbox" checked={planConfig.respect_employee_wishes} onChange={(event) => setPlanConfig({ ...planConfig, respect_employee_wishes: event.target.checked })} className="mt-1 rounded border-white/20 bg-slate-950" />
              <span>
                <span className="block font-medium">{isGerman ? 'Mitarbeiterwünsche beim Planen berücksichtigen' : 'Consider employee wishes when planning'}</span>
                <span className="mt-1 block text-xs text-slate-400">{isGerman ? 'Hauptschalter für alle Wünsche. Ist er aus, gelten die Regler darunter nicht.' : 'Main switch for all wishes. While it is off the sliders below have no effect.'}</span>
              </span>
            </label>
            <PreferenceWeightSettings value={wishStrengths} onChange={setWishStrengths} disabled={!planConfig.respect_employee_wishes} />
          </div>
        ) : null}
      </Section>

      <Section title={isGerman ? 'Abwechslung und Fairness' : 'Variety and fairness'} icon={Sliders}>
        {planConfig && fairness ? (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-200">{isGerman ? 'Schichtart von Woche zu Woche' : 'Shift type from week to week'}</label>
              <input type="range" min="0" max="100" value={advancedSettings.varietyPriority} onChange={(event) => setAdvancedSettings({ ...advancedSettings, varietyPriority: Number.parseInt(event.target.value, 10) || 0 })} className="mt-3 w-full" />
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>{isGerman ? 'immer dieselbe Schichtart' : 'always the same shift type'}</span>
                <span>{advancedSettings.varietyPriority}%</span>
                <span>{isGerman ? 'häufig wechseln' : 'change often'}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{isGerman ? 'Ein Regler statt zwei gegensätzlicher Einstellungen (Stabilität und Abwechslung): niedrig = Mitarbeitende bleiben möglichst bei ihrer Schichtart, hoch = der Plan wechselt Früh, Spät und Nacht stärker durch. Wünsche und harte Regeln gehen immer vor.' : 'One slider instead of two opposite settings (stability and variety): low = employees stay with their shift type, high = the plan rotates early, late and night more. Wishes and hard rules always come first.'}</p>
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
              <input type="checkbox" checked={advancedSettings.lateOverflowThuFri} onChange={(event) => setAdvancedSettings({ ...advancedSettings, lateOverflowThuFri: event.target.checked })} className="mt-1 rounded border-white/20 bg-slate-950" />
              <span>
                <span className="block font-medium">{isGerman ? 'Spätschicht Do/Fr über der Obergrenze erlauben' : 'Allow Thursday/Friday late shifts above the maximum'}</span>
                <span className="mt-1 block text-xs text-slate-400">{isGerman ? 'Wer Nachtschicht und Spätschicht als Wunsch angegeben hat, darf donnerstags und freitags auch dann in die Spätschicht, wenn die maximale Besetzung dort schon erreicht ist. Diese Einsätze werden im Draft als „Überbesetzung" markiert.' : 'Employees who wished for both night and late shifts may work Thursday and Friday late shifts even when the maximum staffing is already reached. These shifts are marked as overstaffing in the draft.'}</span>
              </span>
            </label>

            <div>
              <label className="text-sm font-medium text-slate-200">{isGerman ? 'Stunden gleichmäßig verteilen' : 'Level hours between employees'}</label>
              <input type="range" min="0" max="100" value={planConfig.fairness_priority} onChange={(event) => setPlanConfig({ ...planConfig, fairness_priority: Number.parseInt(event.target.value, 10) || 0 })} className="mt-3 w-full" />
              <div className="mt-1 text-xs text-slate-500">{planConfig.fairness_priority}% · {isGerman ? '0 = aus, 80 = Standard' : '0 = off, 80 = default'}</div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{isGerman ? 'Wie stark Personen mit weniger Stunden bevorzugt werden, damit niemand deutlich mehr oder weniger arbeitet als das Team.' : 'How strongly people with fewer hours are preferred so nobody works much more or less than the team.'}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={fairness.balance_nights} onChange={(event) => setFairness({ ...fairness, balance_nights: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span className="flex items-center">{t("shiftAdmin.fairBalanceNights")} <HelpTooltip textKey="shiftAdmin.helpFairBalanceNights" t={t} /></span>
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={fairness.balance_weekends} onChange={(event) => setFairness({ ...fairness, balance_weekends: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span className="flex items-center">{t("shiftAdmin.fairBalanceWeekends")} <HelpTooltip textKey="shiftAdmin.helpFairBalanceWeekends" t={t} /></span>
              </label>
            </div>
          </div>
        ) : null}
      </Section>

      <Section title={isGerman ? 'Sollstunden' : 'Target hours'} icon={Timer}>
        {planConfig ? (
          <div className="space-y-3">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.planTargetHours")} <HelpTooltip textKey="shiftAdmin.helpPlanTargetHours" t={t} /></label>
                <input type="number" min="0" step="0.5" value={planConfig.monthly_target_hours} onChange={(event) => setPlanConfig({ ...planConfig, monthly_target_hours: Number.parseFloat(event.target.value) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{isGerman ? 'Jährliche Sollzeit (Std.)' : 'Annual target hours'}</label>
                <input type="number" min="0" step="0.5" value={planConfig.annual_target_hours} onChange={(event) => setPlanConfig({ ...planConfig, annual_target_hours: Number.parseFloat(event.target.value) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
            </div>
            <p className="text-xs leading-5 text-slate-400">{isGerman ? 'Die Sollzeit eines Monats richtet sich nach seinen Werktagen (Mo–Fr). Ein Feiertag unter der Woche, an dem jemand nicht arbeitet, zählt mit 8 Stunden – genau wie in der Stundenanzeige des Dienstplans.' : 'The monthly target follows the working days (Mon–Fri) of the month. A weekday holiday on which somebody does not work counts as 8 hours, exactly like in the hours display of the shift plan.'}</p>
          </div>
        ) : null}
      </Section>

        </div>
      ) : null}
      {activeGroup === 'special' ? (
        <div className="space-y-4">
      <div className="rounded-3xl border border-sky-400/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-semibold text-foreground">{isGerman ? "Sonderdienste mit festem Personal" : "Special duties with fixed staff"}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{isGerman ? "DBS wird wochenweise im Wechsel von Personen aus dem DBS-Pool übernommen. Außerhalb ihrer DBS-Woche arbeiten diese Personen nur Früh- oder Spätschicht (je nach Auswahl) und nie in 7-Tage-Blöcken. Colo-Bedarf legst du mit Tagen, Schicht und Personenzahl fest." : "DBS is covered week by week by people from the DBS pool. Outside their DBS week they only work early or late shifts (as selected) and never in seven-day blocks. Colo demand is set with days, shift and head count."}</p>
      </div>

      {/* ── DBS Configuration ── */}
      <Section title={t("shiftAdmin.sectionDbs")} icon={Users} helpKey="shiftAdmin.helpSectionDbs" t={t}>
        <div className="mb-4 rounded-2xl border border-fuchsia-400/15 bg-fuchsia-500/10 px-4 py-3 text-sm text-slate-200">
          {t("shiftAdmin.sectionDbsInfo")}
        </div>

        {/* DBS disabled hint */}
        {!dbsConfig.enabled ? (
          <div className="mb-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t("shiftAdmin.dbsDisabledHint")}
          </div>
        ) : null}

        {/* DBS: one block - rotation settings on top, everything else per employee */}
        <div className="mb-6 space-y-4 rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
              <input type="checkbox" checked={dbsConfig.enabled} onChange={(event) => setDbsConfig({ ...dbsConfig, enabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
              <span className="flex items-center">
                {t("shiftAdmin.dbsEnabled")}
                <HelpTooltip textKey="shiftAdmin.helpDbsEnabled" t={t} />
              </span>
            </label>
            <div>
              <label className="flex items-center text-xs text-slate-400">
                {t("shiftAdmin.dbsShiftCode")}
                <HelpTooltip textKey="shiftAdmin.helpDbsShiftCode" t={t} />
              </label>
              <select value={dbsConfig.shiftCode} onChange={(event) => setDbsConfig({ ...dbsConfig, shiftCode: event.target.value })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                {shiftCodeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/5 px-4 py-3 text-sm text-slate-200">
            <div className="font-medium">{isGerman ? 'Eine Person pro Kalenderwoche, Rotation im Pool' : 'One person per calendar week, rotating through the pool'}</div>
            <div className="mt-1 text-xs text-slate-400">
              {isGerman
                ? 'DBS wird als zusammenhängender Block ab Montag geplant. Welche Tage der Woche jemand arbeitet, seine Zeiten und die freien Tage danach stellst du unten für jeden Mitarbeiter einzeln ein – es gibt keine globalen Zeiten oder Erholungstage mehr.'
                : 'DBS is planned as one continuous block starting Monday. Working days, times and the days off afterwards are set below for each employee individually – there are no global times or recovery days any more.'}
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={dbsConfig.fillGaps} onChange={(event) => setDbsConfig({ ...dbsConfig, fillGaps: event.target.checked })} className="mt-1 rounded border-white/20 bg-slate-950" />
            <span>
              <span className="block font-medium">{isGerman ? 'Lückentage durch anderen DBS-Mitarbeiter auffüllen' : 'Fill gap days with another DBS employee'}</span>
              <span className="mt-1 block text-xs text-slate-400">
                {isGerman
                  ? 'Standard: aus. Kann der Mitarbeiter der DBS-Woche einen Tag nicht übernehmen (z. B. Abwesenheit oder gesperrter Tag), bleibt der Tag ohne DBS und der nächste Mitarbeiter startet seinen vollständigen Block zur nächsten Rotation (nächster Montag). Eingeschaltet springt ein anderer Pool-Mitarbeiter für die Lücke ein.'
                  : 'Default: off. If the employee of the DBS week cannot cover a day (e.g. absence or blocked day), that day stays without DBS and the next employee starts his full block at the next rotation (next Monday). When enabled, another pool member covers the gap.'}
              </span>
            </span>
          </label>
        </div>

        {/* DBS employees: own days, own times, own days off */}
        <div className="mb-3 flex items-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
          {t("shiftAdmin.dbsPool")}
        </div>

        <div className="mb-4 flex flex-col gap-3 xl:flex-row">
          <select value={newDbsEmployee} onChange={(event) => setNewDbsEmployee(event.target.value)} className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
            <option value="">{t("shiftAdmin.dbsSelectEmployee")}</option>
            {employees.filter((employee) => !dbsPool.some((entry) => entry.employee_name === employee)).map((employee) => <option key={employee} value={employee}>{employee}</option>)}
          </select>
          <button onClick={addDbsEmployee} disabled={!newDbsEmployee} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-fuchsia-300/30 bg-fuchsia-400/15 px-4 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-400/25 disabled:opacity-50">
            <Plus className="h-4 w-4" />
            {t("shiftAdmin.dbsAddEmployee")}
          </button>
        </div>

        <div className="space-y-3">
          {dbsPool.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">{t("shiftAdmin.dbsEmptyPool")}</div>
          ) : dbsPool.map((entry) => {
            const updateEntry = (patch: Partial<SpecialPoolEntry>) => setDbsPool((current) => current.map((item) => item.employee_name !== entry.employee_name ? item : ({ ...item, ...patch })));
            const dbsDefinition = definitions.find((definition) => String(definition.code || '').toUpperCase() === String(dbsConfig.shiftCode || 'DBS').toUpperCase());
            const ownHours = getDbsOwnPaidHours(entry.start_time, entry.end_time);
            const activeDays = normalizeApplicableDays(entry.working_weekdays);
            const defaultTimes = dbsDefinition ? ` (${dbsDefinition.start_time || '–'}–${dbsDefinition.end_time || '–'})` : '';
            return (
              <div key={entry.employee_name} className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm font-medium text-slate-100">{entry.employee_name}</div>
                  <button onClick={() => removeDbsEmployee(entry.employee_name)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20"><Trash2 className="h-4 w-4" />{t("shiftAdmin.dbsRemove")}</button>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <label className="text-xs text-slate-400">{isGerman ? 'Arbeitstage im DBS-Block' : 'Working days within the DBS block'}</label>
                    <span className="text-xs text-fuchsia-200">{activeDays.length} {isGerman ? 'Tage pro Woche' : 'days per week'}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {weekdayOptions.map((option) => {
                      const active = activeDays.includes(option.value);
                      return <button key={`${entry.employee_name}-${option.value}`} type="button" onClick={() => updateEntry({ working_weekdays: active ? activeDays.filter((day) => day !== option.value) : [...activeDays, option.value] })} className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-fuchsia-400/20 text-fuchsia-100 ring-1 ring-fuchsia-300/30' : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'}`}>{option.label}</button>;
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div>
                    <label className="text-xs text-slate-400">{isGerman ? 'Beginn' : 'Start'}</label>
                    <input type="time" value={entry.start_time || ''} onChange={(event) => updateEntry({ start_time: event.target.value || null })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">{isGerman ? 'Ende' : 'End'}</label>
                    <input type="time" value={entry.end_time || ''} onChange={(event) => updateEntry({ end_time: event.target.value || null })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">{isGerman ? 'Bezahlte Stunden pro Tag' : 'Paid hours per day'}</label>
                    <div className="mt-1 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2 text-sm text-slate-300">
                      {ownHours !== null ? `${String(ownHours).replace('.', ',')} h` : (dbsDefinition ? `${String(dbsDefinition.duration_hours).replace('.', ',')} h` : '—')}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">{isGerman ? 'Freie Tage danach' : 'Days off afterwards'}</label>
                    <input type="number" min="0" max="14" value={entry.free_days_after_block ?? dbsConfig.freeDaysAfterBlock} onChange={(event) => updateEntry({ free_days_after_block: Math.max(0, Math.min(14, Number.parseInt(event.target.value, 10) || 0)) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  {entry.start_time && entry.end_time
                    ? (isGerman ? 'Eigene Zeiten dieses Mitarbeiters. Die Pause (1 h ab 6 h Anwesenheit) ist bereits abgezogen.' : 'Own times of this employee. The break (1 h from 6 h presence) is already deducted.')
                    : (isGerman ? `Keine eigenen Zeiten: es gelten die Zeiten der DBS-Schicht${defaultTimes}. Beginn und Ende ausfüllen, um sie für diesen Mitarbeiter zu überschreiben.` : `No own times: the DBS shift times apply${defaultTimes}. Fill in start and end to override them for this employee.`)}
                  {(entry.start_time || entry.end_time) ? (
                    <button type="button" onClick={() => updateEntry({ start_time: null, end_time: null })} className="ml-2 underline decoration-dotted hover:text-slate-300">{isGerman ? 'Zurücksetzen' : 'Reset'}</button>
                  ) : null}
                <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
                  <div className="text-xs font-medium text-slate-300">{isGerman ? 'Planung außerhalb von DBS' : 'Planning outside DBS'}</div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {isGerman
                      ? 'Welche Schichten dieser Mitarbeiter in den Zeiten ohne DBS arbeitet und an wie vielen Tagen pro Monat. Nichts ausgewählt = wie alle anderen Mitarbeiter.'
                      : 'Which shifts this employee works when not on DBS and on how many days per month. Nothing selected = planned like every other employee.'}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {outsideDbsShiftOptions.map((code) => {
                      const selected = toOutsideDbsTypes(entry.other_shift_codes).includes(code);
                      return <button key={`${entry.employee_name}-other-${code}`} type="button"
                        onClick={() => updateEntry({ other_shift_codes: selected ? toOutsideDbsTypes(entry.other_shift_codes).filter((value) => value !== code) : [...toOutsideDbsTypes(entry.other_shift_codes), code] })}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${selected ? 'bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/30' : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'}`}>{outsideDbsLabels[code]}</button>;
                    })}
                  </div>
                  <div className="mt-3 w-full sm:max-w-xs">
                    <label className="text-xs text-slate-400">{isGerman ? 'Tage pro Monat außerhalb von DBS (max.)' : 'Days per month outside DBS (max.)'}</label>
                    <input type="number" min="0" max="31" value={entry.other_days_per_month ?? ''} placeholder={isGerman ? 'unbegrenzt' : 'unlimited'}
                      onChange={(event) => updateEntry({ other_days_per_month: event.target.value === '' ? null : Math.max(0, Math.min(31, Number.parseInt(event.target.value, 10) || 0)) })}
                      className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
                  </div>
                </div>
                </p>
              </div>
            );
          })}
        </div>

      </Section>


      {/* ── Colo competency planning ── */}
      <Section title={isGerman ? 'Colo-Kompetenzplanung' : 'Colo competency planning'} icon={Building2} defaultOpen={false}>
        <div className="space-y-5">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/8 px-4 py-3 text-sm text-slate-200">
            <div className="font-semibold text-cyan-100">{isGerman ? 'Colo-Einsätze im Dienstplan' : 'Colo duties in the shift plan'}</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {isGerman
                ? 'Wähle unten, wer Colo-Kompetenz hat, und lege fest, wie viele Personen an welchen Tagen und in welcher Schicht gebraucht werden. Der Generator plant Pool-Mitarbeitende bevorzugt in diese Schichten – aber nie gegen Schichtwünsche, Sperrtage oder Wellbeing-Grenzen. Eingeplante Colo-Mitarbeitende werden im Dienstplan mit „CO“ markiert und lassen sich dort auch von Hand markieren.'
                : 'Choose below who has Colo competence and how many people are needed on which days and in which shift. The generator prefers pool members for these shifts, but never against shift wishes, blocked days or wellbeing limits. Planned Colo employees are marked "CO" in the shift plan and can also be marked by hand there.'}
            </p>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-100">{isGerman ? 'Colo-Planung aktivieren' : 'Enable Colo planning'}</span>
              <span className="mt-1 block text-xs text-slate-400">{isGerman ? 'Die Rollen werden beim Aktivieren eines generierten Drafts in den Wochenplan übernommen.' : 'Roles are transferred to the weekly plan when a generated draft is activated.'}</span>
            </span>
            <input type="checkbox" checked={coloConfig.enabled} onChange={(event) => setColoConfig({ ...coloConfig, enabled: event.target.checked })} className="h-5 w-5 rounded border-white/20 bg-slate-950 text-cyan-500" />
          </label>

          <div className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-100">{isGerman ? 'Colo-Bedarf: an welchen Tagen, in welcher Schicht, wie viele Personen' : 'Colo demand: which days, which shift, how many people'}</div>
                <p className="mt-1 text-xs leading-5 text-slate-400">
                  {isGerman
                    ? 'Lege für jeden Bedarf einen Eintrag an: Tage einzeln anklicken, Schicht wählen (Früh, Spät oder Nacht) und die Anzahl der benötigten Mitarbeitenden eintragen. Beispiel: Mo–Fr · Früh · 1 Person und jede Nacht · Nacht · 1 Person.'
                    : 'Create one entry per demand: click the days one by one, choose the shift (early, late or night) and enter how many employees are needed. Example: Mon–Fri · early · 1 person and every night · night · 1 person.'}
                </p>
              </div>
              <button type="button" onClick={addColoRequirement} className="inline-flex items-center gap-2 rounded-2xl border border-cyan-300/30 bg-cyan-400/15 px-4 py-2 text-sm font-medium text-cyan-100 transition hover:bg-cyan-400/25">
                <Plus className="h-4 w-4" />
                {isGerman ? 'Neuer Eintrag' : 'New entry'}
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {coloConfig.requirements.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">
                  {isGerman ? 'Noch kein Colo-Bedarf eingetragen. Mit „Neuer Eintrag“ anlegen.' : 'No Colo demand entered yet. Use "New entry" to add one.'}
                </div>
              ) : coloConfig.requirements.map((entry) => (
                <div key={entry.id} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-3 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto] xl:items-center">
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{isGerman ? 'Tage' : 'Days'}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {weekdayOptions.map((option) => {
                        const active = entry.weekdays.includes(option.value);
                        return (
                          <button
                            key={`${entry.id}-day-${option.value}`}
                            type="button"
                            onClick={() => updateColoRequirement(entry.id, { weekdays: normalizeColoWeekdays(active ? entry.weekdays.filter((day) => day !== option.value) : [...entry.weekdays, option.value]) })}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-cyan-400/20 text-cyan-100 ring-1 ring-cyan-300/30' : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'}`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {entry.weekdays.length === 0 ? (
                      <div className="mt-1 text-[11px] text-amber-300">{isGerman ? 'Mindestens einen Tag wählen, sonst wird der Eintrag nicht gespeichert.' : 'Pick at least one day, otherwise the entry is not saved.'}</div>
                    ) : null}
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{isGerman ? 'Schicht' : 'Shift'}</div>
                    <div className="flex gap-1.5">
                      {COLO_SHIFT_TYPE_OPTIONS.map((option) => (
                        <button
                          key={`${entry.id}-type-${option.value}`}
                          type="button"
                          onClick={() => updateColoRequirement(entry.id, { shift_type: option.value })}
                          className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${entry.shift_type === option.value ? 'bg-sky-400/20 text-sky-100 ring-1 ring-sky-300/30' : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'}`}
                        >
                          {isGerman ? option.labelDe : option.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">{isGerman ? 'Mitarbeitende' : 'Employees'}</div>
                    <input type="number" min="1" max="20" value={entry.staff} onChange={(event) => updateColoRequirement(entry.id, { staff: Math.max(1, Math.min(20, Number.parseInt(event.target.value, 10) || 1)) })} className="w-24 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <button type="button" onClick={() => removeColoRequirement(entry.id)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20">
                    <Trash2 className="h-4 w-4" />
                    {isGerman ? 'Löschen' : 'Delete'}
                  </button>
                </div>
              ))}
            </div>

            {coloConfig.requirements.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-center text-xs text-slate-300">
                  <caption className="pb-2 text-left text-[10px] uppercase tracking-[0.18em] text-slate-400">{isGerman ? 'Übersicht: benötigte Colo-Mitarbeitende je Tag' : 'Overview: Colo employees needed per day'}</caption>
                  <thead>
                    <tr className="text-slate-400">
                      <th className="px-2 py-1 text-left font-medium">{isGerman ? 'Schicht' : 'Shift'}</th>
                      {weekdayOptions.map((option) => <th key={`ov-h-${option.value}`} className="px-2 py-1 font-medium">{option.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {COLO_SHIFT_TYPE_OPTIONS.map((type) => (
                      <tr key={`ov-${type.value}`} className="border-t border-white/5">
                        <td className="px-2 py-1 text-left">{isGerman ? type.labelDe : type.labelEn}</td>
                        {weekdayOptions.map((option) => {
                          const total = coloConfig.requirements
                            .filter((entry) => entry.shift_type === type.value && entry.weekdays.includes(option.value))
                            .reduce((sum, entry) => sum + entry.staff, 0);
                          return <td key={`ov-${type.value}-${option.value}`} className={total > 0 ? 'px-2 py-1 font-semibold text-cyan-200' : 'px-2 py-1 text-slate-600'}>{total > 0 ? total : '–'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input value={coloSearch} onChange={(event) => setColoSearch(event.target.value)} placeholder={isGerman ? 'Mitarbeiter suchen…' : 'Search employees…'} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-2 pl-10 pr-3 text-sm text-slate-100" />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{isGerman ? 'Alle Mitarbeitenden' : 'All employees'}</span>
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{availableColoEmployees.length}</span>
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto p-2">
                {availableColoEmployees.length === 0 ? <div className="px-3 py-8 text-center text-sm text-slate-500">{isGerman ? 'Keine weiteren Mitarbeitenden' : 'No additional employees'}</div> : availableColoEmployees.map((employee) => (
                  <button key={employee} type="button" onClick={() => addColoEmployee(employee)} className="flex w-full items-center justify-between rounded-xl border border-transparent px-3 py-2 text-left text-sm text-slate-200 transition hover:border-cyan-400/25 hover:bg-cyan-500/10">
                    <span className="truncate">{employee}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-cyan-300">{isGerman ? 'Auswählen' : 'Select'} <ArrowRight className="h-3.5 w-3.5" /></span>
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-cyan-400/25 bg-cyan-500/5">
              <div className="flex items-center justify-between border-b border-cyan-400/15 px-4 py-3">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100">{isGerman ? 'Colo-Kompetenz vorhanden' : 'Colo competency selected'}</span>
                <span className="rounded-full bg-cyan-500/15 px-2 py-0.5 text-xs text-cyan-200">{coloConfig.employeePool.length}</span>
              </div>
              <div className="max-h-80 space-y-1 overflow-y-auto p-2">
                {selectedColoEmployees.length === 0 ? <div className="px-3 py-8 text-center text-sm text-slate-500">{isGerman ? 'Noch niemand ausgewählt' : 'No one selected yet'}</div> : selectedColoEmployees.map((employee) => (
                  <button key={employee} type="button" onClick={() => removeColoEmployee(employee)} className="flex w-full items-center justify-between rounded-xl border border-cyan-400/15 bg-cyan-500/8 px-3 py-2 text-left text-sm text-cyan-50 transition hover:border-red-400/25 hover:bg-red-500/10">
                    <span className="truncate">{employee}</span>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400"><ArrowLeft className="h-3.5 w-3.5" /> {isGerman ? 'Entfernen' : 'Remove'}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {coloConfig.enabled && coloConfig.employeePool.length < minimumColoPoolSize ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{isGerman ? `Der Pool ist für die eingestellte Mindestbesetzung zu klein. Pro Tag werden mindestens ${minimumColoPoolSize} unterschiedliche Mitarbeitende (Tag + Nacht) benötigt.` : `The pool is too small for the configured minimum staffing. At least ${minimumColoPoolSize} different employees (day + night) are required per day.`}</span>
            </div>
          ) : null}

        </div>
      </Section>


        </div>
      ) : null}
      {activeGroup === 'exceptions' ? (
        <div className="space-y-4">
      <div className="rounded-3xl border border-sky-400/20 bg-sky-500/5 px-5 py-4">
        <div className="text-sm font-semibold text-foreground">{isGerman ? "Ausnahmen und Hinweise" : "Exceptions and notes"}</div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{isGerman ? "Einzelne Personen vom Plan ausnehmen oder auf eine Schicht festlegen. Außerdem stellst du hier ein, welche Hinweise der Dienstplan bei Problemen zeigt." : "Exclude single people from the plan or fix them to one shift. Here you also choose which hints the shift plan shows when there are problems."}</p>
      </div>

      {/* Save button for advanced settings */}

      {/* ── Employee exclusions ── */}
      <Section title={t("shiftAdmin.sectionExclusions")} icon={UserX} helpKey="shiftAdmin.helpSectionExclusions" t={t}>
        <div className="mb-2 text-xs text-slate-400">
          {isGerman ? 'Schicht wählen (Früh, Spät oder Nacht) und die Tage Mo–So markieren: Der Mitarbeiter wird nur an diesen Tagen und nur in dieser Schicht eingeplant. Ohne Schicht wird er an den markierten Tagen gar nicht eingeplant.' : 'Leave empty to exclude the employee on the selected weekdays. Early, late, or night plans the employee only on the selected weekdays and only with that shift type.'}
        </div>
        <div className="mb-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px_auto]">
          <select value={newExclusionName} onChange={(event) => setNewExclusionName(event.target.value)} className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
            <option value="">{t("shiftAdmin.exclSelectEmployee")}</option>
            {employees.filter((employee) => !exclusions.some((exclusion) => exclusion.employee_name === employee)).map((employee) => <option key={employee} value={employee}>{employee}</option>)}
          </select>
          <select value={newExclusionFixedShiftType} onChange={(event) => setNewExclusionFixedShiftType(event.target.value as FixedShiftTypeValue)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
            {FIXED_SHIFT_TYPE_OPTIONS.map((option) => (
              <option key={option.value || 'exclude'} value={option.value}>{isGerman ? option.labelDe : option.labelEn}</option>
            ))}
          </select>
          <button onClick={() => void addExclusion()} disabled={!newExclusionName.trim() || saving === 'excl-new'} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50">
            <UserX className="h-4 w-4" />
            {saving === 'excl-new'
              ? (isGerman ? 'Speichert...' : 'Saving...')
              : (newExclusionFixedShiftType ? (isGerman ? 'Regel anlegen' : 'Add rule') : t("shiftAdmin.exclExclude"))}
          </button>
          <div className="flex flex-wrap items-center gap-2 xl:col-span-3">
            <span className="text-xs text-slate-400">{newExclusionFixedShiftType ? (isGerman ? 'Einplanen an:' : 'Plan on:') : (isGerman ? 'Nicht einplanen an:' : 'Do not plan on:')}</span>
            {weekdayOptions.map((option) => {
              const active = newExclusionWeekdays.includes(option.value);
              return (
                <button key={`new-excl-${option.value}`} type="button" onClick={() => setNewExclusionWeekdays((current) => toggleWeekdayInList(current, option.value))} className={`rounded-full px-3 py-1 text-xs font-medium transition ${active ? 'bg-sky-400/20 text-sky-200 ring-1 ring-sky-300/30' : 'bg-white/5 text-slate-400 ring-1 ring-white/10 hover:bg-white/10'}`}>
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {exclusions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">{t("shiftAdmin.exclEmpty")}</div>
        ) : (
          <div className="space-y-3">
            {exclusions.map((exclusion) => {
              const isFixedShiftRule = Boolean(exclusion.fixed_shift_type);
              return (
              <div key={exclusion.id} className={`flex flex-col gap-3 rounded-2xl border p-4 xl:flex-row xl:items-center xl:justify-between ${isFixedShiftRule ? 'border-blue-400/20 bg-blue-500/5' : 'border-red-400/20 bg-red-500/5'}`}>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-slate-100">{exclusion.employee_name}</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${isFixedShiftRule ? 'border-blue-400/30 bg-blue-500/10 text-blue-200' : 'border-red-400/30 bg-red-500/10 text-red-200'}`}>
                      {formatFixedShiftType(exclusion.fixed_shift_type, isGerman)}
                    </div>
                    <div className="inline-flex rounded-full border border-slate-400/30 bg-slate-500/10 px-2 py-0.5 text-[11px] font-semibold text-slate-200">
                      {formatExclusionWeekdays(exclusion.weekdays, isGerman)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[11px] text-slate-400">{isFixedShiftRule ? (isGerman ? 'Einplanen an:' : 'Plan on:') : (isGerman ? 'Nicht einplanen an:' : 'Do not plan on:')}</span>
                    {weekdayOptions.map((option) => {
                      const ruleWeekdays = normalizeExclusionWeekdays(exclusion.weekdays);
                      const active = ruleWeekdays.includes(option.value);
                      return (
                        <button
                          key={`${exclusion.id}-weekday-${option.value}`}
                          type="button"
                          disabled={saving === `excl-${exclusion.id}`}
                          onClick={() => void updateExclusionRule(exclusion, (exclusion.fixed_shift_type || '') as FixedShiftTypeValue, toggleWeekdayInList(ruleWeekdays, option.value))}
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition disabled:opacity-50 ${active ? 'bg-sky-400/20 text-sky-200 ring-1 ring-sky-300/30' : 'bg-white/5 text-slate-500 ring-1 ring-white/10 hover:bg-white/10'}`}
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="text-xs text-slate-400">{t("shiftAdmin.exclCreatedBy")} {exclusion.created_by} {isGerman ? 'am' : 'on'} {new Date(exclusion.created_at).toLocaleDateString(isGerman ? 'de-DE' : 'en-US', { timeZone: 'Europe/Berlin' })}</div>
                </div>
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
                  <select
                    value={(exclusion.fixed_shift_type || '') as FixedShiftTypeValue}
                    onChange={(event) => void updateExclusionRule(exclusion, event.target.value as FixedShiftTypeValue)}
                    disabled={saving === `excl-${exclusion.id}`}
                    className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 disabled:opacity-50"
                  >
                    {FIXED_SHIFT_TYPE_OPTIONS.map((option) => (
                      <option key={`${exclusion.id}-${option.value || 'exclude'}`} value={option.value}>{isGerman ? option.labelDe : option.labelEn}</option>
                    ))}
                  </select>
                  <button onClick={() => void removeExclusion(exclusion.id)} className="inline-flex items-center gap-2 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/20">
                    <Plus className="h-4 w-4" />
                    {isGerman ? 'Regel entfernen' : 'Remove rule'}
                  </button>
                </div>
              </div>
            );})}
          </div>
        )}
      </Section>


      {/* ── Issues / control panel ── */}
      <Section title={t("shiftAdmin.sectionIssues")} icon={AlertTriangle} helpKey="shiftAdmin.helpSectionIssues" t={t}>
        <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-sm text-slate-200">
          {t("shiftAdmin.sectionIssuesInfo")}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={advancedSettings.issuePanelEnabled} onChange={(event) => setAdvancedSettings({ ...advancedSettings, issuePanelEnabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.issuePanel")}
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={advancedSettings.issueShowSolutions} onChange={(event) => setAdvancedSettings({ ...advancedSettings, issueShowSolutions: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.issueShowSolutions")}
          </label>
        </div>

        <div className="mt-4 max-w-sm">
          <label className="text-xs text-slate-400">{t("shiftAdmin.issuePriorityMode")}</label>
          <select value={advancedSettings.issuePriorityMode} onChange={(event) => setAdvancedSettings({ ...advancedSettings, issuePriorityMode: event.target.value as AdvancedPlanningSettings['issuePriorityMode'] })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
            <option value="staffing_first">{t("shiftAdmin.issueModeStaffing")}</option>
            <option value="balanced">{t("shiftAdmin.issueModeBalanced")}</option>
            <option value="fairness_first">{t("shiftAdmin.issueModeFairness")}</option>
          </select>
        </div>
      </Section>


      {user.isRoot ? (
        <Section title={isGerman ? 'Interne Admin-Hinweise' : 'Internal admin notes'} icon={ShieldAlert} defaultOpen={false}>
          <div className="space-y-4">
            <div className="rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {isGerman
                ? 'Dieser Bereich ist ausschließlich für den Admin sichtbar. Die Hinweise sind nicht Teil der Mitarbeiteransicht und beeinflussen die automatische Planung nicht.'
                : 'This area is visible to the administrator only. Notes are not shown to employees and do not affect automated planning.'}
            </div>
            <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
              <input type="checkbox" checked={advancedSettings.adminFlagsEnabled} onChange={(event) => setAdvancedSettings({ ...advancedSettings, adminFlagsEnabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
              <span>{isGerman ? 'Hervorhebung in dieser Admin-Liste aktivieren' : 'Enable highlighting in this admin list'}</span>
            </label>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
              <select value={newAdminFlagName} onChange={(event) => setNewAdminFlagName(event.target.value)} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"><option value="">{isGerman ? 'Mitarbeiter auswählen' : 'Select employee'}</option>{employees.filter((employee) => !adminFlags.some((flag) => flag.employee_name === employee)).map((employee) => <option key={employee} value={employee}>{employee}</option>)}</select>
              <input value={newAdminFlagNote} onChange={(event) => setNewAdminFlagNote(event.target.value)} placeholder={isGerman ? 'Interne Notiz (optional)' : 'Internal note (optional)'} className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500" />
              <button type="button" onClick={() => void saveAdminFlag()} disabled={!newAdminFlagName || saving === 'admin-flag'} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-red-400 px-4 py-2 text-sm font-medium text-slate-950 disabled:opacity-50"><Save className="h-4 w-4" />{saving === 'admin-flag' ? '…' : (isGerman ? 'Hinweis speichern' : 'Save note')}</button>
            </div>
            <div className="space-y-2">
              {adminFlags.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-500">{isGerman ? 'Keine internen Hinweise vorhanden.' : 'No internal notes recorded.'}</div> : adminFlags.map((flag) => <div key={flag.id} className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${advancedSettings.adminFlagsEnabled && flag.is_active ? 'border-red-400/40 bg-red-500/10' : 'border-white/10 bg-slate-900/55'}`}><div><div className="font-medium text-slate-100">{flag.employee_name}</div>{flag.note ? <div className="mt-1 text-sm text-slate-400">{flag.note}</div> : null}<div className="mt-1 text-xs text-slate-500">{isGerman ? 'Zuletzt geändert' : 'Last updated'}: {new Date(flag.updated_at).toLocaleDateString(isGerman ? 'de-DE' : 'en-US')}</div></div><button type="button" onClick={() => void removeAdminFlag(flag.id)} disabled={saving === `admin-flag-${flag.id}`} className="rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-50">{isGerman ? 'Entfernen' : 'Remove'}</button></div>)}
            </div>
          </div>
        </Section>
      ) : null}


        </div>
      ) : null}

      {/* ── One central save for the whole page ── */}
      <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/90 px-4 py-3 shadow-lg backdrop-blur">
        <div className={`flex items-center gap-2 text-sm ${lastSavedAt ? 'text-emerald-300' : 'text-slate-400'}`}>
          {lastSavedAt ? <CheckCircle2 className="h-4 w-4" /> : null}
          {lastSavedAt
            ? (isGerman ? `Zuletzt gespeichert: ${lastSavedAt.toLocaleTimeString('de-DE')}` : `Last saved: ${lastSavedAt.toLocaleTimeString('en-US')}`)
            : (isGerman ? 'Änderungen werden erst mit „Alle Einstellungen speichern“ übernommen (Ausnahme: Regeln und Hinweise werden sofort gespeichert).' : 'Changes apply only after “Save all settings” (exceptions: rules and notes save immediately).')}
        </div>
        <button onClick={() => void saveEverything()} disabled={saving === 'all' || loading} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving === 'all' ? (isGerman ? 'Speichert…' : 'Saving…') : (isGerman ? 'Alle Einstellungen speichern' : 'Save all settings')}
        </button>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <EnterprisePageShell className="admin-enterprise-surface" style={{ maxWidth: 'none' }}>
      <EnterpriseHeader
        icon={<Settings2 className="h-6 w-6 text-blue-400" />}
        title={t("shiftAdmin.title")}
        subtitle={t("shiftAdmin.subtitle")}
      />
      <EnterpriseFeatureHero
        tone="emerald"
        eyebrow={t("shiftAdmin.subtitle")}
        title={t("shiftAdmin.title")}
        description={t("shiftAdmin.subtitle")}
      />
      {content}
    </EnterprisePageShell>
  );
}

export default function ShiftAdminSettings() {
  return <ShiftPlanningSettingsPanel />;
}
