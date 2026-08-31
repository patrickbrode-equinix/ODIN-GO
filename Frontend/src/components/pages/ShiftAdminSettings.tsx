/* ================================================ */
/* Shift Admin Settings                             */
/* Reusable panel for Admin Settings + legacy page  */
/* ================================================ */

import { useCallback, useEffect, useState } from 'react';
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
  Settings2,
  Sliders,
  Star,
  Timer,
  Trash2,
  UserX,
  Users,
} from 'lucide-react';
import { EmployeeSkills, fetchSkills, updateSkills } from '../../api/coverage';
import type { TranslationKey } from '../../context/LanguageContext';
import { useLanguage } from '../../context/LanguageContext';
import { dedupeEmployeeNames } from '../../utils/employeeNames';

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
  modes?: ShiftMode[];
}

function normalizeShiftModes(definition: ShiftDefinition): ShiftMode[] {
  if (Array.isArray(definition.modes) && definition.modes.length > 0) return definition.modes;
  return [{ id: 1, label: 'Standard', start_time: definition.start_time || '00:00', end_time: definition.end_time || '00:00', duration_hours: definition.duration_hours || 0, free_days_after: 0 }];
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
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface SpecialPoolEntry {
  id?: number;
  shift_code: string;
  employee_name: string;
  monthly_max_assignments: number;
  sort_order: number;
  is_active: boolean;
}

interface AdvancedPlanningSettings {
  issuePanelEnabled: boolean;
  issueAutoRefresh: boolean;
  issueShowSolutions: boolean;
  issuePriorityMode: 'staffing_first' | 'balanced' | 'fairness_first';
  illnessAutoSwapEnabled: boolean;
  illnessMinSourceBuffer: number;
  illnessMinRestHours: number;
  illnessRequireSkillMatch: boolean;
  illnessProtectWorklifeBalance: boolean;
  weekendVolumeEnabled: boolean;
  weekendBufferPercent: number;
  weekendMinDispatchers: number;
  colleaguePreferencesEnabled: boolean;
}

interface DbsConfig {
  enabled: boolean;
  rhythmWeeks: number;
  referenceDate: string;
  weekdays: number[];
  shiftCode: string;
  requiredStaff: number;
  defaultMonthlyTarget: number;
  freeDaysAfterBlock: number;
}

interface ColoConfig {
  enabled: boolean;
  employeePool: string[];
  weekdayPreparationStaff: number;
  weekendInstallationStaff: number;
  weekendTroubleshootingStaff: number;
}

interface OvertimeConfig {
  maxOvertimeHours: number;
  overtimeMode: 'show' | 'warn' | 'hard';
  maxDailyHours: number;
  maxWeeklyHours: number;
  dailyMode: 'off' | 'warn' | 'block';
  weeklyMode: 'off' | 'warn' | 'block';
}

type HolidayStaffingLimit = {
  early: number;
  late: number;
};

type HolidayStaffingConfig = Record<string, HolidayStaffingLimit>;

interface SkillMatrixProfile extends EmployeeSkills {
  rated_skills: Record<string, number>;
}

/* ── defaults & constants ── */

const DEFAULT_SKILL_CATALOG = [
  'Cross Connect',
  'Metro Connect',
  'Panel Installation',
  'Deinstalls',
  'Power',
  'Migration',
  'Provide Access',
  'LOS',
  'Colo Planung',
  'Colo Ausfuhrung',
  'Antenne',
  'Begleitung',
] as const;

const DEFAULT_ADVANCED_SETTINGS: AdvancedPlanningSettings = {
  issuePanelEnabled: true,
  issueAutoRefresh: true,
  issueShowSolutions: true,
  issuePriorityMode: 'balanced',
  illnessAutoSwapEnabled: false,
  illnessMinSourceBuffer: 1,
  illnessMinRestHours: 11,
  illnessRequireSkillMatch: true,
  illnessProtectWorklifeBalance: true,
  weekendVolumeEnabled: false,
  weekendBufferPercent: 15,
  weekendMinDispatchers: 1,
  colleaguePreferencesEnabled: true,
};

const DEFAULT_DBS_CONFIG: DbsConfig = {
  enabled: true,
  rhythmWeeks: 2,
  referenceDate: '',
  weekdays: [1, 2, 3, 4, 5, 6, 0],
  shiftCode: 'DBS',
  requiredStaff: 1,
  defaultMonthlyTarget: 4,
  freeDaysAfterBlock: 2,
};

const DEFAULT_COLO_CONFIG: ColoConfig = {
  enabled: false,
  employeePool: [],
  weekdayPreparationStaff: 1,
  weekendInstallationStaff: 1,
  weekendTroubleshootingStaff: 1,
};
type DispatcherConfig = { enabled: boolean; priorities: string[] };
const DEFAULT_DISPATCHER_CONFIG: DispatcherConfig = { enabled: true, priorities: [] };

const DEFAULT_OVERTIME_CONFIG: OvertimeConfig = {
  maxOvertimeHours: 0,
  overtimeMode: 'show',
  maxDailyHours: 10,
  maxWeeklyHours: 48,
  dailyMode: 'warn',
  weeklyMode: 'warn',
};

const HOLIDAY_STAFFING_OPTIONS = [
  { value: 'Neujahr', labelDe: 'Neujahr', labelEn: "New Year's Day" },
  { value: 'Karfreitag', labelDe: 'Karfreitag', labelEn: 'Good Friday' },
  { value: 'Ostermontag', labelDe: 'Ostermontag', labelEn: 'Easter Monday' },
  { value: 'Tag der Arbeit', labelDe: 'Tag der Arbeit', labelEn: 'Labour Day' },
  { value: 'Christi Himmelfahrt', labelDe: 'Christi Himmelfahrt', labelEn: 'Ascension Day' },
  { value: 'Pfingstmontag', labelDe: 'Pfingstmontag', labelEn: 'Whit Monday' },
  { value: 'Fronleichnam', labelDe: 'Fronleichnam', labelEn: 'Corpus Christi' },
  { value: 'Tag der Deutschen Einheit', labelDe: 'Tag der Deutschen Einheit', labelEn: 'German Unity Day' },
  { value: '1. Weihnachtstag', labelDe: '1. Weihnachtstag', labelEn: 'Christmas Day' },
  { value: '2. Weihnachtstag', labelDe: '2. Weihnachtstag', labelEn: 'Boxing Day' },
] as const;

type FixedShiftTypeValue = '' | 'early' | 'late' | 'night';

const FIXED_SHIFT_TYPE_OPTIONS: Array<{ value: FixedShiftTypeValue; labelDe: string; labelEn: string }> = [
  { value: '', labelDe: 'Komplett ausschliessen', labelEn: 'Exclude completely' },
  { value: 'early', labelDe: 'Nur Fruehschicht', labelEn: 'Early only' },
  { value: 'late', labelDe: 'Nur Spaetschicht', labelEn: 'Late only' },
  { value: 'night', labelDe: 'Nur Nachtschicht', labelEn: 'Night only' },
];
const BUILT_IN_SHIFT_CODES = new Set(['E1', 'E2', 'E1SA', 'E1WE', 'L1', 'L2', 'L1WE', 'N', 'DBS', 'FS', 'ABW', 'S']);

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
    issueAutoRefresh: parseBooleanSetting(settings['shiftplan.issue_auto_refresh'], DEFAULT_ADVANCED_SETTINGS.issueAutoRefresh),
    issueShowSolutions: parseBooleanSetting(settings['shiftplan.issue_show_solutions'], DEFAULT_ADVANCED_SETTINGS.issueShowSolutions),
    issuePriorityMode: (settings['shiftplan.issue_priority_mode'] as AdvancedPlanningSettings['issuePriorityMode']) || DEFAULT_ADVANCED_SETTINGS.issuePriorityMode,
    illnessAutoSwapEnabled: parseBooleanSetting(settings['shiftplan.illness_auto_swap_enabled'], DEFAULT_ADVANCED_SETTINGS.illnessAutoSwapEnabled),
    illnessMinSourceBuffer: parseNumberSetting(settings['shiftplan.illness_min_source_buffer'], DEFAULT_ADVANCED_SETTINGS.illnessMinSourceBuffer),
    illnessMinRestHours: parseNumberSetting(settings['shiftplan.illness_min_rest_hours'], DEFAULT_ADVANCED_SETTINGS.illnessMinRestHours),
    illnessRequireSkillMatch: parseBooleanSetting(settings['shiftplan.illness_require_skill_match'], DEFAULT_ADVANCED_SETTINGS.illnessRequireSkillMatch),
    illnessProtectWorklifeBalance: parseBooleanSetting(settings['shiftplan.illness_protect_worklife_balance'], DEFAULT_ADVANCED_SETTINGS.illnessProtectWorklifeBalance),
    weekendVolumeEnabled: parseBooleanSetting(settings['shiftplan.weekend_volume_enabled'], DEFAULT_ADVANCED_SETTINGS.weekendVolumeEnabled),
    weekendBufferPercent: parseNumberSetting(settings['shiftplan.weekend_buffer_percent'], DEFAULT_ADVANCED_SETTINGS.weekendBufferPercent),
    weekendMinDispatchers: parseNumberSetting(settings['shiftplan.weekend_min_dispatchers'], DEFAULT_ADVANCED_SETTINGS.weekendMinDispatchers),
    colleaguePreferencesEnabled: parseBooleanSetting(settings['shiftplan.colleague_preferences_enabled'], DEFAULT_ADVANCED_SETTINGS.colleaguePreferencesEnabled),
  };
}

