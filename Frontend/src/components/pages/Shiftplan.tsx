/* ------------------------------------------------ */
/* SHIFTPLAN – PAGE                                 */
/* FINAL stabile Version (Restored Layout)          */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Calendar, Plus, Trash2, Users } from "lucide-react";
import { EnterprisePageShell, EnterpriseCard, EnterpriseHeader, ENT_SECTION_TITLE } from "../layout/EnterpriseLayout";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { toast } from "sonner"; // [NEW]
import { ShiftplanTable } from "../shiftplan/ShiftplanTable";
import { getShiftKindStyle, SHIFT_COLOR_LEGEND } from "../shiftplan/shiftColors";
import { ShiftContextMenu } from "../shiftplan/ShiftContextMenu";
import { useShiftSelection } from "../../hooks/useShiftSelection";
import { useHiddenEmployees } from "../../hooks/useHiddenEmployees";
import { ShiftImportDialog } from "../shiftplan/ShiftImportDialog"; // [NEW] Excel Import
import { HistoryDialog } from "../shiftplan/HistoryDialog"; // [NEW]
import { CompetencyModal } from "../shiftplan/CompetencyModal";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { isColoEmployee, parseColoPool } from "../../utils/colo";

import {
  createManualShiftplanEmployee,
  deleteManualShiftplanEmployee,
  fetchSchedule,
  importSchedule,
  type ManualShiftplanEmployee,
} from "../shiftplan/shiftplan.api";
import { useShiftplanActions } from "../../hooks/useShiftplanActions";

import { useShiftStore } from "../../store/shiftStore";
import { formatMonthLabel } from "../../utils/dateFormat";
import { getHessenHolidayMap, getIslamicHolidayMap, HolidayMap } from "../../utils/deHolidays";
import { api } from "../../api/api";
import { logActivityEventSafe } from "../../api/activity";
import { fetchShiftHours, type ShiftHoursEmployee } from "../../api/shiftHours";
import { computeUnderstaffWarnings } from "../shiftplan/shiftplan.warnings";
import { calculateEmployeeHours, EmployeeMonthlyStats, HourLimitsConfig } from "../shiftplan/shiftplan.hours";
import { useWellbeingStore } from "../../store/wellbeingStore"; // [NEW]

import { fetchViolations, validateShiftplan, ShiftViolation } from "../../api/shiftValidation"; // [NEW]

// [NEW] Coverage Imports
import {
  EmployeeSkills,
  CoverageViolation,
  fetchSkills,
  fetchCoverageViolations,
  computeCoverage
} from "../../api/coverage";
import { usePersistentToggle } from "../../hooks/usePersistentToggle";
import { fetchStaffingResults, recomputeStaffing, StaffingResult } from "../../api/staffing";
import { fetchAbsences, fetchAbsenceConflicts, Absence, AbsenceConflict, createAbsence, deleteAbsence } from "../../api/absences";
import { fetchConstraints, fetchViolations as fetchConstraintViolations, EmployeeConstraints, ConstraintViolation } from "../../api/constraints";
import { ConstraintDialog } from "../shiftplan/ConstraintDialog";
import { getShiftplanPreferences, updateShiftplanPreferences } from "../../api/userPreferences";
import { fetchAttendance, upsertAttendance, type AttendanceRecord } from "../../api/attendance";

type IssuePriorityMode = "staffing_first" | "balanced" | "fairness_first";

type ShiftplanIssueInsight = {
  id: string;
  source: "understaffing" | "staffing" | "coverage" | "validation" | "absence" | "constraint";
  severity: "high" | "medium";
  title: string;
  detected: string;
  solution: string;
  meta: string;
};

function parseIssueToggleSetting(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return fallback;
}

function formatShiftTypeLabel(value: string, labels?: { early: string; late: string; night: string }) {
  const upper = String(value || "").toUpperCase();
  if (upper === "EARLY") return labels?.early || "Early";
  if (upper === "LATE") return labels?.late || "Late";
  if (upper === "NIGHT") return labels?.night || "Night";
  return value;
}

function formatIssuePriorityMode(mode: IssuePriorityMode, isGerman: boolean) {
  switch (mode) {
    case "staffing_first":
      return isGerman ? "Besetzung zuerst" : "Staffing first";
    case "fairness_first":
      return isGerman ? "Fairness zuerst" : "Fairness first";
    default:
      return isGerman ? "Ausgewogen" : "Balanced";
  }
}

function formatIssueSource(source: ShiftplanIssueInsight["source"], isGerman: boolean) {
  switch (source) {
    case "understaffing":
      return isGerman ? "Unterbesetzung" : "Understaffing";
    case "staffing":
      return isGerman ? "Staffing-Regel" : "Staffing rule";
    case "coverage":
      return isGerman ? "Skill-Abdeckung" : "Skill coverage";
    case "validation":
      return isGerman ? "Validierung" : "Validation";
    case "absence":
      return isGerman ? "Abwesenheit" : "Absence";
    case "constraint":
      return isGerman ? "Restriktion" : "Constraint";
    default:
      return source;
  }
}

function normalizeTargetHours(value: unknown, fallback = 174) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed >= 0 ? Number(parsed.toFixed(2)) : fallback;
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(year: number, monthIndex1: number, day: number) {
  return `${year}-${pad2(monthIndex1)}-${pad2(day)}`;
}

/* ------------------------------------------------ */
/* PAGE                                             */
/* ------------------------------------------------ */

