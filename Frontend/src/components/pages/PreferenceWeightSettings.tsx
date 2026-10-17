/* ================================================ */
/* Gewichtung der Mitarbeiterwünsche (Admin)         */
/* Strength 0-100 % per preference type              */
/* Controlled component: the admin page loads and    */
/* saves the values together with all other settings */
/* ================================================ */

import { useLanguage } from '../../context/LanguageContext';

export type PreferenceType =
  | 'unwanted_shifts'
  | 'preferred_shifts'
  | 'holidays'
  | 'blocked_days'
  | 'max_nights'
  | 'max_weekends'
  | 'colleagues';

export type Strengths = Record<PreferenceType, number>;

export const PREFERENCE_TYPES: PreferenceType[] = [
  'preferred_shifts',
  'unwanted_shifts',
  'blocked_days',
  'holidays',
  'max_nights',
  'max_weekends',
  'colleagues',
];

function getLabels(isGerman: boolean): Record<PreferenceType, { label: string; description: string }> {
  return {
    preferred_shifts: {
      label: isGerman ? 'Wunschschichten' : 'Preferred shifts',
      description: isGerman
        ? 'Schichten, die Mitarbeitende sich wünschen. Bei 100 % arbeitet die Person nur in diesen Schichten.'
        : 'Shifts employees ask for. At 100 % the person only works these shifts.',
    },
    unwanted_shifts: {
      label: isGerman ? 'Unerwünschte Schichten' : 'Unwanted shifts',
      description: isGerman
        ? 'Schichten, die jemand nicht arbeiten möchte (auch „keine Nachtschicht“).'
        : 'Shifts somebody does not want to work (including "no night shift").',
    },
    blocked_days: {
      label: isGerman ? 'Nicht verfügbare Wochentage' : 'Unavailable weekdays',
      description: isGerman
        ? 'Wochentage, an denen jemand nicht arbeiten kann. Admin-Ausschlüsse sind davon unabhängig.'
        : 'Weekdays on which somebody cannot work. Admin exclusions are independent of this.',
    },
    holidays: {
      label: isGerman ? 'Wunsch-Feiertage frei' : 'Holidays off',
      description: isGerman
        ? 'Feiertage, an denen jemand frei haben möchte.'
        : 'Public holidays on which somebody wants to be off.',
    },
    max_nights: {
      label: isGerman ? 'Persönliches Nachtlimit' : 'Personal night limit',
      description: isGerman
        ? 'Höchstzahl an Nachtdiensten pro Monat, die jemand selbst angibt.'
        : 'Maximum number of night shifts per month that somebody states.',
    },
    max_weekends: {
      label: isGerman ? 'Persönliches Wochenendlimit' : 'Personal weekend limit',
      description: isGerman
        ? 'Höchstzahl an Wochenenden pro Monat, die jemand selbst angibt (das allgemeine Wochenendlimit gilt zusätzlich).'
        : 'Maximum number of weekends per month that somebody states (the general weekend limit still applies).',
    },
    colleagues: {
      label: isGerman ? 'Wunschkollegen' : 'Preferred colleagues',
      description: isGerman
        ? 'Wie stark der Plan versucht, Wunschkollegen in dieselbe Schichtart zu legen. Es gibt keine Garantie, weil Besetzung und Regeln Vorrang haben.'
        : 'How hard the plan tries to put preferred colleagues into the same shift type. No guarantee, staffing and rules come first.',
    },
  };
}

interface PreferenceWeightSettingsProps {
  value: Strengths;
  onChange: (next: Strengths) => void;
  /** True while the master switch "consider employee wishes" is off. */
  disabled?: boolean;
}

export function PreferenceWeightSettings({ value, onChange, disabled = false }: PreferenceWeightSettingsProps) {
  const { language } = useLanguage();
  const isGerman = language === 'de';
  const labels = getLabels(isGerman);

  return (
    <div className={`space-y-4 ${disabled ? 'opacity-50' : ''}`}>
      <p className="text-xs leading-5 text-slate-400">
        {isGerman
          ? '100 % = verbindlich: Der Generator hält den Wunsch immer ein. Ein niedrigerer Wert ist ein Wunsch, der bei Bedarf zugunsten der Besetzung übergangen werden darf. 0 % = der Wunsch wird nicht beachtet. Urlaub, Abwesenheit und Admin-Ausschlüsse sind immer verbindlich.'
          : '100 % = binding: the generator always honours the wish. A lower value is a wish that may be overridden to fill a slot. 0 % = the wish is ignored. Vacation, absences and admin exclusions are always binding.'}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {PREFERENCE_TYPES.map((type) => {
          const strength = value[type];
          return (
            <div key={type} className="rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-200">{labels[type].label}</div>
                <div className="flex items-center gap-2">
                  {strength >= 100 ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                      {isGerman ? 'verbindlich' : 'binding'}
                    </span>
                  ) : null}
                  {strength <= 0 ? (
                    <span className="rounded-full bg-slate-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300">
                      {isGerman ? 'aus' : 'off'}
                    </span>
                  ) : null}
                  <span className="w-10 text-right text-sm tabular-nums text-slate-200">{strength}%</span>
                </div>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-400">{labels[type].description}</p>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={strength}
                disabled={disabled}
                aria-label={labels[type].label}
                onChange={(event) => onChange({ ...value, [type]: Math.min(100, Math.max(0, Number.parseInt(event.target.value, 10) || 0)) })}
                className="mt-3 w-full"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PreferenceWeightSettings;
