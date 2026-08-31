
import { useEffect, useState } from "react";
import { TrendingUp, Target, Gauge } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { fetchShiftHours, type ShiftHoursEmployee } from "../../api/shiftHours";
import type { EmployeeMonthlyStats } from "./shiftplan.hours";

interface StatsProps {
    employeeName: string;
    year: number;
    stats?: ShiftHoursEmployee | null;
    loading?: boolean;
    monthStats?: EmployeeMonthlyStats | null;
    monthLabel?: string;
}

export function EmployeeYearlyStats({ employeeName, year, stats, loading = false, monthStats = null, monthLabel }: StatsProps) {
    const { language } = useLanguage();
    const isGerman = language === "de";
    const [resolvedStats, setResolvedStats] = useState<ShiftHoursEmployee | null>(stats ?? null);
    const [fetching, setFetching] = useState(false);

    useEffect(() => {
        if (typeof stats !== "undefined") {
            setResolvedStats(stats);
            return;
        }

        let cancelled = false;
        setFetching(true);
        fetchShiftHours(year)
            .then((response) => {
                if (cancelled) return;
                const match = (response.employees || []).find((entry) => String(entry.employee_name || "").trim() === employeeName) || null;
                setResolvedStats(match);
            })
            .catch((error) => {
                if (cancelled) return;
                console.error(error);
                setResolvedStats(null);
            })
            .finally(() => {
                if (!cancelled) setFetching(false);
            });

        return () => {
            cancelled = true;
        };
    }, [employeeName, stats, year]);

    if (loading || fetching) {
        return <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs text-slate-400">{isGerman ? "Jahresziel wird geladen..." : "Loading yearly target..."}</div>;
    }

    const completion = Math.max(0, Math.min(100, Number(resolvedStats?.completion_rate || 0)));
    const remaining = Math.max(0, Number(-Math.min(resolvedStats?.annual_diff_hours || 0, 0)).toFixed(2));
    const ahead = Math.max(0, Number(Math.max(resolvedStats?.annual_diff_hours || 0, 0)).toFixed(2));
    const monthDiffTone = monthStats && monthStats.diff > 0
        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
        : "border-amber-500/20 bg-amber-500/10 text-amber-100";

    return (
        <div className="rounded-[26px] border border-white/10 bg-[radial-gradient(circle_at_top,#172554_0%,#020617_100%)] p-5 text-slate-100 shadow-[0_18px_45px_rgba(2,6,23,0.35)]">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300/75">{isGerman ? "Jahresziel" : "Year target"}</div>
                    <div className="mt-2 text-lg font-semibold">{employeeName}</div>
                    <div className="mt-1 text-sm text-slate-400">{isGerman ? `Fortschritt fuer ${year}` : `Progress for ${year}`}</div>
                </div>
                {resolvedStats ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{isGerman ? "Erfuellung" : "Completion"}</div>
                        <div className="mt-2 text-2xl font-black text-slate-50">{completion.toFixed(1)}%</div>
                    </div>
                ) : null}
            </div>

            {resolvedStats ? (
                <>
                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                <Target className="h-3.5 w-3.5 text-sky-300" />
                                {isGerman ? "Soll pro Jahr" : "Year target"}
                            </div>
                            <div className="mt-3 text-2xl font-black text-slate-50">{resolvedStats.annual_target_hours.toFixed(1)}h</div>
                        </div>

                        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-200/80">
                                <Gauge className="h-3.5 w-3.5 text-emerald-300" />
                                {isGerman ? "Erreicht" : "Reached"}
                            </div>
                            <div className="mt-3 text-2xl font-black text-emerald-100">{resolvedStats.actual_hours.toFixed(1)}h</div>
                        </div>

                        <div className={`rounded-2xl border px-4 py-3 ${ahead > 0 ? "border-emerald-500/20 bg-emerald-500/10" : "border-amber-500/20 bg-amber-500/10"}`}>
                            <div className={`flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] ${ahead > 0 ? "text-emerald-200/80" : "text-amber-200/80"}`}>
                                <TrendingUp className={`h-3.5 w-3.5 ${ahead > 0 ? "text-emerald-300" : "text-amber-300"}`} />
                                {ahead > 0 ? (isGerman ? "Vorsprung" : "Ahead") : (isGerman ? "Fehlt" : "Remaining")}
                            </div>
                            <div className={`mt-3 text-2xl font-black ${ahead > 0 ? "text-emerald-100" : "text-amber-100"}`}>{ahead > 0 ? ahead.toFixed(1) : remaining.toFixed(1)}h</div>
                        </div>
                    </div>

                    <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
                            <span>{isGerman ? "Jahresfortschritt" : "Year progress"}</span>
                            <span>{resolvedStats.actual_hours.toFixed(1)}h / {resolvedStats.annual_target_hours.toFixed(1)}h</span>
                        </div>
                        <div className="h-3 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-full rounded-full ${ahead > 0 ? "bg-emerald-400" : "bg-sky-400"}`} style={{ width: `${completion}%` }} />
                        </div>
                    </div>
                </>
            ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-white/5 p-4 text-xs text-slate-400">
                    {isGerman ? "Fuer dieses Jahr liegen noch keine Zielwerte vor." : "No yearly target data is available yet."}
                </div>
            )}

            {monthStats ? (
                <div className="mt-6 border-t border-white/10 pt-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/75">{isGerman ? "Aktueller Monat" : "Current month"}</div>
                            <div className="mt-1 text-sm text-slate-400">{monthLabel || `${String(year)}`}</div>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{isGerman ? "Soll" : "Target"}</div>
                            <div className="mt-2 text-2xl font-black text-slate-50">{monthStats.soll.toFixed(1)}h</div>
                        </div>
                        <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 py-3">
                            <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-100/80">{isGerman ? "Ist" : "Actual"}</div>
                            <div className="mt-2 text-2xl font-black text-cyan-50">{monthStats.ist.toFixed(1)}h</div>
                        </div>
                        <div className={`rounded-2xl border px-4 py-3 ${monthDiffTone}`}>
                            <div className="text-[10px] uppercase tracking-[0.22em]">{isGerman ? "Differenz" : "Difference"}</div>
                            <div className="mt-2 text-2xl font-black">{monthStats.diff > 0 ? '+' : ''}{monthStats.diff.toFixed(1)}h</div>
                        </div>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{isGerman ? "Frueh" : "Early"}</div>
                            <div className="mt-1 font-semibold">{monthStats.earlyCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{isGerman ? "Spaet" : "Late"}</div>
                            <div className="mt-1 font-semibold">{monthStats.lateCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{isGerman ? "Nacht" : "Night"}</div>
                            <div className="mt-1 font-semibold">{monthStats.nightCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{isGerman ? "Wochenende" : "Weekend"}</div>
                            <div className="mt-1 font-semibold">{monthStats.weekendCount}</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400">{isGerman ? "Feiertag" : "Holiday"}</div>
                            <div className="mt-1 font-semibold">{monthStats.holidayCount}</div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
