/* ================================================ */
/* Cost control: night, Sunday and holiday          */
/* supplement hours per calendar week, month and    */
/* quarter of a draft. The numbers come from the    */
/* backend (cost_control): night 20-6, Sunday 0-24, */
/* holiday 0-24 (24.12./31.12. from 12:00), minus   */
/* the unpaid break hour.                           */
/* ================================================ */

export interface CostControlTotals {
  nightHours: number;
  sundayHours: number;
  holidayHours: number;
  nightShifts: number;
  sundayShifts: number;
  holidayShifts: number;
}

export interface CostControlData {
  month: string;
  monthTotals: CostControlTotals;
  quarterKey: string;
  quarterTotals: CostControlTotals;
  quarterMonthsPlanned: number;
  weeks: Array<CostControlTotals & { key: string; week: number; year: number; monday: string; partial: boolean }>;
}

function formatHours(value: number, isGerman: boolean) {
  return `${new Intl.NumberFormat(isGerman ? "de-DE" : "en-GB", { maximumFractionDigits: 1 }).format(value)} h`;
}

function formatMonday(monday: string, isGerman: boolean) {
  const [year, month, day] = monday.split("-");
  return isGerman ? `${day}.${month}.${year}` : `${year}-${month}-${day}`;
}

function Tile({ title, totals, note, isGerman }: { title: string; totals: CostControlTotals; note?: string; isGerman: boolean }) {
  const columns = [
    { label: isGerman ? "Nachtzuschlag" : "Night supplement", hours: totals.nightHours, shifts: totals.nightShifts, tone: "text-indigo-100", sub: "text-indigo-200/80" },
    { label: isGerman ? "Sonntagszuschlag" : "Sunday supplement", hours: totals.sundayHours, shifts: totals.sundayShifts, tone: "text-amber-100", sub: "text-amber-200/80" },
    { label: isGerman ? "Feiertagszuschlag" : "Holiday supplement", hours: totals.holidayHours, shifts: totals.holidayShifts, tone: "text-rose-100", sub: "text-rose-200/80" },
  ];
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/55 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{title}</div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        {columns.map((column) => (
          <div key={column.label}>
            <div className={`text-[10px] ${column.sub}`}>{column.label}</div>
            <div className={`text-lg font-black ${column.tone}`}>{formatHours(column.hours, isGerman)}</div>
            <div className="text-[10px] text-muted-foreground">{column.shifts} {isGerman ? "Schichten" : "shifts"}</div>
          </div>
        ))}
      </div>
      {note ? <div className="mt-2 text-[10px] text-muted-foreground">{note}</div> : null}
    </div>
  );
}

export function CostControlPanel({ costControl, isGerman }: { costControl?: CostControlData | null; isGerman: boolean }) {
  if (!costControl) return null;
  const quarterNote = costControl.quarterMonthsPlanned < 3
    ? (isGerman
      ? `Nur ${costControl.quarterMonthsPlanned} von 3 Monaten des Quartals sind geplant.`
      : `Only ${costControl.quarterMonthsPlanned} of 3 months of the quarter are planned.`)
    : undefined;
  const quarterLabel = costControl.quarterKey.replace("-", " ");
  return (
    <details className="rounded-xl border border-white/10 bg-white/[0.02] p-3" open>
      <summary className="cursor-pointer select-none text-sm font-bold text-foreground">
        {isGerman ? "Kostenkontrolle: Nacht-, Sonntags- und Feiertagszuschläge" : "Cost control: night, Sunday and holiday supplements"}
      </summary>
      <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {isGerman
          ? "Zuschlagsstunden aus den Schichtzeiten: Nacht 20-6 Uhr, Sonntag 0-24 Uhr, Feiertag 0-24 Uhr (24.12. und 31.12. ab 12 Uhr), jeweils ohne die unbezahlte Pausenstunde. Nachtschichten am Sonntag zählen als Nacht und Sonntag; ein Sonntag, der Feiertag ist, steht in beiden Spalten."
          : "Supplement hours from the shift times: night 20-6, Sunday 0-24, holiday 0-24 (24 and 31 Dec from 12:00), without the unpaid break hour. Night shifts on a Sunday count as night and Sunday; a Sunday that is a holiday appears in both columns."}
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Tile title={isGerman ? "Dieser Monat" : "This month"} totals={costControl.monthTotals} isGerman={isGerman} />
        <Tile title={`${isGerman ? "Quartal" : "Quarter"} ${quarterLabel}`} totals={costControl.quarterTotals} note={quarterNote} isGerman={isGerman} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="p-2">{isGerman ? "Kalenderwoche" : "Calendar week"}</th>
              <th className="p-2 text-right">{isGerman ? "Nacht" : "Night"}</th>
              <th className="p-2 text-right">{isGerman ? "Sonntag" : "Sunday"}</th>
              <th className="p-2 text-right">{isGerman ? "Feiertag" : "Holiday"}</th>
            </tr>
          </thead>
          <tbody>
            {costControl.weeks.map((week) => (
              <tr key={week.key} className="border-t border-white/6">
                <td className="p-2 text-foreground">
                  {isGerman ? "KW" : "Wk"} {week.week} <span className="text-muted-foreground">({isGerman ? "ab" : "from"} {formatMonday(week.monday, isGerman)})</span>
                  {week.partial ? (
                    <span className="ml-2 rounded border border-slate-500/40 px-1 text-[9px] text-muted-foreground" title={isGerman ? "Teilwoche: Tage aus Monaten, die nicht geplant sind, fehlen" : "Partial week: days of months that are not planned are missing"}>
                      {isGerman ? "Teilwoche" : "partial"}
                    </span>
                  ) : null}
                </td>
                <td className="p-2 text-right font-semibold text-indigo-100">{formatHours(week.nightHours, isGerman)}</td>
                <td className="p-2 text-right font-semibold text-amber-100">{formatHours(week.sundayHours, isGerman)}</td>
                <td className="p-2 text-right font-semibold text-rose-100">{formatHours(week.holidayHours, isGerman)}</td>
              </tr>
            ))}
            {costControl.weeks.length === 0 ? (
              <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">{isGerman ? "Keine Zuschlagsstunden geplant." : "No supplement hours planned."}</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </details>
  );
}
