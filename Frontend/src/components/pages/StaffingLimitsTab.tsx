/* ------------------------------------------------ */
/* ADMIN: GLOBAL STAFFING (MIN / MAX)               */
/* One place for the minimum and maximum staffing   */
/* of early, late and night. Each value is the      */
/* cumulative sum of all shifts of that type.       */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw, Save, Users } from "lucide-react";
import { EnterpriseCard } from "../layout/EnterpriseLayout";
import { api } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

type ShiftType = "early" | "late" | "night";
type DayContext = "weekday" | "saturday" | "sunday" | "holiday";

interface Limit {
  min_count: number;
  max_count: number | null;
}

type LimitMap = Record<DayContext, Partial<Record<ShiftType, Limit>>>;

const EMPTY_LIMIT: Limit = { min_count: 0, max_count: null };
const DAY_CONTEXTS: DayContext[] = ["weekday", "saturday", "sunday", "holiday"];

function emptyLimits(): LimitMap {
  return { weekday: {}, saturday: {}, sunday: {}, holiday: {} };
}

/** Shifts that make up the sum, per day context (weekend variants only exist on weekends). */
const SHIFT_CODES: Record<DayContext, Record<"early" | "late", string>> = {
  weekday: { early: "E1 + E2", late: "L1 + L2" },
  saturday: { early: "E1SA + E2SA + E1WE + E2WE", late: "L1WE" },
  sunday: { early: "E1WE + E2WE", late: "L1WE (nur L1)" },
  holiday: { early: "alle Frühschichten des Tages", late: "alle Spätschichten des Tages" },
};

