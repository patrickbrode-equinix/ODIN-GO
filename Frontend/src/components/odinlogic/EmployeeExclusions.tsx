/* ------------------------------------------------ */
/* Employee Exclusions – Dauerhafte Ausschlüsse     */
/* Mitarbeiter dauerhaft von Ticketzuweisung         */
/* ausschließen  – inkl. Drag & Drop                */
/* ------------------------------------------------ */

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Plus, Trash2, RefreshCw, UserX, Calendar, ShieldOff, Search, ChevronDown, ArrowRight, ArrowLeft, GripVertical } from "lucide-react";
import { api } from "../../api/api";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensors,
  useSensor,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { InfoTooltip } from "../ui/InfoTooltip";
import { useLanguage } from "../../context/LanguageContext";
import { dedupeEmployeeNames } from "../../utils/employeeNames";

interface EmployeeExclusion {
  id: number;
  employee_name: string;
  reason: string;
  reason_text: string | null;
  valid_from: string | null;
  valid_to: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  deactivated_by: string | null;
  deactivated_at: string | null;
}

const REASON_OPTIONS = [
  { value: 'lead', label: 'Lead' },
  { value: 'project', label: 'Projektarbeit' },
  { value: 'admin_override', label: 'Admin-Vorgabe' },
  { value: 'training', label: 'Training' },
  { value: 'no_operative', label: 'Keine operative Ticketbearbeitung' },
  { value: 'temporary', label: 'Temporär ausgeschlossen' },
] as const;

function formatDate(iso: string | null, locale: string): string {
  if (!iso) return '–';
  const d = new Date(iso);
  return d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  return d.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/* ------------------------------------------------ */
/* DnD helper components                            */
/* ------------------------------------------------ */

function DraggableEmployee({ id, name, side }: { id: string; name: string; side: 'available' | 'excluded' }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${side}::${id}`,
    data: { name, side },
  });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm cursor-grab select-none transition-colors
        ${side === 'excluded' ? 'bg-rose-500/10 border border-rose-500/20 text-rose-300' : 'bg-accent/40 border border-border/30 text-foreground/90 hover:bg-accent/70'}
        ${isDragging ? 'opacity-30' : ''}`}
    >
      <GripVertical className="w-3 h-3 text-muted-foreground shrink-0" />
      <span className="truncate">{name}</span>
    </div>
  );
}

function DroppablePanel({ id, children, isOver }: { id: string; children: React.ReactNode; isOver?: boolean }) {
  const { setNodeRef, isOver: over } = useDroppable({ id });
  const active = isOver ?? over;
  return (
    <div
      ref={setNodeRef}
      className={`flex-1 min-h-50 max-h-80 overflow-y-auto rounded-lg border-2 border-dashed p-2 space-y-1 transition-colors
        ${active ? 'border-blue-500/60 bg-blue-500/5' : 'border-border/30 bg-background/40'}`}
    >
      {children}
    </div>
  );
}

