/* Payroll: the monthly statement (gross, deductions, net) with the supplement hours of the month. */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Moon, PartyPopper, Sun } from "lucide-react";
import type { PayrollResult } from "../../utils/payrollEngine";

export interface MonthShift { date: string; code: string; hours: number; night: number; sunday: number; holiday: number; worked: boolean }
export interface MonthTotals { workedShifts: number; workedHours: number; nightHours: number; sundayHours: number; holidayHours: number; absenceDays: number }

const euro = (value: number) => value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const hoursText = (value: number) => `${value.toLocaleString("de-DE", { maximumFractionDigits: 2 })} h`;
const WEEKDAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

/** Count-up for the hero amount. */
function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(origin + (target - origin) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else from.current = target;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration]);
  return value;
}

function Row({ label, value, sub, strong, tone }: { label: string; value: string; sub?: string; strong?: boolean; tone?: "plus" | "minus" | "free" }) {
  const color = tone === "minus" ? "text-rose-300" : tone === "free" ? "text-emerald-300" : "text-slate-100";
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${strong ? "text-[15px] font-bold" : "text-sm"}`}>
      <div className="min-w-0">
        <div className={strong ? "text-white" : "text-slate-200"}>{label}</div>
        {sub ? <div className="text-[11px] text-slate-500">{sub}</div> : null}
      </div>
      <div className={`shrink-0 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-white/10 py-3 first:border-t-0">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{title}</div>
      {children}
    </div>
  );
}

