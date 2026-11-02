/* Shows the slider values and staffing limits a draft was generated with. */

export type StaffLimit = { min: number | null; max: number | null; overflow?: boolean };
export type DraftPlanningSettings = {
  varietyPriority?: number;
  varietySeed?: number;
  lateOverflowEnabled?: boolean;
  overtimeUnlimited?: boolean;
  maxOvertimeHours?: number | null;
  balanceFloorHours?: number;
  maxCatchupHours?: number;
  maxReliefHours?: number;
  staffing?: Record<string, Partial<Record<"early" | "late" | "night", StaffLimit>>>;
  shiftLimits?: Array<{ code: string; type?: string; minStaff?: number; maxStaff?: number }>;
};

const CONTEXTS: Array<[string, string, string]> = [
  ["weekday", "Mo–Fr", "Mon–Fri"],
  ["saturday", "Samstag", "Saturday"],
  ["sunday", "Sonntag", "Sunday"],
  ["holiday_national", "Feiertag national", "Holiday (national)"],
  ["holiday_international", "Feiertag international", "Holiday (international)"],
];
const TYPES: Array<["early" | "late" | "night", string, string]> = [
  ["early", "Früh", "Early"],
  ["late", "Spät", "Late"],
  ["night", "Nacht", "Night"],
];

function formatLimit(limit?: StaffLimit): string {
  if (!limit) return "–";
  return `${limit.min ?? "–"}–${limit.max ?? "∞"}${limit.overflow ? "*" : ""}`;
}

export function DraftSettingsPanel({ settings, isGerman }: { settings?: DraftPlanningSettings; isGerman: boolean }) {
  if (!settings) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        {isGerman ? "Für diesen Entwurf sind keine Einstellungen gespeichert (älterer Entwurf)." : "No settings were stored for this draft (older draft)."}
      </p>
    );
  }
  const chip = "rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs";
  return (
    <details className="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-xs" aria-label={isGerman ? "Einstellungen des Entwurfs" : "Draft settings"}>
      <summary className="cursor-pointer select-none font-semibold text-foreground">
        {isGerman ? "Einstellungen bei der Erstellung" : "Settings used for this draft"}
        <span className="ml-2 font-normal text-muted-foreground">
          {isGerman ? "Abwechslung" : "Variety"} {settings.varietyPriority ?? "–"}% · {isGerman ? "Überstunden" : "Overtime"} {settings.overtimeUnlimited ? (isGerman ? "unbegrenzt" : "unlimited") : `max. ${settings.maxOvertimeHours ?? 0} h`}
        </span>
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className={chip}>{isGerman ? "Abwechslung" : "Variety"}: <strong>{settings.varietyPriority ?? "–"}%</strong>{settings.varietySeed ? ` (Seed ${settings.varietySeed})` : ""}</span>
        <span className={chip}>{isGerman ? "Spät Do/Fr über Max" : "Late Thu/Fri above max"}: <strong>{settings.lateOverflowEnabled ? (isGerman ? "ja" : "yes") : (isGerman ? "nein" : "no")}</strong></span>
        <span className={chip}>{isGerman ? "Aufholung max." : "Catch-up max."} <strong>{settings.maxCatchupHours ?? "–"} h</strong> / {isGerman ? "Abbau max." : "relief max."} <strong>{settings.maxReliefHours ?? "–"} h</strong></span>
        <span className={chip}>{isGerman ? "Jahresminimum" : "Yearly minimum"}: <strong>{settings.balanceFloorHours ?? "–"} h</strong> ({isGerman ? "nach oben offen" : "open upwards"})</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-max border-collapse text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="p-1.5 text-left font-semibold">{isGerman ? "Besetzung (Min–Max Personen)" : "Staffing (min–max people)"}</th>
              {TYPES.map(([key, de, en]) => <th key={key} className="p-1.5 text-center font-semibold">{isGerman ? de : en}</th>)}
            </tr>
          </thead>
          <tbody>
            {CONTEXTS.map(([context, de, en]) => (
              <tr key={context} className="border-t border-white/10">
                <td className="p-1.5 font-semibold">{isGerman ? de : en}</td>
                {TYPES.map(([type]) => (
                  <td key={type} className="p-1.5 text-center tabular-nums">{context !== "weekday" && type === "night" ? "–" : formatLimit(settings.staffing?.[context]?.[type])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-[11px] text-muted-foreground">
          * {isGerman ? "Frühschicht Mo–Fr nimmt den Überhang auf (Maximum wird dort nicht erzwungen). ∞ = keine Obergrenze." : "Weekday early shifts take the overflow (the maximum is not enforced there). ∞ = no upper limit."}
        </p>
      </div>
      {settings.shiftLimits && settings.shiftLimits.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {settings.shiftLimits.map((entry) => (
            <span key={entry.code} className={chip}>
              <strong>{entry.code}</strong> {entry.minStaff ?? 0}–{entry.maxStaff ?? 0}
            </span>
          ))}
        </div>
      ) : null}
    </details>
  );
}
