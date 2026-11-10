/* Statistics: how often groups of 2, 3 or 4 employees worked the same shift type on the same day (filterable). */

import { useEffect, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { api } from "../../api/api";

interface Combination {
  employees: string[];
  count: number;
  byType: { early: number; late: number; night: number };
  dates: Array<{ date: string; type: "early" | "late" | "night" }>;
}
interface CombinationResult { shiftDays: number; totalCombinations: number; combinations: Combination[] }

const TYPE_LABEL: Record<string, { de: string; en: string; color: string }> = {
  early: { de: "Früh", en: "Early", color: "#f5b942" },
  late: { de: "Spät", en: "Late", color: "#e4695a" },
  night: { de: "Nacht", en: "Night", color: "#7b6cf6" },
};
const MONTHS_DE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
const dateText = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
const selectClass = "h-9 rounded-xl border border-white/10 bg-slate-900 px-2 text-sm text-slate-100";

export function ShiftCombinations({ year, employees, de }: { year: number; employees: string[]; de: boolean }) {
  const [size, setSize] = useState(2);
  const [shiftType, setShiftType] = useState("all");
  const [days, setDays] = useState("all");
  const [month, setMonth] = useState(0);
  const [employee, setEmployee] = useState("");
  const [data, setData] = useState<CombinationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.get("/stats/combinations", { params: { year, size, shiftType, days, month: month || undefined, employee: employee || undefined, limit: 60 } })
      .then((response) => { if (!cancelled) setData(response.data as CombinationResult); })
      .catch((requestError: any) => { if (!cancelled) setError(requestError?.response?.data?.error || (de ? "Die Kombinationen konnten nicht geladen werden." : "Unable to load the combinations.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [year, size, shiftType, days, month, employee, de]);

  const max = Math.max(1, ...(data?.combinations ?? []).map((entry) => entry.count));
  const sizeName = size === 2 ? (de ? "Zweier" : "Pairs") : size === 3 ? (de ? "Dreier" : "Triples") : (de ? "Vierer" : "Quads");

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-indigo-300" />
        <h3 className="text-sm font-bold text-white">{de ? "Kombinationen im Dienst" : "Combinations on duty"}</h3>
        <span className="text-xs text-slate-400">{de ? "Wie oft dieselben Personen am selben Tag in derselben Schichtart (Früh, Spät, Nacht) arbeiten." : "How often the same people work the same shift type on the same day."}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={de ? "Blockgröße" : "Block size"} className="inline-flex overflow-hidden rounded-xl border border-white/10">
          {[2, 3, 4].map((value) => (
            <button key={value} type="button" aria-pressed={size === value} onClick={() => { setSize(value); setOpen(null); }}
              className={`h-9 px-4 text-sm font-bold ${size === value ? "bg-indigo-500/30 text-white" : "bg-white/[0.04] text-slate-300 hover:bg-white/10"}`}>
              {value === 2 ? (de ? "Zweier" : "Pairs") : value === 3 ? (de ? "Dreier" : "Triples") : (de ? "Vierer" : "Quads")}
            </button>
          ))}
        </div>
        <select aria-label={de ? "Schichtart" : "Shift type"} value={shiftType} onChange={(event) => setShiftType(event.target.value)} className={selectClass}>
          <option value="all">{de ? "Alle Schichten" : "All shifts"}</option>
          <option value="early">{de ? "Nur Früh" : "Early only"}</option>
          <option value="late">{de ? "Nur Spät" : "Late only"}</option>
          <option value="night">{de ? "Nur Nacht" : "Night only"}</option>
        </select>
        <select aria-label={de ? "Tage" : "Days"} value={days} onChange={(event) => setDays(event.target.value)} className={selectClass}>
          <option value="all">{de ? "Alle Tage" : "All days"}</option>
          <option value="weekend">{de ? "Nur Wochenende" : "Weekends only"}</option>
          <option value="weekdays">{de ? "Nur Werktage" : "Weekdays only"}</option>
        </select>
        <select aria-label={de ? "Monat" : "Month"} value={month} onChange={(event) => setMonth(Number(event.target.value))} className={selectClass}>
          <option value={0}>{de ? "Ganzes Jahr" : "Whole year"}</option>
          {MONTHS_DE.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select>
        <select aria-label={de ? "Mitarbeiter" : "Employee"} value={employee} onChange={(event) => setEmployee(event.target.value)} className={`${selectClass} max-w-56`}>
          <option value="">{de ? "Alle Mitarbeiter" : "All employees"}</option>
          {employees.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {loading ? <span className="text-xs text-slate-400">{de ? "Lade …" : "Loading …"}</span> : null}
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</div> : null}

      {data ? (
        <>
          <p className="text-xs text-slate-400">
            {de
              ? `${data.totalCombinations} verschiedene ${sizeName}-Kombinationen aus ${data.shiftDays} Schichttagen${data.totalCombinations > data.combinations.length ? `, die häufigsten ${data.combinations.length}` : ""}.`
              : `${data.totalCombinations} different ${sizeName.toLowerCase()} from ${data.shiftDays} shift days${data.totalCombinations > data.combinations.length ? `, top ${data.combinations.length}` : ""}.`}
          </p>
          <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10">
            {data.combinations.map((entry) => {
              const id = entry.employees.join("|");
              const expanded = open === id;
              return (
                <li key={id} className="bg-white/[0.02]">
                  <button type="button" onClick={() => setOpen(expanded ? null : id)} aria-expanded={expanded} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/[0.05]">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-100">{entry.employees.join(" · ")}</span>
                    <span className="hidden h-2 w-32 overflow-hidden rounded-full bg-white/10 sm:block"><span className="block h-full rounded-full bg-indigo-400" style={{ width: `${(entry.count / max) * 100}%` }} /></span>
                    <span className="flex gap-1 text-[10px] font-bold">
                      {(["early", "late", "night"] as const).filter((type) => entry.byType[type] > 0).map((type) => (
                        <span key={type} className="rounded px-1.5 py-0.5" style={{ background: `${TYPE_LABEL[type].color}26`, color: TYPE_LABEL[type].color }}>{de ? TYPE_LABEL[type].de : TYPE_LABEL[type].en} {entry.byType[type]}</span>
                      ))}
                    </span>
                    <b className="w-10 text-right text-sm tabular-nums text-white">{entry.count}×</b>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition ${expanded ? "rotate-180" : ""}`} />
                  </button>
                  {expanded ? (
                    <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 py-2 text-[11px]">
                      {entry.dates.map((item) => (
                        <span key={`${item.date}-${item.type}`} className="rounded px-1.5 py-0.5" style={{ background: `${TYPE_LABEL[item.type].color}26`, color: TYPE_LABEL[item.type].color }}>{dateText(item.date)} {de ? TYPE_LABEL[item.type].de : TYPE_LABEL[item.type].en}</span>
                      ))}
                      {entry.count > entry.dates.length ? <span className="text-slate-500">+{entry.count - entry.dates.length}</span> : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
            {data.combinations.length === 0 && !loading ? <li className="px-4 py-8 text-center text-sm text-slate-500">{de ? "Keine Kombinationen für diese Auswahl." : "No combinations for this selection."}</li> : null}
          </ul>
        </>
      ) : null}
    </section>
  );
}