export default function EmployeeExclusions() {
  const { language, t } = useLanguage();
  const isGerman = language === 'de';
  const locale = isGerman ? 'de-DE' : 'en-US';
  const reasonOptions = REASON_OPTIONS.map((option) => ({
    ...option,
    label:
      option.value === 'project'
        ? t("exclusions.reasonProject")
        : option.value === 'admin_override'
          ? t("exclusions.reasonAdminOverride")
          : option.value === 'no_operative'
            ? t("exclusions.reasonNoOperative")
            : option.value === 'temporary'
              ? t("exclusions.reasonTemporary")
              : option.label,
  }));
  const copy = {
    title: t("exclusions.title"),
    subtitle: t("exclusions.subtitle"),
    refresh: t("common.refresh"),
    quickExclude: t("exclusions.quickExclude"),
    quickExcludeInfo: t("exclusions.quickExcludeInfo"),
    filterEmployees: t("exclusions.filterEmployees"),
    available: t("exclusions.available"),
    noMatches: t("exclusions.noMatches"),
    allExcluded: t("exclusions.allExcluded"),
    excludeName: (name: string) => isGerman ? `${name} ausschließen` : `Exclude ${name}`,
    excluded: t("exclusions.excluded"),
    noExclusions: t("exclusions.noExclusions"),
    includeName: (name: string) => isGerman ? `${name} wieder einschließen` : `Include ${name} again`,
    quickFooter: t("exclusions.quickFooter"),
    addTitle: t("exclusions.addTitle"),
    addInfo: t("exclusions.addInfo"),
    searchEmployee: t("exclusions.searchEmployee"),
    noEmployeeFound: t("exclusions.noEmployeeFound"),
    reason: t("exclusions.reason"),
    additionalReason: t("exclusions.additionalReason"),
    additionalReasonPlaceholder: t("exclusions.additionalReasonPlaceholder"),
    saving: t("common.saving"),
    add: t("exclusions.add"),
    limitPeriod: t("exclusions.limitPeriod"),
    until: t("exclusions.until"),
    activeExclusions: t("exclusions.activeExclusions"),
    noActiveExclusions: t("exclusions.noActiveExclusions"),
    employee: t("common.employee"),
    justification: t("exclusions.justification"),
    validFrom: t("exclusions.validFrom"),
    validTo: t("exclusions.validTo"),
    createdBy: t("exclusions.createdBy"),
    createdAt: t("exclusions.createdAt"),
    actions: t("exclusions.actions"),
    deactivate: t("exclusions.deactivate"),
    delete: t("exclusions.deletePermanently"),
    showInactive: t("exclusions.showInactive"),
    inactiveExclusions: t("exclusions.inactiveExclusions"),
    deactivatedBy: t("exclusions.deactivatedBy"),
    deactivatedAt: t("exclusions.deactivatedAt"),
    confirmDeactivate: (name: string) => isGerman ? `Ausschluss für "${name}" deaktivieren?` : `Deactivate exclusion for "${name}"?`,
    confirmDelete: (name: string) => isGerman ? `Ausschluss für "${name}" endgültig löschen?` : `Delete exclusion for "${name}" permanently?`,
  };
  const [exclusions, setExclusions] = useState<EmployeeExclusion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [employeeName, setEmployeeName] = useState('');
  const [reason, setReason] = useState('admin_override');
  const [reasonText, setReasonText] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [adding, setAdding] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  // Autocomplete state
  const [availableEmployees, setAvailableEmployees] = useState<string[]>([]);
  const [empSearch, setEmpSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // DnD state
  const [dndSearch, setDndSearch] = useState('');
  const [draggedName, setDraggedName] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(`/assignment/employee-exclusions?active=${!showInactive}`);
      setExclusions(res.data.exclusions || []);
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  // Load available employees for autocomplete
  useEffect(() => {
    async function loadEmployees() {
      try {
        const res = await api.get('/shiftplan-control/planning-basis?month=' + new Date().toISOString().slice(0, 7));
        setAvailableEmployees(dedupeEmployeeNames(res.data?.basis?.employees || []));
      } catch {
        // silent – autocomplete is optional enhancement
      }
    }
    loadEmployees();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Filtered employee suggestions (exclude already-excluded)
  const excludedNames = useMemo(() => new Set(exclusions.filter(e => e.is_active).map(e => e.employee_name.toLowerCase())), [exclusions]);
  const filteredSuggestions = useMemo(() => {
    const q = (empSearch || employeeName).toLowerCase().trim();
    return availableEmployees.filter(name =>
      !excludedNames.has(name.toLowerCase()) &&
      (!q || name.toLowerCase().includes(q))
    );
  }, [availableEmployees, empSearch, employeeName, excludedNames]);

  // DnD: available employees for DnD panel (not yet excluded)
  const dndAvailable = useMemo(() => {
    const q = dndSearch.toLowerCase().trim();
    return availableEmployees
      .filter(n => !excludedNames.has(n.toLowerCase()))
      .filter(n => !q || n.toLowerCase().includes(q));
  }, [availableEmployees, excludedNames, dndSearch]);

  // DnD: Quick-exclude (creates exclusion with default reason 'admin_override')
  const handleQuickExclude = async (name: string) => {
    setError(null);
    try {
      await api.post('/assignment/employee-exclusions', {
        employee_name: name.trim(),
        reason: 'admin_override',
      });
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  // DnD: Quick-remove (deactivate exclusion)
  const handleQuickRemove = async (name: string) => {
    const exc = exclusions.find(e => e.is_active && e.employee_name.toLowerCase() === name.toLowerCase());
    if (!exc) return;
    setError(null);
    try {
      await api.patch(`/assignment/employee-exclusions/${exc.id}/deactivate`);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  // DnD handlers
  const handleDragStart = (event: DragStartEvent) => {
    setDraggedName((event.active.data?.current as any)?.name ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedName(null);
    const { active, over } = event;
    if (!over) return;
    const data = active.data?.current as { name: string; side: 'available' | 'excluded' } | undefined;
    if (!data) return;
    const targetPanel = over.id as string;
    // Drag from available -> excluded_panel = exclude
    if (data.side === 'available' && targetPanel === 'excluded_panel') {
      handleQuickExclude(data.name);
    }
    // Drag from excluded -> available_panel = re-include
    if (data.side === 'excluded' && targetPanel === 'available_panel') {
      handleQuickRemove(data.name);
    }
  };

  const handleAdd = async () => {
    if (!employeeName.trim()) return;
    setAdding(true);
    setError(null);
    try {
      await api.post('/assignment/employee-exclusions', {
        employee_name: employeeName.trim(),
        reason,
        reason_text: reasonText.trim() || undefined,
        valid_from: validFrom || undefined,
        valid_to: validTo || undefined,
      });
      setEmployeeName('');
      setReasonText('');
      setValidFrom('');
      setValidTo('');
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    } finally {
      setAdding(false);
    }
  };

  const handleDeactivate = async (id: number, name: string) => {
    if (!confirm(copy.confirmDeactivate(name))) return;
    try {
      await api.patch(`/assignment/employee-exclusions/${id}/deactivate`);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(copy.confirmDelete(name))) return;
    try {
      await api.delete(`/assignment/employee-exclusions/${id}`);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.error || e.message);
    }
  };

  const activeExclusions = exclusions.filter(e => e.is_active);
  const inactiveExclusions = exclusions.filter(e => !e.is_active);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserX className="w-5 h-5 text-rose-400" />
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-bold text-foreground">{copy.title}</h3>
              <InfoTooltip title={copy.title} side="right" align="start" width="w-96">
                <p>{t("exclusions.introText")}</p>
              </InfoTooltip>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {copy.subtitle}
            </p>
          </div>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-border/40 bg-background/60 hover:bg-background/80 text-muted-foreground transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {copy.refresh}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {/* ---- Drag & Drop Dual Panel ---- */}
      {availableEmployees.length > 0 && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="rounded-xl border border-border/30 bg-background/30 p-4 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 mb-1">
              <GripVertical className="w-3.5 h-3.5" />
              {copy.quickExclude}
              <InfoTooltip title={copy.quickExclude} side="right" align="start" width="w-96">
                <p>{copy.quickExcludeInfo}</p>
              </InfoTooltip>
            </div>

            {/* Search filter for DnD available list */}
            <div className="relative max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder={copy.filterEmployees}
                value={dndSearch}
                onChange={(e) => setDndSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-border/40 bg-background/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
            </div>

            <div className="flex gap-4 items-stretch">
              {/* LEFT: Available */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-bold text-green-400 mb-1.5">
                  {copy.available} ({dndAvailable.length})
                </div>
                <DroppablePanel id="available_panel">
                  {dndAvailable.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      {dndSearch ? copy.noMatches : copy.allExcluded}
                    </div>
                  )}
                  {dndAvailable.map(name => (
                    <div key={name} className="flex items-center gap-1">
                      <div className="flex-1 min-w-0">
                        <DraggableEmployee id={name} name={name} side="available" />
                      </div>
                      <button
                        onClick={() => handleQuickExclude(name)}
                        className="shrink-0 p-1 rounded hover:bg-rose-500/20 text-muted-foreground hover:text-rose-400 transition"
                        title={copy.excludeName(name)}
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </DroppablePanel>
              </div>

              {/* CENTER: Arrows hint */}
              <div className="flex flex-col items-center justify-center gap-2 px-1">
                <ArrowRight className="w-4 h-4 text-muted-foreground/50" />
                <span className="text-[9px] text-muted-foreground/40 select-none">Drag</span>
                <ArrowLeft className="w-4 h-4 text-muted-foreground/50" />
              </div>

              {/* RIGHT: Excluded */}
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-bold text-rose-400 mb-1.5">
                  {copy.excluded} ({activeExclusions.length})
                </div>
                <DroppablePanel id="excluded_panel">
                  {activeExclusions.length === 0 && (
                    <div className="text-xs text-muted-foreground text-center py-6">
                      {copy.noExclusions}
                    </div>
                  )}
                  {activeExclusions.map(exc => (
                    <div key={exc.id} className="flex items-center gap-1">
                      <button
                        onClick={() => handleQuickRemove(exc.employee_name)}
                        className="shrink-0 p-1 rounded hover:bg-green-500/20 text-muted-foreground hover:text-green-400 transition"
                        title={copy.includeName(exc.employee_name)}
                      >
                        <ArrowLeft className="w-3.5 h-3.5" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <DraggableEmployee id={String(exc.id)} name={exc.employee_name} side="excluded" />
                      </div>
                    </div>
                  ))}
                </DroppablePanel>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground/60">
              {copy.quickFooter}
            </p>
          </div>

          {/* DragOverlay */}
          <DragOverlay>
            {draggedName ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm bg-blue-600/80 text-white border border-blue-400/40 shadow-lg pointer-events-none">
                <GripVertical className="w-3 h-3" />
                {draggedName}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Add Form */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-3">
        <div className="text-xs font-semibold text-blue-400 flex items-center gap-1.5 mb-2">
          <Plus className="w-3.5 h-3.5" />
          {copy.addTitle}
          <InfoTooltip title={copy.addTitle} side="right" align="start" width="w-96">
            <p>{copy.addInfo}</p>
          </InfoTooltip>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Searchable employee dropdown */}
          <div className="relative" ref={dropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                placeholder={copy.searchEmployee}
                value={employeeName}
                onChange={(e) => { setEmployeeName(e.target.value); setEmpSearch(e.target.value); setShowDropdown(true); }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-8 py-2 text-sm rounded-md border border-border/40 bg-background/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
              />
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            </div>
            {showDropdown && filteredSuggestions.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-border/40 bg-zinc-900 shadow-xl">
                {filteredSuggestions.map(name => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => { setEmployeeName(name); setEmpSearch(''); setShowDropdown(false); }}
                    className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-blue-500/20 transition"
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            {showDropdown && filteredSuggestions.length === 0 && empSearch.trim() && (
              <div className="absolute z-50 mt-1 w-full rounded-lg border border-border/40 bg-zinc-900 shadow-xl px-3 py-2 text-xs text-muted-foreground">
                {copy.noEmployeeFound}
              </div>
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{copy.reason}</span>
              <InfoTooltip title={copy.reason} side="right"><p>{t("exclusions.tooltipReason")}</p></InfoTooltip>
            </div>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background/80 text-foreground focus:outline-none focus:border-blue-500/50"
            >
              {reasonOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{copy.additionalReason}</span>
              <InfoTooltip title={copy.additionalReason} side="right"><p>{t("exclusions.tooltipAdditionalReason")}</p></InfoTooltip>
            </div>
            <input
              type="text"
              placeholder={copy.additionalReasonPlaceholder}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-md border border-border/40 bg-background/80 text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-500/50"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={adding || !employeeName.trim()}
            className="flex items-center justify-center gap-1.5 text-sm px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {adding ? copy.saving : copy.add}
          </button>
        </div>

        {/* Optional time range */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <Calendar className="w-3.5 h-3.5" />
          <span>{copy.limitPeriod}</span>
          <InfoTooltip title={copy.limitPeriod} side="right" align="start"><p>{t("exclusions.tooltipLimitPeriod")}</p></InfoTooltip>
          <input
            type="date"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            className="px-2 py-1 text-xs rounded border border-border/40 bg-background/80 text-foreground"
          />
          <span>{copy.until}</span>
          <input
            type="date"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            className="px-2 py-1 text-xs rounded border border-border/40 bg-background/80 text-foreground"
          />
        </div>
      </div>

      {/* Active Exclusions Table */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h4 className="text-xs font-bold text-foreground">
            {copy.activeExclusions} ({activeExclusions.length})
          </h4>
          <InfoTooltip title={copy.activeExclusions} side="right"><p>{t("exclusions.tooltipActiveExclusions")}</p></InfoTooltip>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <div className="w-5 h-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          </div>
        ) : activeExclusions.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6 bg-background/40 rounded-lg border border-border/20">
            {copy.noActiveExclusions}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/20">
                  <th className="pb-2 pr-4 font-medium"><span className="inline-flex items-center gap-1">{copy.employee} <InfoTooltip title={copy.employee} side="right"><p>{t("exclusions.tooltipEmployee")}</p></InfoTooltip></span></th>
                  <th className="pb-2 pr-4 font-medium"><span className="inline-flex items-center gap-1">{copy.reason} <InfoTooltip title={copy.reason} side="right"><p>{t("exclusions.tooltipReasonCol")}</p></InfoTooltip></span></th>
                  <th className="pb-2 pr-4 font-medium"><span className="inline-flex items-center gap-1">{copy.justification} <InfoTooltip title={copy.justification} side="right"><p>{t("exclusions.tooltipJustification")}</p></InfoTooltip></span></th>
                  <th className="pb-2 pr-4 font-medium"><span className="inline-flex items-center gap-1">{copy.validFrom} <InfoTooltip title={copy.validFrom} side="right"><p>{t("exclusions.tooltipValidFrom")}</p></InfoTooltip></span></th>
                  <th className="pb-2 pr-4 font-medium"><span className="inline-flex items-center gap-1">{copy.validTo} <InfoTooltip title={copy.validTo} side="right"><p>{t("exclusions.tooltipValidTo")}</p></InfoTooltip></span></th>
                  <th className="pb-2 pr-4 font-medium"><span className="inline-flex items-center gap-1">{copy.createdBy} <InfoTooltip title={copy.createdBy} side="right"><p>{t("exclusions.tooltipCreatedBy")}</p></InfoTooltip></span></th>
                  <th className="pb-2 pr-4 font-medium"><span className="inline-flex items-center gap-1">{copy.createdAt} <InfoTooltip title={copy.createdAt} side="right"><p>{t("exclusions.tooltipCreatedAt")}</p></InfoTooltip></span></th>
                  <th className="pb-2 font-medium"><span className="inline-flex items-center gap-1">{copy.actions} <InfoTooltip title={copy.actions} side="right"><p>{t("exclusions.tooltipActions")}</p></InfoTooltip></span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {activeExclusions.map((exc) => (
                  <tr key={exc.id} className="hover:bg-blue-500/5 transition">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{exc.employee_name}</td>
                    <td className="py-2.5 pr-4">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border bg-rose-500/10 border-rose-500/20 text-rose-400">
                        {reasonOptions.find(r => r.value === exc.reason)?.label || exc.reason}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{exc.reason_text || '–'}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{formatDate(exc.valid_from, locale)}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{formatDate(exc.valid_to, locale)}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{exc.created_by}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">{formatDateTime(exc.created_at, locale)}</td>
                    <td className="py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleDeactivate(exc.id, exc.employee_name)}
                          className="p-1.5 rounded hover:bg-amber-500/20 text-amber-400 transition"
                          title={copy.deactivate}
                        >
                          <ShieldOff className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(exc.id, exc.employee_name)}
                          className="p-1.5 rounded hover:bg-red-500/20 text-red-400 transition"
                          title={copy.delete}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Toggle to show inactive */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="rounded border-border/40"
          />
          {copy.showInactive}
          <InfoTooltip title={copy.showInactive} side="right"><p>{t("exclusions.tooltipShowInactive")}</p></InfoTooltip>
        </label>
      </div>

      {/* Inactive Exclusions */}
      {showInactive && inactiveExclusions.length > 0 && (
        <div>
          <div className="mb-3 flex items-center gap-1.5">
            <h4 className="text-xs font-bold text-muted-foreground">
            {copy.inactiveExclusions} ({inactiveExclusions.length})
            </h4>
            <InfoTooltip title={copy.inactiveExclusions} side="right"><p>{t("exclusions.tooltipInactive")}</p></InfoTooltip>
          </div>
          <div className="overflow-x-auto opacity-60">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground border-b border-border/20">
                  <th className="pb-2 pr-4 font-medium">{copy.employee}</th>
                  <th className="pb-2 pr-4 font-medium">{copy.reason}</th>
                  <th className="pb-2 pr-4 font-medium">{copy.deactivatedBy}</th>
                  <th className="pb-2 pr-4 font-medium">{copy.deactivatedAt}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {inactiveExclusions.map((exc) => (
                  <tr key={exc.id}>
                    <td className="py-2 pr-4 text-foreground/60">{exc.employee_name}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {reasonOptions.find(r => r.value === exc.reason)?.label || exc.reason}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{exc.deactivated_by || '–'}</td>
                    <td className="py-2 pr-4 text-muted-foreground">{exc.deactivated_at ? formatDateTime(exc.deactivated_at, locale) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
