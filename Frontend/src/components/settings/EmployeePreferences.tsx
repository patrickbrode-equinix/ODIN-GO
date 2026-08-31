/* ================================================ */
/* Employee Preferences – Mitarbeiterwünsche        */
/* Full self-service preference management          */
/* ================================================ */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../../api/api';
import { EnterpriseCard } from '../layout/EnterpriseLayout';
import { getEligibleColleagues, type EligibleColleague } from '../../api/userPreferences';
import { useLanguage, getLanguageLocale } from '../../context/LanguageContext';
import { formatAbsoluteDateTime, formatRelativeTime } from '../../utils/loginStatus';
import { dedupeEmployeeNames } from '../../utils/employeeNames';
import { getHessenHolidayMap } from '../../utils/deHolidays';
import {
  Heart, Moon, Sun, CalendarDays, Users, Briefcase,
  HelpCircle, Save, CheckCircle2, AlertTriangle,
} from 'lucide-react';

const COPY = {
  de: {
    help: 'Hilfe',
    conflictResolved: 'Konflikt bereinigt: Wunschkollegen wurden aus der Ausschlussliste entfernt.',
    colleagueConflict: 'Konflikt in den Kollegenlisten',
    saved: 'Wünsche gespeichert',
    saveFailed: 'Fehler beim Speichern',
    alreadyPreferredSuffix: 'ist bereits als Wunschkollege ausgewählt.',
    preferredShifts: 'Bevorzugte Schichten',
    preferredShiftsHelp: 'Wähle die Schichten, die du bevorzugst. Die Planung versucht, dich diesen Schichten zuzuordnen. COLO gilt für Vorbereitung, Installation und Troubleshooting innerhalb des administrativ gepflegten Kompetenzpools.',
    unwantedShifts: 'Unerwünschte Schichten',
    unwantedShiftsHelp: 'Wähle die Schichten, die du vermeiden möchtest. Die Planung versucht, dich nicht diesen Schichten zuzuordnen. COLO schließt dich von automatisch geplanten Colo-Aufgaben aus.',
    monthlyTitle: 'Zeitlich begrenzte Schichtwünsche',
    monthlyHelp: 'Lege für einen bestimmten Monat eigene Wünsche fest. Diese Werte gelten nur in diesem Monat und ersetzen dort die Ganzjahresauswahl.',
    year: 'Jahr',
    month: 'Monat',
    wholeYearHint: 'Die bisherigen Schichtwünsche gelten als Ganzjahreswunsch.',
    holidays: 'Feiertage, an denen du nicht arbeiten möchtest',
    holidaysHelp: 'Wähle Feiertage aus, an denen du nicht eingeplant werden möchtest. Die Auswahl wird als persönlicher Wunsch berücksichtigt.',
    nightsLoad: 'Schichten, Wochenenden & Belastung',
    nightsLoadHelp: 'Nachtschichten zählen als vollständiger 7-Tage-Block. Früh- und Spätschichten sowie Wochenenden werden pro Monat gezählt.',
    maxNights: 'Nachtschicht-Blöcke pro Monat',
    maxWeekends: 'Wochenenddienste pro Monat',
    noLimit: 'Keine Begrenzung',
    workload: 'Belastungspräferenz',
    workloadLight: 'Reduziert',
    workloadNormal: 'Normal',
    workloadHeavy: 'Erhöht',
    workloadBody: 'Belastung beschreibt, wie stark du insgesamt verplant werden möchtest. Reduziert bevorzugt eine eher leichtere Planung, Normal steht für die übliche Verteilung und Erhöht signalisiert, dass du bei Bedarf auch stärker berücksichtigt werden kannst.',
    workloadHint: 'Diese Einstellung ist ein weicher Wunsch. Harte Regeln, gesetzliche Grenzen, faire Verteilung und Mindestbesetzung haben weiterhin Vorrang vor der Belastungspräferenz.',
    weekDays: 'Bevorzugte Wochentage',
    weekDaysHelp: 'Wähle die Wochentage, an denen du bevorzugt arbeiten möchtest. Nicht ausgewählte Tage gelten automatisch als nicht bevorzugt.',
    weekDayLegend: 'Ausgewählte Tage werden bevorzugt eingeplant.',
    notes: 'Anmerkungen',
    notesHelp: 'Zusätzliche Hinweise für die Planer, z.B. besondere Umstände, Teilzeit, oder andere Wünsche.',
    notesPlaceholder: 'Optionale Anmerkungen...',
    monthsWithPreferences: 'Monate mit Auswahl',
    noMonthSelections: 'Noch keine Monatsauswahl gespeichert.',
    saving: 'Wird gespeichert...',
    savePreferences: 'Wünsche speichern',
    rules: 'Meine Regeln', rulesHelp: 'Regeln gelten ausschließlich für deine eigene Planung und beeinflussen keine anderen Mitarbeiter.', addRule: 'Regel hinzufügen', removeRules: 'Eigene Regeln entfernen',
  },
  en: {
    help: 'Help',
    conflictResolved: 'Conflict resolved: preferred colleagues were removed from the exclusion list.',
    colleagueConflict: 'Conflict in colleague lists',
    saved: 'Preferences saved',
    saveFailed: 'Failed to save',
    alreadyPreferredSuffix: 'is already selected as a preferred colleague.',
    preferredShifts: 'Preferred shifts',
    preferredShiftsHelp: 'Choose the shifts you prefer. Planning will try to assign you to these shifts. COLO covers preparation, installation, and troubleshooting within the administrator-managed competence pool.',
    unwantedShifts: 'Unwanted shifts',
    unwantedShiftsHelp: 'Choose the shifts you want to avoid. Planning will try not to assign you to these shifts. COLO excludes you from automatically planned Colo duties.',
    monthlyTitle: 'Time-limited shift wishes',
    monthlyHelp: 'Set dedicated wishes for one month. These values apply only in that month and replace the whole-year selection there.',
    year: 'Year',
    month: 'Month',
    wholeYearHint: 'The existing shift wishes apply as a whole-year preference.',
    holidays: 'Holidays you do not want to work',
    holidaysHelp: 'Choose holidays on which you do not want to be scheduled. The selection is treated as a personal preference.',
    nightsLoad: 'Shifts, weekends & workload',
    nightsLoadHelp: 'Night shifts count as a complete 7-day block. Early/late shifts and weekend duties are counted per month.',
    maxNights: 'Night-shift blocks per month',
    maxWeekends: 'Weekend duties per month',
    noLimit: 'No limit',
    workload: 'Workload preference',
    workloadLight: 'Reduced',
    workloadNormal: 'Normal',
    workloadHeavy: 'Increased',
    workloadBody: 'Workload describes how heavily you want to be scheduled overall. Reduced prefers a lighter plan, Normal is the standard distribution, and Increased signals that you can be considered more strongly if needed.',
    workloadHint: 'This is a soft preference. Hard rules, legal limits, fair distribution, and minimum staffing still take priority over workload preference.',
    weekDays: 'Preferred weekdays',
    weekDaysHelp: 'Choose the weekdays on which you prefer to work. Days not selected are simply not preferred.',
    weekDayLegend: 'Selected days are preferred.',
    notes: 'Notes',
    notesHelp: 'Additional notes for planners, for example special circumstances, part-time status, or other wishes.',
    notesPlaceholder: 'Optional notes...',
    monthsWithPreferences: 'Months with selections',
    noMonthSelections: 'No monthly selections saved yet.',
    saving: 'Saving...',
    savePreferences: 'Save preferences',
    rules: 'My rules', rulesHelp: 'Rules apply only to your own plan and never change other employees.', addRule: 'Add rule', removeRules: 'Remove my rules',
  },
} as const;