function extractDbsConfig(settings: Record<string, string>): DbsConfig {
  return {
    enabled: parseBooleanSetting(settings['shiftplan.dbs_enabled'], DEFAULT_DBS_CONFIG.enabled),
    rhythmWeeks: parseNumberSetting(settings['shiftplan.dbs_rhythm_weeks'], DEFAULT_DBS_CONFIG.rhythmWeeks),
    referenceDate: settings['shiftplan.dbs_reference_date'] ?? DEFAULT_DBS_CONFIG.referenceDate,
    weekdays: [1, 2, 3, 4, 5, 6, 0],
    shiftCode: settings['shiftplan.dbs_shift_code'] || DEFAULT_DBS_CONFIG.shiftCode,
    requiredStaff: parseNumberSetting(settings['shiftplan.dbs_required_staff'], DEFAULT_DBS_CONFIG.requiredStaff),
    defaultMonthlyTarget: parseNumberSetting(settings['shiftplan.dbs_default_monthly_target'], DEFAULT_DBS_CONFIG.defaultMonthlyTarget),
    freeDaysAfterBlock: parseNumberSetting(settings['shiftplan.dbs_free_days_after_block'], DEFAULT_DBS_CONFIG.freeDaysAfterBlock),
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
    weekdayPreparationStaff: Math.max(0, parseNumberSetting(settings['shiftplan.colo_weekday_preparation_staff'], DEFAULT_COLO_CONFIG.weekdayPreparationStaff)),
    weekendInstallationStaff: Math.max(0, parseNumberSetting(settings['shiftplan.colo_weekend_installation_staff'], DEFAULT_COLO_CONFIG.weekendInstallationStaff)),
    weekendTroubleshootingStaff: Math.max(0, parseNumberSetting(settings['shiftplan.colo_weekend_troubleshooting_staff'], DEFAULT_COLO_CONFIG.weekendTroubleshootingStaff)),
  };
}

function extractDispatcherConfig(settings: Record<string, string>): DispatcherConfig {
  return {
    enabled: parseBooleanSetting(settings['shiftplan.dispatcher_enabled'], DEFAULT_DISPATCHER_CONFIG.enabled),
    priorities: parseEmployeePoolSetting(settings['shiftplan.dispatcher_pool']),
  };
}

function extractOvertimeConfig(settings: Record<string, string>): OvertimeConfig {
  return {
    maxOvertimeHours: parseNumberSetting(settings['shiftplan.max_overtime_hours'], DEFAULT_OVERTIME_CONFIG.maxOvertimeHours),
    overtimeMode: (settings['shiftplan.overtime_mode'] as OvertimeConfig['overtimeMode']) || DEFAULT_OVERTIME_CONFIG.overtimeMode,
    maxDailyHours: parseNumberSetting(settings['shiftplan.max_daily_hours'], DEFAULT_OVERTIME_CONFIG.maxDailyHours),
    maxWeeklyHours: parseNumberSetting(settings['shiftplan.max_weekly_hours'], DEFAULT_OVERTIME_CONFIG.maxWeeklyHours),
    dailyMode: (settings['shiftplan.daily_mode'] as OvertimeConfig['dailyMode']) || DEFAULT_OVERTIME_CONFIG.dailyMode,
    weeklyMode: (settings['shiftplan.weekly_mode'] as OvertimeConfig['weeklyMode']) || DEFAULT_OVERTIME_CONFIG.weeklyMode,
  };
}

function extractHolidayStaffingConfig(settings: Record<string, string>): HolidayStaffingConfig {
  const config: HolidayStaffingConfig = Object.fromEntries(
    HOLIDAY_STAFFING_OPTIONS.map((holiday) => [holiday.value, { early: 0, late: 0 }])
  ) as HolidayStaffingConfig;
  const raw = settings['shiftplan.holiday_staffing_limits'];

  if (!raw) return config;

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return config;

    for (const holiday of HOLIDAY_STAFFING_OPTIONS) {
      const entry = parsed[holiday.value];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      config[holiday.value] = {
        early: Math.max(Number.parseInt(String(entry.early ?? 0), 10) || 0, 0),
        late: Math.max(Number.parseInt(String(entry.late ?? 0), 10) || 0, 0),
      };
    }
  } catch {
    return config;
  }

  return config;
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

function normalizeSkillCatalog(value: unknown): string[] {
  if (Array.isArray(value)) {
    return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
  }

  if (typeof value === 'string' && value.trim()) {
    try {
      return normalizeSkillCatalog(JSON.parse(value));
    } catch {
      return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
    }
  }

  return [...DEFAULT_SKILL_CATALOG];
}

function normalizeRatedSkills(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([skill, rating]) => {
        const normalizedSkill = String(skill || '').trim();
        const normalizedRating = Number.parseInt(String(rating ?? ''), 10);

        if (!normalizedSkill) return null;
        if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) return null;

        return [normalizedSkill, normalizedRating];
      })
      .filter(Boolean) as Array<[string, number]>
  );
}

