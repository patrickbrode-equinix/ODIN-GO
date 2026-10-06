/* ================================================ */
/* Gewichtung der Mitarbeiterwünsche (Admin)         */
/* Strength 0-100 % per preference type              */
/* ================================================ */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Save, Scale } from 'lucide-react';
import { api } from '../../api/api';
import { useLanguage } from '../../context/LanguageContext';

const KEY_PREFIX = 'shiftplan.pref_strength.';

type PreferenceType =
  | 'unwanted_shifts'
  | 'preferred_shifts'
  | 'holidays'
  | 'blocked_days'
  | 'max_nights'
  | 'max_weekends'
  | 'colleagues';

type Strengths = Record<PreferenceType, number>;

const DEFAULT_STRENGTHS: Strengths = {
  unwanted_shifts: 100,
  preferred_shifts: 100,
  holidays: 100,
  blocked_days: 100,
  max_nights: 100,
  max_weekends: 100,
  colleagues: 50,
};

const PREFERENCE_TYPES: PreferenceType[] = [
  'unwanted_shifts',
  'preferred_shifts',
  'holidays',
  'blocked_days',
  'max_nights',
  'max_weekends',
  'colleagues',
];

function getLabels(isGerman: boolean): Record<PreferenceType, { label: string; description: string }> {
  return {
    unwanted_shifts: {
      label: isGerman ? 'Unerwünschte Schichten' : 'Unwanted shifts',
      description: isGerman
        ? 'Schichten (inkl. Nachtschicht-Verweigerung), die Mitarbeitende nicht arbeiten möchten.'
        : 'Shifts (incl. night shift refusal) employees do not want to work.',
    },
    preferred_shifts: {
      label: isGerman ? 'Wunschschichten' : 'Preferred shifts',
      description: isGerman
        ? 'Gewählte Wunschschichten; bei 100 % werden andere Schichten ausgeschlossen.'
        : 'Selected preferred shifts; at 100 % all other shifts are excluded.',
    },
    holidays: {
      label: isGerman ? 'Wunsch-Feiertage frei' : 'Holidays off',
      description: isGerman
        ? 'Feiertage, an denen Mitarbeitende nicht arbeiten möchten.'
        : 'Public holidays on which employees do not want to work.',
    },
    blocked_days: {
      label: isGerman ? 'Nicht verfügbare Wochentage' : 'Unavailable weekdays',
      description: isGerman
        ? 'Von Mitarbeitenden eingetragene Wochentage ohne Verfügbarkeit (Admin-Ausschlüsse sind nicht betroffen).'
        : 'Weekdays employees entered as unavailable (admin exclusions are not affected).',
    },
    max_nights: {
      label: isGerman ? 'Individuelles Nachtlimit' : 'Individual night limit',
      description: isGerman
        ? 'Persönliche maximale Nachtdienste pro Monat.'
        : 'Personal maximum number of night shifts per month.',
    },
    max_weekends: {
      label: isGerman ? 'Individuelles Wochenendlimit' : 'Individual weekend limit',
      description: isGerman
        ? 'Persönliche maximale Wochenenden pro Monat (das globale Rotationslimit bleibt verbindlich).'
        : 'Personal maximum number of weekends per month (the global rotation limit stays binding).',
    },
    colleagues: {
      label: isGerman ? 'Wunschkollegen' : 'Preferred colleagues',
      description: isGerman
        ? 'Bonus für gemeinsame Schichten mit Wunschkollegen (Standard 50 %; 0 % = aus). Wirkt nur bei aktivem Wunschkollegen-Schalter.'
        : 'Bonus for sharing a shift with preferred colleagues (default 50 %; 0 % = off). Only applies while the preferred-colleagues switch is on.',
    },
  };
}

function parseStrength(value: unknown, fallback: number): number {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function extractStrengths(settings: Record<string, unknown>): Strengths {
  const result = { ...DEFAULT_STRENGTHS };
  for (const type of PREFERENCE_TYPES) {
    result[type] = parseStrength(settings[`${KEY_PREFIX}${type}`], DEFAULT_STRENGTHS[type]);
  }
  return result;
}

export function PreferenceWeightSettings() {
  const { language } = useLanguage();
  const isGerman = language === 'de';
  const labels = getLabels(isGerman);
  const [open, setOpen] = useState(false);
  const [strengths, setStrengths] = useState<Strengths>(DEFAULT_STRENGTHS);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/app-settings');
      setStrengths(extractStrengths((data || {}) as Record<string, unknown>));
    } catch {
      setStrengths(DEFAULT_STRENGTHS);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, number> = {};
      for (const type of PREFERENCE_TYPES) payload[`${KEY_PREFIX}${type}`] = strengths[type];
      await api.put('/app-settings', payload);
      setMessage({ type: 'ok', text: isGerman ? 'Gewichtung der Mitarbeiterwünsche gespeichert.' : 'Preference weights saved.' });
    } catch (error: any) {
      setMessage({
        type: 'err',
        text: error?.response?.data?.error || (isGerman ? 'Speichern fehlgeschlagen.' : 'Saving failed.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const title = isGerman ? 'Gewichtung der Mitarbeiterwünsche' : 'Employee preference weighting';

  return (
    <section className="theme-glass-panel overflow-hidden rounded-3xl border shadow-[0_12px_40px_rgba(15,23,42,0.22)] backdrop-blur-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-accent/60"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
            <Scale className="h-4 w-4" />
          </div>
          <div className="min-w-0 text-sm font-semibold text-foreground">{title}</div>
        </div>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />}
      </button>
      {open ? (
        <div className="border-t border-border/60 px-5 pb-5 pt-4">
          <div className="space-y-4">
            <p className="text-xs leading-5 text-slate-400">
              {isGerman
                ? '100 % = absolute Vorgabe (der Generator hält den Wunsch immer ein). Niedrigere Werte sind eine Gewichtung beim Planen: Der Wunsch wird bevorzugt beachtet, aber bei Bedarf zur Besetzung übergangen. 0 % = Wunsch wird ignoriert. Urlaub/Abwesenheit und Admin-Ausschlüsse sind immer verbindlich und hier nicht einstellbar.'
                : '100 % = absolute rule (the generator always honours the wish). Lower values are a planning weight: the wish is preferably honoured but may be overridden when needed to fill a slot. 0 % = wish is ignored. Vacation/absences and admin exclusions are always binding and cannot be configured here.'}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {PREFERENCE_TYPES.map((type) => {
                const value = strengths[type];
                return (
                  <div key={type} className="rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-slate-200">{labels[type].label}</div>
                      <div className="flex items-center gap-2">
                        {value >= 100 ? (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                            {isGerman ? 'verbindlich' : 'binding'}
                          </span>
                        ) : null}
                        {value <= 0 ? (
                          <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                            {isGerman ? 'ignoriert' : 'ignored'}
                          </span>
                        ) : null}
                        <span className="w-10 text-right text-sm tabular-nums text-slate-200">{value}%</span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{labels[type].description}</p>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={value}
                      aria-label={labels[type].label}
                      onChange={(event) => setStrengths({ ...strengths, [type]: parseStrength(event.target.value, value) })}
                      className="mt-3 w-full"
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? (isGerman ? 'Speichert…' : 'Saving…') : (isGerman ? 'Gewichtung speichern' : 'Save weighting')}
              </button>
              {message ? (
                <span className={`text-sm ${message.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{message.text}</span>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default PreferenceWeightSettings;