function HelpTip({ text }: { text: string }) {
  const { language } = useLanguage();
  const copy = COPY[language as keyof typeof COPY] || COPY.en;
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-flex ml-1">
      <button type="button" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}
        className="text-muted-foreground hover:text-blue-400 transition" aria-label={copy.help}>
        <HelpCircle className="w-3.5 h-3.5" />
      </button>
      {show && (
        <div className="absolute left-6 top-0 z-50 w-56 p-2.5 text-xs leading-relaxed rounded-lg border border-blue-500/30 bg-[#0a0f1e]/95 text-muted-foreground shadow-xl">
          {text}
        </div>
      )}
    </span>
  );
}

interface Preferences {
  preferred_shifts: string[];
  unwanted_shifts: string[];
  monthly_preferences: Record<string, { preferred_shifts: string[]; unwanted_shifts: string[] }>;
  preferred_holidays: string[];
  max_nights_per_month: number | null;
  max_weekends_per_month: number | null;
  preferred_days: number[];
  blocked_days: number[];
  avoid_colleagues: string[];
  workload_preference: string;
  notes: string;
}

const SHIFT_CODES = ['E1', 'E2', 'L1', 'L2', 'N'];
const EMPLOYEE_PREFERENCE_EXCLUDED_CODES = new Set(['DBS', 'E1SA', 'E1WE', 'L1WE']);
const SHIFT_LABELS_DE: Record<string, string> = { E1: 'Frühschicht 1', E2: 'Frühschicht 2', L1: 'Spätschicht 1', L2: 'Spätschicht 2', N: 'Nachtschicht' };
const SHIFT_LABELS_EN: Record<string, string> = { E1: 'Early shift 1', E2: 'Early shift 2', L1: 'Late shift 1', L2: 'Late shift 2', N: 'Night shift' };
const DAY_LABELS_DE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const DAY_LABELS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const HOLIDAY_OPTIONS_DE = [
  { value: 'Neujahr', label: 'Neujahr', scope: 'Bundesweit' },
  { value: 'Karfreitag', label: 'Karfreitag', scope: 'Bundesweit' },
  { value: 'Ostermontag', label: 'Ostermontag', scope: 'Bundesweit' },
  { value: 'Tag der Arbeit', label: 'Tag der Arbeit', scope: 'Bundesweit' },
  { value: 'Christi Himmelfahrt', label: 'Christi Himmelfahrt', scope: 'Bundesweit' },
  { value: 'Pfingstmontag', label: 'Pfingstmontag', scope: 'Bundesweit' },
  { value: 'Tag der Deutschen Einheit', label: 'Tag der Deutschen Einheit', scope: 'Bundesweit' },
  { value: '1. Weihnachtstag', label: '1. Weihnachtstag', scope: 'Bundesweit' },
  { value: '2. Weihnachtstag', label: '2. Weihnachtstag', scope: 'Bundesweit' },
  { value: 'Fronleichnam', label: 'Fronleichnam', scope: 'Hessen' },
] as const;
const HOLIDAY_OPTIONS_EN = [
  { value: 'Neujahr', label: "New Year's Day", scope: 'Nationwide' },
  { value: 'Karfreitag', label: 'Good Friday', scope: 'Nationwide' },
  { value: 'Ostermontag', label: 'Easter Monday', scope: 'Nationwide' },
  { value: 'Tag der Arbeit', label: 'Labour Day', scope: 'Nationwide' },
  { value: 'Christi Himmelfahrt', label: 'Ascension Day', scope: 'Nationwide' },
  { value: 'Pfingstmontag', label: 'Whit Monday', scope: 'Nationwide' },
  { value: 'Tag der Deutschen Einheit', label: 'German Unity Day', scope: 'Nationwide' },
  { value: '1. Weihnachtstag', label: 'Christmas Day', scope: 'Nationwide' },
  { value: '2. Weihnachtstag', label: 'Boxing Day', scope: 'Nationwide' },
  { value: 'Fronleichnam', label: 'Corpus Christi', scope: 'Hesse' },
] as const;

