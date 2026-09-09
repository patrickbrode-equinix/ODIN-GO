import { useEffect, useMemo, useState } from "react";
import { Activity, CalendarDays, Gauge, Moon, RefreshCw, ShieldCheck, Sparkles, Users } from "lucide-react";
import { fetchWellbeingConfig, fetchWellbeingMetrics, type WellbeingConfig, type WellbeingMetric } from "../../api/wellbeing";
import { EnterprisePageShell } from "../layout/EnterpriseLayout";
import { Button } from "../ui/button";
import { LANGUAGE_TO_LOCALE, useLanguage } from "../../context/LanguageContext";

type WellbeingCopy = {
  balance: string;
  subtitle: string;
  month: string;
  quarter: string;
  year: string;
  refresh: string;
  employees: string;
  withSignal: string;
  average: string;
  nightShifts: string;
  shiftDistribution: string;
  shiftDistributionHint: string;
  early: string;
  late: string;
  night: string;
  weekend: string;
  shifts: string;
  employeeBurden: string;
  employeeBurdenHint: string;
  nightShort: string;
  weekendShort: string;
  streak: string;
  days: string;
  points: string;
  withinRange: string;
  noMetrics: string;
  thresholds: string;
  weekendDays: string;
  workStreak: string;
  context: string;
  contextText: string;
  loadFailed: string;
};

const WELLBEING_COPY: Record<"de" | "en", WellbeingCopy> = {
  de: { balance: "Work-Life Balance", subtitle: "Belastung transparent erkennen: Nachtdienste, Wochenenden und lange Arbeitsserien in einer ruhigen, nachvollziehbaren Ansicht.", month: "Monat", quarter: "Quartal", year: "Jahr", refresh: "Aktualisieren", employees: "Mitarbeiter", withSignal: "Mit Signal", average: "Durchschnitt", nightShifts: "Nachtdienste", shiftDistribution: "Schichtverteilung", shiftDistributionHint: "Alle geplanten Schichten im ausgewählten Zeitraum.", early: "Frühschicht", late: "Spätschicht", night: "Nachtschicht", weekend: "Wochenende", shifts: "Schichten", employeeBurden: "Belastung nach Mitarbeiter", employeeBurdenHint: "Höhere Werte zeigen mehr Belastungssignale, keine Leistungsbewertung.", nightShort: "Nacht", weekendShort: "Wochenende", streak: "Serie", days: "Tage", points: "Punkte", withinRange: "Im Rahmen", noMetrics: "Für den gewählten Zeitraum liegen noch keine berechneten Wellbeing-Werte vor.", thresholds: "Grenzwerte", weekendDays: "Wochenendtage", workStreak: "Arbeitsserie", context: "Einordnung", contextText: "Die Werte helfen bei einer fairen Planung. Sie sind Hinweise für das Planungsteam und dürfen nicht als Bewertung einzelner Mitarbeiter verstanden werden.", loadFailed: "Die Wellbeing-Daten konnten nicht geladen werden." },
  en: { balance: "Work-Life Balance", subtitle: "Make workload transparent: night shifts, weekends, and long work streaks in a calm, traceable view.", month: "Month", quarter: "Quarter", year: "Year", refresh: "Refresh", employees: "Employees", withSignal: "With signal", average: "Average", nightShifts: "Night shifts", shiftDistribution: "Shift distribution", shiftDistributionHint: "All scheduled shifts in the selected period.", early: "Early shift", late: "Late shift", night: "Night shift", weekend: "Weekend", shifts: "Shifts", employeeBurden: "Burden by employee", employeeBurdenHint: "Higher values indicate more workload signals, not a performance rating.", nightShort: "Night", weekendShort: "Weekend", streak: "Streak", days: "days", points: "points", withinRange: "Within range", noMetrics: "No calculated wellbeing values are available for the selected period.", thresholds: "Thresholds", weekendDays: "Weekend days", workStreak: "Work streak", context: "Context", contextText: "These values support fair planning. They are guidance for the planning team and must not be treated as an evaluation of individual employees.", loadFailed: "Wellbeing data could not be loaded." },
};