function buildSkillProfile(employeeName: string, existing?: EmployeeSkills): SkillMatrixProfile {
  return {
    employee_name: employeeName,
    can_sh: existing?.can_sh ?? false,
    can_tt: existing?.can_tt ?? false,
    can_cc: existing?.can_cc ?? false,
    updated_at: existing?.updated_at ?? '',
    rated_skills: normalizeRatedSkills(existing?.rated_skills),
  };
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

/* ── main panel ── */

export function ShiftPlanningSettingsPanel({ embedded = false }: { embedded?: boolean }) {
  const { language, t } = useLanguage();
  const isGerman = language === 'de';
  const weekdayOptions = getWeekdayOptions(isGerman);
  const shiftDayOffsetOptions = getShiftDayOffsetOptions(isGerman);
  const [definitions, setDefinitions] = useState<ShiftDefinition[]>([]);
  const [rotation, setRotation] = useState<RotationRules | null>(null);
  const [fairness, setFairness] = useState<FairnessRules | null>(null);
  const [planConfig, setPlanConfig] = useState<PlanningConfig | null>(null);
  const [exclusions, setExclusions] = useState<ShiftplanExclusion[]>([]);
  const [employees, setEmployees] = useState<string[]>([]);
  const [dbsPool, setDbsPool] = useState<SpecialPoolEntry[]>([]);
  const [dbsConfig, setDbsConfig] = useState<DbsConfig>(DEFAULT_DBS_CONFIG);
  const [coloConfig, setColoConfig] = useState<ColoConfig>(DEFAULT_COLO_CONFIG);
  const [coloSearch, setColoSearch] = useState('');
  const [dispatcherConfig, setDispatcherConfig] = useState<DispatcherConfig>(DEFAULT_DISPATCHER_CONFIG);
  const [dispatcherSearch, setDispatcherSearch] = useState('');
  const [overtimeConfig, setOvertimeConfig] = useState<OvertimeConfig>(DEFAULT_OVERTIME_CONFIG);
  const [holidayStaffingConfig, setHolidayStaffingConfig] = useState<HolidayStaffingConfig>(extractHolidayStaffingConfig({}));
  const [advancedSettings, setAdvancedSettings] = useState<AdvancedPlanningSettings>(DEFAULT_ADVANCED_SETTINGS);
  const [skillsEnabled, setSkillsEnabled] = useState(false);
  const [skillCatalog, setSkillCatalog] = useState<string[]>([...DEFAULT_SKILL_CATALOG]);
  const [skillProfiles, setSkillProfiles] = useState<SkillMatrixProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [newExclusionName, setNewExclusionName] = useState('');
  const [newExclusionFixedShiftType, setNewExclusionFixedShiftType] = useState<FixedShiftTypeValue>('');
  const [newDbsEmployee, setNewDbsEmployee] = useState('');
  const [newSkillName, setNewSkillName] = useState('');
  const [newDefinition, setNewDefinition] = useState({ code: '', name: '', shift_type: 'early', start_time: '06:30', end_time: '15:00', duration_hours: 8, min_staff: 1, max_staff: 5 });
  const [activeShiftModes, setActiveShiftModes] = useState<Record<string, number>>({});

  const showToast = useCallback((msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    window.setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── data loading ── */

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [defRes, rotRes, fairRes, planRes, exclRes, basisRes, appSettingsRes, skillsRes] = await Promise.all([
        api.get('/shift-config/definitions'),
        api.get('/shift-config/rotation-rules'),
        api.get('/shift-config/fairness-rules'),
        api.get('/shift-config/planning-config'),
        api.get('/shift-config/exclusions'),
        api.get('/shiftplan-control/planning-basis?month=' + new Date().toISOString().slice(0, 7)).catch(() => ({ data: { basis: { employees: [] } } })),
        api.get('/app-settings').catch(() => ({ data: {} })),
        fetchSkills().catch(() => []),
      ]);

      const loadedEmployees = dedupeEmployeeNames(basisRes.data.basis?.employees || []);
      const nextDbsConfig = extractDbsConfig(appSettingsRes.data || {});
      const nextColoConfig = extractColoConfig(appSettingsRes.data || {});
      const nextDispatcherConfig = extractDispatcherConfig(appSettingsRes.data || {});
      const poolRes = await api.get(`/shift-config/special-pools/${encodeURIComponent(nextDbsConfig.shiftCode)}`).catch(() => ({ data: { assignments: [] } }));
      const configuredSkillCatalog = normalizeSkillCatalog(appSettingsRes.data?.['shiftplan.skill_catalog']);
      const allSkillProfiles = Array.isArray(skillsRes) ? skillsRes : [];
      const knownEmployees = [...new Set([
        ...loadedEmployees,
        ...allSkillProfiles.map((entry) => String(entry.employee_name || '').trim()).filter(Boolean),
      ])].sort((left, right) => left.localeCompare(right, 'de'));
      const skillsByEmployee = new Map(allSkillProfiles.map((entry) => [entry.employee_name, entry]));

      setDefinitions((defRes.data.definitions || [])
        .filter((definition: ShiftDefinition) => !isHalfDayShiftCode(definition.code))
        .map((definition: ShiftDefinition) => ({
          ...definition,
          applicable_days: normalizeApplicableDays(definition.applicable_days),
          start_day_offset: normalizeShiftDayOffset(definition.start_day_offset, 0),
          end_day_offset: normalizeShiftDayOffset(definition.end_day_offset, definition.shift_type === 'night' ? 1 : 0),
          series_days: normalizeSeriesDays(definition.series_days, 1),
        })));
      setRotation(rotRes.data.rules || null);
      setFairness(fairRes.data.rules || null);
      setPlanConfig(planRes.data.config || null);
      setExclusions((exclRes.data.exclusions || []).filter((entry: ShiftplanExclusion) => entry.is_active));
      setEmployees(loadedEmployees);
      setDbsPool(poolRes.data.assignments || []);
      setDbsConfig(nextDbsConfig);
      setColoConfig({
        ...nextColoConfig,
        employeePool: nextColoConfig.employeePool.filter((employee) => loadedEmployees.includes(employee)),
      });
      setDispatcherConfig({
        ...nextDispatcherConfig,
        priorities: nextDispatcherConfig.priorities.filter((employee) => loadedEmployees.includes(employee)),
      });
      setOvertimeConfig(extractOvertimeConfig(appSettingsRes.data || {}));
      setHolidayStaffingConfig(extractHolidayStaffingConfig(appSettingsRes.data || {}));
      setAdvancedSettings(extractAdvancedPlanningSettings(appSettingsRes.data || {}));
      setSkillsEnabled(parseBooleanSetting(appSettingsRes.data?.['shiftplan.skills_enabled'], false));
      try {
        const rawModes = appSettingsRes.data?.['shiftplan.active_shift_modes'];
        setActiveShiftModes(typeof rawModes === 'string' ? JSON.parse(rawModes) : (rawModes || {}));
      } catch { setActiveShiftModes({}); }
      setSkillCatalog(configuredSkillCatalog);
      setSkillProfiles(knownEmployees.map((employee) => buildSkillProfile(employee, skillsByEmployee.get(employee))));
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

  const saveHolidayStaffing = async () => {
    setSaving('holiday-staffing');
    try {
      await api.put('/app-settings', {
        'shiftplan.holiday_staffing_limits': JSON.stringify(holidayStaffingConfig),
      });
      showToast(isGerman ? 'Feiertags-Maximalbesetzung gespeichert' : 'Holiday max staffing saved');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
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
        'shiftplan.issue_auto_refresh': advancedSettings.issueAutoRefresh,
        'shiftplan.issue_show_solutions': advancedSettings.issueShowSolutions,
        'shiftplan.issue_priority_mode': advancedSettings.issuePriorityMode,
        'shiftplan.illness_auto_swap_enabled': advancedSettings.illnessAutoSwapEnabled,
        'shiftplan.illness_min_source_buffer': advancedSettings.illnessMinSourceBuffer,
        'shiftplan.illness_min_rest_hours': advancedSettings.illnessMinRestHours,
        'shiftplan.illness_require_skill_match': advancedSettings.illnessRequireSkillMatch,
        'shiftplan.illness_protect_worklife_balance': advancedSettings.illnessProtectWorklifeBalance,
        'shiftplan.weekend_volume_enabled': advancedSettings.weekendVolumeEnabled,
        'shiftplan.weekend_buffer_percent': advancedSettings.weekendBufferPercent,
        'shiftplan.weekend_min_dispatchers': advancedSettings.weekendMinDispatchers,
        'shiftplan.colleague_preferences_enabled': advancedSettings.colleaguePreferencesEnabled,
      });
      showToast(t("shiftAdmin.toastAdvancedSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveDbsConfig = async () => {
    setSaving('dbs-config');
    try {
      await api.put('/app-settings', {
        'shiftplan.dbs_enabled': dbsConfig.enabled,
        'shiftplan.dbs_rhythm_weeks': dbsConfig.rhythmWeeks,
        'shiftplan.dbs_reference_date': dbsConfig.referenceDate,
        'shiftplan.dbs_weekdays': JSON.stringify([1, 2, 3, 4, 5, 6, 0]),
        'shiftplan.dbs_shift_code': dbsConfig.shiftCode,
        'shiftplan.dbs_required_staff': dbsConfig.requiredStaff,
        'shiftplan.dbs_default_monthly_target': dbsConfig.defaultMonthlyTarget,
        'shiftplan.dbs_free_days_after_block': dbsConfig.freeDaysAfterBlock,
      });
      await loadAll();
      showToast(t("shiftAdmin.toastDbsConfigSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveDbsPool = async () => {
    setSaving('dbs-pool');
    try {
      const shiftCode = String(dbsConfig.shiftCode || 'DBS').trim().toUpperCase() || 'DBS';
      const payload = dbsPool.map((entry, index) => ({
        employee_name: entry.employee_name,
        monthly_max_assignments: Math.max(Number.parseInt(String(entry.monthly_max_assignments ?? 0), 10) || 0, 0),
        sort_order: index,
      }));
      const { data } = await api.put(`/shift-config/special-pools/${shiftCode}`, { assignments: payload });
      setDbsPool(data.assignments || []);
      showToast(t("shiftAdmin.toastDbsPoolSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
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
        'shiftplan.colo_weekday_preparation_staff': Math.max(0, Math.trunc(coloConfig.weekdayPreparationStaff)),
        'shiftplan.colo_weekend_installation_staff': Math.max(0, Math.trunc(coloConfig.weekendInstallationStaff)),
        'shiftplan.colo_weekend_troubleshooting_staff': Math.max(0, Math.trunc(coloConfig.weekendTroubleshootingStaff)),
      });
      await api.put('/app-settings', { 'shiftplan.active_shift_modes': JSON.stringify(activeShiftModes) });
      showToast(isGerman ? 'Colo-Kompetenzplanung gespeichert.' : 'Colo competency planning saved.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally {
      setSaving('');
    }
  };

  const saveDispatcherConfig = async () => {
    setSaving('dispatcher-config');
    try {
      await api.put('/app-settings', {
        'shiftplan.dispatcher_enabled': dispatcherConfig.enabled,
        'shiftplan.dispatcher_pool': JSON.stringify(dispatcherConfig.priorities),
      });
      showToast(isGerman ? 'Dispatcher-Konfiguration gespeichert.' : 'Dispatcher configuration saved.');
    } catch (error: any) {
      showToast(error?.response?.data?.error || t('shiftAdmin.error'), 'err');
    } finally { setSaving(''); }
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
      });
      setNewExclusionName('');
      setNewExclusionFixedShiftType('');
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

  const updateExclusionRule = async (exclusion: ShiftplanExclusion, fixedShiftType: FixedShiftTypeValue) => {
    setSaving(`excl-${exclusion.id}`);
    try {
      const { data } = await api.patch(`/shift-config/exclusions/${exclusion.id}`, {
        reason: fixedShiftType ? 'fixed_shift' : 'admin_override',
        reason_text: exclusion.reason_text,
        fixed_shift_type: fixedShiftType || null,
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
      monthly_max_assignments: dbsConfig.defaultMonthlyTarget,
      sort_order: current.length,
      is_active: true,
    }]);
    setNewDbsEmployee('');
  };

  const updateDbsPoolEntry = (employeeName: string, field: keyof SpecialPoolEntry, value: unknown) => {
    setDbsPool((current) => current.map((entry) => entry.employee_name === employeeName ? { ...entry, [field]: value } : entry));
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

  const addSkillToCatalog = () => {
    const skillName = newSkillName.trim();
    if (!skillName) return;

    if (skillCatalog.some((entry) => entry.toLowerCase() === skillName.toLowerCase())) {
      showToast(t("shiftAdmin.toastSkillExists"), 'err');
      return;
    }

    setSkillCatalog((current) => [...current, skillName]);
    setNewSkillName('');
  };

  const removeSkillFromCatalog = (skillName: string) => {
    setSkillCatalog((current) => current.filter((entry) => entry !== skillName));
    setSkillProfiles((current) => current.map((profile) => {
      const nextRatedSkills = { ...profile.rated_skills };
      delete nextRatedSkills[skillName];
      return { ...profile, rated_skills: nextRatedSkills };
    }));
  };

  const setSkillRating = (employeeName: string, skillName: string, rating: number) => {
    setSkillProfiles((current) => current.map((profile) => {
      if (profile.employee_name !== employeeName) return profile;

      const nextRatedSkills = { ...profile.rated_skills };
      if (rating <= 0) delete nextRatedSkills[skillName];
      else nextRatedSkills[skillName] = rating;

      return { ...profile, rated_skills: nextRatedSkills };
    }));
  };

  const saveSkillProfiles = async () => {
    setSaving('skills');
    try {
      await api.put('/app-settings', {
        'shiftplan.skills_enabled': skillsEnabled,
        'shiftplan.skill_catalog': JSON.stringify(skillCatalog),
      });

      await Promise.all(skillProfiles.map((profile) => updateSkills({
        employee_name: profile.employee_name,
        can_sh: profile.can_sh,
        can_tt: profile.can_tt,
        can_cc: profile.can_cc,
        rated_skills: profile.rated_skills,
      })));

      showToast(t("shiftAdmin.toastSkillSaved"));
    } catch (error: any) {
      showToast(error?.response?.data?.error || t("shiftAdmin.error"), 'err');
    } finally {
      setSaving('');
    }
  };

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
  const minimumWeekendPoolSize = coloConfig.weekendInstallationStaff + coloConfig.weekendTroubleshootingStaff;

  /* ── render ── */

  const content = (
    <div className="admin-enterprise-surface space-y-4">
      {toast ? (
        <div className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${toast.type === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-red-500/30 bg-red-500/10 text-red-300'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {toast.msg}
        </div>
      ) : null}

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
          <div className="mt-2 text-sm text-muted-foreground">{isGerman ? 'Ausgewählte Mitarbeitende für Vorbereitung, Installation und Troubleshooting.' : 'Selected employees for preparation, installation and troubleshooting.'}</div>
        </div>
        <div className="theme-admin-hero rounded-3xl border border-amber-400/25 p-5 shadow-[0_20px_50px_rgba(2,6,23,0.18)]">
          <div className="text-xs uppercase tracking-[0.2em] text-amber-700/80 dark:text-amber-200/70">{t("shiftAdmin.cardExclusions")}</div>
          <div className="mt-3 text-3xl font-semibold text-foreground">{exclusions.length}</div>
          <div className="mt-2 text-sm text-muted-foreground">{t("shiftAdmin.cardExclusionsDesc")}</div>
        </div>
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
                  <div className="xl:col-span-1">
                    <label className="mb-1 flex items-center text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defMin")} <HelpTooltip textKey="shiftAdmin.helpDefMinMax" t={t} /></label>
                    <input type="number" min="0" value={definition.min_staff} onChange={(event) => updateDef(definition.id, 'min_staff', Number.parseInt(event.target.value, 10) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
                  <div className="xl:col-span-1">
                    <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{t("shiftAdmin.defMax")}</label>
                    <input type="number" min="0" value={definition.max_staff} onChange={(event) => updateDef(definition.id, 'max_staff', Number.parseInt(event.target.value, 10) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
                  </div>
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
                    <button onClick={() => void saveDefinition(definition)} disabled={saving === `def-${definition.id}`} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
                      <Save className="h-4 w-4" />
                      {saving === `def-${definition.id}` ? t("shiftAdmin.defSaving") : t("shiftAdmin.defSave")}
                    </button>
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

        {/* DBS global config */}
        <div className="mb-6 space-y-4 rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          {/* Row 1: Enabled toggle */}
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={dbsConfig.enabled} onChange={(event) => setDbsConfig({ ...dbsConfig, enabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            <span className="flex items-center">
              {t("shiftAdmin.dbsEnabled")}
              <HelpTooltip textKey="shiftAdmin.helpDbsEnabled" t={t} />
            </span>
          </label>

          {/* Row 2: Rhythm, Reference date, Required staff */}
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="flex items-center text-xs text-slate-400">
                {t("shiftAdmin.dbsRhythm")}
                <HelpTooltip textKey="shiftAdmin.helpDbsRhythm" t={t} />
              </label>
              <input type="number" min="1" max="8" value={dbsConfig.rhythmWeeks} onChange={(event) => setDbsConfig({ ...dbsConfig, rhythmWeeks: Math.max(1, Number.parseInt(event.target.value, 10) || 1) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            </div>
            <div>
              <label className="flex items-center text-xs text-slate-400">
                {t("shiftAdmin.dbsReferenceDate")}
                <HelpTooltip textKey="shiftAdmin.helpDbsReferenceDate" t={t} />
              </label>
              <input type="date" value={dbsConfig.referenceDate} onChange={(event) => setDbsConfig({ ...dbsConfig, referenceDate: event.target.value })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            </div>
            <div>
              <label className="flex items-center text-xs text-slate-400">
                {t("shiftAdmin.dbsRequiredStaff")}
                <HelpTooltip textKey="shiftAdmin.helpDbsRequiredStaff" t={t} />
              </label>
              <input type="number" min="0" max="10" value={dbsConfig.requiredStaff} onChange={(event) => setDbsConfig({ ...dbsConfig, requiredStaff: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            </div>
          </div>

          {/* Row 3: Shift code, Default monthly target */}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="flex items-center text-xs text-slate-400">
                {t("shiftAdmin.dbsShiftCode")}
                <HelpTooltip textKey="shiftAdmin.helpDbsShiftCode" t={t} />
              </label>
              <select value={dbsConfig.shiftCode} onChange={(event) => setDbsConfig({ ...dbsConfig, shiftCode: event.target.value })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                {shiftCodeOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center text-xs text-slate-400">
                {t("shiftAdmin.dbsDefaultTarget")}
                <HelpTooltip textKey="shiftAdmin.helpDbsDefaultTarget" t={t} />
              </label>
              <input type="number" min="0" max="31" value={dbsConfig.defaultMonthlyTarget} onChange={(event) => setDbsConfig({ ...dbsConfig, defaultMonthlyTarget: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/5 px-4 py-3 text-sm text-slate-200">
              <div className="font-medium">{isGerman ? 'Fester DBS-Block: Montag bis Sonntag' : 'Fixed DBS block: Monday through Sunday'}</div>
              <div className="mt-1 text-xs text-slate-400">{isGerman ? 'DBS wird immer als zusammenhängende 7-Tage-Serie geplant.' : 'DBS is always planned as one continuous seven-day series.'}</div>
            </div>
            <div>
              <label className="text-xs text-slate-400">{isGerman ? 'Freie Tage nach DBS' : 'Days off after DBS'}</label>
              <input type="number" min="0" max="7" value={dbsConfig.freeDaysAfterBlock} onChange={(event) => setDbsConfig({ ...dbsConfig, freeDaysAfterBlock: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              <p className="mt-1 text-xs text-slate-500">{isGerman ? 'Standard: zwei komplette Erholungstage nach jedem DBS-Block.' : 'Default: two full recovery days after each DBS block.'}</p>
            </div>
          </div>

          {/* Save DBS config */}
          <div className="flex justify-end">
            <button onClick={saveDbsConfig} disabled={saving === 'dbs-config'} className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-fuchsia-300 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving === 'dbs-config' ? t("shiftAdmin.dbsSavingConfig") : t("shiftAdmin.dbsSaveConfig")}
            </button>
          </div>
        </div>

        {/* DBS employee pool */}
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
          ) : dbsPool.map((entry) => (
            <div key={entry.employee_name} className="grid gap-3 rounded-2xl border border-white/10 bg-slate-900/55 p-4 xl:grid-cols-[minmax(0,1fr)_220px_auto] xl:items-end">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-slate-400">{isGerman ? 'Mitarbeiter' : 'Employee'}</label>
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">{entry.employee_name}</div>
              </div>
              <div>
                <label className="mb-1 flex items-center text-[10px] uppercase tracking-[0.18em] text-slate-400">
                  {t("shiftAdmin.dbsMonthlyDays")}
                  <HelpTooltip textKey="shiftAdmin.helpDbsMonthlyDays" t={t} />
                </label>
                <input type="number" min="0" value={entry.monthly_max_assignments} onChange={(event) => updateDbsPoolEntry(entry.employee_name, 'monthly_max_assignments', Number.parseInt(event.target.value, 10) || 0)} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <button onClick={() => removeDbsEmployee(entry.employee_name)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition hover:bg-red-500/20">
                <Trash2 className="h-4 w-4" />
                {t("shiftAdmin.dbsRemove")}
              </button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={saveDbsPool} disabled={saving === 'dbs-pool'} className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-fuchsia-300 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving === 'dbs-pool' ? t("shiftAdmin.dbsSavingPool") : t("shiftAdmin.dbsSavePool")}
          </button>
        </div>
      </Section>

      {/* ── Colo competency planning ── */}
      <Section title={isGerman ? 'Colo-Kompetenzplanung' : 'Colo competency planning'} icon={Building2} defaultOpen={false}>
        <div className="space-y-5">
          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/8 px-4 py-3 text-sm text-slate-200">
            <div className="font-semibold text-cyan-100">{isGerman ? 'Automatische COLO-Rollen im Wochenplan' : 'Automatic COLO roles in the weekly plan'}</div>
            <p className="mt-1 text-xs leading-5 text-slate-400">
              {isGerman
                ? 'Montag bis Freitag wird Vorbereitung geplant. Samstag und Sonntag werden Installation und Troubleshooting getrennt besetzt. Berücksichtigt werden nur ausgewählte Mitarbeitende, die an diesem Tag im Dienst sind und keinen widersprechenden Wunsch hinterlegt haben.'
                : 'Preparation is planned Monday through Friday. Installation and troubleshooting are staffed separately on Saturday and Sunday. Only selected employees who are working that day and have no conflicting preference are considered.'}
            </p>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3">
            <span>
              <span className="block text-sm font-medium text-slate-100">{isGerman ? 'Colo-Planung aktivieren' : 'Enable Colo planning'}</span>
              <span className="mt-1 block text-xs text-slate-400">{isGerman ? 'Die Rollen werden beim Aktivieren eines generierten Drafts in den Wochenplan übernommen.' : 'Roles are transferred to the weekly plan when a generated draft is activated.'}</span>
            </span>
            <input type="checkbox" checked={coloConfig.enabled} onChange={(event) => setColoConfig({ ...coloConfig, enabled: event.target.checked })} className="h-5 w-5 rounded border-white/20 bg-slate-950 text-cyan-500" />
          </label>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs text-slate-400">{isGerman ? 'Vorbereitung pro Werktag' : 'Preparation per weekday'}</label>
              <input type="number" min="0" max="20" value={coloConfig.weekdayPreparationStaff} onChange={(event) => setColoConfig({ ...coloConfig, weekdayPreparationStaff: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            </div>
            <div>
              <label className="text-xs text-slate-400">{isGerman ? 'Installation pro Wochenendtag' : 'Installation per weekend day'}</label>
              <input type="number" min="0" max="20" value={coloConfig.weekendInstallationStaff} onChange={(event) => setColoConfig({ ...coloConfig, weekendInstallationStaff: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            </div>
            <div>
              <label className="text-xs text-slate-400">{isGerman ? 'Troubleshooting pro Wochenendtag' : 'Troubleshooting per weekend day'}</label>
              <input type="number" min="0" max="20" value={coloConfig.weekendTroubleshootingStaff} onChange={(event) => setColoConfig({ ...coloConfig, weekendTroubleshootingStaff: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            </div>
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

          {coloConfig.enabled && coloConfig.employeePool.length < Math.max(coloConfig.weekdayPreparationStaff, minimumWeekendPoolSize) ? (
            <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{isGerman ? `Der Pool ist für die eingestellte Mindestbesetzung zu klein. Am Wochenende werden mindestens ${minimumWeekendPoolSize} unterschiedliche Mitarbeitende pro Tag benötigt.` : `The pool is too small for the configured minimum staffing. At least ${minimumWeekendPoolSize} different employees are required per weekend day.`}</span>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button onClick={saveColoConfig} disabled={saving === 'colo-config'} className="inline-flex items-center gap-2 rounded-2xl bg-cyan-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-cyan-400 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving === 'colo-config' ? (isGerman ? 'Speichert…' : 'Saving…') : (isGerman ? 'Colo-Planung speichern' : 'Save Colo planning')}
            </button>
          </div>
        </div>
      </Section>

      {/* ── Dispatcher assignment ── */}
      <Section title={isGerman ? 'Dispatcher-Zuweisung' : 'Dispatcher assignment'} icon={Route} defaultOpen={false}>
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3">
            <span><span className="block text-sm font-medium text-slate-100">{isGerman ? 'Dispatcherplanung aktivieren' : 'Enable dispatcher planning'}</span><span className="mt-1 block text-xs text-slate-400">{isGerman ? 'Bei mehreren geeigneten Frühschicht-Mitarbeitern wird nur die höchste Priorität als DP markiert.' : 'When several eligible early-shift employees are scheduled, only the highest priority is marked DP.'}</span></span>
            <input type="checkbox" checked={dispatcherConfig.enabled} onChange={(event) => setDispatcherConfig((current) => ({ ...current, enabled: event.target.checked }))} className="h-5 w-5 rounded border-white/20 bg-slate-950 text-pink-500" />
          </label>
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={dispatcherSearch} onChange={(event) => setDispatcherSearch(event.target.value)} placeholder={isGerman ? 'Dispatcherfähige Mitarbeiter suchen…' : 'Search dispatcher-capable employees…'} className="w-full rounded-2xl border border-white/10 bg-slate-950/70 py-2 pl-10 pr-3 text-sm text-slate-100" /></div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/45 p-2">
              {employees.filter((employee) => !dispatcherConfig.priorities.includes(employee) && employee.toLocaleLowerCase().includes(dispatcherSearch.toLocaleLowerCase())).map((employee) => <button key={employee} type="button" onClick={() => setDispatcherConfig((current) => ({ ...current, priorities: [...current.priorities, employee] }))} className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-slate-200 hover:bg-pink-500/10"><span>{employee}</span><span className="text-xs text-pink-300">{isGerman ? 'Hinzufügen' : 'Add'}</span></button>)}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-pink-400/25 bg-pink-500/5 p-2">
              {dispatcherConfig.priorities.map((employee, index) => <div key={employee} className="flex items-center justify-between rounded-xl border border-pink-400/15 px-3 py-2 text-sm text-pink-50"><span><span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-pink-500/20 text-xs font-bold">{index + 1}</span>{employee}</span><button type="button" onClick={() => setDispatcherConfig((current) => ({ ...current, priorities: current.priorities.filter((entry) => entry !== employee) }))} className="text-xs text-slate-400 hover:text-red-300">{isGerman ? 'Entfernen' : 'Remove'}</button></div>)}
              {dispatcherConfig.priorities.length === 0 ? <div className="px-3 py-8 text-center text-sm text-slate-500">{isGerman ? 'Noch niemand ausgewählt' : 'No one selected yet'}</div> : null}
            </div>
          </div>
          <div className="flex justify-end"><button onClick={saveDispatcherConfig} disabled={saving === 'dispatcher-config'} className="inline-flex items-center gap-2 rounded-2xl bg-pink-500 px-4 py-2 text-sm font-medium text-white hover:bg-pink-400 disabled:opacity-50"><Save className="h-4 w-4" />{saving === 'dispatcher-config' ? (isGerman ? 'Speichert…' : 'Saving…') : (isGerman ? 'Dispatcher speichern' : 'Save dispatchers')}</button></div>
        </div>
      </Section>

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
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div>
                  <label className="text-xs font-medium text-slate-300">{isGerman ? 'Schichtstabilität' : 'Shift stability'}</label>
                  <input type="range" min="0" max="100" value={rotation.stability_priority ?? 70} onChange={(event) => setRotation({ ...rotation, stability_priority: Number.parseInt(event.target.value, 10) || 0 })} className="mt-3 w-full" />
                  <div className="mt-1 text-xs text-slate-500">{rotation.stability_priority ?? 70}% · {isGerman ? 'Bevorzugt dieselbe Schichtart in aufeinanderfolgenden Wochen.' : 'Prefers the same shift type in consecutive weeks.'}</div>
                </div>
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
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="flex items-center text-xs text-slate-400">
                    {t("shiftAdmin.overtimeMax")}
                    <HelpTooltip textKey="shiftAdmin.helpOvertimeMax" t={t} />
                  </label>
                  <input type="number" min="0" max="200" value={overtimeConfig.maxOvertimeHours} onChange={(event) => setOvertimeConfig({ ...overtimeConfig, maxOvertimeHours: Math.max(0, Number.parseInt(event.target.value, 10) || 0) })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
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

            <div className="flex justify-end">
              <button onClick={saveRotation} disabled={saving === 'rotation'} className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
                <Save className="h-4 w-4" />
                {saving === 'rotation' ? t("shiftAdmin.rotSaving") : t("shiftAdmin.rotSave")}
              </button>
            </div>
          </div>
        ) : null}
      </Section>

      <Section title={isGerman ? 'Feiertags-Maximalbesetzung' : 'Holiday max staffing'} icon={CalendarDays}>
        <div className="space-y-4">
          <div className="rounded-2xl border border-emerald-400/15 bg-emerald-500/5 px-4 py-3 text-sm text-slate-200">
            {isGerman
              ? 'Lege pro Feiertag die maximale Gesamtbesetzung fuer Frueh- und Spaetschicht fest. Die Begrenzung gilt nur an Feiertagen und nur fuer die Schichttypen Frueh und Spaet. 0 bedeutet: normale Schichtdefinition ohne Feiertagsbegrenzung verwenden.'
              : 'Define the maximum total staffing for early and late shifts per public holiday. The cap applies only on holidays and only to early and late shift types. 0 means: use the regular shift definition without a holiday-specific cap.'}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {HOLIDAY_STAFFING_OPTIONS.map((holiday) => {
              const limits = holidayStaffingConfig[holiday.value] || { early: 0, late: 0 };
              return (
                <div key={holiday.value} className="rounded-2xl border border-white/10 bg-slate-900/55 p-4">
                  <div className="mb-3 text-sm font-semibold text-slate-100">
                    {isGerman ? holiday.labelDe : holiday.labelEn}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs text-slate-400">{isGerman ? 'Max. Frueh' : 'Max early'}</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={limits.early}
                        onChange={(event) => setHolidayStaffingConfig((prev) => ({
                          ...prev,
                          [holiday.value]: {
                            ...(prev[holiday.value] || { early: 0, late: 0 }),
                            early: Math.max(Number.parseInt(event.target.value, 10) || 0, 0),
                          },
                        }))}
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400">{isGerman ? 'Max. Spaet' : 'Max late'}</label>
                      <input
                        type="number"
                        min="0"
                        max="20"
                        value={limits.late}
                        onChange={(event) => setHolidayStaffingConfig((prev) => ({
                          ...prev,
                          [holiday.value]: {
                            ...(prev[holiday.value] || { early: 0, late: 0 }),
                            late: Math.max(Number.parseInt(event.target.value, 10) || 0, 0),
                          },
                        }))}
                        className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button onClick={saveHolidayStaffing} disabled={saving === 'holiday-staffing'} className="inline-flex items-center gap-2 rounded-2xl bg-emerald-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-300 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving === 'holiday-staffing'
                ? (isGerman ? 'Speichert…' : 'Saving…')
                : (isGerman ? 'Feiertagsbesetzung speichern' : 'Save holiday staffing')}
            </button>
          </div>
        </div>
      </Section>

      {/* ── Fairness ── */}
      <Section title={t("shiftAdmin.sectionFairness")} icon={Scale} helpKey="shiftAdmin.helpSectionFairness" t={t}>
        {fairness ? (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-3">
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={fairness.balance_nights} onChange={(event) => setFairness({ ...fairness, balance_nights: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span className="flex items-center">{t("shiftAdmin.fairBalanceNights")} <HelpTooltip textKey="shiftAdmin.helpFairBalanceNights" t={t} /></span>
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={fairness.balance_weekends} onChange={(event) => setFairness({ ...fairness, balance_weekends: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span className="flex items-center">{t("shiftAdmin.fairBalanceWeekends")} <HelpTooltip textKey="shiftAdmin.helpFairBalanceWeekends" t={t} /></span>
              </label>
              <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
                <input type="checkbox" checked={fairness.balance_total_load} onChange={(event) => setFairness({ ...fairness, balance_total_load: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
                <span className="flex items-center">{t("shiftAdmin.fairBalanceLoad")} <HelpTooltip textKey="shiftAdmin.helpFairBalanceLoad" t={t} /></span>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.fairMaxDeviation")} <HelpTooltip textKey="shiftAdmin.helpFairMaxDeviation" t={t} /></label>
                <input type="number" min="5" max="100" value={fairness.max_deviation_percent} onChange={(event) => setFairness({ ...fairness, max_deviation_percent: Number.parseInt(event.target.value, 10) || 5 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.fairPriority")} <HelpTooltip textKey="shiftAdmin.helpFairPriority" t={t} /></label>
                <select value={fairness.fairness_vs_preference} onChange={(event) => setFairness({ ...fairness, fairness_vs_preference: event.target.value })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100">
                  <option value="fairness">{t("shiftAdmin.fairOptFairness")}</option>
                  <option value="preference">{t("shiftAdmin.fairOptPreference")}</option>
                  <option value="balanced">{t("shiftAdmin.fairOptBalanced")}</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveFairness} disabled={saving === 'fairness'} className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
                <Save className="h-4 w-4" />
                {saving === 'fairness' ? t("shiftAdmin.fairSaving") : t("shiftAdmin.fairSave")}
              </button>
            </div>
          </div>
        ) : null}
      </Section>

      {/* ── Planning config ── */}
      <Section title={t("shiftAdmin.sectionPlanning")} icon={Sliders} helpKey="shiftAdmin.helpSectionPlanning" t={t}>
        {planConfig ? (
          <div className="space-y-4">
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
              <input type="checkbox" checked={planConfig.respect_employee_wishes} onChange={(event) => setPlanConfig({ ...planConfig, respect_employee_wishes: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
              <span className="flex items-center">{t("shiftAdmin.planRespectWishes")} <HelpTooltip textKey="shiftAdmin.helpPlanRespectWishes" t={t} /></span>
            </label>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.planTargetHours")} <HelpTooltip textKey="shiftAdmin.helpPlanTargetHours" t={t} /></label>
                <input type="number" min="0" step="0.5" value={planConfig.monthly_target_hours} onChange={(event) => setPlanConfig({ ...planConfig, monthly_target_hours: Number.parseFloat(event.target.value) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">
                  {isGerman ? 'Jaehrliche Sollzeit (Std.)' : 'Annual target hours'}
                  <HelpTooltip textKey="shiftAdmin.helpPlanTargetHours" t={t} />
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={planConfig.annual_target_hours}
                  onChange={(event) => setPlanConfig({ ...planConfig, annual_target_hours: Number.parseFloat(event.target.value) || 0 })}
                  className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100"
                />
                <div className="mt-1 text-xs text-slate-400">
                  {isGerman ? 'Wird fuer die Jahresauswertung im Statistikbereich genutzt.' : 'Used for yearly progress in the statistics area.'}
                </div>
              </div>
              <div>
                <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.planHardRules")} <HelpTooltip textKey="shiftAdmin.helpPlanHardRules" t={t} /></label>
                <input type="range" min="0" max="100" value={planConfig.hard_rules_priority} onChange={(event) => setPlanConfig({ ...planConfig, hard_rules_priority: Number.parseInt(event.target.value, 10) || 0 })} className="mt-3 w-full" />
                <div className="mt-1 text-xs text-slate-400">{planConfig.hard_rules_priority}%</div>
              </div>
              <div>
                <label className="text-xs text-slate-400">{t("shiftAdmin.planSoftWishes")}</label>
                <input type="range" min="0" max="100" value={planConfig.soft_wishes_priority} onChange={(event) => setPlanConfig({ ...planConfig, soft_wishes_priority: Number.parseInt(event.target.value, 10) || 0 })} className="mt-3 w-full" />
                <div className="mt-1 text-xs text-slate-400">{planConfig.soft_wishes_priority}%</div>
              </div>
              <div>
                <label className="text-xs text-slate-400">{t("shiftAdmin.planFairness")}</label>
                <input type="range" min="0" max="100" value={planConfig.fairness_priority} onChange={(event) => setPlanConfig({ ...planConfig, fairness_priority: Number.parseInt(event.target.value, 10) || 0 })} className="mt-3 w-full" />
                <div className="mt-1 text-xs text-slate-400">{planConfig.fairness_priority}%</div>
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
              {t("shiftAdmin.planAdminOverride")}: <span className="font-semibold text-slate-100">{planConfig.admin_override_priority}%</span>
            </div>

            <div className="flex justify-end">
              <button onClick={savePlanConfig} disabled={saving === 'planconfig'} className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
                <Save className="h-4 w-4" />
                {saving === 'planconfig' ? t("shiftAdmin.planSaving") : t("shiftAdmin.planSave")}
              </button>
            </div>
          </div>
        ) : null}
      </Section>

      {/* ── Issues / control panel ── */}
      <Section title={t("shiftAdmin.sectionIssues")} icon={AlertTriangle} helpKey="shiftAdmin.helpSectionIssues" t={t}>
        <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-sm text-slate-200">
          {t("shiftAdmin.sectionIssuesInfo")}
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={advancedSettings.issuePanelEnabled} onChange={(event) => setAdvancedSettings({ ...advancedSettings, issuePanelEnabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.issuePanel")}
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={advancedSettings.issueAutoRefresh} onChange={(event) => setAdvancedSettings({ ...advancedSettings, issueAutoRefresh: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.issueAutoRefresh")}
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

      {/* ── Illness / replacement ── */}
      <Section title={t("shiftAdmin.sectionIllness")} icon={Settings2} helpKey="shiftAdmin.helpSectionIllness" t={t}>
        <div className="mb-4 rounded-2xl border border-sky-400/15 bg-sky-500/10 px-4 py-3 text-sm text-slate-200">
          {t("shiftAdmin.sectionIllnessInfo")}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={advancedSettings.illnessAutoSwapEnabled} onChange={(event) => setAdvancedSettings({ ...advancedSettings, illnessAutoSwapEnabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.illnessAutoSwap")}
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={advancedSettings.illnessRequireSkillMatch} onChange={(event) => setAdvancedSettings({ ...advancedSettings, illnessRequireSkillMatch: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.illnessSkillMatch")}
          </label>
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200 lg:col-span-2">
            <input type="checkbox" checked={advancedSettings.illnessProtectWorklifeBalance} onChange={(event) => setAdvancedSettings({ ...advancedSettings, illnessProtectWorklifeBalance: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.illnessProtectWLB")}
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.illnessBuffer")} <HelpTooltip textKey="shiftAdmin.helpIllnessBuffer" t={t} /></label>
            <input type="number" min="0" value={advancedSettings.illnessMinSourceBuffer} onChange={(event) => setAdvancedSettings({ ...advancedSettings, illnessMinSourceBuffer: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
          </div>
          <div>
            <label className="text-xs text-slate-400">{t("shiftAdmin.illnessRestHours")}</label>
            <input type="number" min="8" value={advancedSettings.illnessMinRestHours} onChange={(event) => setAdvancedSettings({ ...advancedSettings, illnessMinRestHours: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
          <input type="checkbox" checked={advancedSettings.colleaguePreferencesEnabled} onChange={(event) => setAdvancedSettings({ ...advancedSettings, colleaguePreferencesEnabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
          Kollegenpräferenzen für Mitarbeiter freigeben
        </label>
      </Section>

      {/* ── Weekend planning ── */}
      <Section title={t("shiftAdmin.sectionWeekend")} icon={CalendarDays} helpKey="shiftAdmin.helpSectionWeekend" t={t}>
        <div className="mb-4 rounded-2xl border border-fuchsia-400/15 bg-fuchsia-500/10 px-4 py-3 text-sm text-slate-200">
          {t("shiftAdmin.sectionWeekendInfo")}
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={advancedSettings.weekendVolumeEnabled} onChange={(event) => setAdvancedSettings({ ...advancedSettings, weekendVolumeEnabled: event.target.checked })} className="rounded border-white/20 bg-slate-950" />
            {t("shiftAdmin.weekendVolume")}
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.weekendBuffer")} <HelpTooltip textKey="shiftAdmin.helpWeekendBuffer" t={t} /></label>
            <input type="number" min="0" max="100" value={advancedSettings.weekendBufferPercent} onChange={(event) => setAdvancedSettings({ ...advancedSettings, weekendBufferPercent: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
          </div>
          <div>
            <label className="flex items-center text-xs text-slate-400">{t("shiftAdmin.weekendMinDispatchers")} <HelpTooltip textKey="shiftAdmin.helpWeekendMinDispatchers" t={t} /></label>
            <input type="number" min="0" value={advancedSettings.weekendMinDispatchers} onChange={(event) => setAdvancedSettings({ ...advancedSettings, weekendMinDispatchers: Number.parseInt(event.target.value, 10) || 0 })} className="mt-1 w-full rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
          </div>
        </div>
      </Section>

      {/* Save button for advanced settings (issues + illness + weekend) */}
      <div className="flex justify-end">
        <button onClick={saveAdvancedSettings} disabled={saving === 'advanced'} className="inline-flex items-center gap-2 rounded-2xl bg-sky-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-sky-400 disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving === 'advanced' ? t("shiftAdmin.advancedSaving") : t("shiftAdmin.advancedSave")}
        </button>
      </div>

      {/* ── Skills & competency matrix ── */}
      <Section title={t("shiftAdmin.sectionSkills")} icon={Star} defaultOpen={false} helpKey="shiftAdmin.helpSectionSkills" t={t}>
        <div className="mb-4 rounded-2xl border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-sm text-slate-200">
          {t("shiftAdmin.sectionSkillsInfo")}
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
            <input type="checkbox" checked={skillsEnabled} onChange={(event) => setSkillsEnabled(event.target.checked)} className="mt-0.5 rounded border-white/20 bg-slate-950" />
            <span className="flex items-center">
              {t("shiftAdmin.skillsEnabled")}
              <HelpTooltip textKey="shiftAdmin.helpSkillsEnabled" t={t} />
            </span>
          </label>

          <div className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
            {t("shiftAdmin.skillsEmployeeCount")}: <span className="font-semibold text-slate-100">{skillProfiles.length}</span><br />
            {t("shiftAdmin.skillsCatalogCount")}: <span className="font-semibold text-slate-100">{skillCatalog.length}</span>
          </div>
        </div>

        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${skillsEnabled ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-100' : 'border-slate-500/20 bg-slate-900/45 text-slate-300'}`}>
          {skillsEnabled ? t("shiftAdmin.skillsActive") : t("shiftAdmin.skillsInactive")}
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-slate-900/45 p-4">
          <div className="mb-3 flex items-center text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
            {t("shiftAdmin.skillCatalog")}
            <HelpTooltip textKey="shiftAdmin.helpSkillCatalog" t={t} />
          </div>
          <div className="mb-3 flex flex-col gap-3 xl:flex-row">
            <input value={newSkillName} onChange={(event) => setNewSkillName(event.target.value)} placeholder={t("shiftAdmin.skillAddPlaceholder")} className="flex-1 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100" />
            <button onClick={addSkillToCatalog} disabled={!newSkillName.trim()} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-300/30 bg-amber-400/15 px-4 py-2 text-sm font-medium text-amber-100 transition hover:bg-amber-400/25 disabled:opacity-50">
              <Plus className="h-4 w-4" />
              {t("shiftAdmin.skillAdd")}
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            {skillCatalog.map((skill) => (
              <span key={skill} className="inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-100">
                {skill}
                <button type="button" onClick={() => removeSkillFromCatalog(skill)} className="text-amber-200/80 transition hover:text-white" aria-label={`${skill} ${isGerman ? 'entfernen' : 'remove'}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {skillProfiles.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-slate-400">{isGerman ? 'Keine Mitarbeiter für die Skill-Matrix gefunden.' : 'No employees found for the skill matrix.'}</div>
          ) : skillProfiles.map((profile) => (
            <div key={profile.employee_name} className="rounded-2xl border border-white/10 bg-slate-900/55 p-4 shadow-[0_10px_30px_rgba(2,6,23,0.2)]">
              <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-100">{profile.employee_name}</div>
                  <div className="text-xs text-slate-400">{t("shiftAdmin.skillRateInfo")}</div>
                </div>
                <div className="rounded-full border border-white/10 bg-slate-950/60 px-3 py-1 text-xs text-slate-300">
                  {t("shiftAdmin.skillRatedCount")}: {Object.keys(profile.rated_skills || {}).length}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {skillCatalog.map((skill) => {
                  const rating = profile.rated_skills?.[skill] ?? 0;

                  return (
                    <div key={`${profile.employee_name}-${skill}`} className="rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-100">{skill}</div>
                        <div className="text-xs text-slate-400">{rating}/5</div>
                      </div>
                      <div className="mt-3 flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => {
                          const active = rating >= star;
                          const nextRating = rating === star ? 0 : star;

                          return (
                            <button
                              key={`${profile.employee_name}-${skill}-${star}`}
                              type="button"
                              onClick={() => setSkillRating(profile.employee_name, skill, nextRating)}
                              className={`rounded-full p-1 transition ${active ? 'text-amber-300 hover:text-amber-200' : 'text-slate-600 hover:text-amber-200'}`}
                              aria-label={`${skill} ${star} ${isGerman ? 'Sterne' : 'stars'}`}
                            >
                              <Star className={`h-4 w-4 ${active ? 'fill-current' : ''}`} />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end">
          <button onClick={saveSkillProfiles} disabled={saving === 'skills'} className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-amber-300 disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving === 'skills' ? t("shiftAdmin.skillSaving") : t("shiftAdmin.skillSave")}
          </button>
        </div>
      </Section>

      {/* ── Employee exclusions ── */}
      <Section title={t("shiftAdmin.sectionExclusions")} icon={UserX} helpKey="shiftAdmin.helpSectionExclusions" t={t}>
        <div className="mb-2 text-xs text-slate-400">
          {isGerman ? 'Leer laesst den Mitarbeiter komplett draussen. Frueh, Spaet oder Nacht erzwingt genau diese Schichtart im Draft.' : 'Leave empty to exclude the employee completely. Early, late, or night enforces that shift type in the draft.'}
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
                  <div className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${isFixedShiftRule ? 'border-blue-400/30 bg-blue-500/10 text-blue-200' : 'border-red-400/30 bg-red-500/10 text-red-200'}`}>
                    {formatFixedShiftType(exclusion.fixed_shift_type, isGerman)}
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