const ISLAMIC_HOLIDAY_OPTIONS_DE = [
  { value: 'Eid al-Fitr', label: 'Eid al-Fitr (Zuckerfest)', scope: 'Islamisch', futureDates: ['10.03.2027', '27.02.2028', '15.02.2029', '05.02.2030', '25.01.2031'] },
  { value: 'Eid al-Adha', label: 'Eid al-Adha (Opferfest)', scope: 'Islamisch', futureDates: ['17.05.2027', '05.05.2028', '24.04.2029', '14.04.2030', '03.04.2031'] },
  { value: 'Islamisches Neujahr', label: 'Islamisches Neujahr', scope: 'Islamisch', futureDates: ['07.06.2027', '26.05.2028', '15.05.2029', '05.05.2030', '24.04.2031'] },
  { value: 'Aschura', label: 'Aschura', scope: 'Islamisch', futureDates: ['15.06.2027', '03.06.2028', '24.05.2029', '13.05.2030', '03.05.2031'] },
  { value: 'Mawlid', label: 'Mawlid (Geburtstag des Propheten)', scope: 'Islamisch', futureDates: ['14.08.2027', '03.08.2028', '24.07.2029', '14.07.2030', '03.07.2031'] },
] as const;
const ISLAMIC_HOLIDAY_OPTIONS_EN = ISLAMIC_HOLIDAY_OPTIONS_DE.map((holiday) => ({
  ...holiday,
  label: ({
    'Eid al-Fitr': 'Eid al-Fitr',
    'Eid al-Adha': 'Eid al-Adha',
    'Islamisches Neujahr': 'Islamic New Year',
    Aschura: 'Ashura',
    Mawlid: 'Mawlid',
  } as Record<string, string>)[holiday.value] || holiday.label,
}));

