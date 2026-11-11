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
  holidays?: CostControlHoliday[];
  quarterHolidays?: CostControlHoliday[];
  holidayDistribution?: {
    employees: Array<{ employee: string; hours: number; shifts: number; byHoliday: Record<string, number> }>;
    totalHours: number; maxHours: number; minHours: number; averageHours: number;
  };
}

export interface CostControlHoliday {
  date: string;
  name: string;
  category: "holiday_national" | "holiday_international";
  hours: number;
  shifts: number;
  employees: Array<{ employee: string; hours: number; shifts: number }>;
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

function HolidayBreakdown({ costControl, isGerman }: { costControl: CostControlData; isGerman: boolean }) {
  const holidays = costControl.quarterHolidays ?? costControl.holidays ?? [];
  const distribution = costControl.holidayDistribution;
  if (holidays.length === 0) {
    return <p className="mt-3 text-[11px] text-muted-foreground">{isGerman ? "Keine Bankfeiertage mit Schichten im Quartal." : "No bank holidays with shifts in this quarter."}</p>;
  }
  const people = (distribution?.employees ?? []).filter((entry) => entry.hours > 0);
  const max = Math.max(distribution?.maxHours ?? 0, 1);
  const dateText = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  return (
    <div className="mt-4 space-y-3">
      <div className="text-xs font-bold text-foreground">{isGerman ? "Feiertagsstunden im Quartal nach Feiertag" : "Holiday hours in the quarter by holiday"}</div>
      <p className="text-[11px] text-muted-foreground">
        {isGerman ? "Nur nationale und internationale Bankfeiertage (kein Fronleichnam, Heiligabend, Silvester)." : "National and international bank holidays only (no Corpus Christi, Christmas Eve, New Year's Eve)."}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="p-2">{isGerman ? "Feiertag" : "Holiday"}</th>
              <th className="p-2">{isGerman ? "Art" : "Type"}</th>
              <th className="p-2 text-right">{isGerman ? "Stunden" : "Hours"}</th>
              <th className="p-2 text-right">{isGerman ? "Schichten" : "Shifts"}</th>
              <th className="p-2">{isGerman ? "Eingesetzt (Stunden)" : "Worked by (hours)"}</th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((holiday) => (
              <tr key={holiday.date} className="border-t border-white/6 align-top">
                <td className="p-2 text-foreground">{holiday.name} <span className="text-muted-foreground">{dateText(holiday.date)}</span></td>
                <td className="p-2 text-muted-foreground">{holiday.category === "holiday_international" ? (isGerman ? "international" : "international") : (isGerman ? "national" : "national")}</td>
                <td className="p-2 text-right font-semibold text-rose-100">{formatHours(holiday.hours, isGerman)}</td>
                <td className="p-2 text-right text-foreground">{holiday.shifts}</td>
                <td className="p-2 text-muted-foreground">{holiday.employees.map((person) => `${person.employee} (${formatHours(person.hours, isGerman)})`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {distribution && people.length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-bold text-foreground">{isGerman ? "Verteilung der Feiertagsstunden auf die Mitarbeiter" : "Distribution of the holiday hours"}</div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            {isGerman
              ? `Gesamt ${formatHours(distribution.totalHours, true)} · Ø ${formatHours(distribution.averageHours, true)} je Mitarbeiter · höchster Wert ${formatHours(distribution.maxHours, true)}, niedrigster ${formatHours(distribution.minHours, true)}`
              : `Total ${formatHours(distribution.totalHours, false)} · avg ${formatHours(distribution.averageHours, false)} per employee · highest ${formatHours(distribution.maxHours, false)}, lowest ${formatHours(distribution.minHours, false)}`}
          </p>
          <ul className="space-y-1">
            {people.map((entry) => (
              <li key={entry.employee} className="grid grid-cols-[minmax(110px,1fr)_minmax(0,2fr)_64px] items-center gap-2 text-[11px]">
                <span className="truncate text-foreground">{entry.employee}</span>
                <span className="h-2 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-rose-300/80" style={{ width: `${(entry.hours / max) * 100}%` }} /></span>
                <span className="text-right font-semibold tabular-nums text-rose-100">{formatHours(entry.hours, isGerman)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
          ? "Zuschlagsstunden aus den Schichtzeiten: Nacht 20-6 Uhr, Sonntag 0-24 Uhr, Feiertag 0-24 Uhr (nur nationale und internationale Bankfeiertage), jeweils ohne die unbezahlte Pausenstunde. Nachtschichten am Sonntag zählen als Nacht und Sonntag; ein Sonntag, der Feiertag ist, steht in beiden Spalten."
          : "Supplement hours from the shift times: night 20-6, Sunday 0-24, holiday 0-24 (national and international bank holidays only), without the unpaid break hour. Night shifts on a Sunday count as night and Sunday; a Sunday that is a holiday appears in both columns."}
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
      <HolidayBreakdown costControl={costControl} isGerman={isGerman} />
    </details>
  );
}