export default function WellbeingStatistics() {
  const { language } = useLanguage();
  const copy = WELLBEING_COPY[language];
  const locale = LANGUAGE_TO_LOCALE[language];
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [period, setPeriod] = useState<"month" | "quarter" | "year">("month");
  const [metrics, setMetrics] = useState<WellbeingMetric[]>([]);
  const [config, setConfig] = useState<WellbeingConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const months = period === "year" ? Array.from({ length: 12 }, (_, index) => index + 1) : period === "quarter" ? [((Math.floor((month - 1) / 3) * 3) + 1), ((Math.floor((month - 1) / 3) * 3) + 2), ((Math.floor((month - 1) / 3) * 3) + 3)] : [month];
      const [metricRowsByMonth, thresholdConfig] = await Promise.all([
        Promise.all(months.map((value) => fetchWellbeingMetrics(year, value))),
        fetchWellbeingConfig(),
      ]);
      const byEmployee = new Map<string, WellbeingMetric>();
      for (const rows of metricRowsByMonth) for (const row of rows) {
        const previous = byEmployee.get(row.employee_name);
        byEmployee.set(row.employee_name, previous ? { ...previous, night_count: Number(previous.night_count || 0) + Number(row.night_count || 0), weekend_count: Number(previous.weekend_count || 0) + Number(row.weekend_count || 0), early_count: Number(previous.early_count || 0) + Number(row.early_count || 0), late_count: Number(previous.late_count || 0) + Number(row.late_count || 0), max_streak: Math.max(Number(previous.max_streak || 0), Number(row.max_streak || 0)), score: Number(previous.score || 0) + Number(row.score || 0) } : row);
      }
      const metricRows = [...byEmployee.values()];
      setMetrics(metricRows.sort((left, right) => right.score - left.score || left.employee_name.localeCompare(right.employee_name, "de")));
      setConfig(thresholdConfig);
    } catch (requestError: any) {
      setError(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [year, month, period, copy.loadFailed]);

  const summary = useMemo(() => {
    const totalScore = metrics.reduce((sum, entry) => sum + Number(entry.score || 0), 0);
    return {
      employees: metrics.length,
      average: metrics.length ? Math.round(totalScore / metrics.length) : 0,
      critical: metrics.filter((entry) => entry.score > 0).length,
      nights: metrics.reduce((sum, entry) => sum + Number(entry.night_count || 0), 0),
      early: metrics.reduce((sum, entry) => sum + Number(entry.early_count || 0), 0),
      late: metrics.reduce((sum, entry) => sum + Number(entry.late_count || 0), 0),
      weekend: metrics.reduce((sum, entry) => sum + Number(entry.weekend_count || 0), 0),
      maxScore: Math.max(1, ...metrics.map((entry) => Number(entry.score || 0))),
    };
  }, [metrics]);

  const shiftDistribution = useMemo(() => {
    const entries = [
      { label: copy.early, value: summary.early, color: "from-sky-500 to-cyan-300" },
      { label: copy.late, value: summary.late, color: "from-amber-500 to-orange-300" },
      { label: copy.night, value: summary.nights, color: "from-violet-600 to-indigo-400" },
      { label: copy.weekend, value: summary.weekend, color: "from-rose-500 to-pink-300" },
    ];
    const max = Math.max(1, ...entries.map((entry) => entry.value));
    return { entries, max };
  }, [copy, summary.early, summary.late, summary.nights, summary.weekend]);

  return (
    <EnterprisePageShell className="pb-16">
      <section className="liquid-hero rounded-[30px] p-6 md:p-8">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-3xl">
            <div className="liquid-eyebrow"><Sparkles className="h-3.5 w-3.5" /> {copy.balance}</div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-foreground md:text-5xl">Wellbeing</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
              {copy.subtitle}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select value={period} onChange={(event) => setPeriod(event.target.value as "month" | "quarter" | "year")} className="liquid-control rounded-xl px-3 py-2 text-sm"><option value="month">{copy.month}</option><option value="quarter">{copy.quarter}</option><option value="year">{copy.year}</option></select>
            {period !== "year" ? <select value={period === "quarter" ? Math.floor((month - 1) / 3) + 1 : month} onChange={(event) => setMonth(period === "quarter" ? (Number(event.target.value) - 1) * 3 + 1 : Number(event.target.value))} className="liquid-control rounded-xl px-3 py-2 text-sm">{period === "quarter" ? [1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>) : Array.from({ length: 12 }, (_, index) => new Date(2024, index, 1).toLocaleDateString(locale, { month: "long" })).map((label, index) => <option key={label} value={index + 1}>{label}</option>)}</select> : null}
            <select value={year} onChange={(event) => setYear(Number(event.target.value))} className="liquid-control rounded-xl px-3 py-2 text-sm">{Array.from({ length: 6 }, (_, index) => now.getFullYear() - 1 + index).map((value) => <option key={value}>{value}</option>)}</select>
            <Button onClick={load} disabled={loading} className="liquid-button"><RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> {copy.refresh}</Button>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: copy.employees, value: summary.employees, icon: Users, tone: "cyan" },
          { label: copy.withSignal, value: summary.critical, icon: Activity, tone: "violet" },
          { label: copy.average, value: summary.average, icon: Gauge, tone: "blue" },
          { label: copy.nightShifts, value: summary.nights, icon: Moon, tone: "indigo" },
        ].map((item) => <div key={item.label} className="liquid-kpi rounded-[24px] p-5"><div className="flex items-center justify-between"><div className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{item.label}</div><item.icon className="h-5 w-5 text-cyan-300" /></div><div className="mt-4 text-4xl font-black text-foreground">{item.value}</div></div>)}
      </section>

      <section className="liquid-panel mt-5 rounded-[26px] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-lg font-bold">{copy.shiftDistribution}</h2><p className="mt-1 text-xs text-muted-foreground">{copy.shiftDistributionHint}</p></div>
          <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-700 dark:text-cyan-200">{shiftDistribution.entries.reduce((sum, entry) => sum + entry.value, 0)} {copy.shifts}</span>
        </div>
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {shiftDistribution.entries.map((entry) => <div key={entry.label} className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
            <div className="flex items-baseline justify-between gap-3"><span className="text-sm font-semibold text-foreground">{entry.label}</span><strong className="text-2xl font-black text-foreground">{entry.value}</strong></div>
            <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-900/10 dark:bg-white/10"><div className={`h-full rounded-full bg-gradient-to-r ${entry.color}`} style={{ width: `${Math.max(entry.value > 0 ? 8 : 0, (entry.value / shiftDistribution.max) * 100)}%` }} /></div>
          </div>)}
        </div>
      </section>

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="liquid-panel rounded-[26px] p-5">
          <div className="flex items-center gap-3"><Activity className="h-5 w-5 text-cyan-300" /><div><h2 className="text-lg font-bold">{copy.employeeBurden}</h2><p className="text-xs text-muted-foreground">{copy.employeeBurdenHint}</p></div></div>
          {error ? <div className="mt-4 rounded-xl border border-red-400/20 bg-red-500/10 p-3 text-sm text-red-200">{error}</div> : null}
          <div className="mt-5 space-y-3">
            {metrics.map((entry) => {
              const width = Math.max(entry.score > 0 ? 8 : 2, (Number(entry.score || 0) / summary.maxScore) * 100);
              return <article key={entry.employee_name} className="rounded-2xl border border-white/8 bg-white/[0.028] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-bold text-foreground">{entry.employee_name}</div><div className="mt-1 text-xs text-muted-foreground">{entry.night_count} {copy.nightShort} · {entry.weekend_count} {copy.weekendShort} · {copy.streak} {entry.max_streak} {copy.days}</div></div><div className={`rounded-full px-3 py-1 text-xs font-bold ${entry.score > 0 ? "bg-amber-400/12 text-amber-200" : "bg-emerald-400/12 text-emerald-200"}`}>{entry.score > 0 ? `${entry.score} ${copy.points}` : copy.withinRange}</div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/6"><div className={`h-full rounded-full ${entry.score > 0 ? "bg-gradient-to-r from-violet-500 via-cyan-400 to-amber-300" : "bg-emerald-400/60"}`} style={{ width: `${width}%` }} /></div></article>;
            })}
            {!metrics.length && !loading ? <div className="rounded-2xl border border-dashed border-white/10 py-14 text-center text-sm text-muted-foreground">{copy.noMetrics}</div> : null}
          </div>
        </div>

        <aside className="space-y-5">
          <div className="liquid-panel rounded-[26px] p-5"><div className="flex items-center gap-3"><ShieldCheck className="h-5 w-5 text-emerald-300" /><h2 className="font-bold">{copy.thresholds}</h2></div><div className="mt-5 space-y-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">{copy.nightShifts}</span><strong>{config?.night_threshold ?? 4}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">{copy.weekendDays}</span><strong>{config?.weekend_threshold ?? 2}</strong></div><div className="flex justify-between"><span className="text-muted-foreground">{copy.workStreak}</span><strong>{config?.streak_threshold ?? 7} {copy.days}</strong></div></div></div>
          <div className="liquid-panel rounded-[26px] p-5"><CalendarDays className="h-5 w-5 text-violet-300" /><h2 className="mt-3 font-bold">{copy.context}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.contextText}</p></div>
        </aside>
      </section>
    </EnterprisePageShell>
  );
}