const HOLIDAY_DATE_NAMES: Record<string, string> = {
  Neujahr: 'Neujahr',
  Karfreitag: 'Karfreitag',
  Ostermontag: 'Ostermontag',
  'Tag der Arbeit': 'Tag der Arbeit',
  'Christi Himmelfahrt': 'Christi Himmelfahrt',
  Pfingstmontag: 'Pfingstmontag',
  'Tag der Deutschen Einheit': 'Tag der Deutschen Einheit',
  '1. Weihnachtstag': '1. Weihnachtstag',
  '2. Weihnachtstag': '2. Weihnachtstag',
  Fronleichnam: 'Fronleichnam',
};

const DEFAULTS: Preferences = {
  preferred_shifts: [], unwanted_shifts: [], preferred_holidays: [], max_nights_per_month: null,
  monthly_preferences: {},
  preferred_days: [], blocked_days: [], avoid_colleagues: [],
  max_weekends_per_month: null, workload_preference: 'normal', notes: '',
};

function normalizeNameList(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return dedupeEmployeeNames(values);
}

function isSameList(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function formatHolidayDates(value: string, locale: string): string {
  const holidayName = HOLIDAY_DATE_NAMES[value];
  if (!holidayName) return '';
  const year = new Date().getFullYear();
  return (() => {
    const entry = Object.entries(getHessenHolidayMap(year, 'de')).find(([, name]) => name === holidayName);
    if (!entry) return null;
    const date = new Date(`${entry[0]}T00:00:00`);
    return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });
  })() || '';
}

