import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  FileSpreadsheet,
  LayoutGrid,
  List,
  MessageSquarePlus,
  RefreshCw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { api } from "../../api/api";
import { EnterprisePageShell } from "../layout/EnterpriseLayout";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { getShiftColorKind, getShiftColorStyle, getShiftKindStyle, SHIFT_COLOR_LEGEND } from "../shiftplan/shiftColors";
import { isColoEmployee } from "../../utils/colo";

type DraftSummary = {
  id: number;
  month: string;
  version: number;
  status: string;
  title: string | null;
  note: string | null;
  created_at: string;
  feedback_count: number;
  open_feedback_count: number;
  approve_votes: number;
  needs_changes_votes: number;
};
type DraftShift = { employee_name: string; day: number; shift_code: string };
type ColoAssignment = { employee_name: string; date: string; comment: string; task_key: string };
type Draft = DraftSummary & { shifts_json: DraftShift[]; config_snapshot?: { coloAssignments?: ColoAssignment[]; coloPlanningConfig?: { employeePool?: string[] }; dispatcherConfig?: { enabled?: boolean; priorities?: string[] } } };
type DraftFeedback = {
  id: number;
  employee_name: string | null;
  day: number | null;
  suggestion: string;
  status: string;
  created_by_name: string;
  created_at: string;
};
type VoteSummary = { approve: number; needs_changes: number; total: number };
type ViewMode = "month" | "year";

function formatMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return month >= 1 && month <= 12
    ? new Date(year, month - 1, 1).toLocaleDateString("de-DE", { month: "long", year: "numeric" })
    : value;
}

function statusLabel(value: string) {
  if (value === "in_review") return "In Prüfung";
  if (value === "approved") return "Freigegeben";
  if (value === "activated") return "Aktiviert";
  return "Entwurf";
}

