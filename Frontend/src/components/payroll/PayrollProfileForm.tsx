/* Payroll: data entry form for the salary profile (everything the estimate needs). */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DEFAULT_PROFILE, validateProfile, type ExtraItem, type PayrollProfile } from "../../utils/payrollEngine";

interface Props {
  initial: PayrollProfile | null;
  saving: boolean;
  /** error of the last save attempt (shown right at the save button) */
  saveError?: string;
  onSave: (profile: PayrollProfile) => void;
  onCancel?: () => void;
}

const CHILD_STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4];
const EXTRA_KINDS: Array<[ExtraItem["kind"], string]> = [
  ["gross-taxable", "Brutto, steuer- und sozialversicherungspflichtig (z. B. Zulage)"],
  ["gross-free", "Brutto, steuer- und sozialversicherungsfrei (z. B. Jobticket)"],
  ["net-add", "Netto-Zahlung (z. B. Fahrtkostenerstattung)"],
  ["net-deduct", "Netto-Abzug (z. B. Vorschuss)"],
];

const field = "h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none";
const labelClass = "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-sm font-bold text-white">{title}</h3>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </section>
  );
}

function Field({ label, hint, children, wide }: { label: string; hint?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2 xl:col-span-3" : ""}`}>
      <span className={labelClass}>{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

/** Numbers are edited as text so that "2,9" and an empty field work; the value is parsed on every change. */
function NumberInput({ value, onChange, step = 1, suffix, min = 0 }: { value: number; onChange: (value: number) => void; step?: number; suffix?: string; min?: number }) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={Number.isFinite(value) ? value : ""}
        onChange={(event) => onChange(event.target.value === "" ? Number.NaN : Number(event.target.value.replace(",", ".")))}
        className={`${field} ${suffix ? "pr-10" : ""}`}
      />
      {suffix ? <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{suffix}</span> : null}
    </div>
  );
}

export function PayrollProfileForm({ initial, saving, saveError, onSave, onCancel }: Props) {
  const [profile, setProfile] = useState<PayrollProfile>(initial ? { ...DEFAULT_PROFILE, ...initial } : { ...DEFAULT_PROFILE, annualGross: Number.NaN });
  const [errors, setErrors] = useState<string[]>([]);
  const patch = <K extends keyof PayrollProfile>(key: K, value: PayrollProfile[K]) => setProfile((current) => ({ ...current, [key]: value }));

  const submit = () => {
    const found = validateProfile(profile);
    setErrors(found);
    if (found.length === 0) onSave(profile);
  };
  const updateExtra = (id: string, change: Partial<ExtraItem>) => patch("extras", profile.extras.map((item) => (item.id === id ? { ...item, ...change } : item)));

  return (
    <div className="space-y-4">
      <Section title="Gehalt" hint="Dein vertragliches Jahresbrutto. Daraus werden Monatsgehalt und Stundenlohn für die Zuschläge berechnet.">
        <Field label="Jahresbruttogehalt"><NumberInput value={profile.annualGross} onChange={(value) => patch("annualGross", value)} step={100} suffix="€" /></Field>
        <Field label="Monatsstunden laut Vertrag" hint="Standard im Betrieb: 174 h"><NumberInput value={profile.monthlyHours} onChange={(value) => patch("monthlyHours", value)} step={0.5} suffix="h" /></Field>
      </Section>

      <Section title="Bundesland" hint="Bestimmt die Feiertage (Zuschläge) und den Kirchensteuersatz.">
        <Field label="Bundesland" hint={profile.state === "BY" ? "Bayern: Kirchensteuer 8 %, Feiertage inkl. Heilige Drei Könige, Mariä Himmelfahrt und Allerheiligen" : "Hessen: Kirchensteuer 9 %, Feiertage inkl. Fronleichnam"}>
          <select value={profile.state} onChange={(event) => patch("state", event.target.value as PayrollProfile["state"])} className={field}>
            <option value="HE">Hessen</option>
            <option value="BY">Bayern</option>
          </select>
        </Field>
      </Section>

      <Section title="Persönliches" hint="Für Pflegeversicherung (Kinderlosenzuschlag ab 23, Abschlag bei mehreren Kindern) und Lohnsteuer.">
        <Field label="Geburtsjahr"><NumberInput value={profile.birthYear} onChange={(value) => patch("birthYear", value)} min={1940} /></Field>
        <Field label="Kinder unter 25 Jahren" hint="Anzahl der Kinder (für die Pflegeversicherung)"><NumberInput value={profile.childrenUnder25} onChange={(value) => patch("childrenUnder25", value)} /></Field>
        <Field label="Konfession" hint={profile.state === "BY" ? "Kirchensteuer Bayern: 8 %" : "Kirchensteuer Hessen: 9 %"}>
          <select value={profile.confession} onChange={(event) => patch("confession", event.target.value as PayrollProfile["confession"])} className={field}>
            <option value="none">keine / nicht kirchensteuerpflichtig</option>
            <option value="ev">evangelisch</option>
            <option value="rk">römisch-katholisch</option>
          </select>
        </Field>
      </Section>

      <Section title="Steuer (Lohnsteuerabzugsmerkmale)" hint="Die Werte stehen in deiner elektronischen Lohnsteuerbescheinigung (ELStAM).">
        <Field label="Steuerklasse">
          <select value={profile.taxClass} onChange={(event) => patch("taxClass", Number(event.target.value) as PayrollProfile["taxClass"])} className={field}>
            {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>Steuerklasse {value}</option>)}
          </select>
        </Field>
        <Field label="Kinderfreibeträge (Zähler)" hint="0,5 je Elternteil und Kind, 1,0 bei beiden">
          <select value={profile.childAllowance} onChange={(event) => patch("childAllowance", Number(event.target.value))} className={field}>
            {CHILD_STEPS.map((value) => <option key={value} value={value}>{String(value).replace(".", ",")}</option>)}
          </select>
        </Field>
        <Field label="Jährlicher Freibetrag / Hinzurechnung" hint="Negativ = Hinzurechnungsbetrag. Ohne Eintrag: 0"><NumberInput value={profile.yearlyTaxAllowance} onChange={(value) => patch("yearlyTaxAllowance", Number.isFinite(value) ? value : 0)} step={50} suffix="€" min={-100000} /></Field>
      </Section>

      <Section title="Sozialversicherung">
        <Field label="Krankenversicherung">
          <select value={profile.healthInsurance} onChange={(event) => patch("healthInsurance", event.target.value as PayrollProfile["healthInsurance"])} className={field}>
            <option value="statutory">gesetzlich</option>
            <option value="private">privat</option>
          </select>
        </Field>
        {profile.healthInsurance === "statutory" ? (
          <Field label="Zusatzbeitrag deiner Krankenkasse" hint="Gesamtsatz, Arbeitnehmer zahlt die Hälfte"><NumberInput value={profile.additionalContributionPercent} onChange={(value) => patch("additionalContributionPercent", value)} step={0.1} suffix="%" /></Field>
        ) : (
          <Field label="Monatlicher Eigenanteil PKV" hint="Beitrag abzüglich Arbeitgeberzuschuss"><NumberInput value={profile.privateMonthlyPremium} onChange={(value) => patch("privateMonthlyPremium", value)} step={10} suffix="€" /></Field>
        )}
        <div className="flex flex-col justify-end gap-2 text-sm text-slate-200">
          <label className="flex items-center gap-2"><input type="checkbox" checked={profile.pensionInsured} onChange={(event) => patch("pensionInsured", event.target.checked)} />rentenversicherungspflichtig</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={profile.unemploymentInsured} onChange={(event) => patch("unemploymentInsured", event.target.checked)} />arbeitslosenversicherungspflichtig</label>
        </div>
      </Section>

      <Section title="Zuschläge laut Arbeitsvertrag" hint="Prozent vom Grundstundenlohn. Alle Zuschläge sind steuerfrei: 25 % je Stunde für Spät/Nacht ab 20 Uhr, 40 % für Sonntage (ganztägig) und 100 % für Feiertage (24.12. und 31.12. nur der halbe Tag).">
        <Field label="Nacht- / Spätzuschlag (20–6 Uhr)"><NumberInput value={profile.nightRatePercent} onChange={(value) => patch("nightRatePercent", value)} suffix="%" /></Field>
        <Field label="Sonntagszuschlag"><NumberInput value={profile.sundayRatePercent} onChange={(value) => patch("sundayRatePercent", value)} suffix="%" /></Field>
        <Field label="Feiertagszuschlag"><NumberInput value={profile.holidayRatePercent} onChange={(value) => patch("holidayRatePercent", value)} suffix="%" /></Field>
        <details className="sm:col-span-2 xl:col-span-3 text-sm text-slate-300">
          <summary className="cursor-pointer text-xs font-semibold text-slate-400">Steuerfreie Grenzen anpassen</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <Field label="Nacht steuerfrei bis"><NumberInput value={profile.nightFreePercent} onChange={(value) => patch("nightFreePercent", value)} suffix="%" /></Field>
            <Field label="Sonntag steuerfrei bis"><NumberInput value={profile.sundayFreePercent} onChange={(value) => patch("sundayFreePercent", value)} suffix="%" /></Field>
            <Field label="Feiertag steuerfrei bis"><NumberInput value={profile.holidayFreePercent} onChange={(value) => patch("holidayFreePercent", value)} suffix="%" /></Field>
          </div>
        </details>
      </Section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Abzüge und zusätzliche Einnahmen (pro Monat)</h3>
            <p className="mt-1 text-xs text-slate-400">Zusätzliche Einnahmen (z. B. Schichtzulage, Fahrtkostenerstattung) und Abzüge (z. B. Vorschuss, vermögenswirksame Leistungen). Sie fließen in jede Monatsabrechnung ein.</p>
          </div>
          <button type="button" onClick={() => patch("extras", [...profile.extras, { id: `x${Date.now()}`, label: "", amount: 0, kind: "gross-taxable" }])}
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 text-xs font-semibold text-slate-100 hover:bg-white/10"><Plus className="h-4 w-4" />Hinzufügen</button>
        </div>
        <div className="mt-4 space-y-3">
          {profile.extras.map((item) => (
            <div key={item.id} className="grid items-end gap-3 sm:grid-cols-[1.2fr_120px_2fr_40px]">
              <Field label="Bezeichnung"><input value={item.label} onChange={(event) => updateExtra(item.id, { label: event.target.value })} className={field} /></Field>
              <Field label="Betrag / Monat"><NumberInput value={item.amount} onChange={(value) => updateExtra(item.id, { amount: Number.isFinite(value) ? value : 0 })} step={5} suffix="€" /></Field>
              <Field label="Art">
                <select value={item.kind} onChange={(event) => updateExtra(item.id, { kind: event.target.value as ExtraItem["kind"] })} className={field}>
                  {EXTRA_KINDS.map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                </select>
              </Field>
              <button type="button" aria-label="Eintrag entfernen" onClick={() => patch("extras", profile.extras.filter((entry) => entry.id !== item.id))} className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 text-red-300 hover:bg-red-500/10"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {profile.extras.length === 0 ? <p className="text-xs text-slate-500">Keine weiteren Einträge.</p> : null}
        </div>
      </section>

      {errors.length > 0 ? (
        <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
          <p className="font-semibold">Bitte prüfe deine Angaben:</p>
          <ul className="mt-1 list-disc pl-5">{errors.map((message) => <li key={message}>{message}</li>)}</ul>
        </div>
      ) : null}

      {saveError ? <div role="alert" className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">{saveError}</div> : null}
      <div className="flex flex-wrap justify-end gap-3">
        {onCancel ? <button type="button" onClick={onCancel} className="h-10 rounded-xl border border-white/10 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10">Abbrechen</button> : null}
        <button type="button" onClick={submit} disabled={saving} className="h-10 rounded-xl bg-gradient-to-b from-blue-400 to-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-900/40 disabled:opacity-60">{saving ? "Verschlüssele und speichere …" : "Verschlüsselt speichern"}</button>
      </div>
    </div>
  );
}
