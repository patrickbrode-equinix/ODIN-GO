/* ------------------------------------------------ */
/* Employee statistics (tab in the user management)  */
/* Hours, shift mix, nights, weekends, holidays and  */
/* absences per employee for one year.               */
/* ------------------------------------------------ */

import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Clock, Moon, Palmtree, RefreshCw, Search, Sun, Sunrise, Sunset, TrendingDown, TrendingUp } from "lucide-react";
import { api } from "../../api/api";
import { useLanguage } from "../../context/LanguageContext";

interface MonthStat { month: number; actual_hours: number; target_hours: number; diff_hours: number }
interface EmployeeStat {
  employee_name: string;
  months: MonthStat[];
  actual_hours: number;
  target_hours: number;
  diff_hours: number;
  total_shifts: number;
  early_shifts: number;
  late_shifts: number;
  night_shifts: number;
  special_shifts: number;
  weekend_days: number;
  saturday_days: number;
  sunday_days: number;
  holiday_days: number;
  absence_days: { vacation: number; sick: number; training: number; other: number; total: number };
}
interface Overview {
  year: number;
  employees: EmployeeStat[];
  totals: {
    employees: number; actual_hours: number; target_hours: number; night_shifts: number; early_shifts: number; late_shifts: number;
    weekend_days: number; holiday_days: number; absence_days: number; avg_actual_hours: number; avg_diff_hours: number;
  };
}

type SortKey = "name" | "hours" | "diff" | "night" | "weekend" | "holiday" | "absence";

const EARLY = "#e6b445";
const LATE = "#4a86e8";
const NIGHT = "#8b6bd6";
const GOOD = "#3fbf79";
const WARN = "#e0a43a";
const BAD = "#ef6a6a";