const DraftScheduleTable = memo(function DraftScheduleTable({ draft, compact = false }: { draft: Draft; compact?: boolean }) {
  const { employees, days, shiftsByEmployee, coloByEmployee, coloPool } = useMemo(() => {
    const employeeNames = [...new Set((draft.shifts_json || []).map((entry) => entry.employee_name))]
      .sort((left, right) => left.localeCompare(right, "de"));
    const [year, month] = draft.month.split("-").map(Number);
    const monthDays = Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => index + 1);
    const schedule = new Map<string, Map<number, string>>();
    for (const shift of draft.shifts_json || []) {
      if (!schedule.has(shift.employee_name)) schedule.set(shift.employee_name, new Map());
      schedule.get(shift.employee_name)?.set(Number(shift.day), shift.shift_code);
    }
    const coloSchedule = new Map<string, Map<number, ColoAssignment>>();
    for (const assignment of draft.config_snapshot?.coloAssignments || []) {
      const day = Number.parseInt(String(assignment.date || '').slice(8, 10), 10);
      if (!Number.isInteger(day)) continue;
      if (!coloSchedule.has(assignment.employee_name)) coloSchedule.set(assignment.employee_name, new Map());
      coloSchedule.get(assignment.employee_name)?.set(day, assignment);
    }
    const configuredPool = draft.config_snapshot?.coloPlanningConfig?.employeePool || [];
    // Older drafts may not have stored the pool; their Colo assignments still identify the selected people.
    const coloPool = [...new Set([
      ...configuredPool,
      ...(draft.config_snapshot?.coloAssignments || []).map((assignment) => assignment.employee_name),
    ])];
    const dispatcherPool = draft.config_snapshot?.dispatcherConfig?.priorities || [];
    return { employees: employeeNames, days: monthDays, shiftsByEmployee: schedule, coloByEmployee: coloSchedule, coloPool, dispatcherPool };
  }, [draft]);

  return (
    <div className="overflow-x-auto">
      <table className={`min-w-max border-collapse ${compact ? "text-[10px]" : "text-xs"}`}>
        <thead>
          <tr>
            <th className={`${compact ? "min-w-40 p-2" : "min-w-48 p-3"} sticky left-0 z-20 bg-[#0a1424]/95 text-left`}>Mitarbeiter</th>
            {days.map((value) => <th key={value} className={`${compact ? "min-w-8 p-1.5" : "min-w-11 p-2"} border-l border-white/6 text-center text-muted-foreground`}>{value}</th>)}
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee} className="border-t border-white/6">
              <th className={`${compact ? "p-2" : "p-3"} sticky left-0 z-10 bg-[#081321]/95 text-left font-semibold text-foreground`}>
                <span>{employee}</span>
                {isColoEmployee(employee, coloPool) ? <span className="ml-2 inline-flex rounded border border-cyan-400/40 bg-cyan-500/15 px-1.5 py-px text-[9px] font-black text-cyan-200">COLO</span> : null}
                {dispatcherPool.length > 0 && isColoEmployee(employee, [dispatcherPool[0]]) && Array.from(shiftsByEmployee.get(employee)?.values() || []).some((code) => String(code).startsWith("E")) ? <span className="ml-2 inline-flex rounded border border-pink-400/40 bg-pink-500/15 px-1.5 py-px text-[9px] font-black text-pink-200">DP</span> : null}
              </th>
              {days.map((value) => {
                const code = shiftsByEmployee.get(employee)?.get(value) || "";
                const coloAssignment = coloByEmployee.get(employee)?.get(value);
                const kind = getShiftColorKind(code);
                return (
                  <td key={value} className="border-l border-white/6 p-1 text-center">
                    <div className="flex flex-col items-center gap-1">
                      {code ? <span style={getShiftColorStyle(code)} className={`shift-badge shift-badge-${kind} inline-flex ${compact ? "min-h-5 min-w-6 px-1" : "min-h-7 min-w-8 px-1.5"} items-center justify-center rounded-md border font-bold`}>{code}</span> : null}
                      {coloAssignment ? <span title={coloAssignment.comment} className="inline-flex rounded border border-cyan-400/40 bg-cyan-500/15 px-1 py-px text-[8px] font-black text-cyan-100">CO</span> : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

function LazyYearDraftTable({ draft }: { draft: DraftSummary }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [schedule, setSchedule] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    const element = containerRef.current;
    if (!element || visible) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    }, { rootMargin: "700px 0px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || schedule) return;
    let cancelled = false;
    void api.get(`/shiftplan-control/drafts/${draft.id}/schedule`)
      .then(({ data }) => {
        if (!cancelled) setSchedule({ ...draft, ...data.draft });
      })
      .catch(() => {
        if (!cancelled) setLoadError("Monatsplan konnte nicht geladen werden.");
      });
    return () => { cancelled = true; };
  }, [draft, schedule, visible]);

  return (
    <div ref={containerRef} className="min-h-72">
      {loadError
        ? <div className="flex min-h-72 items-center justify-center text-sm text-red-300">{loadError}</div>
        : schedule
        ? <DraftScheduleTable draft={schedule} compact />
        : <div className="flex min-h-72 items-center justify-center text-sm text-muted-foreground">Monatsplan wird beim Scrollen geladen.</div>}
    </div>
  );
}

export default function ShiftplanDrafts() {
  const initialParams = new URLSearchParams(window.location.search);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [activeDraft, setActiveDraft] = useState<Draft | null>(null);
  const [yearDrafts, setYearDrafts] = useState<DraftSummary[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>(initialParams.get("view") === "year" ? "year" : "month");
  const [selectedYear, setSelectedYear] = useState(Number(initialParams.get("year")) || 2027);
  const [feedback, setFeedback] = useState<DraftFeedback[]>([]);
  const [votes, setVotes] = useState<VoteSummary>({ approve: 0, needs_changes: 0, total: 0 });
  const [currentVote, setCurrentVote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [voting, setVoting] = useState(false);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [day, setDay] = useState("");
  const [suggestion, setSuggestion] = useState("");

  const loadDraft = async (id: number) => {
    setLoading(true);
    setError("");
    try {
      const [draftResult, feedbackResult, voteResult] = await Promise.all([
        api.get(`/shiftplan-control/drafts/${id}`),
        api.get(`/shiftplan-control/drafts/${id}/feedback`),
        api.get(`/shiftplan-control/drafts/${id}/votes`),
      ]);
      setActiveDraft(draftResult.data.draft);
      setFeedback(feedbackResult.data.feedback || []);
      setVotes(voteResult.data.votes || { approve: 0, needs_changes: 0, total: 0 });
      setCurrentVote(voteResult.data.currentVote || null);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "Der Draft konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  const loadYear = async (year: number) => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get(`/shiftplan-control/drafts/year/${year}`);
      setYearDrafts(result.data.drafts || result.data.generated || []);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "Die Jahresansicht konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  const loadDrafts = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await api.get("/shiftplan-control/drafts");
      const rows = (result.data.drafts || []) as DraftSummary[];
      setDrafts(rows);
      if (viewMode === "year") {
        await loadYear(selectedYear);
        return;
      }
      const preferredId = activeDraft && rows.some((item) => item.id === activeDraft.id) ? activeDraft.id : rows[0]?.id;
      if (preferredId) await loadDraft(preferredId);
      else setActiveDraft(null);
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || "Drafts konnten nicht geladen werden.");
      setLoading(false);
    }
  };

  useEffect(() => { void loadDrafts(); }, []);

  const employees = useMemo(() => [...new Set((activeDraft?.shifts_json || []).map((entry) => entry.employee_name))]
    .sort((left, right) => left.localeCompare(right, "de")), [activeDraft]);
  const daysInActiveMonth = useMemo(() => {
    if (!activeDraft) return 31;
    const [year, month] = activeDraft.month.split("-").map(Number);
    return new Date(year, month, 0).getDate();
  }, [activeDraft]);
  const availableYears = useMemo(() => {
    const values = new Set(drafts.map((draft) => Number(draft.month.slice(0, 4))).filter((year) => year >= 2027));
    values.add(selectedYear);
    return [...values].sort((left, right) => left - right);
  }, [drafts, selectedYear]);

  const switchView = async (mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "year") await loadYear(selectedYear);
    else if (!activeDraft && drafts[0]) await loadDraft(drafts[0].id);
  };

  const selectYear = async (year: number) => {
    setSelectedYear(year);
    if (viewMode === "year") await loadYear(year);
  };

  const submitFeedback = async () => {
    if (!activeDraft || suggestion.trim().length < 5) return;
    setSaving(true);
    setError("");
    try {
      const result = await api.post(`/shiftplan-control/drafts/${activeDraft.id}/feedback`, {
        employeeName: employeeName || null,
        day: day || null,
        suggestion: suggestion.trim(),
      });
      setSuggestion("");
      setDay("");
      setEmployeeName("");
      setFeedback((current) => [result.data.feedback, ...current]);
      setDrafts((current) => current.map((draft) => draft.id === activeDraft.id
        ? { ...draft, feedback_count: Number(draft.feedback_count || 0) + 1, open_feedback_count: Number(draft.open_feedback_count || 0) + 1 }
        : draft));
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || requestError.response?.data?.message || "Der Kommentar konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  const submitVote = async (vote: "approve" | "needs_changes") => {
    if (!activeDraft || voting) return;
    setVoting(true);
    setError("");
    try {
      const result = await api.put(`/shiftplan-control/drafts/${activeDraft.id}/vote`, { vote });
      setVotes(result.data.votes || votes);
      setCurrentVote(result.data.currentVote || vote);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || requestError.response?.data?.error || "Der Vote konnte nicht gespeichert werden.");
    } finally {
      setVoting(false);
    }
  };

  const exportDraft = async (draft: Draft) => {
    setExportingId(draft.id);
    setError("");
    try {
      const response = await api.get(`/shiftplan-control/drafts/${draft.id}/excel`, { responseType: "blob" });
      const disposition = String(response.headers?.["content-disposition"] || "");
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || `Dienstplan_${draft.month}_v${draft.version}.xlsx`;
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (requestError: any) {
      setError(requestError.response?.data?.message || "Der Excel-Export konnte nicht erstellt werden.");
    } finally {
      setExportingId(null);
    }
  };

  const openMonthFromYear = async (draft: DraftSummary) => {
    setViewMode("month");
    await loadDraft(draft.id);
  };

  return (
    <EnterprisePageShell className="drafts-enterprise pb-16">
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="liquid-eyebrow"><Sparkles className="h-3.5 w-3.5" /> Gemeinsam planen</div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-5xl">Dienstplan-Drafts</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">Monate einzeln oder als vollständiges Planungsjahr prüfen, abstimmen und kommentieren.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={selectedYear} onChange={(event) => void selectYear(Number(event.target.value))} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm">
              {availableYears.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
            <Button type="button" variant={viewMode === "month" ? "default" : "outline"} onClick={() => void switchView("month")}><List className="mr-2 h-4 w-4" />Monat</Button>
            <Button type="button" variant={viewMode === "year" ? "default" : "outline"} onClick={() => void switchView("year")}><LayoutGrid className="mr-2 h-4 w-4" />Ganzes Jahr</Button>
            <Button onClick={loadDrafts} disabled={loading} className="liquid-button"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Aktualisieren</Button>
          </div>
        </div>
      </section>

      {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}

      {viewMode === "year" ? (
        <div className="mt-5 space-y-5">
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-xl font-bold text-foreground">Jahresplanung {selectedYear}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Je Monat wird die neueste gespeicherte Draft-Version angezeigt. Öffne einen Monat für Votes und Kommentare.</p>
          </section>
          {yearDrafts.map((draft) => (
            <section key={draft.id} className="liquid-panel overflow-hidden rounded-[22px]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/8 p-4">
                <div><h3 className="text-lg font-bold text-foreground">{draft.title || formatMonth(draft.month)} <span className="text-xs font-normal text-muted-foreground">v{draft.version}</span></h3><div className="mt-1 text-xs text-muted-foreground">{draft.feedback_count || 0} Kommentare · {draft.approve_votes || 0} Zustimmung · {draft.needs_changes_votes || 0} Änderungswünsche</div></div>
                <Button type="button" variant="outline" onClick={() => void openMonthFromYear(draft)}>Monat öffnen</Button>
              </div>
              <LazyYearDraftTable draft={draft} />
            </section>
          ))}
          {!yearDrafts.length && !loading ? <div className="liquid-panel rounded-[26px] p-12 text-center text-muted-foreground">Für {selectedYear} sind noch keine gespeicherten Drafts vorhanden.</div> : null}
        </div>
      ) : (
        <div className="mt-5 grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="liquid-panel h-fit rounded-[26px] p-3">
            <div className="px-3 pb-3 pt-2 text-xs font-bold uppercase tracking-[0.2em] text-cyan-300/80">Verfügbare Drafts</div>
            <div className="space-y-2">
              {drafts.map((draft) => (
                <button key={draft.id} onClick={() => void loadDraft(draft.id)} className={`liquid-list-item w-full rounded-2xl p-3 text-left ${activeDraft?.id === draft.id ? "active" : ""}`}>
                  <div className="flex items-center justify-between gap-2"><span className="font-bold text-foreground">{formatMonth(draft.month)}</span><span className="rounded-full bg-white/8 px-2 py-1 text-[10px] text-muted-foreground">v{draft.version}</span></div>
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground"><span>{statusLabel(draft.status)}</span><span>{draft.feedback_count || 0} Kommentare</span></div>
                  <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground"><span>✓ {draft.approve_votes || 0}</span><span>△ {draft.needs_changes_votes || 0}</span></div>
                </button>
              ))}
              {!drafts.length && !loading ? <div className="px-3 py-8 text-center text-sm text-muted-foreground">Noch keine Drafts vorhanden.</div> : null}
            </div>
          </aside>

          <div className="min-w-0 space-y-5">
            {activeDraft ? (
              <>
                <section className="liquid-panel rounded-[26px] p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div><div className="liquid-eyebrow"><CalendarRange className="h-3.5 w-3.5" /> {statusLabel(activeDraft.status)}</div><h2 className="mt-3 text-2xl font-black text-foreground">{activeDraft.title || formatMonth(activeDraft.month)}</h2><p className="mt-2 text-sm text-muted-foreground">{activeDraft.note || "Noch keine zusätzliche Notiz zu diesem Entwurf."}</p></div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" variant="outline" onClick={() => void submitVote("approve")} disabled={voting} className={currentVote === "approve" ? "border-emerald-400 bg-emerald-500/15 text-emerald-200" : "border-slate-600"}><ThumbsUp className="mr-2 h-4 w-4" />Passt für mich ({votes.approve || 0})</Button>
                      <Button type="button" variant="outline" onClick={() => void submitVote("needs_changes")} disabled={voting} className={currentVote === "needs_changes" ? "border-amber-400 bg-amber-500/15 text-amber-100" : "border-slate-600"}><ThumbsDown className="mr-2 h-4 w-4" />Änderung nötig ({votes.needs_changes || 0})</Button>
                      <Button type="button" variant="outline" onClick={() => void exportDraft(activeDraft)} disabled={exportingId === activeDraft.id} className="border-slate-600 bg-slate-950/40"><FileSpreadsheet className="mr-2 h-4 w-4" />{exportingId === activeDraft.id ? "Excel wird erstellt..." : "Excel exportieren"}</Button>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2" aria-label="Farblegende Schichten">{SHIFT_COLOR_LEGEND.map((item) => <span key={item.kind} style={getShiftKindStyle(item.kind)} className="inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-bold"><strong>{item.code}</strong>{item.label}</span>)}</div>
                </section>

                <section className="liquid-panel overflow-hidden rounded-[26px]"><DraftScheduleTable draft={activeDraft} /></section>

                <section className="grid gap-5 lg:grid-cols-2">
                  <div className="liquid-panel rounded-[26px] p-5">
                    <div className="flex items-center gap-3"><MessageSquarePlus className="h-5 w-5 text-cyan-300" /><h3 className="text-lg font-bold">Kommentar oder Verbesserung</h3></div>
                    <p className="mt-2 text-xs text-muted-foreground">Dein Name wird automatisch aus dem verifizierten Jarvis-Profil übernommen.</p>
                    <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_110px]">
                      <select value={employeeName} onChange={(event) => setEmployeeName(event.target.value)} className="rounded-xl px-3 py-2.5 text-sm"><option value="">Allgemeiner Kommentar</option>{employees.map((employee) => <option key={employee} value={employee}>Bezug: {employee}</option>)}</select>
                      <Input type="number" min="1" max={daysInActiveMonth} value={day} onChange={(event) => setDay(event.target.value)} placeholder="Tag (optional)" />
                    </div>
                    <textarea value={suggestion} onChange={(event) => setSuggestion(event.target.value)} rows={4} className="mt-3 w-full rounded-xl p-3 text-sm" placeholder="Was sollte angepasst werden und warum?" />
                    <Button onClick={submitFeedback} disabled={saving || suggestion.trim().length < 5} className="liquid-button mt-3 w-full">{saving ? "Wird gespeichert..." : "Kommentar senden"}</Button>
                  </div>

                  <div className="liquid-panel rounded-[26px] p-5">
                    <div className="flex items-center gap-3"><Clock3 className="h-5 w-5 text-violet-300" /><h3 className="text-lg font-bold">Kommentare & Verbesserungen</h3></div>
                    <div className="mt-4 max-h-80 space-y-3 overflow-y-auto pr-1">
                      {feedback.map((entry) => <article key={entry.id} className="rounded-2xl border border-white/8 bg-white/[0.035] p-3"><div className="flex items-center justify-between gap-3"><div className="font-semibold text-foreground">{entry.employee_name ? `Bezug: ${entry.employee_name}` : "Allgemeiner Kommentar"}{entry.day ? `, Tag ${entry.day}` : ""}</div><span className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-emerald-300"><CheckCircle2 className="h-3 w-3" />{entry.status}</span></div><p className="mt-2 text-sm leading-5 text-muted-foreground">{entry.suggestion}</p><div className="mt-2 text-[10px] text-muted-foreground">{entry.created_by_name} · {new Date(entry.created_at).toLocaleString("de-DE")}</div></article>)}
                      {!feedback.length ? <div className="py-10 text-center text-sm text-muted-foreground">Noch keine Einwände oder Verbesserungen.</div> : null}
                    </div>
                  </div>
                </section>
              </>
            ) : <div className="liquid-panel rounded-[26px] p-12 text-center text-muted-foreground">{loading ? "Drafts werden geladen..." : "Noch kein Generator-Draft vorhanden."}</div>}
          </div>
        </div>
      )}
    </EnterprisePageShell>
  );
}
