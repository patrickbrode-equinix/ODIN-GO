/* Statistics: how the worked shifts of every employee split into early / late / night (Mon-Fri) and the weekend
   (own segment), as stacked bars with absolute numbers and percent. */

import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";

export interface DistributionValues {
  early: number; late: number; night: number; weekend: number; other: number; total: number;
  percent: { early: number; late: number; night: number; weekend: number; other: number };
}

type Segment = "early" | "late" | "night" | "weekend" | "other";
const SEGMENTS: Array<{ key: Segment; de: string; en: string; color: string }> = [
  { key: "early", de: "Früh", en: "Early", color: "#e6b445" },
  { key: "late", de: "Spät", en: "Late", color: "#4a86e8" },
  { key: "night", de: "Nacht", en: "Night", color: "#8b6bd6" },
  { key: "weekend", de: "Wochenende", en: "Weekend", color: "#6fd0e8" },
  { key: "other", de: "Sonstige", en: "Other", color: "#9ca3af" },
];

type SortKey = "name" | "total" | Segment;

const fmtPercent = (value: number) => `${value.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

function Bar({ values, mode, name, de }: { values: DistributionValues; mode: "absolute" | "percent"; name: string; de: boolean }) {
  return (
    <div className="flex h-5 w-full overflow-hidden rounded-md bg-white/10" role="img"
      aria-label={`${name}: ${SEGMENTS.map((segment) => `${de ? segment.de : segment.en} ${values[segment.key]} (${fmtPercent(values.percent[segment.key])})`).join(", ")}`}>
      {SEGMENTS.map((segment) => {
        const count = values[segment.key];
        if (count <= 0) return null;
        const percent = values.percent[segment.key];
        return (
          <div key={segment.key} className="flex items-center justify-center overflow-hidden text-[10px] font-bold text-slate-900"
            style={{ width: `${percent}%`, background: segment.color }} title={`${de ? segment.de : segment.en}: ${count} (${fmtPercent(percent)})`}>
            {percent >= 8 ? (mode === "absolute" ? count : `${Math.round(percent)}%`) : null}
          </div>
        );
      })}
    </div>
  );
}

export function ShiftDistributionChart({ employees, team, de }: {
  employees: Array<{ employee_name: string; distribution: DistributionValues }>;
  team?: DistributionValues;
  de: boolean;
}) {
  const [mode, setMode] = useState<"absolute" | "percent">("absolute");
  const [sort, setSort] = useState<SortKey>("name");
  const rows = useMemo(() => {
    const list = employees.filter((entry) => entry.distribution.total > 0);
    return [...list].sort((left, right) => {
      if (sort === "name") return left.employee_name.localeCompare(right.employee_name, "de");
      if (sort === "total") return right.distribution.total - left.distribution.total;
      return right.distribution[sort] - left.distribution[sort];
    });
  }, [employees, sort]);
  const maxTotal = Math.max(1, ...rows.map((entry) => entry.distribution.total));

  return (
    <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <BarChart3 className="h-4 w-4 text-sky-300" />
        <h3 className="text-sm font-bold text-white">{de ? "Schichtverteilung pro Mitarbeiter" : "Shift distribution per employee"}</h3>
        <span className="text-xs text-slate-400">{de ? "Früh, Spät, Nacht von Montag bis Freitag; das Wochenende (Sa + So) steht als eigener Abschnitt." : "Early, late, night Monday to Friday; the weekend (Sat + Sun) is its own segment."}</span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label={de ? "Darstellung" : "Display"} className="inline-flex overflow-hidden rounded-xl border border-white/10">
          {(["absolute", "percent"] as const).map((value) => (
            <button key={value} type="button" aria-pressed={mode === value} onClick={() => setMode(value)}
              className={`h-9 px-4 text-sm font-bold ${mode === value ? "bg-sky-500/30 text-white" : "bg-white/[0.04] text-slate-300 hover:bg-white/10"}`}>
              {value === "absolute" ? (de ? "Absolut" : "Absolute") : (de ? "Prozent" : "Percent")}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-400">
          {de ? "Sortieren nach" : "Sort by"}
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} className="h-9 rounded-xl border border-white/10 bg-slate-900 px-2 text-sm text-slate-100">
            <option value="name">Name</option>
            <option value="total">{de ? "Schichten gesamt" : "Total shifts"}</option>
            {SEGMENTS.map((segment) => <option key={segment.key} value={segment.key}>{de ? segment.de : segment.en}</option>)}
          </select>
        </label>
        <ul className="ml-auto flex flex-wrap gap-3 text-[11px] text-slate-300">
          {SEGMENTS.map((segment) => (
            <li key={segment.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: segment.color }} />{de ? segment.de : segment.en}</li>
          ))}
        </ul>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px] space-y-1.5">
          {team && team.total > 0 ? (
            <div className="grid grid-cols-[minmax(130px,0.9fr)_minmax(0,3fr)_minmax(220px,1.4fr)] items-center gap-3 border-b border-white/10 pb-2 text-xs">
              <span className="font-bold text-white">{de ? "Team gesamt" : "Whole team"}</span>
              <Bar values={team} mode={mode} name={de ? "Team" : "Team"} de={de} />
              <Numbers values={team} mode={mode} />
            </div>
          ) : null}
          {rows.map((entry) => (
            <div key={entry.employee_name} className="grid grid-cols-[minmax(130px,0.9fr)_minmax(0,3fr)_minmax(220px,1.4fr)] items-center gap-3 text-xs">
              <span className="truncate font-medium text-slate-100">{entry.employee_name}</span>
              <div style={{ width: mode === "absolute" ? `${Math.max((entry.distribution.total / maxTotal) * 100, 6)}%` : "100%" }}>
                <Bar values={entry.distribution} mode={mode} name={entry.employee_name} de={de} />
              </div>
              <Numbers values={entry.distribution} mode={mode} />
            </div>
          ))}
          {rows.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">{de ? "Keine Schichten in diesem Jahr." : "No shifts in this year."}</div> : null}
        </div>
      </div>
    </section>
  );
}

function Numbers({ values, mode }: { values: DistributionValues; mode: "absolute" | "percent" }) {
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-0.5 tabular-nums text-[11px] text-slate-300">
      <b className="text-white">{values.total}</b>
      {SEGMENTS.filter((segment) => segment.key !== "other" || values.other > 0).map((segment) => (
        <span key={segment.key} style={{ color: segment.color }}>
          {mode === "absolute" ? `${values[segment.key]} (${fmtPercent(values.percent[segment.key])})` : `${fmtPercent(values.percent[segment.key])} (${values[segment.key]})`}
        </span>
      ))}
    </span>
  );
}