const MONTH_SHORT_DE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const MONTH_SHORT_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmt = (value: number, digits = 0) => value.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${fmt(Math.abs(value), digits)}`;
const diffColor = (diff: number) => (diff >= -20 ? (diff > 60 ? WARN : GOOD) : diff >= -50 ? WARN : BAD);

function Kpi({ icon, label, value, sub, accent }: { icon: React.ReactNode; label: string; value: string; sub?: string; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-4">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-20 blur-2xl" style={{ background: accent }} />
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        <span className="grid h-6 w-6 place-items-center rounded-lg" style={{ background: `${accent}26`, color: accent }}>{icon}</span>
        {label}
      </div>
      <div className="mt-3 text-3xl font-bold tabular-nums text-white">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-400">{sub}</div> : null}
    </div>
  );
}

function ShiftDonut({ early, late, night, label }: { early: number; late: number; night: number; label: string }) {
  const total = Math.max(early + late + night, 1);
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const parts = [
    { value: early, color: EARLY },
    { value: late, color: LATE },
    { value: night, color: NIGHT },
  ];
  return (
    <svg viewBox="0 0 110 110" className="h-28 w-28 shrink-0" role="img" aria-label={label}>
      <circle cx="55" cy="55" r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" />
      {parts.map((part, index) => {
        const length = (part.value / total) * circumference;
        const circle = (
          <circle key={index} cx="55" cy="55" r={radius} fill="none" stroke={part.color} strokeWidth="14" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 55 55)" />
        );
        offset += length;
        return circle;
      })}
      <text x="55" y="52" textAnchor="middle" className="fill-white text-[15px] font-bold">{fmt(early + late + night)}</text>
      <text x="55" y="66" textAnchor="middle" className="fill-slate-400 text-[8px] uppercase tracking-widest">{label}</text>
    </svg>
  );
}

function MonthBars({ months, height = 36, labels }: { months: MonthStat[]; height?: number; labels?: string[] }) {
  const max = Math.max(...months.map((month) => Math.max(month.actual_hours, month.target_hours)), 1);
  return (
    <div className="flex items-end gap-[3px]" style={{ height }} aria-hidden="true">
      {months.map((month) => {
        const ratio = month.target_hours > 0 ? month.actual_hours / month.target_hours : 0;
        const color = month.actual_hours === 0 ? "rgba(255,255,255,0.12)" : ratio >= 0.97 ? GOOD : ratio >= 0.9 ? WARN : BAD;
        return (
          <div key={month.month} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height: "100%" }} title={`${labels?.[month.month - 1] ?? month.month}: ${fmt(month.actual_hours, 1)} / ${fmt(month.target_hours, 1)} h`}>
            <div className="w-full rounded-[3px]" style={{ height: `${Math.max((month.actual_hours / max) * 100, 4)}%`, background: color, opacity: month.actual_hours === 0 ? 1 : 0.9 }} />
          </div>
        );
      })}
    </div>
  );
}

function StackedMix({ early, late, night }: { early: number; late: number; night: number }) {
  const total = Math.max(early + late + night, 1);
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-white/10" title={`Früh ${early} · Spät ${late} · Nacht ${night}`}>
      <div style={{ width: `${(early / total) * 100}%`, background: EARLY }} />
      <div style={{ width: `${(late / total) * 100}%`, background: LATE }} />
      <div style={{ width: `${(night / total) * 100}%`, background: NIGHT }} />
    </div>
  );
}

function Chip({ icon, value, label, color }: { icon: React.ReactNode; value: number; label: string; color: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[11px] font-semibold tabular-nums text-slate-200" title={label}>
      <span style={{ color }}>{icon}</span>
      {value}
      <span className="hidden font-normal text-slate-400 2xl:inline">{label}</span>
    </span>
  );
}

function Leader({ title, icon, color, rows, unit }: { title: string; icon: React.ReactNode; color: string; rows: Array<{ name: string; value: number }>; unit: string }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1);
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
        <span style={{ color }}>{icon}</span>{title}
      </div>
      <ol className="mt-3 space-y-2.5">
        {rows.map((row, index) => (
          <li key={row.name} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate font-medium text-slate-100"><span className="mr-1.5 text-slate-500">{index + 1}.</span>{row.name}</span>
              <span className="shrink-0 font-bold tabular-nums" style={{ color }}>{row.value > 0 && unit.startsWith("±") ? "+" : ""}{fmt(row.value, unit === "h" || unit === "±h" ? 1 : 0)}{unit.replace("±", "")}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${(Math.abs(row.value) / max) * 100}%`, background: color }} /></div>
          </li>
        ))}
        {rows.length === 0 ? <li className="text-xs text-slate-500">–</li> : null}
      </ol>
    </div>
  );
}