export default function EmployeePreferences() {
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = COPY[language as keyof typeof COPY] || COPY.en;
  const isGerman = language === 'de';
  const shiftLabels = isGerman ? SHIFT_LABELS_DE : SHIFT_LABELS_EN;
  const dayLabels = isGerman ? DAY_LABELS_DE : DAY_LABELS_EN;
  const holidayOptions = isGerman
    ? [...HOLIDAY_OPTIONS_DE, ...ISLAMIC_HOLIDAY_OPTIONS_DE]
    : [...HOLIDAY_OPTIONS_EN, ...ISLAMIC_HOLIDAY_OPTIONS_EN];
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const [colleagues, setColleagues] = useState<EligibleColleague[]>([]);
  const [preferredColleagues, setPreferredColleagues] = useState<string[]>([]);
  const [colleagueSearch, setColleagueSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preferenceYear, setPreferenceYear] = useState(new Date().getFullYear());
  const [preferenceMonth, setPreferenceMonth] = useState(new Date().getMonth() + 1);
  const [shiftOptions, setShiftOptions] = useState<string[]>(SHIFT_CODES);
  const [shiftNameMap, setShiftNameMap] = useState<Record<string, string>>({});

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prefRes, collRes, preferredRes, definitionsRes] = await Promise.all([
        api.get('/shift-config/employee-preferences'),
        getEligibleColleagues().catch(() => []),
        api.get('/user/preferred-colleagues').catch(() => ({ data: [] })),
        api.get('/shift-config/definitions').catch(() => ({ data: { definitions: [] } })),
      ]);
      const configuredCodes = (definitionsRes.data?.definitions || [])
        .filter((definition: any) => definition?.is_active !== false && !String(definition?.code || '').startsWith('H') && !EMPLOYEE_PREFERENCE_EXCLUDED_CODES.has(String(definition?.code || '').trim().toUpperCase()))
        .map((definition: any) => String(definition.code || '').trim().toUpperCase())
        .filter(Boolean);
      setShiftOptions(Array.from(new Set([...SHIFT_CODES, ...configuredCodes])).filter((code) => !EMPLOYEE_PREFERENCE_EXCLUDED_CODES.has(code)));
      const configuredNames: Record<string, string> = {};
      (definitionsRes.data?.definitions || []).forEach((definition: any) => {
        const code = String(definition?.code || '').trim().toUpperCase();
        if (EMPLOYEE_PREFERENCE_EXCLUDED_CODES.has(code)) return;
        const name = String(definition?.name || '').trim();
        if (code && name) configuredNames[code] = name;
      });
      setShiftNameMap(configuredNames);
      if (prefRes.data.preferences) {
        const stored = prefRes.data.preferences;
        const allowed = (value: unknown) => (Array.isArray(value) ? value.filter((code) => {
          const normalized = String(code).toUpperCase();
          return normalized !== 'COLO' && !EMPLOYEE_PREFERENCE_EXCLUDED_CODES.has(normalized);
        }) : []);
        const monthly = Object.fromEntries(Object.entries(stored.monthly_preferences || {}).map(([key, value]: [string, any]) => [key, { ...value, preferred_shifts: allowed(value?.preferred_shifts), unwanted_shifts: allowed(value?.unwanted_shifts) }]));
        setPrefs({
          preferred_shifts: allowed(stored.preferred_shifts), unwanted_shifts: allowed(stored.unwanted_shifts), monthly_preferences: monthly,
          preferred_holidays: stored.preferred_holidays || [], max_nights_per_month: stored.max_nights_per_month, max_weekends_per_month: stored.max_weekends_per_month ?? null, preferred_days: stored.preferred_days || [], blocked_days: stored.blocked_days || [], avoid_colleagues: normalizeNameList(stored.avoid_colleagues || []), workload_preference: stored.workload_preference || 'normal', notes: stored.notes || '',
        });
      } else {
        setPrefs(DEFAULTS);
      }
      const normalizedPreferred = normalizeNameList(preferredRes.data);
      setPreferredColleagues(normalizedPreferred);
      setColleagues(collRes);
    } catch (e: any) {
      showToast(e?.response?.data?.error || e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filteredColleagues = useMemo(() => {
    const query = colleagueSearch.trim().toLowerCase();
    if (!query) return colleagues;
    return colleagues.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [colleagues, colleagueSearch]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/shift-config/employee-preferences', { ...prefs, avoid_colleagues: [] });
      showToast(copy.saved);
      setDirty(false);
    } catch (e: any) {
      showToast(e?.response?.data?.error || copy.saveFailed, 'err');
    } finally {
      setSaving(false);
    }
  };

  const update = (field: keyof Preferences, value: any) => {
    setPrefs(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const toggleInArray = (field: 'preferred_shifts' | 'unwanted_shifts' | 'preferred_holidays' | 'preferred_days' | 'blocked_days' | 'avoid_colleagues', value: any) => {
    setPrefs(prev => {
      const arr = (prev[field] as any[]) || [];
      const next = arr.includes(value) ? arr.filter((v: any) => v !== value) : [...arr, value];
      return { ...prev, [field]: next };
    });
    setDirty(true);
  };

  const selectedMonthKey = `${preferenceYear}-${String(preferenceMonth).padStart(2, '0')}`;
  const selectedMonthPreferences = prefs.monthly_preferences[selectedMonthKey] || { preferred_shifts: [], unwanted_shifts: [] };
  const monthsWithPreferences = Object.entries(prefs.monthly_preferences)
    .filter(([, value]) => value.preferred_shifts.length > 0 || value.unwanted_shifts.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  const toggleMonthlyShift = (field: 'preferred_shifts' | 'unwanted_shifts', code: string) => {
    setPrefs((current) => {
      const existing = current.monthly_preferences[selectedMonthKey] || { preferred_shifts: [], unwanted_shifts: [] };
      const nextValues = existing[field].includes(code)
        ? existing[field].filter((value) => value !== code)
        : [...existing[field], code];
      return {
        ...current,
        monthly_preferences: {
          ...current.monthly_preferences,
          [selectedMonthKey]: { ...existing, [field]: nextValues },
        },
      };
    });
    setDirty(true);
  };

  if (loading) return <div className="flex items-center justify-center h-32"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>;

  return (
    <div className="space-y-4">
      {toast && (
        <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toast.type === 'ok' ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-red-500/30 bg-red-500/10 text-red-400'}`}>
          {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Preferred Shifts */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <Sun className="w-4 h-4 text-amber-400" />
          {copy.preferredShifts}
          <HelpTip text={copy.preferredShiftsHelp} />
        </h3>
        <div className="flex flex-wrap gap-2">
          {shiftOptions.map(code => (
            <button key={code} onClick={() => toggleInArray('preferred_shifts', code)}
              className={`px-3 py-1.5 text-xs rounded-full border transition font-medium ${
                prefs.preferred_shifts.includes(code)
                  ? 'border-green-500/50 bg-green-500/15 text-green-400'
                  : 'border-border/30 bg-background/40 text-muted-foreground hover:border-green-500/30'
              }`}>
              {code} – {shiftNameMap[code] || shiftLabels[code] || code}
            </button>
          ))}
        </div>
      </EnterpriseCard>

      {/* Unwanted Shifts */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <Moon className="w-4 h-4 text-purple-400" />
          {copy.unwantedShifts}
          <HelpTip text={copy.unwantedShiftsHelp} />
        </h3>
        <div className="flex flex-wrap gap-2">
          {shiftOptions.map(code => (
            <button key={code} onClick={() => toggleInArray('unwanted_shifts', code)}
              className={`px-3 py-1.5 text-xs rounded-full border transition font-medium ${
                prefs.unwanted_shifts.includes(code)
                  ? 'border-red-500/50 bg-red-500/15 text-red-400'
                  : 'border-border/30 bg-background/40 text-muted-foreground hover:border-red-500/30'
              }`}>
              {code} – {shiftNameMap[code] || shiftLabels[code] || code}
            </button>
          ))}
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-1">
          <CalendarDays className="w-4 h-4 text-sky-400" />
          {copy.monthlyTitle}
          <HelpTip text={copy.monthlyHelp} />
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">{copy.wholeYearHint}</p>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_190px] sm:items-end">
          <label className="text-xs text-muted-foreground">
            {copy.year}
            <input type="number" min={2020} max={2100} value={preferenceYear} onChange={(event) => { setPreferenceYear(Number(event.target.value) || new Date().getFullYear()); setDirty(true); }} className="mt-1 w-full rounded-lg border border-border bg-background/85 px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none" />
          </label>
          <label className="text-xs text-muted-foreground">
            {copy.month}
            <select value={preferenceMonth} onChange={(event) => { setPreferenceMonth(Number(event.target.value)); setDirty(true); }} className="mt-1 w-full rounded-lg border border-border bg-background/85 px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>{new Date(preferenceYear, month - 1, 1).toLocaleDateString(locale, { month: 'long' })}</option>)}
            </select>
          </label>
          <div className="min-w-0">
            <div className="mb-1 text-xs text-muted-foreground">{copy.monthsWithPreferences}</div>
            <div className="max-h-20 overflow-y-auto rounded-lg border border-border/40 bg-background/40 p-1.5 pr-1 scrollbar-thin scrollbar-thumb-slate-500/60">
              {monthsWithPreferences.length === 0 ? (
                <div className="px-2 py-1 text-[11px] text-muted-foreground">{copy.noMonthSelections}</div>
              ) : monthsWithPreferences.map(([key]) => {
                const [year, month] = key.split('-').map(Number);
                const active = key === selectedMonthKey;
                return (
                  <button key={key} type="button" onClick={() => { setPreferenceYear(year); setPreferenceMonth(month); }}
                    className={`mb-1 block w-full rounded-md px-2 py-1 text-left text-[11px] transition last:mb-0 ${active ? 'bg-sky-500/20 text-sky-200' : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'}`}>
                    {new Date(year, month - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' })}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{copy.preferredShifts}</div>
            <div className="flex flex-wrap gap-2">
              {shiftOptions.map((code) => <button key={`monthly-preferred-${code}`} type="button" onClick={() => toggleMonthlyShift('preferred_shifts', code)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selectedMonthPreferences.preferred_shifts.includes(code) ? 'border-green-500/50 bg-green-500/15 text-green-400' : 'border-border/30 bg-background/40 text-muted-foreground hover:border-green-500/30'}`}>{code} – {shiftLabels[code] || code}</button>)}
            </div>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{copy.unwantedShifts}</div>
            <div className="flex flex-wrap gap-2">
              {shiftOptions.map((code) => <button key={`monthly-unwanted-${code}`} type="button" onClick={() => toggleMonthlyShift('unwanted_shifts', code)} className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${selectedMonthPreferences.unwanted_shifts.includes(code) ? 'border-red-500/50 bg-red-500/15 text-red-400' : 'border-border/30 bg-background/40 text-muted-foreground hover:border-red-500/30'}`}>{code} – {shiftLabels[code] || code}</button>)}
            </div>
          </div>
        </div>
      </EnterpriseCard>

      {/* Holiday Preferences */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-emerald-400" />
          {copy.holidays}
          <HelpTip text={copy.holidaysHelp} />
        </h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {holidayOptions.map((holiday) => {
            const checked = prefs.preferred_holidays.includes(holiday.value);
            return (
              <label key={holiday.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 transition ${checked ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-border/30 bg-background/40 hover:border-emerald-500/25'}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleInArray('preferred_holidays', holiday.value)}
                  className="mt-0.5 h-4 w-4 rounded border-border/40 bg-background/80 text-emerald-500"
                />
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${checked ? 'text-emerald-300' : 'text-foreground'}`}>{holiday.label}</div>
                  <div className="relative text-[11px] text-muted-foreground">
                    {holiday.scope}{'futureDates' in holiday ? '' : (formatHolidayDates(holiday.value, locale) ? ` · ${formatHolidayDates(holiday.value, locale)}` : '')}
                    {'futureDates' in holiday && (
                      <span className="ml-1 cursor-help underline decoration-dotted underline-offset-2" title={holiday.futureDates.map((date, index) => `${new Date().getFullYear() + 1 + index}: ${date}`).join(' · ')}>
                        (voraussichtlich 2027–2031)
                      </span>
                    )}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </EnterpriseCard>

      {/* Max Nights + Workload */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <Moon className="w-4 h-4 text-indigo-400" />
          {copy.nightsLoad}
          <HelpTip text={copy.nightsLoadHelp} />
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs text-muted-foreground">{copy.maxNights}</label>
            <input type="number" value={prefs.max_nights_per_month ?? ''} onChange={e => update('max_nights_per_month', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground" min="0" max="31" placeholder={copy.noLimit} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.maxWeekends}</label>
            <input type="number" value={prefs.max_weekends_per_month ?? ''} onChange={e => update('max_weekends_per_month', e.target.value ? parseInt(e.target.value) : null)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground" min="0" max="8" placeholder={copy.noLimit} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">{copy.workload}</label>
            <select value={prefs.workload_preference} onChange={e => update('workload_preference', e.target.value)}
              className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
              <option value="light">{copy.workloadLight}</option>
              <option value="normal">{copy.workloadNormal}</option>
              <option value="heavy">{copy.workloadHeavy}</option>
            </select>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {copy.workloadBody}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          {copy.workloadHint}
        </div>
      </EnterpriseCard>

      {/* Preferred Days */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <CalendarDays className="w-4 h-4 text-blue-400" />
          {copy.weekDays}
          <HelpTip text={copy.weekDaysHelp} />
        </h3>
        <div className="grid grid-cols-7 gap-2">
          {dayLabels.map((label, idx) => {
            const isPref = prefs.preferred_days.includes(idx);
            return (
              <div key={idx} className="text-center">
                <span className="text-[10px] text-muted-foreground">{label.slice(0, 2)}</span>
                <div className="mt-1">
                  <button onClick={() => toggleInArray('preferred_days', idx)}
                    className={`px-2 py-1 text-[10px] rounded border transition ${isPref ? 'border-green-500/50 bg-green-500/15 text-green-400' : 'border-border/30 bg-background/40 text-muted-foreground'}`}>
                    ✓
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">{copy.weekDayLegend}</p>
      </EnterpriseCard>

      {/* Notes */}
      <EnterpriseCard>
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
          <Briefcase className="w-4 h-4 text-gray-400" />
          {copy.notes}
          <HelpTip text={copy.notesHelp} />
        </h3>
        <textarea value={prefs.notes} onChange={e => update('notes', e.target.value)}
          className="w-full min-h-20 rounded-lg border border-border/30 bg-background/40 px-3 py-2 text-sm text-foreground"
          placeholder={copy.notesPlaceholder} />
      </EnterpriseCard>

      {/* Save */}
      <div className="flex justify-end">
        <button onClick={handleSave} disabled={saving || !dirty}
          className="flex items-center gap-1.5 text-sm px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 font-medium">
          <Save className="w-4 h-4" />
          {saving ? copy.saving : copy.savePreferences}
        </button>
      </div>
    </div>
  );
}