function Donut({ net, taxes, social }: { net: number; taxes: number; social: number }) {
  const total = Math.max(net + taxes + social, 1);
  const r = 46;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const parts = [{ v: net, color: "#3fbf79" }, { v: taxes, color: "#e0a43a" }, { v: social, color: "#6aa5ff" }];
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36" role="img" aria-label="Aufteilung des Bruttos">
      <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="14" />
      {parts.map((part, index) => {
        const length = (part.v / total) * c;
        const node = <circle key={index} cx="60" cy="60" r={r} fill="none" stroke={part.color} strokeWidth="14" strokeDasharray={`${length} ${c - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" strokeLinecap="butt" />;
        offset += length;
        return node;
      })}
      <text x="60" y="57" textAnchor="middle" className="fill-white text-[17px] font-bold">{Math.round((net / total) * 100)}%</text>
      <text x="60" y="72" textAnchor="middle" className="fill-slate-400 text-[8px] uppercase tracking-widest">netto</text>
    </svg>
  );
}

export function PayrollStatement({ result, totals, shifts, monthLabel, matched, planned, state }: {
  result: PayrollResult; totals: MonthTotals | null; shifts: MonthShift[]; monthLabel: string; matched: boolean; planned: boolean; state: "HE" | "BY";
}) {
  const animated = useCountUp(result.netPay);
  const [showShifts, setShowShifts] = useState(false);
  const withSupplement = useMemo(() => shifts.filter((shift) => shift.worked && (shift.night > 0 || shift.sunday > 0 || shift.holiday > 0)), [shifts]);

  return (
    <div className="space-y-5">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-blue-500/25 via-indigo-500/10 to-emerald-500/15 p-6">
        <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-blue-400/20 blur-3xl" />
        <div className="relative grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-300">Voraussichtlicher Auszahlungsbetrag · {monthLabel}</div>
            <div className="mt-2 text-5xl font-black tabular-nums tracking-tight text-white md:text-6xl">{euro(animated)}</div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-slate-100">Brutto <b className="tabular-nums">{euro(result.grossTotal)}</b></span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-slate-100">Steuern <b className="tabular-nums">{euro(result.taxesTotal)}</b></span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-slate-100">Sozialabgaben <b className="tabular-nums">{euro(result.socialTotal)}</b></span>
              <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-slate-100">Abzüge gesamt <b className="tabular-nums">{result.effectiveDeductionRate.toLocaleString("de-DE")} %</b></span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Donut net={Math.max(result.netPay, 0)} taxes={result.taxesTotal} social={result.socialTotal} />
            <ul className="space-y-1.5 text-xs text-slate-200">
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#3fbf79]" />Netto</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#e0a43a]" />Steuern</li>
              <li className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-sm bg-[#6aa5ff]" />Sozialabgaben</li>
            </ul>
          </div>
        </div>
      </div>

      {!planned ? <div role="status" className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Für diesen Monat gibt es noch keinen Dienstplan. Es wird nur das Grundgehalt berechnet.</div> : null}
      {planned && !matched ? <div role="status" className="rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">Dein Name konnte im Dienstplan nicht eindeutig zugeordnet werden. Zuschläge sind deshalb 0. Bitte melde das der Administration.</div> : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        {/* statement */}
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-base font-bold text-white">Abrechnung {monthLabel}</h3>
            <span className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Näherung</span>
          </div>
          <Block title="Bezüge">
            <Row label="Grundgehalt" sub={`Jahresbrutto ÷ 12 · Stundenlohn ${euro(result.hourlyWage)}`} value={euro(result.baseMonthly)} />
            {result.supplements.map((line) => (
              <Row key={line.key} label={line.label} sub={`${hoursText(line.hours)} × ${line.ratePercent} % · davon steuerfrei ${euro(line.taxFree)}`} value={euro(line.total)} tone={line.total > 0 ? "free" : undefined} />
            ))}
            {result.extrasGrossTaxable + result.extrasGrossFree > 0 ? <Row label="Weitere Zulagen (brutto)" value={euro(result.extrasGrossTaxable + result.extrasGrossFree)} /> : null}
            <div className="mt-1 border-t border-white/10"><Row label="Gesamtbrutto" value={euro(result.grossTotal)} strong /></div>
            <div className="text-[11px] text-slate-500">Davon steuerpflichtig {euro(result.taxableGross)} · sozialversicherungspflichtig {euro(result.socialGross)}</div>
          </Block>
          <Block title="Steuern">
            <Row label="Lohnsteuer" value={`− ${euro(result.incomeTax)}`} tone="minus" />
            <Row label="Solidaritätszuschlag" value={`− ${euro(result.soli)}`} tone="minus" />
            <Row label={state === "BY" ? "Kirchensteuer (Bayern 8 %)" : "Kirchensteuer (Hessen 9 %)"} value={`− ${euro(result.churchTax)}`} tone="minus" />
            <div className="border-t border-white/10"><Row label="Steuern gesamt" value={`− ${euro(result.taxesTotal)}`} tone="minus" strong /></div>
          </Block>
          <Block title="Sozialversicherung (Arbeitnehmeranteil)">
            <Row label="Krankenversicherung" sub={result.rates.health ? `${result.rates.health.toLocaleString("de-DE")} %` : undefined} value={`− ${euro(result.health)}`} tone="minus" />
            <Row label="Pflegeversicherung" sub={result.care ? `${result.rates.care.toLocaleString("de-DE")} %` : undefined} value={`− ${euro(result.care)}`} tone="minus" />
            <Row label="Rentenversicherung" sub={`${result.rates.pension.toLocaleString("de-DE")} %`} value={`− ${euro(result.pension)}`} tone="minus" />
            <Row label="Arbeitslosenversicherung" sub={`${result.rates.unemployment.toLocaleString("de-DE")} %`} value={`− ${euro(result.unemployment)}`} tone="minus" />
            <div className="border-t border-white/10"><Row label="Sozialabgaben gesamt" value={`− ${euro(result.socialTotal)}`} tone="minus" strong /></div>
          </Block>
          {result.netExtrasAdd > 0 || result.netExtrasDeduct > 0 ? (
            <Block title="Netto-Zahlungen und -Abzüge">
              {result.netExtrasAdd > 0 ? <Row label="Netto-Zahlungen" value={`+ ${euro(result.netExtrasAdd)}`} tone="free" /> : null}
              {result.netExtrasDeduct > 0 ? <Row label="Netto-Abzüge" value={`− ${euro(result.netExtrasDeduct)}`} tone="minus" /> : null}
            </Block>
          ) : null}
          <div className="mt-2 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3">
            <Row label="Auszahlungsbetrag (netto)" value={euro(result.netPay)} strong />
          </div>
        </div>

        {/* month data */}
        <div className="space-y-5">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <h3 className="text-base font-bold text-white">Zuschlagsstunden im Monat</h3>
            <p className="mt-1 text-xs text-slate-400">Aus deinem Dienstplan, mit den echten Schichtzeiten. Ändert sich der Plan (Tausch, neue Schicht), ändert sich die Abrechnung automatisch.</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { icon: <Moon className="h-4 w-4" />, label: "Nacht", value: totals?.nightHours ?? 0, color: "#8b6bd6" },
                { icon: <Sun className="h-4 w-4" />, label: "Sonntag", value: Math.max((totals?.sundayHours ?? 0) - (totals?.holidayHours ?? 0), 0), color: "#4a86e8" },
                { icon: <PartyPopper className="h-4 w-4" />, label: "Feiertag", value: totals?.holidayHours ?? 0, color: "#e08ab4" },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center">
                  <div className="mx-auto grid h-8 w-8 place-items-center rounded-lg" style={{ background: `${item.color}26`, color: item.color }}>{item.icon}</div>
                  <div className="mt-2 text-lg font-bold tabular-nums text-white">{item.value.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</div>
                  <div className="text-[10px] uppercase tracking-widest text-slate-400">{item.label} h</div>
                </div>
              ))}
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 text-center text-xs text-slate-300">
              <div><dt className="text-slate-500">Schichten</dt><dd className="font-bold text-white">{totals?.workedShifts ?? 0}</dd></div>
              <div><dt className="text-slate-500">Arbeitsstunden</dt><dd className="font-bold text-white">{(totals?.workedHours ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 1 })}</dd></div>
              <div><dt className="text-slate-500">Abwesenheit</dt><dd className="font-bold text-white">{totals?.absenceDays ?? 0} Tage</dd></div>
            </dl>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
            <button type="button" onClick={() => setShowShifts((open) => !open)} aria-expanded={showShifts} className="flex w-full items-center justify-between text-left">
              <span className="text-base font-bold text-white">Schichten mit Zuschlag ({withSupplement.length})</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showShifts ? "rotate-180" : ""}`} />
            </button>
            {showShifts ? (
              <ul className="mt-3 divide-y divide-white/5 text-sm">
                {withSupplement.map((shift) => {
                  const date = new Date(`${shift.date}T12:00:00`);
                  return (
                    <li key={shift.date} className="flex items-center justify-between gap-3 py-2">
                      <span className="text-slate-200">{WEEKDAYS[date.getDay()]} {date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })} <b className="ml-1 text-white">{shift.code}</b></span>
                      <span className="text-xs tabular-nums text-slate-400">
                        {shift.night > 0 ? `Nacht ${shift.night} h ` : ""}{shift.sunday > 0 ? `So ${shift.sunday} h ` : ""}{shift.holiday > 0 ? `FT ${shift.holiday} h` : ""}
                      </span>
                    </li>
                  );
                })}
                {withSupplement.length === 0 ? <li className="py-3 text-xs text-slate-500">Keine Schichten mit Zuschlag in diesem Monat.</li> : null}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