export default function Shiftplan() {
  const shiftStore = useShiftStore();
  const { canWrite, user } = useAuth();
  const { language, t } = useLanguage();
  const wellbeingStore = useWellbeingStore(); // [NEW]
  const isGerman = language === "de";
  const shiftTypeLabels = {
    early: t("shiftplan.shiftEarly"),
    late: t("shiftplan.shiftLate"),
    night: t("shiftplan.shiftNight"),
  };

  const locale: "de-DE" | "en-US" = isGerman ? "de-DE" : "en-US";

  /* ------------------------------------------------ */
  /* STATE                                            */
  /* ------------------------------------------------ */

  /* monthsWithData + API mutations provided by hook */
  const { monthsWithData, refreshMonths } = useShiftplanActions();

  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(
    new Date().getMonth()
  );

  // View mode: month (default) or full-year overview
  const [viewMode, setViewMode] = useState<"month" | "year">("month");



  const [schedule, setSchedule] = useState<Record<string, any>>({});
  const [manualEmployees, setManualEmployees] = useState<ManualShiftplanEmployee[]>([]);
  const [manualEmployeeDraft, setManualEmployeeDraft] = useState("");
  const [manualEmployeesSaving, setManualEmployeesSaving] = useState(false);
  const [daysInMonth, setDaysInMonth] = useState<number>(31);
  const [loading, setLoading] = useState(false);
  const [coloPool, setColoPool] = useState<string[]>([]);
  const [dispatcherConfig, setDispatcherConfig] = useState<{ enabled: boolean; priorities: string[] }>({ enabled: true, priorities: [] });

  // [NEW] Shift Violations
  const [violations, setViolations] = useState<ShiftViolation[]>([]);

  // Full-year view data (loaded only in year mode)
  const [yearSchedules, setYearSchedules] = useState<Record<string, Record<string, any>>>({});
  const [yearLoading, setYearLoading] = useState(false);

  // Panels visibility
  const [warningsVisible, setWarningsVisible] = useState(false);
  const [warningDialogOpen, setWarningDialogOpen] = useState(false);
  const [hiddenPanelVisible, setHiddenPanelVisible] = useState(false);
  // [NEW] Wellbeing Panel
  const [wellbeingVisible, setWellbeingVisible] = useState(false);

  const [isEditMode, setIsEditMode] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<null | { employeeName: string; day: number; current: string }>(null);
  const EMPTY = "__EMPTY__";
  const [editValue, setEditValue] = useState<string>(EMPTY);

  // [NEW] Skills & Coverage State
  const [showSkills, setShowSkills] = usePersistentToggle("shiftplan-show-skills", false);
  const [employeeSkills, setEmployeeSkills] = useState<Map<string, EmployeeSkills>>(new Map());
  const [coverageViolations, setCoverageViolations] = useState<CoverageViolation[]>([]);

  // [NEW] Staffing Results
  const [staffingResults, setStaffingResults] = useState<StaffingResult[]>([]);

  // [NEW] Absences & Conflicts
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [absenceConflicts, setAbsenceConflicts] = useState<AbsenceConflict[]>([]);

  // New Selection Hook
  const { selection, selectCell, clearSelection, isSelected, getSelectedKeys } = useShiftSelection();

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; employeeName: string } | null>(null);

  // Swap Dialog State
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapFrom, setSwapFrom] = useState<null | { employeeName: string; day: number }>(null);
  const [swapToEmployee, setSwapToEmployee] = useState<string>("");
  const [swapToDay, setSwapToDay] = useState<string>("");

  // Hide employees (global hook)
  const { hiddenEmployees, hideEmployee, unhideEmployee, unhideAll, isHidden } = useHiddenEmployees();

  // Highlight Today Request
  const [highlightRequest, setHighlightRequest] = useState<number>(0);

  // [NEW] Hessen Holidays
  const [showHolidayOverlay, setShowHolidayOverlay] = useState(false);
  const [holidayListOpen, setHolidayListOpen] = useState(false);
  const [holidayMap, setHolidayMap] = useState<HolidayMap>({});

  // [NEW] History Dialog
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<string | undefined>(undefined);

  // [NEW] Constraints Dialog
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [constraintsTarget, setConstraintsTarget] = useState<string | undefined>(undefined);

  // [NEW] Competency Modal
  const [competencyOpen, setCompetencyOpen] = useState(false);
  const [competencyTarget, setCompetencyTarget] = useState<string>("");

  // [NEW] Constraints Data
  const [constraintsMap, setConstraintsMap] = useState<Record<string, EmployeeConstraints>>({});
  const [constraintViolations, setConstraintViolations] = useState<ConstraintViolation[]>([]);

  // [NEW] Filter State
  const [searchTerm, setSearchTerm] = useState("");
  const [showNightOnly, setShowNightOnly] = useState(false);
  const [showWeekendOnly, setShowWeekendOnly] = useState(false);
  const [showWarningsOnly, setShowWarningsOnly] = useState(false);
  const [showManualOnly, setShowManualOnly] = useState(false);
  const [showUnderstaffedOnly, setShowUnderstaffedOnly] = useState(false); // Not used yet in logic but requested
  const [issuePanelEnabled, setIssuePanelEnabled] = useState(true);
  const [issueShowSolutions, setIssueShowSolutions] = useState(true);
  const [issuePriorityMode, setIssuePriorityMode] = useState<IssuePriorityMode>("balanced");
  const [skillsEnabled, setSkillsEnabled] = useState(false);
  const [hourLimits, setHourLimits] = useState<HourLimitsConfig>({ maxDailyHours: 10, maxWeeklyHours: 48, dailyMode: 'warn', weeklyMode: 'warn' });
  const [defaultTargetHours, setDefaultTargetHours] = useState(174);
  const [employeeYearProgress, setEmployeeYearProgress] = useState<Map<string, ShiftHoursEmployee>>(new Map());
  const [employeeYearProgressLoading, setEmployeeYearProgressLoading] = useState(false);

  const [attendanceMap, setAttendanceMap] = useState<Record<string, AttendanceRecord>>({});
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [attendanceTarget, setAttendanceTarget] = useState<{ employeeName: string; day: number; date: string } | null>(null);
  const [attendanceSelectionTargets, setAttendanceSelectionTargets] = useState<Array<{ employeeName: string; day: number; date: string }>>([]);
  const [attendanceApplyToSelection, setAttendanceApplyToSelection] = useState(false);
  const [attendanceArrival, setAttendanceArrival] = useState("");
  const [attendanceDeparture, setAttendanceDeparture] = useState("");
  const [attendanceNote, setAttendanceNote] = useState("");

  // Load Preferences
  useEffect(() => {
    getShiftplanPreferences().then(prefs => {
      if (prefs.searchTerm !== undefined) setSearchTerm(prefs.searchTerm);
      if (prefs.showNightOnly !== undefined) setShowNightOnly(prefs.showNightOnly);
      if (prefs.showWeekendOnly !== undefined) setShowWeekendOnly(prefs.showWeekendOnly);
      if (prefs.showWarningsOnly !== undefined) setShowWarningsOnly(prefs.showWarningsOnly);
    });
  }, []);

  useEffect(() => {
    api.get("/app-settings")
      .then((res) => {
        const settings = res.data || {};
        setColoPool(parseColoPool(settings["shiftplan.colo_pool"]));
        let dispatcherPriorities = parseColoPool(settings["shiftplan.dispatcher_pool"]);
        let dispatcherEnabled = settings["shiftplan.dispatcher_enabled"] !== "false";
        setDispatcherConfig({ enabled: dispatcherEnabled, priorities: dispatcherPriorities });
        setIssuePanelEnabled(parseIssueToggleSetting(settings["shiftplan.issue_panel_enabled"], true));
        setIssueShowSolutions(parseIssueToggleSetting(settings["shiftplan.issue_show_solutions"], true));
        setSkillsEnabled(parseIssueToggleSetting(settings["shiftplan.skills_enabled"], false));
        const nextMode = settings["shiftplan.issue_priority_mode"];
        if (nextMode === "staffing_first" || nextMode === "balanced" || nextMode === "fairness_first") {
          setIssuePriorityMode(nextMode);
        }
        // Hour limits
        const dh = parseFloat(settings["shiftplan.max_daily_hours"]);
        const wh = parseFloat(settings["shiftplan.max_weekly_hours"]);
        setHourLimits({
          maxDailyHours: Number.isFinite(dh) ? dh : 10,
          maxWeeklyHours: Number.isFinite(wh) ? wh : 48,
          dailyMode: (settings["shiftplan.daily_mode"] as HourLimitsConfig['dailyMode']) || 'warn',
          weeklyMode: (settings["shiftplan.weekly_mode"] as HourLimitsConfig['weeklyMode']) || 'warn',
        });
      })
      .catch(() => {
        setIssuePanelEnabled(true);
        setIssueShowSolutions(true);
        setIssuePriorityMode("balanced");
        setSkillsEnabled(false);
      });
  }, []);

  // Load Hessen Holidays per year
  useEffect(() => {
    // Use frontend calculation for instant results (no backend call needed)
    setHolidayMap(getHessenHolidayMap(selectedYear, isGerman ? "de" : "en"));
  }, [isGerman, selectedYear]);

  // Save Preferences (Debounced for search?) 
  // For simplicity, save strictly when values change.
  useEffect(() => {
    const timer = setTimeout(() => {
      updateShiftplanPreferences({
        searchTerm,
        showNightOnly,
        showWeekendOnly,
        showWarningsOnly
      }).catch(err => console.error("Failed to save prefs", err));
    }, 1000);
    return () => clearTimeout(timer);
  }, [searchTerm, showNightOnly, showWeekendOnly, showWarningsOnly]);

  const cellKey = (employeeName: string, day: number) => `${employeeName}|||${day}`;
  const attendanceKey = (employeeName: string, date: string) => `${employeeName}|||${date}`;

  const canEdit = user.isAdmin && canWrite("shiftplan");

  const loadMonthAttendance = useCallback(async (year: number, monthIndex1: number, totalDays: number) => {
    try {
      const from = toIsoDate(year, monthIndex1, 1);
      const to = toIsoDate(year, monthIndex1, totalDays);
      const records = await fetchAttendance(from, to);
      const map: Record<string, AttendanceRecord> = {};
      for (const record of records) {
        const dateValue = String(record.date || "").split("T")[0];
        map[attendanceKey(record.employee_name, dateValue)] = record;
      }
      setAttendanceMap(map);
    } catch {
      setAttendanceMap({});
    }
  }, []);

  const applyAttendance = useCallback(async () => {
    if (!attendanceTarget) return;
    try {
      const targets = attendanceApplyToSelection && attendanceSelectionTargets.length > 0
        ? attendanceSelectionTargets
        : [attendanceTarget];

      const nextRecords: Record<string, AttendanceRecord> = {};
      for (const target of targets) {
        const result = await upsertAttendance({
          employee_name: target.employeeName,
          date: target.date,
          arrival_time: attendanceArrival || null,
          departure_time: attendanceDeparture || null,
          note: attendanceNote || null,
        });
        nextRecords[attendanceKey(target.employeeName, target.date)] = result;
      }

      setAttendanceMap((prev) => ({
        ...prev,
        ...nextRecords,
      }));
      setAttendanceOpen(false);
      toast.success(
        targets.length > 1
          ? (isGerman ? `Kommen/Gehen für ${targets.length} Einträge gespeichert.` : `Arrival/departure saved for ${targets.length} entries.`)
          : (isGerman ? "Kommen/Gehen gespeichert." : "Arrival/departure saved.")
      );
    } catch {
      toast.error(isGerman ? "Speichern fehlgeschlagen." : "Save failed.");
    }
  }, [attendanceApplyToSelection, attendanceArrival, attendanceDeparture, attendanceNote, attendanceSelectionTargets, attendanceTarget, isGerman]);

  /* ------------------------------------------------ */
  /* HELPERS                                         */
  /* ------------------------------------------------ */

  const activeMonthLabel = formatMonthLabel(
    selectedYear,
    selectedMonthIndex + 1,
    locale
  );

  const monthIndex1 = selectedMonthIndex + 1;

  const holidays = useMemo(() => getHessenHolidayMap(selectedYear, isGerman ? "de" : "en"), [isGerman, selectedYear]);
  const islamicHolidays = useMemo(() => getIslamicHolidayMap(selectedYear, isGerman ? "de" : "en"), [isGerman, selectedYear]);
  const absencesByEmployee = useMemo(() => {
    const grouped = new Map<string, Absence[]>();
    for (const absence of absences) {
      const employeeName = String(absence.employee_name || "").trim();
      if (!employeeName) continue;
      if (!grouped.has(employeeName)) grouped.set(employeeName, []);
      grouped.get(employeeName)!.push(absence);
    }
    return grouped;
  }, [absences]);

  const logShiftplanEvent = (action: string, details: Record<string, unknown> = {}) => {
    logActivityEventSafe({
      action,
      module: "SHIFTPLAN",
      details: {
        year: selectedYear,
        month: monthIndex1,
        viewMode,
        ...details,
      },
    });
  };

  const handleToggleHolidayOverlay = () => {
    const nextState = !showHolidayOverlay;
    logShiftplanEvent("SHIFTPLAN_HOLIDAYS_TOGGLE", { enabled: nextState });
    setShowHolidayOverlay(nextState);
  };

  const handleToggleWarnings = () => {
    const nextState = !warningsVisible;
    logShiftplanEvent("SHIFTPLAN_WARNINGS_TOGGLE", { enabled: nextState });
    setWarningsVisible(nextState);
  };

  const handleOpenWarningsDialog = () => {
    logShiftplanEvent("SHIFTPLAN_WARNINGS_DIALOG_OPEN", {});
    setWarningDialogOpen(true);
  };

  const handleToggleWellbeing = () => {
    const nextState = !wellbeingVisible;
    logShiftplanEvent("SHIFTPLAN_WELLBEING_TOGGLE", { enabled: nextState });
    setWellbeingVisible(nextState);
  };

  const handleToggleHiddenPanel = () => {
    const nextState = !hiddenPanelVisible;
    logShiftplanEvent("SHIFTPLAN_HIDDEN_PANEL_TOGGLE", { enabled: nextState, hiddenEmployees: hiddenEmployees.size });
    setHiddenPanelVisible(nextState);
  };

  const handleShiftplanYearChange = (delta: number) => {
    const nextYear = selectedYear + delta;
    logShiftplanEvent("SHIFTPLAN_YEAR_CHANGE", { nextYear });
    setSelectedYear(nextYear);
  };

  const handleShiftplanMonthSelect = (monthIndex: number) => {
    if (monthIndex === selectedMonthIndex) return;

    logShiftplanEvent("SHIFTPLAN_MONTH_SELECT", { nextMonth: monthIndex + 1 });
    setSelectedMonthIndex(monthIndex);

    if (viewMode === "year") {
      const el = document.getElementById(`shiftplan-month-${monthIndex + 1}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  useEffect(() => {
    let cancelled = false;

    api.get("/shift-config/planning-config")
      .then((res) => {
        if (cancelled) return;

        setDefaultTargetHours(normalizeTargetHours(res.data?.config?.monthly_target_hours, 174));
      })
      .catch(() => {
        if (cancelled) return;
        setDefaultTargetHours(174);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setEmployeeYearProgressLoading(true);

    fetchShiftHours(selectedYear)
      .then((response) => {
        if (cancelled) return;
        const next = new Map<string, ShiftHoursEmployee>();
        for (const entry of response.employees || []) {
          const key = String(entry.employee_name || "").trim();
          if (!key) continue;
          next.set(key, entry);
        }
        setEmployeeYearProgress(next);
      })
      .catch(() => {
        if (cancelled) return;
        setEmployeeYearProgress(new Map());
      })
      .finally(() => {
        if (!cancelled) setEmployeeYearProgressLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedYear]);

  const warningsComputed = useMemo(
    () => computeUnderstaffWarnings(schedule || {}, selectedYear, monthIndex1, daysInMonth),
    [schedule, selectedYear, monthIndex1, daysInMonth]
  );

  const warningsForMonthTable = warningsVisible ? warningsComputed : [];

  const warningsSummary = useMemo(() => {
    const night = warningsComputed.filter((w) => w.kind === "night");
    const late = warningsComputed.filter((w) => w.kind === "late");
    const early = warningsComputed.filter((w) => w.kind === "early");
    return { night, late, early, total: warningsComputed.length };
  }, [warningsComputed]);

  const issueInsights = useMemo(() => {
    const items: ShiftplanIssueInsight[] = [];

    warningsComputed.forEach((warning, index) => {
      const delta = Math.max((warning.target || 0) - (warning.actual || 0), 0);
      const shiftLabel = formatShiftTypeLabel(warning.kind, shiftTypeLabels);
      items.push({
        id: `warning-${index}`,
        source: "understaffing",
        severity: delta >= 2 || warning.actual === 0 ? "high" : "medium",
        title: isGerman ? "Unterbesetzung erkannt" : "Understaffing detected",
        detected: isGerman
          ? `${warning.label} am ${warning.dateKey}: ${shiftLabel} ist mit ${warning.actual}/${warning.target} besetzt.`
          : `${warning.label} on ${warning.dateKey}: ${shiftLabel} is staffed with ${warning.actual}/${warning.target}.`,
        solution: isGerman
          ? `Besetzung in ${shiftLabel} erhöhen, Reserve/DBS prüfen oder einen verfügbaren Mitarbeiter aus einer weniger kritischen Schicht verschieben.`
          : `Increase staffing in ${shiftLabel}, check reserve/DBS capacity, or move an available employee from a less critical shift.`,
        meta: isGerman ? `Soll ${warning.target}, Ist ${warning.actual}` : `Target ${warning.target}, actual ${warning.actual}`,
      });
    });

    staffingResults.filter((entry) => entry.status !== "OK").forEach((entry, index) => {
      items.push({
        id: `staffing-${index}`,
        source: "staffing",
        severity: entry.status === "FAIL" ? "high" : "medium",
        title: t("shiftplan.minStaffingViolated"),
        detected: isGerman
          ? `${entry.date}: ${formatShiftTypeLabel(entry.shift_type, shiftTypeLabels)} hat ${entry.actual}/${entry.min} Mitarbeiter.`
          : `${entry.date}: ${formatShiftTypeLabel(entry.shift_type, shiftTypeLabels)} has ${entry.actual}/${entry.min} employees.`,
        solution: t("shiftplan.minStaffingSolution"),
        meta: isGerman ? `Status ${entry.status}` : `Status ${entry.status}`,
      });
    });

    coverageViolations.forEach((entry, index) => {
      const missing = Object.entries(entry.missing || {})
        .filter(([, count]) => Number(count || 0) > 0)
        .map(([skill, count]) => `${skill.toUpperCase()}: ${count}`)
        .join(", ");

      items.push({
        id: `coverage-${index}`,
        source: "coverage",
        severity: "high",
        title: t("shiftplan.skillGapDetected"),
        detected: isGerman
          ? `${entry.date}: ${formatShiftTypeLabel(entry.shift_type, shiftTypeLabels)} fehlt Qualifikation ${missing || "unbekannt"}.`
          : `${entry.date}: ${formatShiftTypeLabel(entry.shift_type, shiftTypeLabels)} is missing skill ${missing || "unknown"}.`,
        solution: t("shiftplan.skillGapSolution"),
        meta: missing || t("shiftplan.skillGapMeta"),
      });
    });

    violations.forEach((entry, index) => {
      items.push({
        id: `validation-${index}`,
        source: "validation",
        severity: "medium",
        title: entry.violation_type === "REST_TIME"
          ? t("shiftplan.restTimeViolated")
          : t("shiftplan.hardTransitionDetected"),
        detected: isGerman
          ? `${entry.employee_name} am ${entry.date}: ${entry.details.msg}`
          : `${entry.employee_name} on ${entry.date}: ${entry.details.msg}`,
        solution: entry.violation_type === "REST_TIME"
          ? t("shiftplan.restTimeSolution")
          : t("shiftplan.hardTransitionSolution"),
        meta: `${entry.details.prev} -> ${entry.details.curr}`,
      });
    });

    absenceConflicts.forEach((entry, index) => {
      items.push({
        id: `absence-${index}`,
        source: "absence",
        severity: "high",
        title: isGerman ? "Abwesenheitskonflikt" : "Absence conflict",
        detected: isGerman
          ? `${entry.employee_name} am ${entry.date}: ${entry.details.msg}`
          : `${entry.employee_name} on ${entry.date}: ${entry.details.msg}`,
        solution: isGerman
          ? "Entweder Abwesenheit oder Schichteintrag anpassen und anschließend Staffing erneut berechnen."
          : "Adjust either the absence entry or the scheduled shift and then recalculate staffing.",
        meta: entry.details.shift_code,
      });
    });

    constraintViolations.forEach((entry, index) => {
      items.push({
        id: `constraint-${index}`,
        source: "constraint",
        severity: "medium",
        title: isGerman ? "Persönliche Restriktion verletzt" : "Personal constraint violated",
        detected: isGerman
          ? `${entry.employee_name}: ${entry.details?.msg || entry.constraint_key}`
          : `${entry.employee_name}: ${entry.details?.msg || entry.constraint_key}`,
        solution: isGerman
          ? "Schicht an die hinterlegte Mitarbeiterrestriktion anpassen oder die Restriktion fachlich aktualisieren."
          : "Adjust the shift to the stored employee constraint or update the constraint definition.",
        meta: entry.constraint_key,
      });
    });

    const sourceWeight: Record<IssuePriorityMode, Record<ShiftplanIssueInsight['source'], number>> = {
      staffing_first: { understaffing: 60, staffing: 55, coverage: 50, absence: 42, validation: 24, constraint: 20 },
      balanced: { understaffing: 50, staffing: 48, coverage: 44, absence: 40, validation: 32, constraint: 30 },
      fairness_first: { understaffing: 40, staffing: 38, coverage: 36, absence: 34, validation: 46, constraint: 44 },
    };

    return items
      .sort((left, right) => {
        const leftScore = (left.severity === "high" ? 100 : 60) + sourceWeight[issuePriorityMode][left.source];
        const rightScore = (right.severity === "high" ? 100 : 60) + sourceWeight[issuePriorityMode][right.source];
        return rightScore - leftScore;
      })
      .slice(0, 12);
  }, [warningsComputed, staffingResults, coverageViolations, violations, absenceConflicts, constraintViolations, issuePriorityMode]);

  const issueCounts = useMemo(() => {
    const high = issueInsights.filter((entry) => entry.severity === "high").length;
    return { high, total: issueInsights.length };
  }, [issueInsights]);

  const manualEmployeeNameSet = useMemo(() => {
    return new Set(
      manualEmployees
        .map((entry) => String(entry.employee_name || "").trim())
        .filter(Boolean)
    );
  }, [manualEmployees]);

  const employeeBadges = useMemo(() => {
    const badges: Record<string, Array<{ label: string; tone?: "success" | "warning" | "neutral" }>> = {};
    const signedInKey = String(user.displayName || "")
      .toLocaleLowerCase("de-DE")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .sort()
      .join(" ");

    for (const entry of manualEmployees) {
      const employeeName = String(entry.employee_name || "").trim();
      if (!employeeName) continue;
      badges[employeeName] = [{ label: isGerman ? "MANUELL" : "MANUAL", tone: "warning" }];
    }

    for (const employeeName of Object.keys(schedule || {})) {
      const employeeKey = employeeName
        .toLocaleLowerCase("de-DE")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(" ");
      if (signedInKey && employeeKey === signedInKey) {
        badges[employeeName] = [
          ...(badges[employeeName] || []),
          { label: isGerman ? "DEINE SCHICHT" : "YOUR SHIFT", tone: "success" },
        ];
      }
      if (isColoEmployee(employeeName, coloPool)) {
        badges[employeeName] = [
          ...(badges[employeeName] || []),
          { label: "COLO", tone: "success" },
        ];
      }
      if (dispatcherConfig.enabled && dispatcherConfig.priorities.length > 0) {
        const priorityIndex = dispatcherConfig.priorities.findIndex((entry) => isColoEmployee(employeeName, [entry]));
        const hasEarlyShift = Object.values(schedule?.[employeeName] || {}).some((code) => String(code || "").toUpperCase().startsWith("E"));
        const hasHigherPriorityEarly = Object.entries(schedule || {}).some(([otherName, plan]) => {
          const otherIndex = dispatcherConfig.priorities.findIndex((entry) => isColoEmployee(otherName, [entry]));
          return otherIndex >= 0 && otherIndex < priorityIndex && Object.values(plan || {}).some((code) => String(code || "").toUpperCase().startsWith("E"));
        });
        if (priorityIndex >= 0 && hasEarlyShift && !hasHigherPriorityEarly) {
          badges[employeeName] = [...(badges[employeeName] || []), { label: "DP", tone: "success" }];
        }
      }
    }

    return badges;
  }, [coloPool, dispatcherConfig, isGerman, manualEmployees, schedule, user.displayName]);

  const visibleSchedule = useMemo(() => {
    const out: Record<string, any> = {};
    const importedEntries: Array<[string, any]> = [];
    const manualEntries: Array<[string, any]> = [];
    const searchLower = searchTerm.toLowerCase();

    const safeSchedule = (schedule && typeof schedule === 'object') ? schedule : {};
    for (const [name, plan] of Object.entries(safeSchedule)) {
      if (!plan || typeof plan !== 'object' || Array.isArray(plan)) continue;
      if (hiddenEmployees.has(name)) continue;

      // [NEW] SEARCH FILTER
      if (searchTerm && !name.toLowerCase().includes(searchLower)) continue;

      // [NEW] WARNINGS FILTER (Only show employees with warnings?)
      if (showWarningsOnly) {
        const hasWarning = Array.isArray(warningsComputed) && warningsComputed.some(w => w.label === name);
        if (!hasWarning) continue;
      }

      if (showManualOnly && !manualEmployeeNameSet.has(name)) continue;

      const planTyped = plan as Record<number, string>;
      const shifts = Object.values(planTyped);

      if (showNightOnly) {
        const hasNight = shifts.some(s => s === 'N');
        if (!hasNight) continue;
      }

      if (showWeekendOnly) {
        let hasWeekendShift = false;
        for (const [dayKey, code] of Object.entries(planTyped)) {
          const d = Number(dayKey);
          const date = new Date(selectedYear, monthIndex1 - 1, d);
          const dow = date.getDay();
          if ((dow === 0 || dow === 6) && code && code !== 'FS' && code !== 'ABW') {
            hasWeekendShift = true;
            break;
          }
        }
        if (!hasWeekendShift) continue;
      }

      if (manualEmployeeNameSet.has(name)) manualEntries.push([name, plan]);
      else importedEntries.push([name, plan]);
    }

    importedEntries.sort((left, right) => left[0].localeCompare(right[0], locale));
    manualEntries.sort((left, right) => left[0].localeCompare(right[0], locale));

    for (const [name, plan] of [...importedEntries, ...manualEntries]) {
      out[name] = plan;
    }

    return out;
  }, [schedule, hiddenEmployees, searchTerm, showWarningsOnly, showNightOnly, showWeekendOnly, showManualOnly, warningsComputed, selectedYear, monthIndex1, manualEmployeeNameSet, locale]);

  // Employee hours calculation (always active)
  const employeeHours = useMemo(() => {
    const map = new Map<string, EmployeeMonthlyStats>();
    for (const [name, row] of Object.entries(visibleSchedule)) {
      const rowTyped = row as Record<number, string>;
      const stats = calculateEmployeeHours(
        name,
        rowTyped,
        selectedYear,
        monthIndex1,
        daysInMonth,
        holidays,
        hourLimits,
        defaultTargetHours,
        absencesByEmployee.get(name) || []
      );
      map.set(name, stats);
    }
    return map;
  }, [visibleSchedule, selectedYear, monthIndex1, daysInMonth, holidays, hourLimits, defaultTargetHours, absencesByEmployee]);

  /* ------------------------------------------------ */
  /* WELLBEING LOGIC (NEW)                            */
  /* ------------------------------------------------ */
  useEffect(() => {
    if (viewMode === "month") {
      wellbeingStore.loadConfig();
      wellbeingStore.loadMetrics(selectedYear, monthIndex1);
    }
  }, [selectedYear, monthIndex1, viewMode]);

  const wellbeingMetrics = wellbeingStore.getMetricsForMonth(selectedYear, monthIndex1);
  const topCriticalEmployees = useMemo(() => {
    if (!wellbeingMetrics) return [];
    return [...wellbeingMetrics]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .filter(m => m.score > 0);
  }, [wellbeingMetrics]);

  const handleComputeWellbeing = async () => {
    await wellbeingStore.computeMetrics(selectedYear, monthIndex1);
  };

  /* ------------------------------------------------ */
  /* DATA LOADING                                     */
  /* ------------------------------------------------ */

  // [NEW] Load Staffing Results
  const loadData = async (year: number, month: number) => {
    // Main month data fetch
    try {
      const label = formatMonthLabel(year, month, locale);
      const [
        violationsData,
        coverageViolationsData,
        staffingData,
        absencesData,
        conflictsData,
        constraintsData,
        constraintViolationsData
      ] = await Promise.all([
        fetchViolations(year, month).catch(e => { console.error("Violations failed", e); return []; }),
        fetchCoverageViolations(year, month).catch(e => { console.error("Coverage failed", e); return []; }),
        fetchStaffingResults(year, month).catch(e => { console.error("Staffing failed", e); return []; }),
        fetchAbsences(year, month).catch(e => { console.error("Absences failed", e); return []; }),
        fetchAbsenceConflicts(year, month).catch(e => { console.error("Absence conflicts failed", e); return []; }),
        fetchConstraints().catch(e => { console.error("Constraints failed", e); return {}; }),
        fetchConstraintViolations(label).catch(e => { console.error("Constraint violations failed", e); return []; })
      ]);

      setViolations(Array.isArray(violationsData) ? violationsData : []);
      setCoverageViolations(Array.isArray(coverageViolationsData) ? coverageViolationsData : []);
      setStaffingResults(Array.isArray(staffingData) ? staffingData : []);
      setAbsences(Array.isArray(absencesData) ? absencesData : []);
      setAbsenceConflicts(Array.isArray(conflictsData) ? conflictsData : []);
      setConstraintsMap(constraintsData);
      setConstraintViolations(Array.isArray(constraintViolationsData) ? constraintViolationsData : []);
    } catch (err) {
      console.error("Error loading month data:", err);
    }
  };

  // Load Violations when year/month changes
  useEffect(() => {
    if (viewMode === "month") {
      fetchViolations(selectedYear, selectedMonthIndex + 1)
        .then(v => setViolations(Array.isArray(v) ? v : []))
        .catch(err => console.error("Violations Load Error:", err));

      loadData(selectedYear, selectedMonthIndex + 1);
    }
  }, [selectedYear, selectedMonthIndex, viewMode]);

  // [NEW] Load Skills if toggle is ON
  useEffect(() => {
    if (showSkills) {
      fetchSkills().then(list => {
        const map = new Map<string, EmployeeSkills>();
        for (const s of list) map.set(s.employee_name, s);
        setEmployeeSkills(map);
      });
    }
  }, [showSkills]);

  // Month list is managed by useShiftplanActions; seed it on mount.
  useEffect(() => { refreshMonths(); }, []);

  useEffect(() => {
    if (viewMode !== "month") return;
    const cached = shiftStore.schedulesByMonth?.[activeMonthLabel];
    if (cached && Object.keys(cached).length > 0) {
      setSchedule(cached);
      const days = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
      setDaysInMonth(days);
      shiftStore.setDaysInMonth(days);
    }
    setManualEmployees([]);
    loadSchedule(activeMonthLabel);
  }, [viewMode, selectedYear, selectedMonthIndex]);

  const loadSchedule = async (monthLabel: string) => {
    try {
      setLoading(true);
      setIsEditMode(false);
      setIsDirty(false);
      clearSelection();

      const data = await fetchSchedule(monthLabel);
      const sched = (data && typeof data === 'object' && data.schedule) ? data.schedule : {};
      const meta = (data && typeof data === 'object') ? data.meta : null;
      const manual = Array.isArray((data as any)?.manualEmployees)
        ? (data as any).manualEmployees as ManualShiftplanEmployee[]
        : [];

      setSchedule(sched);
      setManualEmployees(manual);
      shiftStore.setSchedule(monthLabel, sched);
      shiftStore.setSelectedMonth(monthLabel);

      if (meta && typeof meta === 'object' && meta.year && meta.month) {
        const days = new Date(meta.year, meta.month, 0).getDate();
        setDaysInMonth(days);
        shiftStore.setDaysInMonth(days);
      } else {
        setDaysInMonth(31);
        shiftStore.setDaysInMonth(31);
      }
    } catch (err) {
      console.error("LOAD SCHEDULE ERROR:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadYear = async (yearToLoad: number) => {
    try {
      setYearLoading(true);
      const out: Record<string, Record<string, any>> = {};
      const tasks = Array.from({ length: 12 }).map(async (_, idx) => {
        const label = formatMonthLabel(yearToLoad, idx + 1, locale);
        try {
          const data = await fetchSchedule(label);
          out[label] = data?.schedule || {};
        } catch (e) {
          out[label] = {};
        }
      });
      await Promise.all(tasks);
      setYearSchedules(out);
    } finally {
      setYearLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode !== "year") return;
    setIsEditMode(false);
    setIsDirty(false);
    clearSelection();
    setEditOpen(false);
    loadYear(selectedYear);
  }, [viewMode, selectedYear]);

  useEffect(() => {
    if (viewMode !== "month") return;
    const totalDays = new Date(selectedYear, selectedMonthIndex + 1, 0).getDate();
    void loadMonthAttendance(selectedYear, selectedMonthIndex + 1, totalDays);
  }, [loadMonthAttendance, selectedMonthIndex, selectedYear, viewMode]);

  /* ------------------------------------------------ */
  /* INTERACTIONS                                     */
  /* ------------------------------------------------ */

  const toggleEditMode = () => {
    if (!canEdit) return;
    setIsEditMode((prev) => {
      const next = !prev;
      if (!next) {
        clearSelection();
        setEditOpen(false);
        setContextMenu(null);
      }
      return next;
    });
  };

  const handleCellClick = (employeeName: string, day: number, modifiers: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    selectCell(employeeName, day, modifiers);
    setContextMenu(null);
  };

  const handleCellContextMenu = (e: React.MouseEvent, args: { employeeName: string; day: number; current: string }) => {
    e.preventDefault(); // Ensure native menu is prevented
    if (!isSelected(args.employeeName, args.day)) {
      selectCell(args.employeeName, args.day, { shiftKey: false, ctrlKey: false, metaKey: false });
    }
    // Align menu to the row's top edge (not cursor Y) to prevent visual downward shift.
    // clientX stays as-is (horizontal = cursor position is fine).
    const rowTop = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setContextMenu({ x: e.clientX, y: rowTop, employeeName: args.employeeName });
  };

  const applyShiftChange = async (value: string) => {
    const keys = getSelectedKeys();
    if (!keys.size) return;

    // [NEW] ABESENCE HANDLING
    if (value === "HISTORY") {
      // Pick the first employee from selection
      const keysArr = Array.from(keys);
      if (keysArr.length > 0) {
        const [emp] = keysArr[0].split("|||");
        setHistoryTarget(emp);
        setHistoryOpen(true);
      }
      setContextMenu(null);
      return;
    }

    if (value === "CONSTRAINTS") {
      const keysArr = Array.from(keys);
      if (keysArr.length > 0) {
        const [emp] = keysArr[0].split("|||");
        setConstraintsTarget(emp);
        setConstraintsOpen(true);
      }
      setContextMenu(null);
      return;
    }

    if (value === "COMPETENCIES") {
      const keysArr = Array.from(keys);
      const emp = keysArr.length > 0
        ? keysArr[0].split("|||")[0]
        : (contextMenu as any)?.employeeName ?? "";
      if (emp) {
        setCompetencyTarget(emp);
        setCompetencyOpen(true);
      }
      setContextMenu(null);
      return;
    }

    if (value.startsWith("ABSENCE:")) {
      const type = value.split(":")[1] as any; // VACATION, SICK...

      // Group by Employee
      const empMap = new Map<string, number[]>();
      for (const k of keys) {
        const [employeeName, dayRaw] = k.split("|||");
        const day = Number(dayRaw);
        if (!employeeName || !Number.isFinite(day)) continue;
        const list = empMap.get(employeeName) ?? [];
        list.push(day);
        empMap.set(employeeName, list);
      }

      if (!window.confirm(`Abwesenheit (${type}) für ${empMap.size} Mitarbeiter erstellen?`)) {
        setContextMenu(null);
        return;
      }

      setLoading(true);
      try {
        for (const [emp, days] of empMap.entries()) {
          // Find continuous ranges? For simplicity, we take min and max day and claim the whole range.
          // Or strictly creates multiple if gaps? 
          // Implementation Plan Assumption: "Create Absence ... Type and End Date (Start matches clicked cell)".
          // Use selection range.
          if (days.length === 0) continue;
          days.sort((a, b) => a - b);

          // Simple approach: One absence from Min to Max.
          // Ideally we check for gaps, but user typically selects a range.
          const minDay = days[0];
          const maxDay = days[days.length - 1];

          const startDate = new Date(Date.UTC(selectedYear, selectedMonthIndex, minDay)).toISOString().split('T')[0];
          const endDate = new Date(Date.UTC(selectedYear, selectedMonthIndex, maxDay)).toISOString().split('T')[0];

          await createAbsence({
            employee_name: emp,
            start_date: startDate,
            end_date: endDate,
            type,
            note: "Via Context Menu"
          });
        }

        // Reload Absences
        alert("Abwesenheit erstellt!");
        const freshAbsences = await fetchAbsences(selectedYear, selectedMonthIndex + 1);
        setAbsences(freshAbsences);
        // Reload Conflicts
        const freshConflicts = await fetchAbsenceConflicts(selectedYear, selectedMonthIndex + 1);
        setAbsenceConflicts(freshConflicts);

      } catch (err) {
        console.error(err);
        alert("Fehler beim Erstellen der Abwesenheit");
      } finally {
        setLoading(false);
        setContextMenu(null);
        clearSelection();
      }
      return;
    }

    if (value === "ATTENDANCE") {
      const keysArr = Array.from(keys);
      if (keysArr.length > 0) {
        const targets = keysArr
          .map((raw) => {
            const [employeeName, dayRaw] = raw.split("|||");
            const day = Number(dayRaw);
            if (!employeeName || !Number.isFinite(day)) return null;
            return {
              employeeName,
              day,
              date: toIsoDate(selectedYear, selectedMonthIndex + 1, day),
            };
          })
          .filter((entry): entry is { employeeName: string; day: number; date: string } => Boolean(entry));

        if (targets.length > 0) {
          const primary = targets[0];
          const existing = attendanceMap[attendanceKey(primary.employeeName, primary.date)];
          setAttendanceSelectionTargets(targets);
          setAttendanceApplyToSelection(targets.length > 1);
          setAttendanceTarget(primary);
          setAttendanceArrival(existing?.arrival_time?.substring(0, 5) || "");
          setAttendanceDeparture(existing?.departure_time?.substring(0, 5) || "");
          setAttendanceNote(existing?.note || "");
          setAttendanceOpen(true);
        }
      }
      setContextMenu(null);
      return;
    }

    if (!window.confirm(`Möchten Sie die Änderung für ${keys.size} ${keys.size === 1 ? 'Eintrag' : 'Einträge'} übernehmen?`)) {
      setContextMenu(null);
      return;
    }

    setSchedule((prev: any) => {
      const next = { ...(prev || {}) };
      for (const k of keys) {
        const [employeeName, dayRaw] = k.split("|||");
        const day = Number(dayRaw);
        if (!employeeName || !Number.isFinite(day)) continue;
        const row = { ...(next[employeeName] || {}) };
        if (!value || value === "") delete row[day];
        else row[day] = value;
        next[employeeName] = row;
      }
      shiftStore.setSchedule(activeMonthLabel, next);
      return next;
    });
    setIsDirty(true);
    setContextMenu(null);
  };

  const applyEdit = () => {
    if (!editTarget) return;
    const { employeeName, day } = editTarget;
    setSchedule((prev: any) => {
      const next = { ...(prev || {}) };
      const row = { ...(next[employeeName] || {}) };
      const value = String(editValue || "").trim().toUpperCase();
      if (!value || value === EMPTY) delete row[day];
      else row[day] = value;
      next[employeeName] = row;
      shiftStore.setSchedule(activeMonthLabel, next);
      return next;
    });
    setIsDirty(true);
    setEditOpen(false);
  };

  const handleCreateManualEmployee = async () => {
    if (!canEdit || manualEmployeesSaving) return;

    const employeeName = manualEmployeeDraft.trim().replace(/\s+/g, " ");
    if (!employeeName) return;

    try {
      setManualEmployeesSaving(true);
      const response = await createManualShiftplanEmployee(activeMonthLabel, employeeName);
      const createdEmployee = (response?.employee as ManualShiftplanEmployee | undefined) ?? { employee_name: employeeName };
      const normalizedName = String(createdEmployee.employee_name || employeeName).trim();

      setManualEmployees((prev) => {
        const next = [...prev.filter((entry) => entry.employee_name !== normalizedName), createdEmployee];
        next.sort((left, right) => String(left.employee_name || "").localeCompare(String(right.employee_name || ""), locale));
        return next;
      });

      setSchedule((prev) => {
        if (prev?.[normalizedName]) return prev;
        const next = { ...(prev || {}), [normalizedName]: {} };
        shiftStore.setSchedule(activeMonthLabel, next);
        return next;
      });

      setManualEmployeeDraft("");
      toast.success(isGerman ? "Manueller Mitarbeiter angelegt" : "Manual employee created");
    } catch (err) {
      console.error("MANUAL EMPLOYEE CREATE ERROR:", err);
      toast.error(isGerman ? "Manueller Mitarbeiter konnte nicht angelegt werden" : "Failed to create manual employee");
    } finally {
      setManualEmployeesSaving(false);
    }
  };

  const handleDeleteManualEmployee = async (employeeName: string) => {
    if (!canEdit || manualEmployeesSaving) return;

    const confirmed = window.confirm(
      isGerman
        ? `Manuellen Mitarbeiter "${employeeName}" wirklich löschen?`
        : `Delete manual employee "${employeeName}"?`
    );
    if (!confirmed) return;

    try {
      setManualEmployeesSaving(true);
      await deleteManualShiftplanEmployee(activeMonthLabel, employeeName);

      setManualEmployees((prev) => prev.filter((entry) => entry.employee_name !== employeeName));
      setSchedule((prev) => {
        const next = { ...(prev || {}) };
        delete next[employeeName];
        shiftStore.setSchedule(activeMonthLabel, next);
        return next;
      });

      if (hiddenEmployees.has(employeeName)) {
        unhideEmployee(employeeName);
      }

      clearSelection();
      setContextMenu(null);
      toast.success(isGerman ? "Manueller Mitarbeiter gelöscht" : "Manual employee deleted");
    } catch (err) {
      console.error("MANUAL EMPLOYEE DELETE ERROR:", err);
      toast.error(isGerman ? "Manueller Mitarbeiter konnte nicht gelöscht werden" : "Failed to delete manual employee");
    } finally {
      setManualEmployeesSaving(false);
    }
  };

  const saveChanges = async () => {
    if (!canEdit) return;
    if (!isDirty) return;
    try {
      setLoading(true);
      await importSchedule(activeMonthLabel, schedule, { preserveManualEmployees: true });

      // [NEW] Trigger Wellbeing Compute
      if (wellbeingVisible) {
        await wellbeingStore.computeMetrics(selectedYear, monthIndex1);
      }

      // [NEW] Trigger Shift Validation
      validateShiftplan(selectedYear, monthIndex1)
        .then(res => {
          if (res.success) setViolations(res.violations);
        })
        .catch(err => console.error("Validation Error:", err));

      // [NEW] Recompute Staffing
      recomputeStaffing(selectedYear, monthIndex1)
        .then(() => fetchStaffingResults(selectedYear, monthIndex1))
        .then(setStaffingResults)
        .catch(err => console.error("Staffing Recompute Error:", err));

      shiftStore.setSchedule(activeMonthLabel, schedule);
      setIsDirty(false);
      toast.success(t("shiftplan.changesSaved"));
    } catch (err) {
      console.error("SAVE ERROR:", err);
      toast.error(t("shiftplan.saveFailed"));
    } finally {
      setLoading(false);
    }
  };

  /* ------------------------------------------------ */
  /* RENDER                                           */
  /* ------------------------------------------------ */

  // REMOVED: h-[calc(100vh-20px)] overflow-hidden => allowed page scroll
  return (
    <EnterprisePageShell className="shiftplan-enterprise pb-20">
      {/* HEADER */}
      <EnterpriseHeader
        title={t("shiftplan.title")}
        icon={<Calendar className="w-5 h-5 text-indigo-400" />}
        rightContent={
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex flex-wrap items-center gap-1.5" aria-label="Farblegende Schichten">
              {SHIFT_COLOR_LEGEND.map((item) => <span key={item.kind} style={getShiftKindStyle(item.kind)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold"><strong>{item.code}</strong><span className="hidden 2xl:inline">{item.label}</span></span>)}
            </div>
            <div className="theme-divider mx-1 h-5 w-px" />
            {/* FEIERTAGE BUTTON: left-click toggles overlay, right-click shows list */}
            <div className="relative">
              <Button
                variant={showHolidayOverlay ? "default" : "secondary"}
                size="sm"
                className={`h-7 px-3 text-[11px] font-bold tracking-wider uppercase ${showHolidayOverlay ? 'bg-indigo-600/80 hover:bg-indigo-600 text-white border-transparent' : 'theme-toolbar-button border border-border bg-background/85 text-foreground shadow-sm hover:bg-accent'}`}
                onClick={handleToggleHolidayOverlay}
                onContextMenu={(e) => { e.preventDefault(); setHolidayListOpen(true); }}
                title={t("shiftplan.holidayTooltip")}
              >
                {showHolidayOverlay ? t("shiftplan.holidaysOn") : t("shiftplan.holidays")}
              </Button>
            </div>

            <div className="theme-divider mx-1 h-5 w-px" />

            <Button
              variant={warningsVisible ? "default" : "secondary"}
              size="sm"
              className={`h-7 px-3 text-[11px] font-bold tracking-wider uppercase ${warningsVisible ? 'bg-red-500/80 hover:bg-red-500 text-white border-transparent' : 'theme-toolbar-button border border-border bg-background/85 text-foreground shadow-sm hover:bg-accent'}`}
              onClick={handleToggleWarnings}
              onContextMenu={(event) => {
                event.preventDefault();
                handleOpenWarningsDialog();
              }}
              title={t("shiftplan.warningsTooltip")}
            >
              {warningsVisible ? t("shiftplan.warningsOn") : t("shiftplan.warnings")}
            </Button>

            <Button
              variant={hiddenPanelVisible ? "default" : "secondary"}
              size="sm"
              className={`h-7 px-3 text-[11px] font-bold tracking-wider uppercase ${hiddenPanelVisible ? 'bg-sky-600/80 hover:bg-sky-600 text-white border-transparent' : 'theme-toolbar-button border border-border bg-background/85 text-foreground shadow-sm hover:bg-accent'}`}
              onClick={handleToggleHiddenPanel}
            >
              {hiddenPanelVisible ? `${t("shiftplan.hiddenOn")}: ${hiddenEmployees.size}` : `${t("shiftplan.hidden")} (${hiddenEmployees.size})`}
            </Button>

            {canEdit && (
              <>
                <div className="theme-divider mx-1 h-5 w-px" />
                <Button
                  size="sm"
                  className="h-7 px-3 text-[11px] font-bold tracking-wider uppercase bg-green-600/80 hover:bg-green-600 text-white disabled:opacity-50"
                  onClick={saveChanges}
                  disabled={!isDirty || loading}
                >
                  {t("common.save")}
                </Button>
              </>
            )}

            <div className="theme-divider mx-1 h-5 w-px" />

            {user.isAdmin && (
              <ShiftImportDialog
                onImportSuccess={() => {
                  if (viewMode === "year") loadYear(selectedYear);
                  else loadSchedule(activeMonthLabel);
                  refreshMonths();
                }}
              />
            )}
          </div>
        }
      />

      <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950 p-5 shadow-sm">
        <div className="relative overflow-hidden rounded-lg border border-slate-700 bg-slate-900 px-5 py-5">
          <div className="relative grid gap-5 lg:grid-cols-[1.35fr_0.95fr] lg:items-end">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                {isGerman ? "Planungszentrale" : "Planning Deck"}
              </div>
              <h2 className="mt-3 text-[32px] font-bold tracking-tight text-white">
                {activeMonthLabel}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300/88">
                {isGerman
                  ? "Monatsplanung, Warnlagen und operative Eingriffe liegen in einer kompakten Steuerbuehne vor dir."
                  : "Monthly planning, warning pressure and operational interventions are unified in one control stage."}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-200/48">{isGerman ? "Mitarbeiter" : "Crew"}</div>
                <div className="mt-2 text-sm font-black text-white">{Object.keys(visibleSchedule).length}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-200/48">{isGerman ? "Risiken" : "Risks"}</div>
                <div className="mt-2 text-sm font-black text-white">{issueCounts.total}</div>
              </div>
              <div className="rounded-lg border border-slate-700 bg-slate-800/70 px-4 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-indigo-200/48">{isGerman ? "Manuell" : "Manual"}</div>
                <div className="mt-2 text-sm font-black text-white">{manualEmployees.length}</div>
              </div>
            </div>
          </div>
          <div className="mt-5 grid gap-3">
            <div className="rounded-lg border border-slate-700 bg-slate-950/60 px-4 py-4">
              <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">{isGerman ? "Signalstatus" : "Signal state"}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center rounded-full border border-amber-400/22 bg-amber-500/10 px-3 py-1 text-[11px] font-semibold text-amber-100">{warningsComputed.length} {isGerman ? "Warnungen" : "warnings"}</span>
                <span className="inline-flex items-center rounded-full border border-rose-400/22 bg-rose-500/10 px-3 py-1 text-[11px] font-semibold text-rose-100">{issueCounts.high} {isGerman ? "kritisch" : "critical"}</span>
                <span className="inline-flex items-center rounded-full border border-cyan-400/22 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold text-cyan-100">{hiddenEmployees.size} {isGerman ? "ausgeblendet" : "hidden"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PLAN VIEW ── */}
      {(<>

      {/* MONTH NAVIGATION */}
      <EnterpriseCard className="theme-glass-panel relative flex items-center justify-center px-4! py-2!" noPadding={false}>
        <div className="theme-glass-inset absolute left-4 flex items-center gap-2 rounded-md border p-1">
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => handleShiftplanYearChange(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-12 text-center text-sm font-bold text-foreground">{selectedYear}</span>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => handleShiftplanYearChange(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar mask-gradient-x">
          {Array.from({ length: 12 }).map((_, idx) => {
            const label = formatMonthLabel(selectedYear, idx + 1, locale);
            const active = idx === selectedMonthIndex;
            const hasData = monthsWithData.includes(label);

            return (
              <button
                key={idx}
                onClick={() => handleShiftplanMonthSelect(idx)}
                className={`
                            px-4 py-1.5 text-[11px] rounded-md transition-all font-bold uppercase tracking-wider whitespace-nowrap border
                            ${active
                    ? "bg-indigo-600/90 text-white shadow-sm border-indigo-500"
                    : hasData
                      ? "text-emerald-400/90 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20"
                      : "text-red-400/90 border-red-500/30 bg-red-500/10 hover:bg-red-500/20"
                  }
                          `}
              >
                {label.split(" ")[0]}
              </button>
            );
          })}
        </div>
      </EnterpriseCard>

      {false && viewMode === "month" && (
        <EnterpriseCard className="theme-glass-panel relative overflow-hidden">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-amber-300/80">
                <Users className="h-4 w-4" />
                {isGerman ? "Manuelle Mitarbeiter" : "Manual employees"}
              </div>
              <h3 className="text-base font-semibold text-foreground">
                {isGerman ? "Azubis, Praktikanten und Zusatzkräfte separat vom Excel pflegen" : "Manage trainees, interns, and extra staff separately from Excel"}
              </h3>
              <p className="max-w-3xl text-sm text-muted-foreground">
                {isGerman
                  ? "Diese Mitarbeiter bleiben als eigene Quelle im Dienstplan bestehen und werden beim Excel-Import nicht überschrieben."
                  : "These employees stay as a separate source inside the shiftplan and are not overwritten by Excel imports."}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  variant={showManualOnly ? "default" : "secondary"}
                  className={`h-8 px-3 text-[11px] font-bold uppercase tracking-[0.22em] ${showManualOnly ? "bg-amber-500/85 text-slate-950 hover:bg-amber-400" : "border border-amber-400/20 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"}`}
                  onClick={() => setShowManualOnly((current) => !current)}
                >
                  {showManualOnly
                    ? (isGerman ? "Nur manuelle Mitarbeiter aktiv" : "Manual-only filter active")
                    : (isGerman ? "Nur manuelle Mitarbeiter" : "Manual employees only")}
                </Button>
              </div>
            </div>

            {canEdit && (
              <div className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
                <Input
                  value={manualEmployeeDraft}
                  onChange={(event) => setManualEmployeeDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void handleCreateManualEmployee();
                    }
                  }}
                  placeholder={isGerman ? "Name für manuellen Mitarbeiter eingeben" : "Enter a manual employee name"}
                  className="h-9 bg-background/75 text-sm"
                  disabled={manualEmployeesSaving}
                />
                <Button
                  type="button"
                  className="h-9 shrink-0 bg-amber-500/85 font-bold text-slate-950 hover:bg-amber-400"
                  onClick={() => void handleCreateManualEmployee()}
                  disabled={manualEmployeesSaving || !manualEmployeeDraft.trim()}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  {isGerman ? "Manuell anlegen" : "Add manual employee"}
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            {manualEmployees.length > 0 ? (
              manualEmployees.map((entry) => {
                const employeeName = String(entry.employee_name || "").trim();
                return (
                  <div
                    key={employeeName}
                    className="flex items-center gap-2 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-sm shadow-[0_18px_38px_rgba(245,158,11,0.08)]"
                  >
                    <span className="font-semibold text-foreground">{employeeName}</span>
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.22em] text-amber-200">
                      {isGerman ? "MANUELL" : "MANUAL"}
                    </span>
                    {canEdit && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-full text-muted-foreground hover:bg-red-500/10 hover:text-red-300"
                        onClick={() => void handleDeleteManualEmployee(employeeName)}
                        disabled={manualEmployeesSaving}
                        title={isGerman ? "Manuellen Mitarbeiter löschen" : "Delete manual employee"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="rounded-2xl border border-dashed border-white/12 bg-white/3 px-4 py-3 text-sm text-muted-foreground">
                {isGerman
                  ? "Noch keine manuellen Mitarbeiter für diesen Monat angelegt."
                  : "No manual employees have been created for this month yet."}
              </div>
            )}
          </div>
        </EnterpriseCard>
      )}

      {/* PANELS */}
      {
        hiddenPanelVisible && (
          <div className="flex flex-col gap-4">
            {/* WELLBEING / FAIRNESS PANEL */}
            {false && wellbeingVisible && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-blue-400">Wellbeing</h3>
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={handleComputeWellbeing} disabled={wellbeingStore.loading}>
                      {wellbeingStore.loading ? <RefreshCw className="animate-spin w-3 h-3" /> : <RefreshCw className="w-3 h-3" />}
                      <span className="ml-1">Aktualisieren</span>
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Grenzwerte: Nacht {wellbeingStore.config?.night_threshold || 4},
                    WE {wellbeingStore.config?.weekend_threshold || 2},
                    Streak {wellbeingStore.config?.streak_threshold || 7}
                  </div>
                </div>

                {/* TOP CRITICAL EMPLOYEES */}
                {topCriticalEmployees.length > 0 ? (
                  <div className="space-y-1">
                    {topCriticalEmployees.map((emp) => (
                      <div key={emp.employee_name} className="flex items-center justify-between bg-background/50 p-2 rounded text-sm">
                        <span className="font-medium">{emp.employee_name}</span>
                        <div className="flex items-center gap-2 text-xs">
                          {emp.night_count > (wellbeingStore.config?.night_threshold || 4) && (
                            <span className="bg-red-500/20 text-red-500 px-1 rounded">{emp.night_count} Nacht</span>
                          )}
                          {emp.weekend_count > (wellbeingStore.config?.weekend_threshold || 2) && (
                            <span className="bg-orange-500/20 text-orange-500 px-1 rounded">{emp.weekend_count} WE</span>
                          )}
                          {emp.max_streak > (wellbeingStore.config?.streak_threshold || 7) && (
                            <span className="bg-yellow-500/20 text-yellow-500 px-1 rounded">{emp.max_streak} Streak</span>
                          )}
                          <span className="font-bold text-blue-300">Score: {emp.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-green-400">Alles im grünen Bereich!</div>
                )}
              </div>
            )}

            {hiddenPanelVisible && (
              <div className="bg-secondary/20 border rounded-xl p-3 flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm">Ausgeblendet:</span>
                {Array.from(hiddenEmployees).map(name => (
                  <span key={name} className="px-2 py-0.5 bg-background rounded border text-xs flex items-center gap-1">
                    {name}
                    <button className="hover:text-red-400" onClick={() => unhideEmployee(name)}>×</button>
                  </span>
                ))}
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={unhideAll}>Alle zeigen</Button>
              </div>
            )}
          </div>
        )
      }

      {/* MAIN CONTENT */}
      <EnterpriseCard noPadding className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {viewMode === "month" && (
          <>
            <div className="flex-1 min-h-0 relative">
              <ShiftplanTable
                schedule={visibleSchedule}
                daysInMonth={daysInMonth}
                loading={loading}
                year={selectedYear}
                monthIndex1={selectedMonthIndex + 1}
                holidays={showHolidayOverlay ? holidays as any : {}}
                warnings={warningsForMonthTable}
                isEditMode={isEditMode}
                onCellClick={handleCellClick}
                selectedCells={getSelectedKeys()}
                onCellContextMenu={handleCellContextMenu}
                onHideEmployee={hideEmployee}
                employeeBadges={employeeBadges}
                employeeHours={employeeHours}
                employeeYearProgress={employeeYearProgress}
                employeeYearProgressLoading={employeeYearProgressLoading}
                highlightRequest={highlightRequest}
                // [NEW] Pass metrics
                // [NEW] Coverage Props
                showSkillsOverlay={showSkills && skillsEnabled}
                employeeSkills={employeeSkills}
                coverageViolations={coverageViolations}
                // [NEW] Staffing
                staffingResults={staffingResults}
                // [NEW] Absences
                absences={absences}
                absenceConflicts={absenceConflicts}
                constraintsMap={constraintsMap}
                constraintViolations={constraintViolations}
                attendanceMap={attendanceMap}
              />
              {contextMenu && (
                <ShiftContextMenu
                  x={contextMenu!.x}
                  y={contextMenu!.y}
                  employeeName={contextMenu!.employeeName || ""} // [NEW] Pass Name
                  selectedCount={getSelectedKeys().size}
                  onClose={() => setContextMenu(null)}
                  onSelect={applyShiftChange}
                />
              )}
            </div>
          </>
        )}
        {viewMode === "year" && (
          <div className="flex-1 overflow-auto p-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {/* Placeholder for Year View */}
              <div className="col-span-full text-center text-muted-foreground py-20">
                Jahresübersicht Implementierung folgt...
              </div>
            </div>
          </div>
        )}
      </EnterpriseCard>

      </>)}

      <Dialog open={holidayListOpen} onOpenChange={setHolidayListOpen}>
        <DialogContent className="theme-modal-surface max-w-2xl border border-indigo-500/30 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
          <DialogHeader>
            <DialogTitle>{isGerman ? `Feiertage Hessen und islamische Feiertage ${selectedYear}` : `Public and Islamic holidays Hesse ${selectedYear}`}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-2 overflow-auto pr-1">
            {Object.entries(holidayMap).length > 0 ? (
              Object.entries(holidayMap)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, name]) => (
                  <div key={date} className="theme-glass-inset flex items-center justify-between gap-3 rounded-xl border border-indigo-500/20 px-3 py-2 text-sm">
                    <span className="font-mono text-indigo-700 dark:text-indigo-300">{date.slice(5).split('-').reverse().join('.')}</span>
                    <span className="font-medium text-foreground">{name}</span>
                  </div>
                ))
            ) : (
              <div className="theme-glass-inset rounded-xl border px-4 py-6 text-sm text-muted-foreground">
                {t("shiftplan.noHolidays")}
              </div>
            )}
            <div className="mt-5 border-t border-border pt-4">
              <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
                {isGerman ? "Islamische Feiertage und Ramadan (ungefähre Termine)" : "Islamic holidays and Ramadan (approximate dates)"}
              </div>
              {Object.entries(islamicHolidays).length > 0 ? Object.entries(islamicHolidays)
                .sort((a, b) => a[0].localeCompare(b[0]))
                .map(([date, name]) => (
                  <div key={`islamic-${date}`} className="theme-glass-inset flex items-center justify-between gap-3 rounded-xl border border-emerald-500/20 px-3 py-2 text-sm">
                    <span className="font-mono text-emerald-700 dark:text-emerald-300">{date.slice(5).split('-').reverse().join('.')}</span>
                    <span className="font-medium text-foreground">{name}</span>
                  </div>
                )) : <div className="theme-glass-inset rounded-xl border px-4 py-3 text-sm text-muted-foreground">{isGerman ? "Für dieses Jahr sind keine Termine hinterlegt." : "No dates are available for this year."}</div>}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={warningDialogOpen} onOpenChange={setWarningDialogOpen}>
        <DialogContent className="theme-modal-surface max-w-4xl border border-red-500/30 text-foreground shadow-[0_24px_80px_rgba(0,0,0,0.75)]">
          <DialogHeader>
            <DialogTitle>{isGerman ? "Warnungsdetails für " : "Warning details for "}{formatMonthLabel(selectedYear, selectedMonthIndex + 1, locale)}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-red-700/80 dark:text-red-200/70">{t("common.total")}</div>
              <div className="mt-2 text-2xl font-semibold text-red-700 dark:text-red-100">{warningsSummary.total}</div>
            </div>
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-blue-700/80 dark:text-blue-200/70">{shiftTypeLabels.early}</div>
              <div className="mt-2 text-2xl font-semibold text-blue-700 dark:text-blue-100">{warningsSummary.early.length}</div>
            </div>
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-amber-700/80 dark:text-amber-200/70">{shiftTypeLabels.late}</div>
              <div className="mt-2 text-2xl font-semibold text-amber-700 dark:text-amber-100">{warningsSummary.late.length}</div>
            </div>
            <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 px-4 py-3">
              <div className="text-[11px] uppercase tracking-[0.18em] text-violet-700/80 dark:text-violet-200/70">{shiftTypeLabels.night}</div>
              <div className="mt-2 text-2xl font-semibold text-violet-700 dark:text-violet-100">{warningsSummary.night.length}</div>
            </div>
          </div>
          <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
            {warningsComputed.length > 0 ? (
              warningsComputed.map((warning, index) => (
                <div key={`${warning.dateKey}-${warning.kind}-${warning.label}-${index}`} className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3">
                  <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm font-semibold text-red-700 dark:text-red-100">{warning.label}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-red-700/80 dark:text-red-200/70">{formatShiftTypeLabel(warning.kind, shiftTypeLabels)}</div>
                  </div>
                  <div className="mt-2 text-sm text-foreground">{warning.dateKey}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{isGerman ? "Ist" : "Actual"}: {warning.actual} | {isGerman ? "Soll" : "Target"}: {warning.target}</div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-6 text-sm text-emerald-700 dark:text-emerald-200">
                {isGerman
                  ? "Für den aktuellen Monat wurden keine Unterbesetzungen erkannt."
                  : "No understaffing gaps were detected for the current month."}
              </div>
            )}
          </div>
          {issuePanelEnabled ? (
            <div className="space-y-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-sm font-semibold text-foreground">{isGerman ? "Problem- und Lösungsansicht" : "Issue and resolution view"}</div>
                  <div className="text-xs text-muted-foreground">
                    {issueInsights.length > 0
                      ? isGerman
                        ? `${issueCounts.total} Hinweise erkannt, davon ${issueCounts.high} kritisch priorisiert.`
                        : `${issueCounts.total} insights detected, ${issueCounts.high} prioritised as critical.`
                      : isGerman
                        ? "Keine weiteren Probleme in den geladenen Prüfdaten erkannt."
                        : "No further issues were detected in the loaded validation data."}
                  </div>
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{isGerman ? "Priorisierung" : "Priority"}: {formatIssuePriorityMode(issuePriorityMode, isGerman)}</div>
              </div>

              <div className="max-h-[34vh] space-y-2 overflow-auto pr-1">
                {issueInsights.length > 0 ? (
                  issueInsights.map((issue) => (
                    <div key={issue.id} className={`rounded-2xl border px-4 py-3 ${issue.severity === 'high' ? 'border-red-400/20 bg-red-500/10' : 'border-amber-400/20 bg-amber-500/10'}`}>
                      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                        <div className="text-sm font-semibold text-foreground">{issue.title}</div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${issue.severity === 'high' ? 'bg-red-500/20 text-red-700 dark:text-red-200' : 'bg-amber-500/20 text-amber-700 dark:text-amber-200'}`}>
                          {issue.severity === 'high' ? (isGerman ? 'Kritisch' : 'Critical') : (isGerman ? 'Hinweis' : 'Notice')}
                        </span>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground">{issue.detected}</div>
                      {issueShowSolutions ? <div className="mt-2 text-sm text-muted-foreground"><span className="font-semibold text-sky-700 dark:text-sky-200">{isGerman ? 'Lösung' : 'Solution'}:</span> {issue.solution}</div> : null}
                      <div className="mt-2 text-xs text-muted-foreground">{isGerman ? 'Quelle' : 'Source'}: {formatIssueSource(issue.source, isGerman)} | {issue.meta}</div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-4 text-sm text-emerald-700 dark:text-emerald-200">
                    {isGerman
                      ? "Die kombinierte Warnungsanalyse meldet für diesen Monat aktuell keine akuten Probleme."
                      : "The combined warning analysis currently reports no acute issues for this month."}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* EDIT DIALOG */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("shiftplan.changeShift")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">{t("ticketAudit.employee")}</label>
                <div className="font-medium">{editTarget?.employeeName}</div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("common.date")}</label>
                <div className="font-medium">{editTarget?.day}. {activeMonthLabel}</div>
              </div>
            </div>
            <Select value={editValue} onValueChange={setEditValue}>
              <SelectTrigger>
                <SelectValue placeholder={t("shiftplan.selectShift")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={EMPTY}>{t("shiftplan.emptyShift")}</SelectItem>
                <SelectItem value="E1">E1 ({t("shiftplan.early1")})</SelectItem>
                <SelectItem value="E2">E2 ({t("shiftplan.early2")})</SelectItem>
                <SelectItem value="L1">L1 ({t("shiftplan.late1")})</SelectItem>
                <SelectItem value="L2">L2 ({t("shiftplan.late2")})</SelectItem>
                <SelectItem value="N">N ({t("shiftplan.shiftNight")})</SelectItem>
                <SelectItem value="FS">FS ({t("shiftplan.offWeekend")})</SelectItem>
                <SelectItem value="ABW">ABW ({t("shiftplan.absent")})</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={applyEdit}>{t("common.apply")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={attendanceOpen} onOpenChange={setAttendanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isGerman ? "Kommen/Gehen erfassen" : "Track arrival/departure"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <label className="text-xs text-muted-foreground">{isGerman ? "Mitarbeiter" : "Employee"}</label>
                <div className="font-medium">{attendanceTarget?.employeeName}</div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t("common.date")}</label>
                <div className="font-medium">{attendanceTarget?.day}. {activeMonthLabel}</div>
              </div>
            </div>
            {attendanceSelectionTargets.length > 1 ? (
              <label className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={attendanceApplyToSelection}
                  onChange={(event) => setAttendanceApplyToSelection(event.target.checked)}
                />
                <span>
                  {isGerman
                    ? `Auf alle ${attendanceSelectionTargets.length} ausgewählten Zellen anwenden`
                    : `Apply to all ${attendanceSelectionTargets.length} selected cells`}
                </span>
              </label>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground">{isGerman ? "Kommen (HH:MM)" : "Arrival (HH:MM)"}</label>
                <input
                  type="time"
                  value={attendanceArrival}
                  onChange={(event) => setAttendanceArrival(event.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{isGerman ? "Gehen (HH:MM)" : "Departure (HH:MM)"}</label>
                <input
                  type="time"
                  value={attendanceDeparture}
                  onChange={(event) => setAttendanceDeparture(event.target.value)}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{isGerman ? "Notiz" : "Note"}</label>
              <textarea
                value={attendanceNote}
                onChange={(event) => setAttendanceNote(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAttendanceOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={() => void applyAttendance()}>{isGerman ? "Speichern" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <HistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        year={selectedYear}
        month={selectedMonthIndex + 1}
        employeeName={historyTarget}
      />

      <ConstraintDialog
        open={constraintsOpen}
        onOpenChange={setConstraintsOpen}
        employeeName={constraintsTarget}
        onSave={() => loadData(selectedYear, selectedMonthIndex + 1)}
      />

      <CompetencyModal
        employeeName={competencyTarget}
        isOpen={competencyOpen}
        onClose={() => setCompetencyOpen(false)}
      />
    </EnterprisePageShell>
  );
}
