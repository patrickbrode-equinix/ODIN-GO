/* ================================================ */
/* Admin editor for the wishes of one employee      */
/* Same fields the employee sees in the personal    */
/* settings; saved through PUT /admin/users/:id/    */
/* preferences. Only the fields shown here change.  */
/* ================================================ */

import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "../../api/api";
import { Button } from "../ui/button";

const SHIFT_CODES = ["E1", "E2", "L1", "L2", "N", "COLO"];
const WEEKDAYS: Array<{ value: number; de: string; en: string }> = [
  { value: 1, de: "Mo", en: "Mon" },
  { value: 2, de: "Di", en: "Tue" },
  { value: 3, de: "Mi", en: "Wed" },
  { value: 4, de: "Do", en: "Thu" },
  { value: 5, de: "Fr", en: "Fri" },
  { value: 6, de: "Sa", en: "Sat" },
  { value: 0, de: "So", en: "Sun" },
];

export interface UserPreferenceEditorValue {
  preferredShifts?: string[] | null;
  unwantedShifts?: string[] | null;
  blockedDays?: Array<number | string> | null;
  maxNightsPerMonth?: number | null;
  maxWeekendsPerMonth?: number | null;
  nightModel?: string | null;
  preferredColleagues?: Array<{ id: number; name: string }> | null;
}

interface ColleagueOption {
  id: number;
  name: string;
}

interface Props {
  userId: number;
  value: UserPreferenceEditorValue | null;
  colleagueOptions: ColleagueOption[];
  isGerman: boolean;
  onSaved: () => void;
}

interface Draft {
  preferred: string[];
  unwanted: string[];
  blocked: number[];
  maxNights: string;
  maxWeekends: string;
  nightModel: "SEVEN_DAY" | "SHORT";
  colleagues: number[];
}

function toDraft(value: UserPreferenceEditorValue | null): Draft {
  return {
    preferred: (value?.preferredShifts || []).map(String),
    unwanted: (value?.unwantedShifts || []).map(String),
    blocked: (value?.blockedDays || []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
    maxNights: value?.maxNightsPerMonth ? String(value.maxNightsPerMonth) : "",
    maxWeekends: value?.maxWeekendsPerMonth ? String(value.maxWeekendsPerMonth) : "",
    nightModel: value?.nightModel === "SHORT" ? "SHORT" : "SEVEN_DAY",
    colleagues: (value?.preferredColleagues || []).map((colleague) => colleague.id),
  };
}

function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((entry) => entry !== item) : [...list, item];
}

