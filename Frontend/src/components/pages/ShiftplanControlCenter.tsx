/* ================================================ */
/* Shiftplan Control Center – Schichtplaner          */
/* Draft generation, review, activation             */
/* ================================================ */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { api } from '../../api/api';
import { EnterprisePageShell, EnterpriseFeatureHero, EnterpriseHeader, EnterpriseCard } from '../layout/EnterpriseLayout';
import { Input } from '../ui/input';
import { useLanguage, getLanguageLocale } from '../../context/LanguageContext';
import { ShiftplanTable } from '../shiftplan/ShiftplanTable';
import type { EmployeeMonthlyStats } from '../shiftplan/shiftplan.hours';
import type { Absence } from '../../api/absences';
import {
  CalendarClock, Play, Download, Check, X, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Clock, FileSpreadsheet, Eye, Trash2,
  ArrowRight, Users, Calendar, CalendarRange, ShieldAlert, BarChart3, List, Info, HelpCircle
} from 'lucide-react';

/* ------------------------------------------------ */
/* TYPES                                            */
/* ------------------------------------------------ */

interface Draft {
  id: number;
  month: string;
  version: number;
  status: string;
  shifts_json: any[];
  explanations: Record<string, any>;
  conflicts: any[];
  fairness: Record<string, any>;
  config_snapshot: any;
  title: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  activated_by: string | null;
  activated_at: string | null;
  wish_status?: Array<{ employee_name: string; submitted: boolean; updated_at: string | null }>;
  wish_summary?: { submitted: number; missing: number };
  absences?: Absence[];
  manual_employees?: ManualShiftplanEmployee[];
}

interface ManualShiftplanEmployee {
  employee_name: string;
  created_at?: string | null;
  created_by?: string | null;
}

interface ManualEmployeeMonthSummary {
  month: string;
  count: number;
  employee_names: string[];
}

interface DraftSummary {
  id: number;
  month: string;
  version: number;
  status: string;
  title: string | null;
  note: string | null;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  activated_by: string | null;
  activated_at: string | null;
}

/* ------------------------------------------------ */
/* CONSTANTS                                        */
/* ------------------------------------------------ */

