import { RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MarketHistory, MarketQuote } from "../api/market";

type Props = {
  market: MarketQuote | null;
  history: MarketHistory | null;
  loading: boolean;
  error: string;
};

function formatDollar(value?: number | null, fractionDigits = 2) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "–";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function MarketChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value?: number }>; label?: string }) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 shadow-xl">
      <div className="text-[10px] text-slate-400">{new Date(label).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}</div>
      <div className="mt-1 text-sm font-bold tabular-nums text-white">{formatDollar(payload[0]?.value)}</div>
    </div>
  );
}

export default function EqixHistoryPanel({ market, history, loading, error }: Props) {
  const positive = Number(history?.changePercent ?? market?.changePercent ?? 0) >= 0;

  return (
    <section role="dialog" aria-label="EQIX Aktienkurs der letzten 12 Monate" className="absolute right-0 top-[52px] z-50 w-[min(560px,calc(100vw-24px))] animate-[odin-weather-panel-in_180ms_ease-out] overflow-hidden rounded-xl border border-slate-600 bg-slate-950 shadow-2xl shadow-black/60">
      <div className="border-b border-slate-700 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Equinix · NASDAQ: EQIX</div>
            <div className="mt-2 text-3xl font-semibold tabular-nums text-white">{formatDollar(market?.price)}</div>
            <div className="mt-1 text-[11px] text-slate-500">Aktueller Kurs · USD</div>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-right ${positive ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">12 Monate</div>
            <div className={`mt-1 flex items-center justify-end gap-1 text-lg font-bold tabular-nums ${positive ? "text-emerald-300" : "text-red-300"}`}>
              {positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {typeof history?.changePercent === "number" ? `${history.changePercent >= 0 ? "+" : ""}${history.changePercent.toFixed(2)}%` : "–"}
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-3 pt-4">
        {loading ? (
          <div className="flex h-60 items-center justify-center gap-2 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" />12-Monats-Verlauf wird geladen...</div>
        ) : history?.available && history.points.length > 1 ? (
          <div className="h-60 w-full" aria-label="EQIX Kursgraph über zwölf Monate">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history.points} margin={{ top: 8, right: 8, bottom: 2, left: 2 }}>
                <defs>
                  <linearGradient id="eqixHistoryFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={positive ? "#34d399" : "#f87171"} stopOpacity={0.36} />
                    <stop offset="100%" stopColor={positive ? "#34d399" : "#f87171"} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#1e293b" strokeDasharray="3 5" vertical={false} />
                <XAxis dataKey="date" axisLine={false} tickLine={false} minTickGap={44} tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(value) => new Date(value).toLocaleDateString("de-DE", { month: "short" })} />
                <YAxis axisLine={false} tickLine={false} width={52} domain={["auto", "auto"]} tick={{ fill: "#64748b", fontSize: 9 }} tickFormatter={(value) => `$${Math.round(Number(value))}`} />
                <Tooltip content={<MarketChartTooltip />} cursor={{ stroke: "#64748b", strokeDasharray: "3 3" }} />
                <Area type="monotone" dataKey="price" stroke={positive ? "#34d399" : "#f87171"} strokeWidth={2.5} fill="url(#eqixHistoryFill)" activeDot={{ r: 4, strokeWidth: 0 }} isAnimationActive animationDuration={700} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-60 items-center justify-center text-sm text-slate-500">{error || "Der 12-Monats-Verlauf ist momentan nicht verfügbar."}</div>
        )}

        <div className="mt-2 grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"><div className="text-[9px] uppercase tracking-wider text-slate-500">Veränderung</div><div className={`mt-1 text-xs font-bold tabular-nums ${positive ? "text-emerald-300" : "text-red-300"}`}>{typeof history?.change === "number" ? `${history.change >= 0 ? "+" : ""}${formatDollar(history.change)}` : "–"}</div></div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"><div className="text-[9px] uppercase tracking-wider text-slate-500">12M Tief</div><div className="mt-1 text-xs font-bold tabular-nums text-slate-200">{formatDollar(history?.minPrice)}</div></div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2"><div className="text-[9px] uppercase tracking-wider text-slate-500">12M Hoch</div><div className="mt-1 text-xs font-bold tabular-nums text-slate-200">{formatDollar(history?.maxPrice)}</div></div>
        </div>
        {history?.stale ? <div className="mt-2 text-[10px] text-amber-300">Zuletzt gespeicherter Verlauf. Aktualisierung läuft.</div> : null}
        <div className="mt-3 border-t border-slate-800 pt-2 text-right text-[9px] text-slate-600">Marktdaten: Yahoo Finance · zeitverzögert</div>
      </div>
    </section>
  );
}