export function UserPreferenceEditor({ userId, value, colleagueOptions, isGerman, onSaved }: Props) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(value));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    setDraft(toDraft(value));
  }, [value]);

  const chip = (active: boolean, tone: "success" | "danger" | "neutral") => {
    if (!active) return "bg-white/5 text-muted-foreground ring-1 ring-white/10 hover:bg-white/10";
    if (tone === "success") return "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/40";
    if (tone === "danger") return "bg-red-500/20 text-red-200 ring-1 ring-red-400/40";
    return "bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/40";
  };

  async function save() {
    if (draft.colleagues.length > 4) {
      setMessage({ type: "err", text: isGerman ? "Höchstens vier Wunschkollegen." : "At most four preferred colleagues." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await api.put(`/admin/users/${userId}/preferences`, {
        preferred_shifts: draft.preferred,
        unwanted_shifts: draft.unwanted.filter((code) => !draft.preferred.includes(code)),
        blocked_days: draft.blocked,
        max_nights_per_month: draft.maxNights === "" ? null : Number(draft.maxNights),
        max_weekends_per_month: draft.maxWeekends === "" ? null : Number(draft.maxWeekends),
        night_model: draft.nightModel,
        preferred_colleagues: draft.colleagues,
      });
      setMessage({ type: "ok", text: isGerman ? "Wünsche gespeichert." : "Wishes saved." });
      onSaved();
    } catch (error: any) {
      setMessage({ type: "err", text: error?.response?.data?.message || (isGerman ? "Speichern fehlgeschlagen." : "Saving failed.") });
    } finally {
      setSaving(false);
    }
  }

  const label = "mb-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground";

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-sky-500/25 bg-sky-500/5 p-4">
      <div>
        <div className="text-sm font-bold text-foreground">{isGerman ? "Wünsche bearbeiten" : "Edit wishes"}</div>
        <div className="text-xs text-muted-foreground">
          {isGerman
            ? "Hier trägst du die Wünsche für diese Person ein oder änderst sie, genau wie sie es selbst in den persönlichen Einstellungen tun würde."
            : "Enter or change the wishes of this person here, exactly as they would in their personal settings."}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <div className={label}>{isGerman ? "Wunschschichten" : "Preferred shifts"}</div>
          <div className="flex flex-wrap gap-1.5">
            {SHIFT_CODES.map((code) => (
              <button key={`p-${code}`} type="button" onClick={() => setDraft((current) => ({ ...current, preferred: toggle(current.preferred, code), unwanted: current.unwanted.filter((entry) => entry !== code) }))} className={`rounded-full px-3 py-1 text-xs font-medium transition ${chip(draft.preferred.includes(code), "success")}`}>{code}</button>
            ))}
          </div>
        </div>
        <div>
          <div className={label}>{isGerman ? "Unerwünschte Schichten" : "Unwanted shifts"}</div>
          <div className="flex flex-wrap gap-1.5">
            {SHIFT_CODES.map((code) => (
              <button key={`u-${code}`} type="button" onClick={() => setDraft((current) => ({ ...current, unwanted: toggle(current.unwanted, code), preferred: current.preferred.filter((entry) => entry !== code) }))} className={`rounded-full px-3 py-1 text-xs font-medium transition ${chip(draft.unwanted.includes(code), "danger")}`}>{code}</button>
            ))}
          </div>
        </div>
        <div>
          <div className={label}>{isGerman ? "Nicht verfügbare Wochentage" : "Unavailable weekdays"}</div>
          <div className="flex flex-wrap gap-1.5">
            {WEEKDAYS.map((day) => (
              <button key={`d-${day.value}`} type="button" onClick={() => setDraft((current) => ({ ...current, blocked: toggle(current.blocked, day.value) }))} className={`rounded-full px-3 py-1 text-xs font-medium transition ${chip(draft.blocked.includes(day.value), "danger")}`}>{isGerman ? day.de : day.en}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs text-muted-foreground">
            <span className={label}>{isGerman ? "Nachtmodell" : "Night model"}</span>
            <select value={draft.nightModel} onChange={(event) => setDraft((current) => ({ ...current, nightModel: event.target.value === "SHORT" ? "SHORT" : "SEVEN_DAY" }))} className="mt-1 w-full rounded-lg border border-border/40 bg-background/70 px-2 py-1.5 text-xs text-foreground">
              <option value="SEVEN_DAY">{isGerman ? "7 Nächte" : "7 nights"}</option>
              <option value="SHORT">{isGerman ? "Kurz" : "Short"}</option>
            </select>
          </label>
          <label className="text-xs text-muted-foreground">
            <span className={label}>{isGerman ? "Max. Nächte" : "Max nights"}</span>
            <input type="number" min="0" max="21" value={draft.maxNights} placeholder="–" onChange={(event) => setDraft((current) => ({ ...current, maxNights: event.target.value }))} className="mt-1 w-full rounded-lg border border-border/40 bg-background/70 px-2 py-1.5 text-xs text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">
            <span className={label}>{isGerman ? "Max. Wochenenden" : "Max weekends"}</span>
            <input type="number" min="0" max="3" value={draft.maxWeekends} placeholder="–" onChange={(event) => setDraft((current) => ({ ...current, maxWeekends: event.target.value }))} className="mt-1 w-full rounded-lg border border-border/40 bg-background/70 px-2 py-1.5 text-xs text-foreground" />
          </label>
        </div>
      </div>

      <div>
        <div className={label}>{isGerman ? "Wunschkollegen (höchstens vier)" : "Preferred colleagues (at most four)"}</div>
        <div className="grid gap-2 sm:grid-cols-2">
          {[0, 1, 2, 3].map((slot) => (
            <select
              key={`c-${slot}`}
              value={draft.colleagues[slot] ?? ""}
              onChange={(event) => setDraft((current) => {
                const next = [...current.colleagues];
                const id = Number(event.target.value);
                if (!id) next.splice(slot, 1);
                else next[slot] = id;
                return { ...current, colleagues: [...new Set(next.filter(Boolean))] };
              })}
              className="rounded-lg border border-border/40 bg-background/70 px-2 py-1.5 text-xs text-foreground"
            >
              <option value="">{isGerman ? "– kein Wunschkollege –" : "– none –"}</option>
              {colleagueOptions
                .filter((option) => option.id !== userId && (option.id === draft.colleagues[slot] || !draft.colleagues.includes(option.id)))
                .map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {saving ? (isGerman ? "Speichert…" : "Saving…") : (isGerman ? "Wünsche speichern" : "Save wishes")}
        </Button>
        {message ? <span className={`text-xs ${message.type === "ok" ? "text-emerald-400" : "text-red-400"}`}>{message.text}</span> : null}
      </div>
    </div>
  );
}

export default UserPreferenceEditor;