function getStatusLabels(t: (key: any) => string): Record<string, { label: string; color: string; bg: string }> {
  return {
    draft: { label: t('sc.statusDraft'), color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
    in_review: { label: t('sc.statusInReview'), color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
    approved: { label: t('sc.statusApproved'), color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
    activated: { label: t('sc.statusActivated'), color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
    failed: { label: t('sc.statusFailed'), color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
  };
}

type TabKey = 'overview' | 'draft' | 'conflicts' | 'explanations' | 'fairness' | 'history' | 'basis' | 'help';

/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

function formatDT(iso: string | null, locale: string) {
  if (!iso) return '–';
  return new Date(iso).toLocaleString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function isWeekend(year: number, month: number, day: number) {
  const d = new Date(year, month - 1, day);
  return d.getDay() === 0 || d.getDay() === 6;
}

function monthLabel(month: string, locale: string) {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
}

function getSeverityLabel(severity: string, t: (key: any) => string) {
  switch (severity) {
    case 'critical':
      return t('sc.severityCritical');
    case 'relevant':
      return t('sc.severityRelevant');
    case 'hint':
      return t('sc.severityHint');
    default:
      return severity;
  }
}

/* ------------------------------------------------ */
/* COMPONENT                                        */
/* ------------------------------------------------ */

export default function ShiftplanControlCenter() {
  const { language, t } = useLanguage();
  const locale = getLanguageLocale(language);
  const isGerman = language === 'de';
  const statusLabels = getStatusLabels(t);
  const [tab, setTab] = useState<TabKey>('overview');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`;
  });
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingYear, setGeneratingYear] = useState(false);
  const [planningMode, setPlanningMode] = useState<'week' | 'month' | 'year'>('month');
  const [selectedWeekStart, setSelectedWeekStart] = useState(() => {
    const date = new Date();
    const daysUntilMonday = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + daysUntilMonday);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [weekResult, setWeekResult] = useState<{ weekStart: string; generated: any[] } | null>(null);
  const [selectedPlanningYear, setSelectedPlanningYear] = useState(2027);
  const [yearResult, setYearResult] = useState<{ year: number; generated: any[]; errors: any[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [planningBasis, setPlanningBasis] = useState<any>(null);
  const [basisLoading, setBasisLoading] = useState(false);
  const [manualEmployees, setManualEmployees] = useState<ManualShiftplanEmployee[]>([]);
  const [manualEmployeeSummaryByMonth, setManualEmployeeSummaryByMonth] = useState<Record<string, ManualEmployeeMonthSummary>>({});
  const [manualEmployeeDraft, setManualEmployeeDraft] = useState('');
  const [manualEmployeesSaving, setManualEmployeesSaving] = useState(false);
  const [showManualEmployeesOnly, setShowManualEmployeesOnly] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftNote, setDraftNote] = useState('');
  const [draftMetadataSaving, setDraftMetadataSaving] = useState(false);

  // Year derived from selected month
  const selectedMonthYear = parseInt(selectedMonth.split('-')[0]);

  // Generate month options (full year: current month -2 to +13 → ~15 months)
  const monthOptions = (() => {
    const opts: string[] = [];
    const now = new Date();
    for (let i = -2; i <= 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      opts.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return opts;
  })();

  // Full-year planning intentionally starts in 2027 because 2026 is already underway.
  const yearOptions = (() => {
    const now = new Date();
    const years: number[] = [];
    const lastYear = Math.max(2032, now.getFullYear() + 6);
    for (let y = 2027; y <= lastYear; y++) {
      years.push(y);
    }
    return years;
  })();

  const loadDrafts = useCallback(async () => {
    try {
      const res = await api.get(`/shiftplan-control/drafts?month=${selectedMonth}`);
      setDrafts(res.data.drafts || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  }, [selectedMonth]);

  const loadDraft = useCallback(async (id: number) => {
    setLoading(true);
    try {
      const res = await api.get(`/shiftplan-control/drafts/${id}`);
      setActiveDraft(res.data.draft);
      setDraftTitle(res.data.draft?.title || '');
      setDraftNote(res.data.draft?.note || '');
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const openYearMonth = useCallback(async (entry: any) => {
    setSelectedMonth(entry.month);
    await loadDraft(entry.draftId);
    setTab('draft');
  }, [loadDraft]);

  const loadBasis = useCallback(async () => {
    setBasisLoading(true);
    try {
      const res = await api.get(`/shiftplan-control/planning-basis?month=${selectedMonth}`);
      setPlanningBasis(res.data.basis);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setBasisLoading(false);
    }
  }, [selectedMonth]);

  const loadManualEmployees = useCallback(async () => {
    try {
      const res = await api.get(`/shiftplan-control/manual-employees?month=${selectedMonth}`);
      setManualEmployees(Array.isArray(res.data?.employees) ? res.data.employees : []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  }, [selectedMonth]);

  const loadManualEmployeeSummary = useCallback(async () => {
    try {
      const res = await api.get(`/shiftplan-control/manual-employees/summary?year=${selectedMonthYear}`);
      const months = Array.isArray(res.data?.months) ? res.data.months : [];
      setManualEmployeeSummaryByMonth(
        Object.fromEntries(
          months
            .filter((entry: any) => typeof entry?.month === 'string')
            .map((entry: any) => [entry.month, entry as ManualEmployeeMonthSummary])
        )
      );
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  }, [selectedMonthYear]);

  useEffect(() => { loadDrafts(); }, [loadDrafts]);
  useEffect(() => {
    setManualEmployeeDraft('');
    setPlanningBasis(null);
    loadManualEmployees();
  }, [loadManualEmployees, selectedMonth]);
  useEffect(() => {
    loadManualEmployeeSummary();
  }, [loadManualEmployeeSummary]);
  useEffect(() => {
    if (planningMode !== 'year') return;
    api.get(`/shiftplan-control/drafts/year/${selectedPlanningYear}`)
      .then((res) => setYearResult(res.data))
      .catch((e: any) => setError(e?.response?.data?.error || e.message));
  }, [planningMode, selectedPlanningYear]);

  const selectedMonthManualSummary = manualEmployeeSummaryByMonth[selectedMonth] || null;
  const manualSummaryMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, index) => {
      const month = `${selectedMonthYear}-${String(index + 1).padStart(2, '0')}`;
      return manualEmployeeSummaryByMonth[month] || { month, count: 0, employee_names: [] };
    });
  }, [manualEmployeeSummaryByMonth, selectedMonthYear]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await api.post('/shiftplan-control/drafts/generate', { month: selectedMonth });
      await loadDrafts();
      if (res.data.draft?.id) await loadDraft(res.data.draft.id);
      setTab('draft');
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleGenerateYear = async () => {
    if (!confirm(isGerman ? `Schichtpläne für alle 12 Monate des Jahres ${selectedPlanningYear} generieren? Dies erstellt für jeden Monat einen neuen Draft.` : `Generate shift plans for all 12 months of ${selectedPlanningYear}? This creates a new draft for each month.`)) return;
    setGeneratingYear(true);
    setError(null);
    setYearResult(null);
    try {
      const res = await api.post('/shiftplan-control/drafts/generate-year', { year: selectedPlanningYear });
      setYearResult(res.data);
      const firstMonth = res.data.generated?.[0];
      if (firstMonth) await openYearMonth(firstMonth);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setGeneratingYear(false);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await api.patch(`/shiftplan-control/drafts/${id}/status`, { status });
      await loadDrafts();
      if (activeDraft?.id === id) await loadDraft(id);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const handleGenerateWeek = async () => {
    setGenerating(true);
    setError(null);
    setWeekResult(null);
    try {
      const res = await api.post('/shiftplan-control/drafts/generate-week', { weekStart: selectedWeekStart });
      setWeekResult(res.data);
      const firstPart = res.data.generated?.[0];
      if (firstPart) await openYearMonth(firstPart);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveDraftMetadata = async () => {
    if (!activeDraft) return;
    setDraftMetadataSaving(true);
    setError(null);
    try {
      const res = await api.patch(`/shiftplan-control/drafts/${activeDraft.id}/metadata`, {
        title: draftTitle,
        note: draftNote,
      });
      setActiveDraft(res.data.draft);
      await loadDrafts();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setDraftMetadataSaving(false);
    }
  };

  const handleDraftCellChange = async (employeeName: string, day: number, shiftCode: string) => {
    if (!activeDraft) return;
    try {
      const res = await api.patch(`/shiftplan-control/drafts/${activeDraft.id}/shifts`, {
        employeeName,
        day,
        shiftCode,
      });
      setActiveDraft(res.data.draft);
      await loadDrafts();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
      throw e;
    }
  };

  const handleActivate = async () => {
    if (!activeDraft) return;
    try {
      await api.post(`/shiftplan-control/drafts/${activeDraft.id}/activate`);
      setConfirmActivate(false);
      await loadDrafts();
      await loadDraft(activeDraft.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const handleCreateManualEmployee = async () => {
    const employeeName = manualEmployeeDraft.trim().replace(/\s+/g, ' ');
    if (!employeeName || manualEmployeesSaving) return;

    try {
      setManualEmployeesSaving(true);
      const res = await api.post('/shiftplan-control/manual-employees', { month: selectedMonth, employeeName });
      const createdEmployee = res.data?.employee || { employee_name: employeeName };
      setManualEmployees((prev) => {
        const next = [...prev.filter((entry) => entry.employee_name !== createdEmployee.employee_name), createdEmployee];
        return next.sort((left, right) => String(left.employee_name || '').localeCompare(String(right.employee_name || ''), 'de'));
      });
      setManualEmployeeDraft('');
      loadManualEmployeeSummary();
      if (planningBasis) loadBasis();
      if (activeDraft?.month === selectedMonth) loadDraft(activeDraft.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setManualEmployeesSaving(false);
    }
  };

  const handleDeleteManualEmployee = async (employeeName: string) => {
    if (manualEmployeesSaving) return;
    if (!confirm(isGerman ? `Manuellen Mitarbeiter "${employeeName}" löschen?` : `Delete manual employee "${employeeName}"?`)) return;

    try {
      setManualEmployeesSaving(true);
      await api.delete(`/shiftplan-control/manual-employees?month=${encodeURIComponent(selectedMonth)}&employeeName=${encodeURIComponent(employeeName)}`);
      setManualEmployees((prev) => prev.filter((entry) => entry.employee_name !== employeeName));
      loadManualEmployeeSummary();
      if (planningBasis) loadBasis();
      if (activeDraft?.month === selectedMonth) loadDraft(activeDraft.id);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setManualEmployeesSaving(false);
    }
  };

  const handleExport = async (id: number) => {
    try {
      const res = await api.get(`/shiftplan-control/drafts/${id}/excel`, { responseType: 'blob' });
      const blob = res.data;
      const cd = String(res.headers?.['content-disposition'] || '');
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `Dienstplan_Draft_${id}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || t('sc.exportFailed'));
    }
  };

  const handleYearExport = async (year: number) => {
    try {
      const res = await api.get(`/shiftplan-control/drafts/year-excel/${year}`, { responseType: 'blob' });
      const cd = String(res.headers?.['content-disposition'] || '');
      const match = cd.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `Jahresschichtplan_${year}.xlsx`;
      const url = URL.createObjectURL(res.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || t('sc.exportFailed'));
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t('sc.confirmDeleteDraft'))) return;
    try {
      await api.delete(`/shiftplan-control/drafts/${id}`);
      if (activeDraft?.id === id) setActiveDraft(null);
      await loadDrafts();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const tabs: { key: TabKey; label: string; icon: any }[] = [
    { key: 'overview', label: t('sc.tabOverview'), icon: CalendarClock },
    { key: 'draft', label: t('sc.tabDraftView'), icon: Eye },
    { key: 'conflicts', label: t('sc.tabConflictCenter'), icon: AlertTriangle },
    { key: 'explanations', label: t('sc.tabExplanations'), icon: Info },
    { key: 'fairness', label: 'Fairness', icon: BarChart3 },
    { key: 'basis', label: t('sc.tabPlanningBasis'), icon: List },
    { key: 'history', label: t('sc.tabVersions'), icon: Clock },
    { key: 'help', label: t('sc.tabHelp'), icon: HelpCircle },
  ];

  return (
    <EnterprisePageShell style={{ maxWidth: 'none' }}>
      {/* Header */}
      <EnterpriseHeader
        icon={<CalendarClock className="w-6 h-6 text-blue-400" />}
        title={t('sc.title')}
        subtitle={t('sc.subtitle')}
        rightContent={
          <div className="flex items-center gap-3">
            <select
              value={planningMode}
              onChange={(event) => setPlanningMode(event.target.value as 'week' | 'month' | 'year')}
              className="px-3 py-2 text-sm rounded-lg border border-indigo-500/30 bg-background/80 text-foreground focus:outline-none focus:border-indigo-500/50"
              aria-label={isGerman ? 'Planungszeitraum' : 'Planning period'}
            >
              <option value="week">{isGerman ? 'Wöchentlich' : 'Weekly'}</option>
              <option value="month">{isGerman ? 'Monatlich' : 'Monthly'}</option>
              <option value="year">{isGerman ? 'Jährlich' : 'Yearly'}</option>
            </select>

            <input
              type="date"
              value={selectedWeekStart}
              onChange={(event) => setSelectedWeekStart(event.target.value)}
              className={`${planningMode === 'week' ? '' : 'hidden'} px-3 py-2 text-sm rounded-lg border border-cyan-500/30 bg-background/80 text-foreground focus:outline-none focus:border-cyan-500/50`}
              aria-label={isGerman ? 'Montag der Planungswoche' : 'Monday of planning week'}
            />

            {/* Month Selector */}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className={`${planningMode === 'month' ? '' : 'hidden'} px-3 py-2 text-sm rounded-lg border border-blue-500/30 bg-background/80 text-foreground focus:outline-none focus:border-blue-500/50`}
            >
              {monthOptions.map(m => (
                <option key={m} value={m}>{monthLabel(m, locale)}</option>
              ))}
            </select>

            <select
              value={selectedPlanningYear}
              onChange={(event) => setSelectedPlanningYear(Number.parseInt(event.target.value, 10))}
              className={`${planningMode === 'year' ? '' : 'hidden'} px-3 py-2 text-sm rounded-lg border border-emerald-500/30 bg-background/80 text-foreground focus:outline-none focus:border-emerald-500/50`}
            >
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>

            {/* Generate Month Button */}
            <button
              onClick={handleGenerate}
              disabled={planningMode !== 'month' || generating || generatingYear}
              className={`${planningMode === 'month' ? '' : 'hidden'} flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 font-medium`}
            >
              <Play className="w-3.5 h-3.5" />
              {generating ? t('sc.generating') : t('sc.generateDraft')}
            </button>

            {/* Separator */}
            <div className="w-px h-8 bg-border/40" />

            {/* Generate Full Year Button */}
            <button
              onClick={handleGenerateYear}
              disabled={planningMode !== 'year' || generating || generatingYear}
              className={`${planningMode === 'year' ? '' : 'hidden'} flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50 font-medium`}
              title={isGerman ? `Schichtpläne für alle 12 Monate von ${selectedPlanningYear} generieren` : `Generate shift plans for all 12 months of ${selectedPlanningYear}`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {generatingYear ? (isGerman ? `${selectedPlanningYear} wird generiert...` : `${selectedPlanningYear} is being generated...`) : (isGerman ? `Jahresplanung ${selectedPlanningYear}` : `Full year ${selectedPlanningYear}`)}
            </button>

            <button
              onClick={handleGenerateWeek}
              disabled={planningMode !== 'week' || generating || generatingYear}
              className={`${planningMode === 'week' ? '' : 'hidden'} flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white transition disabled:opacity-50 font-medium`}
            >
              <Calendar className="w-3.5 h-3.5" />
              {generating ? (isGerman ? 'Woche wird generiert...' : 'Generating week...') : (isGerman ? 'Wochenplan erstellen' : 'Generate week')}
            </button>
          </div>
        }
      />

      <EnterpriseFeatureHero
        tone="indigo"
        eyebrow={t('sc.subtitle')}
        title={planningMode === 'week'
          ? `${isGerman ? 'Wochenplanung ab' : 'Week starting'} ${selectedWeekStart}`
          : planningMode === 'month' ? monthLabel(selectedMonth, locale) : `${isGerman ? 'Jahresplanung' : 'Year plan'} ${selectedPlanningYear}`}
        description={planningMode === 'week'
          ? (isGerman ? 'Erstellt einen Wochen-Draft mit anteiligem Stundenziel und vollständiger Besetzungsprüfung.' : 'Creates a weekly draft with a prorated hours target and full staffing validation.')
          : planningMode === 'month'
          ? (isGerman ? 'Erstellt einen Monats-Draft mit vollständiger Stunden- und Serienprüfung.' : 'Creates one monthly draft with complete hours and series validation.')
          : (isGerman ? 'Erstellt alle zwölf Monats-Drafts. Jahresplanungen sind ab 2027 verfügbar.' : 'Creates all twelve monthly drafts. Full-year planning is available from 2027 onward.')}
        metrics={[
          { label: isGerman ? 'Zeitraum' : 'Period', value: planningMode === 'week' ? selectedWeekStart : planningMode === 'month' ? monthLabel(selectedMonth, locale) : selectedPlanningYear },
          { label: isGerman ? 'Modus' : 'Mode', value: planningMode === 'week' ? (isGerman ? 'Wöchentlich' : 'Weekly') : planningMode === 'month' ? (isGerman ? 'Monatlich' : 'Monthly') : (isGerman ? 'Jährlich' : 'Yearly') },
          { label: 'Status', value: generatingYear || generating ? (isGerman ? 'Wird erstellt' : 'Generating') : (isGerman ? 'Bereit' : 'Ready') },
        ]}
      />

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-xs underline hover:text-red-300">{isGerman ? 'Schließen' : 'Close'}</button>
        </div>
      )}

      {/* Week Generation Result */}
      {weekResult && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
          <div className="font-bold">
            {isGerman
              ? `Wochenplanung ab ${weekResult.weekStart} erstellt`
              : `Week starting ${weekResult.weekStart} generated`}
          </div>
          <div className="mt-1 text-xs text-cyan-200/80">
            {weekResult.generated
              .map((part) => `${monthLabel(part.month, locale)}: ${part.shifts} Dienste, ${part.conflicts} Warnungen`)
              .join(' · ')}
          </div>
        </div>
      )}

      {/* Year Generation Result */}
      {yearResult && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-bold text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              {isGerman ? `Jahresplanung ${yearResult.year}: ${yearResult.generated.length}/12 Monate generiert` : `Year plan ${yearResult.year}: ${yearResult.generated.length}/12 months generated`}
            </h4>
            <button onClick={() => setYearResult(null)} className="text-xs text-muted-foreground underline hover:text-foreground">{isGerman ? 'Schließen' : 'Close'}</button>
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { window.location.href = `/drafts?view=year&year=${yearResult.year}`; }}
              className="flex items-center gap-1.5 rounded-md border border-blue-400/30 bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-200 transition hover:bg-blue-500/20"
            >
              <CalendarRange className="h-4 w-4" />
              {isGerman ? 'Vollständige Jahresansicht öffnen' : 'Open full year view'}
            </button>
            <button
              type="button"
              onClick={() => handleYearExport(yearResult.year)}
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-300 transition hover:bg-emerald-500/20"
            >
              <FileSpreadsheet className="h-4 w-4" />
              {isGerman ? `Jahresplan ${yearResult.year} als Excel exportieren` : `Export year plan ${yearResult.year} to Excel`}
            </button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
            {yearResult.generated.map((g: any) => (
              <button type="button" onClick={() => openYearMonth(g)} key={g.month} className={`text-left text-xs rounded-md border px-2 py-1 transition hover:bg-emerald-500/15 ${activeDraft?.id === g.draftId ? 'border-emerald-300 bg-emerald-500/20 ring-1 ring-emerald-300/30' : 'border-emerald-500/20 bg-emerald-500/5'}`}>
                <span className="font-medium text-foreground">{monthLabel(g.month, locale)}</span>
                <span className="text-muted-foreground ml-1">v{g.version}</span>
                {typeof g.shifts === 'number' && <span className="text-emerald-400 ml-1">{g.shifts} {t('sc.shifts')}</span>}
                {g.conflicts > 0 && <span className="text-amber-400 ml-1">{g.conflicts} {t('sc.conflicts')}</span>}
                {(manualEmployeeSummaryByMonth[g.month]?.count || 0) > 0 && (
                  <span className="ml-1 text-amber-300">{manualEmployeeSummaryByMonth[g.month].count} {isGerman ? 'manuell' : 'manual'}</span>
                )}
              </button>
            ))}
          </div>
          {yearResult.errors?.length > 0 && (
            <div className="mt-2 text-xs text-red-400">
              {t('sc.errors')}: {yearResult.errors.map((e: any) => `${e.month}: ${e.error}`).join(', ')}
            </div>
          )}
        </div>
      )}

      <EnterpriseCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-amber-300/80">
              <Users className="w-4 h-4" />
              {isGerman ? 'Manuelle Mitarbeiter im Planer' : 'Manual employees in planner'}
            </div>
            <div className="text-sm font-semibold text-foreground">
              {isGerman ? `Separat für ${monthLabel(selectedMonth, locale)} gepflegt` : `Maintained separately for ${monthLabel(selectedMonth, locale)}`}
            </div>
            <p className="max-w-3xl text-sm text-muted-foreground">
              {isGerman
                ? 'Diese Mitarbeiter fließen in die Planungsbasis und in neue Drafts ein, bleiben aber von Excel-Importen getrennt.'
                : 'These employees are included in the planning basis and new drafts while staying separate from Excel imports.'}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={() => setShowManualEmployeesOnly((current) => !current)}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.22em] transition ${showManualEmployeesOnly ? 'bg-amber-500/90 text-slate-950 hover:bg-amber-400' : 'border border-amber-400/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20'}`}
              >
                {showManualEmployeesOnly
                  ? (isGerman ? 'Nur manuelle Mitarbeiter aktiv' : 'Manual-only filter active')
                  : (isGerman ? 'Nur manuelle Mitarbeiter' : 'Manual employees only')}
              </button>
              {selectedMonthManualSummary?.count ? (
                <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.2em] text-amber-200">
                  {selectedMonthManualSummary.count} {isGerman ? 'manuelle Quelle(n)' : 'manual source(s)'}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
            <Input
              value={manualEmployeeDraft}
              onChange={(event) => setManualEmployeeDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void handleCreateManualEmployee();
                }
              }}
              placeholder={isGerman ? 'Name für manuellen Mitarbeiter eingeben' : 'Enter a manual employee name'}
              className="h-9 bg-background/75 text-sm"
              disabled={manualEmployeesSaving}
            />
            <button
              onClick={handleCreateManualEmployee}
              disabled={manualEmployeesSaving || !manualEmployeeDraft.trim()}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/90 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-amber-400 disabled:opacity-50"
            >
              <Users className="w-3.5 h-3.5" />
              {isGerman ? 'Manuell anlegen' : 'Add manual employee'}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          {manualEmployees.length > 0 ? manualEmployees.map((entry) => {
            const employeeName = String(entry.employee_name || '').trim();
            return (
              <div key={employeeName} className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm shadow-[0_18px_38px_rgba(245,158,11,0.08)]">
                <span className="font-semibold text-foreground">{employeeName}</span>
                <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">
                  {isGerman ? 'MANUELL' : 'MANUAL'}
                </span>
                <button
                  onClick={() => handleDeleteManualEmployee(employeeName)}
                  disabled={manualEmployeesSaving}
                  className="rounded-full p-1 text-muted-foreground transition hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
                  title={isGerman ? 'Manuellen Mitarbeiter löschen' : 'Delete manual employee'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          }) : (
            <div className="rounded-2xl border border-dashed border-white/12 bg-white/3 px-4 py-3 text-sm text-muted-foreground">
              {isGerman ? 'Noch keine manuellen Mitarbeiter für diesen Planungsmonat angelegt.' : 'No manual employees have been created for this planning month yet.'}
            </div>
          )}
        </div>
      </EnterpriseCard>

      {/* Active Draft Status Bar */}
      {activeDraft && (
        <EnterpriseCard>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <span className="text-sm font-bold text-foreground">{monthLabel(activeDraft.month, locale)}</span>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusLabels[activeDraft.status]?.bg || ''} ${statusLabels[activeDraft.status]?.color || ''}`}>
                {statusLabels[activeDraft.status]?.label || activeDraft.status}
              </span>
              <span className="text-xs text-muted-foreground">{t('sc.version')} {activeDraft.version}</span>
              <span className="text-xs text-muted-foreground">{t('sc.created')}: {formatDT(activeDraft.created_at, locale)} {t('sc.by')} {activeDraft.created_by}</span>
            </div>
            <div className="flex items-center gap-2">
              {activeDraft.status === 'draft' && (
                <button onClick={() => handleStatusChange(activeDraft.id, 'in_review')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-amber-600/20 border border-amber-500/30 text-amber-400 hover:bg-amber-600/30 transition">
                  <Eye className="w-3.5 h-3.5" /> {t('sc.markInReview')}
                </button>
              )}
              {(activeDraft.status === 'draft' || activeDraft.status === 'in_review') && (
                <button onClick={() => handleStatusChange(activeDraft.id, 'approved')} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30 transition">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {t('sc.approve')}
                </button>
              )}
              {activeDraft.status === 'approved' && (
                <button onClick={() => setConfirmActivate(true)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-500 transition font-medium">
                  <ArrowRight className="w-3.5 h-3.5" /> {t('sc.activatePlan')}
                </button>
              )}
              <button onClick={() => handleExport(activeDraft.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border/40 bg-background/60 text-muted-foreground hover:text-foreground hover:bg-background/80 transition">
                <FileSpreadsheet className="w-3.5 h-3.5" /> {t('sc.excelExport')}
              </button>
              {activeDraft.status !== 'activated' && (
                <button onClick={() => handleDelete(activeDraft.id)} className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition">
                  <Trash2 className="w-3.5 h-3.5" /> {t('sc.discard')}
                </button>
              )}
            </div>
          </div>
        </EnterpriseCard>
      )}

      {/* Activation Confirmation */}
      {confirmActivate && activeDraft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="max-w-md w-full mx-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-6 shadow-2xl" style={{ background: 'rgba(8,12,28,0.95)' }}>
            <div className="flex items-start gap-3 mb-4">
              <ShieldAlert className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-bold text-foreground">{t('sc.activateModalTitle')}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                  {isGerman ? <>Der Draft für <strong>{monthLabel(activeDraft.month, locale)}</strong> (Version {activeDraft.version}) wird als aktiver Schichtplan übernommen. Ein eventuell bestehender aktiver Plan für diesen Monat wird ersetzt.</> : <>The draft for <strong>{monthLabel(activeDraft.month, locale)}</strong> (version {activeDraft.version}) will be activated as the live shift plan. Any existing active plan for this month will be replaced.</>}
                </p>
                <p className="text-sm text-amber-400 mt-2">{t('sc.cannotBeUndone')}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setConfirmActivate(false)} className="px-4 py-2 text-sm rounded-md border border-border/40 bg-background/60 hover:bg-background/80 text-muted-foreground transition">
                {t('common.cancel')}
              </button>
              <button onClick={handleActivate} className="px-4 py-2 text-sm rounded-md bg-emerald-600 hover:bg-emerald-500 text-white transition font-medium">
                {t('sc.confirmActivate')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-0 overflow-x-auto border-b border-blue-500/20 px-1 pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              if (t.key === 'basis' && !planningBasis) loadBasis();
            }}
            className={`-mb-px shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition border-b-2 ${
              tab === t.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-blue-500/30'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <EnterpriseCard noPadding>
        <div className="p-6">
          {/* Overview Tab */}
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 mb-4">
                <CalendarClock className="w-5 h-5 text-blue-400" />
                <h3 className="text-sm font-bold text-foreground">{t('sc.shiftPlanning')} — {monthLabel(selectedMonth, locale)}</h3>
              </div>

              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-300/80">
                      {isGerman ? 'Manuelle Quellen im Jahr' : 'Manual sources across the year'}
                    </div>
                    <div className="text-sm font-semibold text-foreground">
                      {isGerman ? `Übersicht für ${selectedMonthYear}` : `Overview for ${selectedMonthYear}`}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {isGerman ? 'Zeigt je Monat, ob Drafts auf manuellen Mitarbeitern aufbauen.' : 'Shows per month whether drafts build on manual employees.'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {manualSummaryMonths.map((entry) => {
                    const hasManualSources = entry.count > 0;
                    const isCurrentMonth = entry.month === selectedMonth;
                    return (
                      <button
                        key={entry.month}
                        type="button"
                        onClick={() => setSelectedMonth(entry.month)}
                        className={`rounded-xl border px-3 py-2 text-left transition ${isCurrentMonth ? 'border-blue-500/40 bg-blue-500/10' : hasManualSources ? 'border-amber-400/20 bg-amber-500/10 hover:bg-amber-500/15' : 'border-border/20 bg-background/40 hover:bg-background/60'}`}
                      >
                        <div className="text-xs font-semibold text-foreground">{monthLabel(entry.month, locale)}</div>
                        <div className={`mt-1 text-[11px] font-bold uppercase tracking-[0.2em] ${hasManualSources ? 'text-amber-200' : 'text-muted-foreground'}`}>
                          {hasManualSources
                            ? `${entry.count} ${isGerman ? 'manuell' : 'manual'}`
                            : (isGerman ? 'Keine manuellen Quellen' : 'No manual sources')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Draft List */}
              {drafts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="w-8 h-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium">{isGerman ? `Noch kein Draft für ${monthLabel(selectedMonth, locale)} vorhanden` : `No draft exists yet for ${monthLabel(selectedMonth, locale)}`}</p>
                  <p className="text-xs mt-1 mb-4">{isGerman ? 'Wähle einen Monat und klicke auf „Draft generieren" um zu starten' : 'Select a month and click "Generate draft" to begin'}</p>
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 font-medium"
                  >
                    <Play className="w-3.5 h-3.5" />
                    {generating ? t('sc.generating') : t('sc.generateFirstDraft')}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {drafts.map(d => {
                    const st = statusLabels[d.status] || statusLabels.draft;
                    return (
                      <div
                        key={d.id}
                        className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition hover:border-blue-500/30 ${
                          activeDraft?.id === d.id ? 'border-blue-500/40 bg-blue-500/5' : 'border-border/20 bg-background/40'
                        }`}
                        onClick={() => loadDraft(d.id)}
                      >
                        <div className="flex items-center gap-4">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${st.bg} ${st.color}`}>
                            {st.label}
                          </span>
                          <span className="text-sm font-medium text-foreground">{d.title || `Version ${d.version}`}</span>
                          {d.title && <span className="text-xs text-muted-foreground">v{d.version}</span>}
                          {(selectedMonthManualSummary?.count || 0) > 0 && (
                            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
                              {selectedMonthManualSummary?.count} {isGerman ? 'manuell' : 'manual'}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground">{formatDT(d.created_at, locale)}</span>
                          <span className="text-xs text-muted-foreground">{t('sc.by')} {d.created_by}</span>
                          {d.note && <span className="text-xs text-muted-foreground italic">"{d.note}"</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          {d.activated_by && (
                            <span className="text-xs text-emerald-400">{t('sc.activatedBy')} {d.activated_by} {t('sc.on')} {formatDT(d.activated_at, locale)}</span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExport(d.id); }}
                            className="p-1.5 rounded hover:bg-blue-500/20 text-blue-400 transition"
                            title={t('sc.excelExport')}
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Draft View Tab */}
          {tab === 'draft' && (
            <div className="space-y-4">
              {!activeDraft ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-sm">{t('sc.selectOrGenerateDraft')}</p>
                </div>
              ) : loading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                </div>
              ) : (
                <>
                  <div className="rounded-xl border border-border/30 bg-card/70 p-4">
                    <div className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end">
                      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                        {isGerman ? 'Draft-Name' : 'Draft name'}
                        <Input
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          placeholder={isGerman ? `Schichtplan ${monthLabel(activeDraft.month, locale)} v${activeDraft.version}` : `Shift plan ${monthLabel(activeDraft.month, locale)} v${activeDraft.version}`}
                          disabled={activeDraft.status === 'activated'}
                        />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-muted-foreground">
                        {isGerman ? 'Notizen' : 'Notes'}
                        <Input
                          value={draftNote}
                          onChange={(event) => setDraftNote(event.target.value)}
                          placeholder={isGerman ? 'Notiz zu diesem Draft' : 'Note for this draft'}
                          disabled={activeDraft.status === 'activated'}
                        />
                      </label>
                      <button
                        type="button"
                        onClick={handleSaveDraftMetadata}
                        disabled={draftMetadataSaving || activeDraft.status === 'activated'}
                        className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-50"
                      >
                        {draftMetadataSaving ? (isGerman ? 'Speichert...' : 'Saving...') : (isGerman ? 'Draft speichern' : 'Save draft')}
                      </button>
                    </div>
                  </div>
                  <DraftShiftTable
                    draft={activeDraft}
                    manualOnly={showManualEmployeesOnly}
                    onCellChange={handleDraftCellChange}
                  />
                </>
              )}
            </div>
          )}

          {/* Conflicts Tab */}
          {tab === 'conflicts' && (
            <ConflictsView conflicts={activeDraft?.conflicts || []} />
          )}

          {/* Explanations Tab */}
          {tab === 'explanations' && (
            <ExplanationsView explanations={activeDraft?.explanations || {}} />
          )}

          {/* Fairness Tab */}
          {tab === 'fairness' && (
            <FairnessView fairness={activeDraft?.fairness || {}} />
          )}

          {/* Planning Basis Tab */}
          {tab === 'basis' && (
            <PlanningBasisView basis={planningBasis} loading={basisLoading} onReload={loadBasis} manualOnly={showManualEmployeesOnly} />
          )}

          {/* History Tab */}
          {tab === 'history' && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-400" />
                {t('sc.draftVersionsFor')} {monthLabel(selectedMonth, locale)}
              </h3>
              {drafts.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">{t('sc.noVersions')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b border-border/20">
                        <th className="pb-2 pr-4 font-medium">{t('sc.version')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('sc.status')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('sc.createdBy')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('sc.createdAt')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('sc.approvedBy')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('sc.activatedBy')}</th>
                        <th className="pb-2 font-medium">{t('sc.note')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10">
                      {drafts.map(d => {
                        const st = statusLabels[d.status] || statusLabels.draft;
                        return (
                          <tr key={d.id} className="hover:bg-blue-500/5 transition cursor-pointer" onClick={() => loadDraft(d.id)}>
                            <td className="py-2.5 pr-4 font-medium text-foreground">v{d.version}</td>
                            <td className="py-2.5 pr-4"><span className={`${st.color}`}>{st.label}</span></td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{d.created_by}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{formatDT(d.created_at, locale)}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{d.approved_by || '–'}</td>
                            <td className="py-2.5 pr-4 text-muted-foreground">{d.activated_by || '–'}</td>
                            <td className="py-2.5 text-muted-foreground">
                              <div className="flex items-center gap-2">
                                {(selectedMonthManualSummary?.count || 0) > 0 && (
                                  <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                                    {selectedMonthManualSummary?.count} {isGerman ? 'manuell' : 'manual'}
                                  </span>
                                )}
                                <span>{d.note || '–'}</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Help Tab */}
          {tab === 'help' && (
            <ShiftplanHelp />
          )}
        </div>
      </EnterpriseCard>
    </EnterprisePageShell>
  );
}

/* ================================================ */
/* SUB-COMPONENTS                                   */
/* ================================================ */

function DraftShiftTable({ draft, manualOnly = false, onCellChange }: { draft: Draft; manualOnly?: boolean; onCellChange?: (employeeName: string, day: number, shiftCode: string) => Promise<void> }) {
  const { language, t } = useLanguage();
  const locale = getLanguageLocale(language);
  const isGerman = language === 'de';
  const [year, mon] = draft.month.split('-').map(Number);
  const numDays = daysInMonth(year, mon);
  const [editMode, setEditMode] = useState(false);
  const [savingCell, setSavingCell] = useState<string | null>(null);
  const shiftOptions = useMemo(() => {
    const fromConfig = Array.isArray(draft.config_snapshot?.shiftDefinitions)
      ? draft.config_snapshot.shiftDefinitions.map((definition: any) => String(definition.code || '').trim()).filter(Boolean)
      : [];
    return Array.from(new Set(['', ...fromConfig, 'E1', 'E1SA', 'E1WE', 'L1', 'L1WE', 'N', 'DBS', 'FS', 'ABW', 'S']));
  }, [draft.config_snapshot?.shiftDefinitions]);
  const manualEmployeeNameSet = useMemo(
    () => new Set((Array.isArray(draft.manual_employees) ? draft.manual_employees : []).map((entry) => String(entry.employee_name || '').trim()).filter(Boolean)),
    [draft.manual_employees]
  );
  const schedule = useMemo(() => {
    const nextSchedule: Record<string, Record<number, string>> = {};
    for (const shift of draft.shifts_json || []) {
      if (!nextSchedule[shift.employee_name]) nextSchedule[shift.employee_name] = {};
      nextSchedule[shift.employee_name][shift.day] = shift.shift_code;
    }

    const employees = new Set<string>([
      ...Object.keys(draft.fairness || {}),
      ...Object.keys(nextSchedule),
      ...(Array.isArray(draft.absences) ? draft.absences.map((absence) => absence.employee_name) : []),
    ]);

    for (const employee of employees) {
      if (!nextSchedule[employee]) nextSchedule[employee] = {};
    }

    return Object.fromEntries(
      Object.entries(nextSchedule).sort(([left], [right]) => left.localeCompare(right, 'de'))
    );
  }, [draft.absences, draft.fairness, draft.shifts_json]);

  const filteredSchedule = useMemo(() => {
    if (!manualOnly) return schedule;

    return Object.fromEntries(
      Object.entries(schedule).filter(([employee]) => manualEmployeeNameSet.has(employee))
    );
  }, [manualEmployeeNameSet, manualOnly, schedule]);

  const employees = useMemo(() => Object.keys(filteredSchedule), [filteredSchedule]);

  const wishStatusByEmployee = useMemo(
    () => new Map((Array.isArray(draft.wish_status) ? draft.wish_status : []).map((entry) => [entry.employee_name, entry])),
    [draft.wish_status]
  );

  const employeeBadges = useMemo<Record<string, Array<{ label: string; tone?: 'success' | 'warning' | 'neutral' }>>>(() => {
    return Object.fromEntries(
      employees.map((employee) => {
        const submitted = wishStatusByEmployee.get(employee)?.submitted;
        const badges: Array<{ label: string; tone?: 'success' | 'warning' | 'neutral' }> = [];
        if (manualEmployeeNameSet.has(employee)) {
          badges.push({ label: isGerman ? 'MANUELL' : 'MANUAL', tone: 'warning' });
        }
        badges.push({ label: submitted ? (isGerman ? 'Wunsch da' : 'Submitted') : (isGerman ? 'Offen' : 'Missing'), tone: submitted ? 'success' : 'warning' });
        return [employee, badges];
      })
    );
  }, [employees, isGerman, manualEmployeeNameSet, wishStatusByEmployee]);

  const employeeHours = useMemo(() => {
    const map = new Map<string, EmployeeMonthlyStats>();
    for (const employee of employees) {
      const fairness = draft.fairness?.[employee] || {};
      const soll = Number(fairness.targetHours ?? draft.config_snapshot?.planningConfig?.monthly_target_hours ?? 174);
      const ist = Number(fairness.actualHours ?? 0);
      const diff = Number(fairness.deltaHours ?? (ist - soll));
      map.set(employee, {
        name: employee,
        soll,
        ist,
        diff,
        warnings: [],
        dayHours: {},
        weekHours: {},
      });
    }
    return map;
  }, [draft.config_snapshot?.planningConfig?.monthly_target_hours, draft.fairness, employees]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-bold text-foreground">{t('sc.draftShiftPlan')}: {monthLabel(draft.month, locale)}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 font-bold">
          {t('sc.draftLabel')} v{draft.version}
        </span>
        {manualOnly && (
          <span className="text-xs px-2 py-0.5 rounded-full border border-amber-400/30 bg-amber-500/15 text-amber-200 font-black uppercase tracking-[0.2em]">
            {isGerman ? 'Nur manuelle Mitarbeiter' : 'Manual employees only'}
          </span>
        )}
        <button
          type="button"
          onClick={() => setEditMode((current) => !current)}
          disabled={draft.status === 'activated' || !onCellChange}
          className="ml-auto rounded-lg border border-blue-500/30 px-3 py-1.5 text-xs font-bold text-blue-300 transition hover:bg-blue-500/10 disabled:opacity-50"
        >
          {editMode ? (isGerman ? 'Bearbeitung beenden' : 'Stop editing') : (isGerman ? 'Draft manuell bearbeiten' : 'Edit draft manually')}
        </button>
      </div>
      {manualOnly && employees.length === 0 && (
        <div className="rounded-lg border border-dashed border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          {isGerman ? 'Für diesen Draft gibt es keine manuellen Mitarbeiterzeilen.' : 'There are no manual employee rows for this draft.'}
        </div>
      )}
      {editMode && onCellChange ? (
        <div className="overflow-auto rounded-xl border border-border/30">
          <table className="w-full min-w-[1200px] text-xs">
            <thead>
              <tr className="bg-muted/30 text-left text-muted-foreground">
                <th className="sticky left-0 z-10 bg-muted/60 px-3 py-2">{isGerman ? 'Mitarbeiter' : 'Employee'}</th>
                {Array.from({ length: numDays }, (_, index) => index + 1).map((day) => (
                  <th key={day} className={`px-1 py-2 text-center ${isWeekend(year, mon, day) ? 'text-amber-300' : ''}`}>{day}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee} className="border-t border-border/10">
                  <td className="sticky left-0 z-10 bg-background px-3 py-2 font-semibold text-foreground">{employee}</td>
                  {Array.from({ length: numDays }, (_, index) => index + 1).map((day) => {
                    const key = `${employee}-${day}`;
                    return (
                      <td key={day} className="px-1 py-1">
                        <select
                          value={filteredSchedule[employee]?.[day] || ''}
                          disabled={savingCell === key}
                          onChange={async (event) => {
                            setSavingCell(key);
                            try {
                              await onCellChange(employee, day, event.target.value);
                            } finally {
                              setSavingCell(null);
                            }
                          }}
                          className="w-16 rounded border border-border/40 bg-background px-1 py-1 text-center text-xs text-foreground disabled:opacity-50"
                        >
                          {shiftOptions.map((code) => <option key={code || 'empty'} value={code}>{code || '–'}</option>)}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ShiftplanTable
          schedule={filteredSchedule}
          daysInMonth={numDays}
          year={year}
          monthIndex1={mon}
          holidays={{}}
          warnings={[]}
          selectedCells={new Set<string>()}
          employeeHours={employeeHours}
          absences={draft.absences || []}
          employeeBadges={employeeBadges}
        />
      )}

    </div>
  );
}

function ConflictsView({ conflicts }: { conflicts: any[] }) {
  const { language, t } = useLanguage();
  const isGerman = language === 'de';
  const severityColor: Record<string, string> = {
    critical: 'border-red-500/30 bg-red-500/10 text-red-400',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    relevant: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    hint: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        {t('sc.conflictCenter')}
      </h3>
      {conflicts.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-4 h-4" />
          {t('sc.noConflicts')}
        </div>
      ) : (
        <div className="space-y-2">
          {conflicts.map((c, i) => (
            <div key={i} className={`rounded-lg border px-4 py-3 text-xs ${severityColor[c.severity] || severityColor.hint}`}>
              <div className="flex items-center gap-3">
                <span className="font-bold uppercase text-[10px] tracking-wider">{getSeverityLabel(c.severity, t)}</span>
                <span className="font-medium">{c.message}</span>
              </div>
              {Array.isArray(c.suggestions) && c.suggestions.length > 0 && (
                <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {c.suggestions.map((suggestion: any) => (
                    <div key={`${c.date}-${c.shift}-${suggestion.employee}`} className="rounded-lg border border-white/10 bg-background/45 px-3 py-2 text-foreground">
                      <div className="flex items-center justify-between gap-2 font-bold">
                        <span>{suggestion.employee}</span>
                        {suggestion.weekendException && (
                          <span className="rounded-full border border-amber-400/30 bg-amber-500/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-amber-300">
                            {isGerman ? 'Wochenend-Ausnahme' : 'Weekend exception'}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {isGerman ? 'Vorschlag für' : 'Suggested for'} {suggestion.shiftCode || c.shift}
                        {Array.isArray(suggestion.coverageDays) ? ` · ${isGerman ? 'Tage' : 'days'} ${suggestion.coverageDays.join(', ')}` : ''}
                      </div>
                      <div className="mt-1 text-[10px] text-muted-foreground">{(suggestion.reasons || []).join(' · ')}</div>
                    </div>
                  ))}
                </div>
              )}
              {c.type === 'understaffed' && (!Array.isArray(c.suggestions) || c.suggestions.length === 0) && (
                <div className="mt-2 text-[10px] font-medium opacity-80">
                  {isGerman ? 'Kein konfliktfreier Ersatz verfügbar. Der Plan wurde trotzdem erstellt.' : 'No conflict-free replacement is available. The draft was still created.'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ExplanationsView({ explanations }: { explanations: Record<string, any> }) {
  const { language, t } = useLanguage();
  const isGerman = language === 'de';
  const entries = Object.values(explanations);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Group by employee
  const byEmployee: Record<string, any[]> = {};
  for (const e of entries) {
    if (!byEmployee[e.employee]) byEmployee[e.employee] = [];
    byEmployee[e.employee].push(e);
  }
  const empNames = Object.keys(byEmployee).sort();

  // Categorize a reason string
  const categorizeReason = (reason: string): 'positive' | 'negative' | 'neutral' | 'info' => {
    if (/Regelverstoß|verboten|Limit erreicht|nicht im.*Pool|Feste Schichtvorgabe: nur|fachlich besser|unerwünscht|gesperrt|vermeid|Über Sollzeit|Mehr Stunden/i.test(reason)) return 'negative';
    if (/bevorzugt|Wunschkollege|Fairness: Weniger|Sollzeit offen|Skill-Match|Pool \(|Schichtvorgabe erfüllt/i.test(reason)) return 'positive';
    if (/Planungsbewertung|Rang \d/i.test(reason)) return 'info';
    return 'neutral';
  };

  const reasonStyle: Record<string, string> = {
    positive: 'bg-green-500/10 border-green-500/20 text-green-300',
    negative: 'bg-red-500/10 border-red-500/20 text-red-300',
    neutral: 'bg-blue-500/10 border-blue-500/15 text-blue-300',
    info: 'bg-purple-500/10 border-purple-500/20 text-purple-300',
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Info className="w-4 h-4 text-blue-400" />
        {t('sc.explanationsPerAssignment')}
      </h3>

      {/* Legend explaining the scoring system */}
      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3 text-xs text-muted-foreground space-y-1.5">
        <p className="font-semibold text-cyan-300 text-[11px]">
          {isGerman ? '📊 So liest du die Begründungen:' : '📊 How to read the explanations:'}
        </p>
        <p>
          {isGerman
            ? 'Jeder Mitarbeiter startet mit einem Basiswert von 1000 Punkten. Positive Faktoren (z. B. Skills, Wünsche, Fairness) erhöhen den Wert, negative Faktoren (z. B. Überlast, Regelverstöße) senken ihn. Der Mitarbeiter mit dem höchsten Endwert erhält die Schicht.'
            : 'Each employee starts with a base score of 1000 points. Positive factors (e.g. skills, wishes, fairness) increase it, negative factors (e.g. overload, rule violations) decrease it. The employee with the highest final score gets the shift.'}
        </p>
        <div className="flex flex-wrap gap-2 mt-1.5">
          <span className={`px-2 py-0.5 rounded border text-[10px] ${reasonStyle.positive}`}>{isGerman ? '✓ Positiver Faktor' : '✓ Positive factor'}</span>
          <span className={`px-2 py-0.5 rounded border text-[10px] ${reasonStyle.negative}`}>{isGerman ? '✗ Negativer Faktor' : '✗ Negative factor'}</span>
          <span className={`px-2 py-0.5 rounded border text-[10px] ${reasonStyle.neutral}`}>{isGerman ? '○ Neutraler Kontext' : '○ Neutral context'}</span>
          <span className={`px-2 py-0.5 rounded border text-[10px] ${reasonStyle.info}`}>{isGerman ? '★ Gesamtergebnis' : '★ Final result'}</span>
        </div>
      </div>

      {empNames.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">{t('sc.noExplanations')}</p>
      ) : (
        <div className="space-y-2">
          {empNames.map(emp => {
            const empEntries = byEmployee[emp];
            const assignedCount = empEntries.filter(e => e.code).length;
            const totalScore = empEntries.reduce((sum, e) => sum + (e.score || 0), 0);
            return (
              <div key={emp} className="rounded-lg border border-border/20 overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === emp ? null : emp)}
                  className="flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium text-foreground/80 hover:text-foreground hover:bg-blue-500/5 transition"
                >
                  <span className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-400" />
                    {emp}
                    <span className="text-xs text-muted-foreground">({assignedCount} {t('sc.shifts')})</span>
                  </span>
                  <div className="flex items-center gap-3">
                    {totalScore > 0 && (
                      <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded">
                        Σ {totalScore.toLocaleString()} {isGerman ? 'Punkte' : 'pts'}
                      </span>
                    )}
                    {expanded === emp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </button>
                {expanded === emp && (
                  <div className="px-4 pb-3 space-y-1.5">
                    {empEntries.sort((a: any, b: any) => a.day - b.day).map((e: any) => (
                      <div key={e.day} className="py-2 border-t border-border/10">
                        <div className="flex items-center gap-3 text-xs mb-1.5">
                          <span className="font-medium text-muted-foreground min-w-12.5">{t('sc.day')} {e.day}</span>
                          <span className={`font-bold min-w-7.5 ${e.code ? 'text-blue-400' : 'text-zinc-500'}`}>
                            {e.code || '–'}
                          </span>
                          {e.score != null && e.code && (
                            <span className="text-[10px] font-mono text-purple-300 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded">
                              {e.score.toLocaleString()} {isGerman ? 'Pkt' : 'pts'}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 ml-12.5 pl-3">
                          {(e.reasons || []).map((r: string, ri: number) => {
                            const cat = categorizeReason(r);
                            return (
                              <span key={ri} className={`px-2 py-0.5 rounded border text-[11px] ${reasonStyle[cat]}`}>
                                {r}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FairnessView({ fairness }: { fairness: Record<string, any> }) {
  const { language, t } = useLanguage();
  const isGerman = language === 'de';
  const entries = Object.entries(fairness).map(([name, data]) => ({ name, ...data }));
  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground text-xs">
        {t('sc.noFairnessData')}
      </div>
    );
  }

  // Average values
  const avg = (field: string) => {
    const vals = entries.map(e => e[field] || 0);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '0';
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-blue-400" />
        {t('sc.fairnessOverview')}
      </h3>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-center">
          <div className="text-lg font-bold text-purple-400">{avg('nights')}</div>
          <div className="text-[10px] text-muted-foreground">∅ {t('sc.nights')}</div>
        </div>
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-center">
          <div className="text-lg font-bold text-amber-400">{avg('weekends')}</div>
          <div className="text-[10px] text-muted-foreground">∅ {t('sc.weekends')}</div>
        </div>
        <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-center">
          <div className="text-lg font-bold text-blue-400">{avg('earlyCount')}</div>
          <div className="text-[10px] text-muted-foreground">∅ {t('sc.earlyShifts')}</div>
        </div>
        <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3 text-center">
          <div className="text-lg font-bold text-green-400">{avg('total')}</div>
          <div className="text-[10px] text-muted-foreground">∅ {t('common.total')}</div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-border/20">
              <th className="pb-2 pr-4 font-medium">{t('common.employee')}</th>
              <th className="pb-2 pr-4 font-medium text-center">{t('sc.nights')}</th>
              <th className="pb-2 pr-4 font-medium text-center">{t('sc.weekends')}</th>
              <th className="pb-2 pr-4 font-medium text-center">{t('sc.early')}</th>
              <th className="pb-2 pr-4 font-medium text-center">{t('sc.late')}</th>
              <th className="pb-2 pr-4 font-medium text-center">{t('common.total')}</th>
              <th className="pb-2 font-medium text-center">{t('sc.deviation')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/10">
            {entries.sort((a, b) => a.name.localeCompare(b.name)).map(e => {
              const totalAvg = parseFloat(avg('total'));
              const deviation = (e.total || 0) - totalAvg;
              return (
                <tr key={e.name} className="hover:bg-blue-500/5 transition">
                  <td className="py-2 pr-4 font-medium text-foreground">{e.name}</td>
                  <td className="py-2 pr-4 text-center text-purple-400">{e.nights || 0}</td>
                  <td className="py-2 pr-4 text-center text-amber-400">{e.weekends || 0}</td>
                  <td className="py-2 pr-4 text-center text-blue-400">{e.earlyCount || 0}</td>
                  <td className="py-2 pr-4 text-center text-orange-400">{e.lateCount || 0}</td>
                  <td className="py-2 pr-4 text-center font-bold text-foreground">{e.total || 0}</td>
                  <td className="py-2 text-center">
                    <span className={`font-medium ${Math.abs(deviation) > 2 ? 'text-red-400' : Math.abs(deviation) > 1 ? 'text-amber-400' : 'text-green-400'}`}>
                      {deviation > 0 ? '+' : ''}{deviation.toFixed(1)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PlanningBasisView({ basis, loading, onReload, manualOnly = false }: { basis: any; loading: boolean; onReload: () => void; manualOnly?: boolean }) {
  const { language, t } = useLanguage();
  const locale = getLanguageLocale(language);
  const isGerman = language === 'de';
  const manualEmployeeNameSet = useMemo(
    () => new Set((basis?.manualEmployees || []).map((entry: any) => String(entry.employee_name || '').trim()).filter(Boolean)),
    [basis]
  );
  const visibleEmployees = useMemo(
    () => (basis?.employees || []).filter((employee: string) => !manualOnly || manualEmployeeNameSet.has(employee)),
    [basis, manualEmployeeNameSet, manualOnly]
  );
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!basis) {
    return (
      <div className="text-center py-6 text-muted-foreground text-xs">
        <button onClick={onReload} className="text-blue-400 underline">{t('sc.loadPlanningBasis')}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
          <List className="w-4 h-4 text-blue-400" />
          {t('sc.planningBasisFor')} {monthLabel(basis.month, locale)}
        </h3>
        <div className="flex items-center gap-3">
          {manualOnly && (
            <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200">
              {isGerman ? 'Nur manuelle Mitarbeiter' : 'Manual employees only'}
            </span>
          )}
          <button onClick={onReload} className="text-xs text-blue-400 underline">{t('common.refresh')}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-lg border border-border/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-400" /> {manualOnly ? (isGerman ? 'Gefilterte Mitarbeiter' : 'Filtered employees') : t('sc.employees')} ({visibleEmployees.length || 0})
          </h4>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
            {visibleEmployees.map((e: string) => <div key={e}>{e}</div>)}
            {visibleEmployees.length === 0 && <div>{manualOnly ? (isGerman ? 'Keine manuellen Mitarbeiter in der Planungsbasis' : 'No manual employees in the planning basis') : '–'}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-amber-500/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-amber-300" /> {isGerman ? 'Manuelle Mitarbeiter' : 'Manual employees'} ({basis.manualEmployees?.length || 0})
          </h4>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
            {(basis.manualEmployees || []).map((entry: any, index: number) => (
              <div key={`${entry.employee_name}-${index}`}>{entry.employee_name}</div>
            ))}
            {(basis.manualEmployees || []).length === 0 && <div>{isGerman ? 'Keine manuellen Mitarbeiter' : 'No manual employees'}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-border/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-amber-400" /> {t('sc.absences')} ({basis.absences?.length || 0})
          </h4>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
            {(basis.absences || []).map((a: any, i: number) => (
              <div key={i}>{a.employee_name}: {a.type} ({new Date(a.start_date).toLocaleDateString(locale, { timeZone: 'Europe/Berlin' })} – {new Date(a.end_date).toLocaleDateString(locale, { timeZone: 'Europe/Berlin' })})</div>
            ))}
            {(basis.absences || []).length === 0 && <div>{t('sc.noAbsences')}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-border/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" /> {t('sc.permanentExclusions')} ({basis.exclusions?.length || 0})
          </h4>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
            {(basis.exclusions || []).map((e: any, i: number) => (
              <div key={i}>{e.employee_name} – {e.reason}</div>
            ))}
            {(basis.exclusions || []).length === 0 && <div>{t('sc.noExclusions')}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-border/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2 flex items-center gap-1.5">
            {t('sc.skills')} ({basis.skills?.length || 0})
          </h4>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
            {(basis.skills || []).map((s: any, i: number) => (
              <div key={i}>{s.employee_name}: SH={s.can_sh ? '✓' : '✗'} TT={s.can_tt ? '✓' : '✗'} CC={s.can_cc ? '✓' : '✗'}</div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2">{t('sc.minimumStaffing')}</h4>
          <div className="text-xs text-muted-foreground space-y-0.5">
            {(basis.staffingRules || []).map((r: any, i: number) => (
              <div key={i}>{t('sc.shift')} {r.shift_type}: {t('sc.atLeast')} {r.min_count} {t('sc.people')}</div>
            ))}
            {(basis.staffingRules || []).length === 0 && <div>{t('sc.noRulesDefined')}</div>}
          </div>
        </div>

        <div className="rounded-lg border border-border/20 p-4">
          <h4 className="text-xs font-bold text-foreground mb-2">{t('sc.preferredColleagues')} ({basis.preferredColleagues?.length || 0})</h4>
          <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
            {(basis.preferredColleagues || []).map((p: any, i: number) => (
              <div key={i}>{p.requester_name} → {p.preferred_employee_name}</div>
            ))}
            {(basis.preferredColleagues || []).length === 0 && <div>{t('sc.noPreferredColleagues')}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ================================================ */
/* HELP COMPONENT                                   */
/* ================================================ */

function ShiftplanHelp() {
  const { language, t } = useLanguage();
  const isGerman = language === 'de';
  const sections = isGerman ? [
    {
      title: 'Was ist der Schichtplaner?',
      content: 'Der Schichtplaner erstellt automatisch Dienstpläne auf Basis vorhandener Mitarbeiterdaten, Abwesenheiten, Qualifikationen und Fairnessregeln. Er erzeugt Draft-Versionen, die geprüft, freigegeben und als aktiven Plan übernommen werden können.',
    },
    {
      title: 'Einen Draft generieren',
      content: 'Wähle oben rechts den gewünschten Monat aus und klicke auf „Draft generieren". Das System berücksichtigt automatisch: verfügbare Mitarbeiter, gemeldete Abwesenheiten, dauerhafte Ausschlüsse, Qualifikationen (SmartHands/TT/CC), Fairness-Metriken aus Vormonaten und Wunschkollegen.',
    },
    {
      title: 'Mitarbeiter auswählen & ausschließen',
      content: 'Mitarbeiter werden automatisch aus dem bestehenden Schichtplan geladen. Unter „ODIN-Logik → Dauerhafte Ausschlüsse" können einzelne Mitarbeiter zeitlich unbegrenzt oder für bestimmte Zeiträume von der Planung ausgeschlossen werden. Gründe wie Lead, Projektarbeit oder Training können angegeben werden.',
    },
    {
      title: 'Draft-Workflow: Entwurf → Prüfung → Freigabe → Übernahme',
      content: 'Jeder Draft durchläuft einen definierten Workflow:\n• Entwurf – frisch generiert, kann verworfen werden\n• In Prüfung – zur Durchsicht markiert\n• Freigegeben – bestätigt, bereit zur Übernahme\n• Übernommen – als aktiver Schichtplan eingesetzt (ersetzt bestehenden Plan für den Monat)',
    },
    {
      title: 'Konflikte & Fairness prüfen',
      content: 'Im Tab „Konfliktzentrum" werden Besetzungslücken und Regelkonflikte angezeigt. Der „Fairness"-Tab zeigt die Verteilung von Nacht-, Wochenend- und Gesamtschichten pro Mitarbeiter. Abweichungen vom Durchschnitt werden farblich markiert.',
    },
    {
      title: 'Erklärungen nachvollziehen',
      content: 'Unter „Erklärungen" wird für jede Zuweisung dokumentiert, warum ein Mitarbeiter einer bestimmten Schicht zugeteilt oder nicht eingeteilt wurde. Das macht die Planung transparent und nachprüfbar.',
    },
    {
      title: 'Jahresplanung',
      content: 'Der Monatsauswahl-Bereich umfasst bis zu 16 Monate (2 Monate zurück, 13 Monate voraus). Um ein ganzes Jahr zu planen, generiere nacheinander Drafts für die gewünschten Monate. Jeder Monat wird separat geplant, sodass Änderungen in einem Monat keine anderen Monate beeinflussen.',
    },
    {
      title: 'Excel-Export',
      content: 'Klicke auf „Excel Export" in der Draft-Statusleiste oder bei einem Draft in der Übersicht. Die exportierte .xls-Datei enthält den kompletten Schichtplan mit farbcodierten Schichtarten (Früh = blau, Spät = gelb, Nacht = lila) und Wochenendmarkierungen.',
    },
    {
      title: 'Planungsbasis einsehen',
      content: 'Im Tab „Planungsbasis" siehst du alle Daten, die bei der Generierung verwendet werden: Mitarbeiterliste, Abwesenheiten, Ausschlüsse, Qualifikationen, Mindestbesetzung und Wunschkollegen. So kannst du vor der Generierung prüfen, ob alle Daten aktuell sind.',
    },
    {
      title: 'Tipps für die tägliche Nutzung',
      content: '• Prüfe vor der Generierung die Planungsbasis auf Vollständigkeit\n• Nutze den Fairness-Tab, um Ungleichgewichte früh zu erkennen\n• Generiere bei Änderungen einfach eine neue Version – alte bleiben erhalten\n• Der Excel-Export eignet sich gut für die Weitergabe an Teamleiter oder den Aushang',
    },
  ] : [
    {
      title: 'What is the shift planner?',
      content: 'The shift planner creates duty plans automatically based on available employee data, absences, qualifications, and fairness rules. It produces draft versions that can be reviewed, approved, and activated as the live plan.',
    },
    {
      title: 'Generate a draft',
      content: 'Select the target month at the top right and click "Generate draft". The system automatically considers available employees, reported absences, permanent exclusions, qualifications (SmartHands/TT/CC), fairness metrics from previous months, and preferred colleagues.',
    },
    {
      title: 'Select and exclude employees',
      content: 'Employees are loaded automatically from the existing shift plan. Under "ODIN logic → Permanent exclusions" you can exclude specific employees from planning indefinitely or for a defined time range. Reasons such as lead duty, project work, or training can be documented.',
    },
    {
      title: 'Draft workflow: draft → review → approval → activation',
      content: 'Each draft follows a defined workflow:\n• Draft – freshly generated and can be discarded\n• In review – marked for checking\n• Approved – confirmed and ready for activation\n• Activated – used as the live shift plan for the month',
    },
    {
      title: 'Review conflicts and fairness',
      content: 'The "Conflict center" tab shows staffing gaps and rule conflicts. The "Fairness" tab shows the distribution of night shifts, weekend shifts, and total shifts per employee. Deviations from the average are highlighted.',
    },
    {
      title: 'Trace explanations',
      content: 'Under "Explanations" you can see why an employee was assigned or not assigned to a specific shift. This keeps the planning process transparent and auditable.',
    },
    {
      title: 'Year planning',
      content: 'The month selector covers up to 16 months. To plan a full year, generate drafts for the required months one after another. Each month is planned independently so changes in one month do not affect other months.',
    },
    {
      title: 'Excel export',
      content: 'Click "Excel export" in the draft status bar or in the overview. The exported .xls file contains the full shift plan with color-coded shift types and weekend markers.',
    },
    {
      title: 'Inspect the planning basis',
      content: 'In the "Planning basis" tab you can inspect all data used during generation: employee list, absences, exclusions, qualifications, minimum staffing, and preferred colleagues. This lets you validate the input before generating.',
    },
    {
      title: 'Daily usage tips',
      content: '• Check the planning basis for completeness before generating\n• Use the fairness tab to spot imbalances early\n• Generate a new version whenever requirements change – older versions remain available\n• Excel export works well for sharing with team leads or for notice boards',
    },
  ];

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-blue-400" />
        {t('sc.helpTitle')}
      </h3>
      <div className="space-y-3">
        {sections.map((s, i) => (
          <div key={i} className="rounded-lg border border-border/20 p-4">
            <h4 className="text-xs font-bold text-foreground mb-2">{s.title}</h4>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{s.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
