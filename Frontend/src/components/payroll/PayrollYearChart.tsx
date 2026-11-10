/* Payroll: net and gross pay per month of the year (only months with a plan). Computed in the browser from the own profile. */

import { useMemo, useState } from "react";

export interface YearChartPoint { month: number; net: number; gross: number }

const SHORT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const euro = (value: number) => value.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const W = 720;
const H = 260;
const PAD = { left: 56, right: 12, top: 16, bottom: 28 };

function niceMax(value: number): number {
  if (!(value > 0)) return 1000;
  const step = Math.pow(10, Math.floor(Math.log10(value)));
  return Math.ceil(value / step) * step;
}

export function PayrollYearChart({ year, points, selectedMonth, onSelect, loading }: {
  year: number;
  points: YearChartPoint[];
  selectedMonth: number;
  onSelect: (month: number) => void;
  loading?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const byMonth = useMemo(() => new Map(points.map((point) => [point.month, point])), [points]);
  const max = niceMax(Math.max(0, ...points.map((point) => point.gross)));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const slot = innerW / 12;
  const barW = Math.min(34, slot * 0.6);
  const y = (value: number) => PAD.top + innerH - (value / max) * innerH;
  const totalNet = points.reduce((sum, point) => sum + point.net, 0);
  const totalGross = points.reduce((sum, point) => sum + point.gross, 0);
  const shown = hover ?? selectedMonth;
  const active = byMonth.get(shown);

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-white">Gehalt im Jahr {year}</h3>
          <p className="text-xs text-slate-400">Netto je Monat (Balken) und Brutto (Linie), nur Monate mit vorliegendem Dienstplan. Näherungswerte.</p>
        </div>
        <div className="text-right text-xs text-slate-300">
          <div>Summe netto: <strong className="text-emerald-300">{euro(totalNet)}</strong></div>
          <div>Summe brutto: <strong className="text-slate-100">{euro(totalGross)}</strong></div>
        </div>
      </div>

      {points.length === 0 ? (
        <div role="status" className="py-12 text-center text-sm text-slate-400">{loading ? "Lade …" : "Für dieses Jahr liegt noch kein Dienstplan mit deinen Schichten vor."}</div>
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label={`Netto- und Bruttogehalt pro Monat ${year}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <g key={fraction}>
                <line x1={PAD.left} x2={W - PAD.right} y1={y(max * fraction)} y2={y(max * fraction)} stroke="rgba(148,163,184,0.18)" strokeDasharray={fraction === 0 ? undefined : "3 4"} />
                <text x={PAD.left - 8} y={y(max * fraction) + 3} textAnchor="end" fontSize="10" fill="rgb(148,163,184)">{euro(max * fraction)}</text>
              </g>
            ))}
            {SHORT.map((label, index) => {
              const month = index + 1;
              const point = byMonth.get(month);
              const cx = PAD.left + slot * index + slot / 2;
              const selected = month === selectedMonth;
              return (
                <g key={label} onMouseEnter={() => setHover(month)} onMouseLeave={() => setHover(null)} onClick={() => point && onSelect(month)} style={{ cursor: point ? "pointer" : "default" }}>
                  <rect x={cx - slot / 2} y={PAD.top} width={slot} height={innerH + PAD.bottom} fill="transparent" />
                  {point ? (
                    <rect x={cx - barW / 2} y={y(point.net)} width={barW} height={Math.max(1, y(0) - y(point.net))} rx="4" fill={selected ? "rgb(52,211,153)" : "rgba(52,211,153,0.55)"} />
                  ) : null}
                  <text x={cx} y={H - 9} textAnchor="middle" fontSize="11" fontWeight={selected ? 700 : 400} fill={selected ? "rgb(241,245,249)" : "rgb(148,163,184)"}>{label}</text>
                </g>
              );
            })}
            <polyline
              fill="none"
              stroke="rgb(96,165,250)"
              strokeWidth="2"
              strokeLinejoin="round"
              points={points.map((point) => `${PAD.left + slot * (point.month - 1) + slot / 2},${y(point.gross)}`).join(" ")}
            />
            {points.map((point) => (
              <circle key={point.month} cx={PAD.left + slot * (point.month - 1) + slot / 2} cy={y(point.gross)} r="3.5" fill="rgb(96,165,250)" />
            ))}
          </svg>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-300" aria-live="polite">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" />Netto</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 bg-blue-400" />Brutto</span>
            {active ? <span className="ml-auto font-semibold text-slate-100">{SHORT[shown - 1]}: netto {euro(active.net)} · brutto {euro(active.gross)}</span> : null}
          </div>
        </>
      )}
    </div>
  );
}