export default function StaffingLimitsTab() {
  const { language } = useLanguage();
  const { canWrite } = useAuth();
  const isGerman = language === "de";
  const writable = canWrite("shiftplan_control");

  const [limits, setLimits] = useState<LimitMap>(emptyLimits);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const dayLabel: Record<DayContext, string> = useMemo(() => ({
    weekday: isGerman ? "Werktag (Mo–Fr)" : "Weekday (Mon–Fri)",
    saturday: isGerman ? "Samstag" : "Saturday",
    sunday: isGerman ? "Sonntag" : "Sunday",
    holiday: isGerman ? "Feiertag" : "Public holiday",
  }), [isGerman]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/shift-config/staffing-rules");
      const next = emptyLimits();
      for (const rule of data?.rules || []) {
        const type = rule.shift_type as ShiftType;
        // Weekday early/late and the single night value come from staffing_rules.
        if (type === "night") next.weekday.night = { min_count: Number(rule.min_count) || 0, max_count: rule.max_count ?? null };
        else next.weekday[type] = { min_count: Number(rule.min_count) || 0, max_count: rule.max_count ?? null };
      }
      for (const row of data?.day_limits || []) {
        const context = row.day_context as DayContext;
        if (next[context]) next[context][row.shift_type as ShiftType] = { min_count: Number(row.min_count) || 0, max_count: row.max_count ?? null };
      }
      setLimits(next);
    } catch (error: any) {
      setMessage({ ok: false, text: error?.response?.data?.error || (isGerman ? "Besetzung konnte nicht geladen werden." : "Staffing could not be loaded.") });
    } finally {
      setLoading(false);
    }
  }, [isGerman]);

  useEffect(() => { void load(); }, [load]);

  const getLimit = (context: DayContext, type: ShiftType): Limit => limits[context][type] || EMPTY_LIMIT;

  const setLimit = (context: DayContext, type: ShiftType, field: keyof Limit, value: number | null) => {
    setLimits((current) => ({
      ...current,
      [context]: { ...current[context], [type]: { ...(current[context][type] || EMPTY_LIMIT), [field]: value } },
    }));
  };

  const problems = useMemo(() => {
    const found: string[] = [];
    const check = (context: DayContext, type: ShiftType, label: string) => {
      const limit = limits[context][type] || EMPTY_LIMIT;
      if (limit.max_count !== null && limit.max_count < limit.min_count) {
        found.push(isGerman ? `${label}: Das Maximum ist kleiner als das Minimum.` : `${label}: maximum is lower than minimum.`);
      }
    };
    for (const context of DAY_CONTEXTS) {
      check(context, "early", `${dayLabel[context]} ${isGerman ? "Früh" : "early"}`);
      check(context, "late", `${dayLabel[context]} ${isGerman ? "Spät" : "late"}`);
    }
    check("weekday", "night", isGerman ? "Nacht" : "Night");
    return found;
  }, [limits, dayLabel, isGerman]);

  const save = async () => {
    if (problems.length > 0) {
      setMessage({ ok: false, text: problems[0] });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const rules = (["early", "late", "night"] as ShiftType[]).map((type) => ({ shift_type: type, ...getLimit("weekday", type) }));
      const dayLimits = (["saturday", "sunday", "holiday"] as DayContext[]).flatMap((context) => (
        (["early", "late"] as ShiftType[]).map((type) => ({ day_context: context, shift_type: type, ...getLimit(context, type) }))
      ));
      await api.put("/shift-config/staffing-rules", { rules, day_limits: dayLimits });
      setMessage({ ok: true, text: isGerman ? "Besetzung gespeichert. Sie gilt ab der nächsten Generierung." : "Staffing saved. It applies from the next generation." });
      await load();
    } catch (error: any) {
      setMessage({ ok: false, text: error?.response?.data?.error || (isGerman ? "Speichern fehlgeschlagen." : "Saving failed.") });
    } finally {
      setSaving(false);
    }
  };

  const resetDefaults = async () => {
    if (!window.confirm(isGerman ? "Besetzung auf die Standardwerte zurücksetzen?" : "Reset staffing to the default values?")) return;
    setSaving(true);
    setMessage(null);
    try {
      await api.post("/shift-config/defaults/reset", { scope: "staffing" });
      await load();
      setMessage({ ok: true, text: isGerman ? "Standardwerte wiederhergestellt." : "Defaults restored." });
    } catch (error: any) {
      setMessage({ ok: false, text: error?.response?.data?.error || (isGerman ? "Zurücksetzen fehlgeschlagen." : "Reset failed.") });
    } finally {
      setSaving(false);
    }
  };

  const numberInput = (context: DayContext, type: ShiftType, field: keyof Limit) => {
    const limit = getLimit(context, type);
    const value = field === "min_count" ? limit.min_count : limit.max_count;
    return (
      <input
        type="number"
        min={0}
        disabled={!writable || saving}
        value={value ?? ""}
        placeholder={field === "max_count" ? (isGerman ? "unbegrenzt" : "unlimited") : undefined}
        onChange={(event) => {
          const raw = event.target.value;
          if (field === "max_count") setLimit(context, type, field, raw === "" ? null : Math.max(Number.parseInt(raw, 10) || 0, 0));
          else setLimit(context, type, field, Math.max(Number.parseInt(raw, 10) || 0, 0));
        }}
        className="w-20 rounded-lg border border-border bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-60"
      />
    );
  };

  const cell = (context: DayContext, type: "early" | "late") => (
    <td className="px-3 py-3 align-top">
      <div className="mb-2 text-[11px] text-muted-foreground">{SHIFT_CODES[context][type]}</div>
      <div className="flex items-center gap-2">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Min {numberInput(context, type, "min_count")}</label>
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max {numberInput(context, type, "max_count")}</label>
      </div>
    </td>
  );

  if (loading) {
    return (
      <EnterpriseCard>
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{isGerman ? "Besetzung wird geladen…" : "Loading staffing…"}</div>
      </EnterpriseCard>
    );
  }

  return (
    <EnterpriseCard>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 text-sky-400" />
          <div>
            <h3 className="text-lg font-semibold text-foreground">{isGerman ? "Besetzung (Minimum / Maximum)" : "Staffing (minimum / maximum)"}</h3>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {isGerman
                ? "Globale Werte je Tagesart. Jeder Wert ist die Summe aller Schichten dieser Art an dem Tag (z. B. Früh = E1 + E2). Ein leeres Maximum bedeutet unbegrenzt. Die Werte gelten nicht mehr je einzelne Schicht."
                : "Global values per day type. Each value is the sum of all shifts of that type on the day (e.g. early = E1 + E2). An empty maximum means unlimited. They no longer apply per individual shift."}
            </p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{isGerman ? "Tagesart" : "Day type"}</th>
              <th className="px-3 py-2">{isGerman ? "Frühschicht" : "Early shift"}</th>
              <th className="px-3 py-2">{isGerman ? "Spätschicht" : "Late shift"}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {DAY_CONTEXTS.map((context) => (
              <tr key={context}>
                <td className="px-3 py-3 align-top font-medium text-foreground">{dayLabel[context]}</td>
                {cell(context, "early")}
                {cell(context, "late")}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border border-border p-4">
        <div className="mb-1 text-sm font-semibold text-foreground">{isGerman ? "Nachtschicht (alle Tage)" : "Night shift (all days)"}</div>
        <div className="mb-2 text-[11px] text-muted-foreground">{isGerman ? "N und NK teilen sich diese Grenzen." : "N and NK share these limits."}</div>
        <div className="flex items-center gap-3">
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Min {numberInput("weekday", "night", "min_count")}</label>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Max {numberInput("weekday", "night", "max_count")}</label>
        </div>
      </div>

      {message && (
        <div className={`mt-4 rounded-lg border px-3 py-2 text-sm ${message.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>{message.text}</div>
      )}
      {problems.length > 0 && !message && (
        <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{problems[0]}</div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => void resetDefaults()} disabled={!writable || saving} className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-60">
          <RotateCcw className="h-4 w-4" />
          {isGerman ? "Auf Standard zurücksetzen" : "Reset to defaults"}
        </button>
        <button type="button" onClick={() => void save()} disabled={!writable || saving || problems.length > 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60">
          <Save className="h-4 w-4" />
          {saving ? (isGerman ? "Wird gespeichert…" : "Saving…") : (isGerman ? "Besetzung speichern" : "Save staffing")}
        </button>
      </div>
    </EnterpriseCard>
  );
}