export function EmployeeStatistics() {
  const { language } = useLanguage();
  const de = language === "de";
  const monthLabels = de ? MONTH_SHORT_DE : MONTH_SHORT_EN;
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("hours");
  const [open, setOpen] = useState<string | null>(null);

  const load = async (targetYear: number) => {
    setLoading(true);
    setError("");
    try {
      const response = await api.get("/stats/employee-overview", { params: { year: targetYear } });
      setData(response.data as Overview);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.error || (de ? "Die Statistik konnte nicht geladen werden." : "Unable to load the statistics."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(year); }, [year]);

  const people = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("de");
    const list = (data?.employees ?? []).filter((entry) => entry.total_shifts > 0 || entry.actual_hours > 0 || entry.absence_days.total > 0);
    const filtered = term ? list.filter((entry) => entry.employee_name.toLocaleLowerCase("de").includes(term)) : list;
    const value = (entry: EmployeeStat) => {
      switch (sort) {
        case "diff": return entry.diff_hours;
        case "night": return entry.night_shifts;
        case "weekend": return entry.weekend_days;
        case "holiday": return entry.holiday_days;
        case "absence": return entry.absence_days.total;
        default: return entry.actual_hours;
      }
    };
    return [...filtered].sort((left, right) => (sort === "name" ? left.employee_name.localeCompare(right.employee_name, "de") : value(right) - value(left)));
  }, [data, search, sort]);

  const all = data?.employees ?? [];
  const top = (pick: (entry: EmployeeStat) => number, descending = true, count = 3) => [...all]
    .filter((entry) => entry.total_shifts > 0)
    .sort((left, right) => (descending ? pick(right) - pick(left) : pick(left) - pick(right)))
    .slice(0, count)
    .map((entry) => ({ name: entry.employee_name, value: pick(entry) }));

  const maxHours = Math.max(...all.map((entry) => Math.max(entry.actual_hours, entry.target_hours)), 1);
  const t = data?.totals;
  const sortOptions: Array<[SortKey, string]> = [
    ["hours", de ? "Stunden" : "Hours"], ["diff", de ? "Differenz" : "Difference"], ["night", de ? "Nachtschichten" : "Night shifts"],
    ["weekend", de ? "Wochenenden" : "Weekends"], ["holiday", de ? "Feiertage" : "Holidays"], ["absence", de ? "Abwesenheit" : "Absence"], ["name", "Name"],
  ];

  return (
    <div className="space-y-5">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center rounded-xl border border-white/10 bg-white/[0.04]">
          <button type="button" className="grid h-9 w-9 place-items-center text-slate-300 hover:text-white" onClick={() => setYear((current) => current - 1)} aria-label={de ? "Vorjahr" : "Previous year"}><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-16 text-center text-sm font-bold tabular-nums text-white">{year}</span>
          <button type="button" className="grid h-9 w-9 place-items-center text-slate-300 hover:text-white" onClick={() => setYear((current) => current + 1)} aria-label={de ? "Folgejahr" : "Next year"}><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={de ? "Mitarbeiter suchen …" : "Search employee …"} className="h-9 w-56 rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400/60 focus:outline-none" />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          {de ? "Sortieren nach" : "Sort by"}
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="h-9 rounded-xl border border-white/10 bg-slate-900 px-2 text-sm text-slate-100">
            {sortOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => void load(year)} disabled={loading} className="ml-auto inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />{de ? "Aktualisieren" : "Refresh"}
        </button>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      {t ? (
        <>
          {/* KPI strip + shift mix */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
            <Kpi icon={<Clock className="h-3.5 w-3.5" />} label={de ? "Geleistete Stunden" : "Hours worked"} value={fmt(t.actual_hours)} sub={`${de ? "Soll" : "Target"} ${fmt(t.target_hours)} h · Ø ${fmt(t.avg_actual_hours)} h`} accent="#5b8def" />
            <Kpi icon={<Activity className="h-3.5 w-3.5" />} label={de ? "Ø Differenz" : "Avg. difference"} value={`${signed(t.avg_diff_hours)} h`} sub={de ? "je Mitarbeiter zum Soll" : "per employee vs. target"} accent={diffColor(t.avg_diff_hours)} />
            <Kpi icon={<Moon className="h-3.5 w-3.5" />} label={de ? "Nachtschichten" : "Night shifts"} value={fmt(t.night_shifts)} sub={`${de ? "Wochenendtage" : "Weekend days"} ${fmt(t.weekend_days)}`} accent={NIGHT} />
            <Kpi icon={<CalendarDays className="h-3.5 w-3.5" />} label={de ? "Feiertagseinsätze" : "Holiday shifts"} value={fmt(t.holiday_days)} sub={de ? "bundesweit + Hessen" : "federal + Hesse"} accent={EARLY} />
            <Kpi icon={<Palmtree className="h-3.5 w-3.5" />} label={de ? "Abwesenheitstage" : "Absence days"} value={fmt(t.absence_days)} sub={de ? "Urlaub, Krank, Seminar" : "vacation, sick, training"} accent={GOOD} />
            <div className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <ShiftDonut early={t.early_shifts} late={t.late_shifts} night={t.night_shifts} label={de ? "Schichten" : "Shifts"} />
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: EARLY }} />{de ? "Früh" : "Early"} <b className="ml-auto pl-3 tabular-nums text-white">{fmt(t.early_shifts)}</b></li>
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: LATE }} />{de ? "Spät" : "Late"} <b className="ml-auto pl-3 tabular-nums text-white">{fmt(t.late_shifts)}</b></li>
                <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: NIGHT }} />{de ? "Nacht" : "Night"} <b className="ml-auto pl-3 tabular-nums text-white">{fmt(t.night_shifts)}</b></li>
              </ul>
            </div>
          </div>

          {/* highlights */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Leader title={de ? "Am weitesten über dem Soll" : "Furthest above target"} icon={<TrendingUp className="h-4 w-4" />} color={WARN} unit="±h" rows={top((entry) => entry.diff_hours)} />
            <Leader title={de ? "Am weitesten unter dem Soll" : "Furthest below target"} icon={<TrendingDown className="h-4 w-4" />} color={BAD} unit="±h" rows={top((entry) => entry.diff_hours, false)} />
            <Leader title={de ? "Meiste Nachtschichten" : "Most night shifts"} icon={<Moon className="h-4 w-4" />} color={NIGHT} unit="" rows={top((entry) => entry.night_shifts)} />
            <Leader title={de ? "Meiste Wochenenden" : "Most weekend days"} icon={<Sun className="h-4 w-4" />} color={LATE} unit="" rows={top((entry) => entry.weekend_days)} />
          </div>

          {/* per employee */}
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
            <div className="hidden grid-cols-[minmax(140px,1fr)_minmax(170px,1.3fr)_100px_minmax(110px,0.7fr)_minmax(300px,1.9fr)_24px] items-center gap-4 border-b border-white/10 bg-white/[0.04] px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 lg:grid">
              <span>{de ? "Mitarbeiter" : "Employee"}</span><span>{de ? "Stunden (Ist / Soll)" : "Hours (actual / target)"}</span><span className="text-right">{de ? "Differenz" : "Difference"}</span><span>{de ? "Verlauf pro Monat" : "Per month"}</span><span>{de ? "Einsätze" : "Assignments"}</span><span />
            </div>
            {people.map((entry) => {
              const isOpen = open === entry.employee_name;
              return (
                <div key={entry.employee_name} className="border-b border-white/5 last:border-b-0">
                  <button type="button" onClick={() => setOpen(isOpen ? null : entry.employee_name)} aria-expanded={isOpen} className="grid w-full grid-cols-1 items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.04] lg:grid-cols-[minmax(140px,1fr)_minmax(170px,1.3fr)_100px_minmax(110px,0.7fr)_minmax(300px,1.9fr)_24px] lg:gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{entry.employee_name}</div>
                      <div className="mt-1.5"><StackedMix early={entry.early_shifts} late={entry.late_shifts} night={entry.night_shifts} /></div>
                    </div>
                    <div>
                      <div className="flex items-baseline justify-between text-xs">
                        <span className="text-base font-bold tabular-nums text-white">{fmt(entry.actual_hours, 1)} h</span>
                        <span className="tabular-nums text-slate-400">/ {fmt(entry.target_hours)} h</span>
                      </div>
                      <div className="relative mt-1.5 h-2.5 rounded-full bg-white/10">
                        <div className="h-full rounded-full" style={{ width: `${Math.min((entry.actual_hours / maxHours) * 100, 100)}%`, background: `linear-gradient(90deg, ${diffColor(entry.diff_hours)}99, ${diffColor(entry.diff_hours)})` }} />
                        <div className="absolute -top-1 h-4.5 w-0.5 rounded bg-white/80" style={{ left: `${Math.min((entry.target_hours / maxHours) * 100, 100)}%`, height: 18 }} title={de ? "Jahressoll" : "Yearly target"} />
                      </div>
                    </div>
                    <div className="lg:text-right">
                      <span className="inline-flex min-w-[84px] items-center justify-center rounded-lg px-2.5 py-1 text-sm font-bold tabular-nums" style={{ background: `${diffColor(entry.diff_hours)}22`, color: diffColor(entry.diff_hours) }}>{signed(entry.diff_hours)} h</span>
                    </div>
                    <MonthBars months={entry.months} labels={monthLabels} />
                    <div className="flex flex-wrap gap-1.5">
                      <Chip icon={<Moon className="h-3.5 w-3.5" />} value={entry.night_shifts} label={de ? "Nacht" : "Night"} color={NIGHT} />
                      <Chip icon={<Sunset className="h-3.5 w-3.5" />} value={entry.late_shifts} label={de ? "Spät" : "Late"} color={LATE} />
                      <Chip icon={<Sunrise className="h-3.5 w-3.5" />} value={entry.early_shifts} label={de ? "Früh" : "Early"} color={EARLY} />
                      <Chip icon={<Sun className="h-3.5 w-3.5" />} value={entry.weekend_days} label={de ? "Wochenende" : "Weekend"} color="#6fd0e8" />
                      <Chip icon={<CalendarDays className="h-3.5 w-3.5" />} value={entry.holiday_days} label={de ? "Feiertag" : "Holiday"} color="#e08ab4" />
                      <Chip icon={<Palmtree className="h-3.5 w-3.5" />} value={entry.absence_days.total} label={de ? "Abwesend" : "Absent"} color={GOOD} />
                    </div>
                    <ChevronDown className={`hidden h-4 w-4 text-slate-500 transition-transform lg:block ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen ? (
                    <div className="grid gap-5 border-t border-white/5 bg-black/20 px-4 py-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                      <div>
                        <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{de ? "Stunden je Monat (Ist, grün = Soll erreicht)" : "Hours per month (actual, green = target reached)"}</div>
                        <MonthBars months={entry.months} height={110} labels={monthLabels} />
                        <div className="mt-1 flex gap-[3px] text-center text-[10px] text-slate-500">
                          {entry.months.map((month) => <span key={month.month} className="flex-1">{monthLabels[month.month - 1]}<br /><b className="font-semibold text-slate-300">{month.actual_hours > 0 ? fmt(month.actual_hours) : "–"}</b></span>)}
                        </div>
                      </div>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                        {[
                          [de ? "Schichten gesamt" : "Total shifts", entry.total_shifts],
                          [de ? "Samstage" : "Saturdays", entry.saturday_days],
                          [de ? "Sonntage" : "Sundays", entry.sunday_days],
                          [de ? "Urlaub" : "Vacation", entry.absence_days.vacation],
                          [de ? "Krank" : "Sick", entry.absence_days.sick],
                          [de ? "Seminar / Extern" : "Training / offsite", entry.absence_days.training],
                          [de ? "Sonstige Abwesenheit" : "Other absence", entry.absence_days.other],
                          [de ? "Sonderschichten" : "Special shifts", entry.special_shifts],
                        ].map(([label, value]) => (
                          <div key={String(label)} className="flex items-baseline justify-between border-b border-white/5 pb-1"><dt className="text-slate-400">{label}</dt><dd className="font-bold tabular-nums text-white">{value}</dd></div>
                        ))}
                      </dl>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {people.length === 0 && !loading ? <div className="px-4 py-10 text-center text-sm text-slate-500">{de ? "Keine Daten für dieses Jahr." : "No data for this year."}</div> : null}
          </div>
        </>
      ) : loading ? (
        <div className="grid h-48 place-items-center text-sm text-slate-400"><RefreshCw className="mr-2 inline h-4 w-4 animate-spin" />{de ? "Statistik wird geladen …" : "Loading statistics …"}</div>
      ) : null}
    </div>
  );
}
