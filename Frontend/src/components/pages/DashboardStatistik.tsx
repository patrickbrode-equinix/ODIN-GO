import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CheckCircle2,
  Clock3,
  Crown,
  RefreshCw,
  ShieldAlert,
  Ticket,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";

import { api } from "../../api/api";
import { logActivityEventSafe } from "../../api/activity";
import { dedupeEmployeeNames } from "../../utils/employeeNames";
import { fetchWellbeingAnalytics, type WellbeingAnalyticsResponse, type WellbeingAnalyticsRow } from "../../api/wellbeing";
import { getLanguageLocale, useLanguage } from "../../context/LanguageContext";
import { useTheme } from "../ThemeProvider";
import { EnterpriseCard, EnterpriseKpiCard, EnterprisePageShell } from "../layout/EnterpriseLayout";

type AnalyticsRange = "month" | "quarter" | "year";
type AnalyticsGroup = "tickets" | "team" | "wellbeing";

type HourBucket = {
  hour: number;
  label: string;
  count: number;
};

type QueueBucket = {
  queue: string;
  count: number;
};

type OwnerRankingRow = {
  worker: string;
  total: number;
  sh: number;
  tt: number;
  cc: number;
};

type CloserRankingRow = {
  worker: string;
  closed: number;
  sh: number;
  tt: number;
  cc: number;
};

type ManualTakeoverRow = {
  worker: string;
  count: number;
  total: number;
  percentage: number;
  lastTakeover: string | null;
  ticketTypes: string[];
};

type DashboardAnalyticsResponse = {
  from: string;
  to: string;
  summary: {
    dispatchTotal: number;
    closedTotal: number;
    overdueActive: number;
    onTrackActive: number;
    activeOwned: number;
    activeUnassigned: number;
    activeOwners: number;
  };
  tickets: {
    dispatchByHour: HourBucket[];
    closedByHour: HourBucket[];
    troubleDispatchByHour: HourBucket[];
    overdueByQueue: QueueBucket[];
  };
  team: {
    ownerRanking: OwnerRankingRow[];
    closerRanking: CloserRankingRow[];
    manualTakeovers: ManualTakeoverRow[];
  };
};

type EmployeeDrilldownResponse = {
  from: string;
  to: string;
  worker: string;
  summary: {
    activeOwned: number;
    closedTotal: number;
    sh: number;
    tt: number;
    cc: number;
    manualTakeovers: number;
  };
  closedByDay: Array<{ day: string; count: number }>;
  manualByDay: Array<{ day: string; count: number }>;
};

type DistributionMetrics = {
  average: number;
  min: number;
  max: number;
  spread: number;
  topShare: number;
  aboveAverageCount: number;
};

type WorkerMixRow = {
  worker: string;
  label: string;
  total: number;
  sh: number;
  tt: number;
  cc: number;
  other: number;
};

const STATS_PREMIUM_PILL = "relative overflow-hidden rounded-full border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] transition duration-200";
const PREMIUM_CHART_FRAME_CLASS = "relative overflow-hidden rounded-[24px] border border-sky-200/70 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,249,255,0.92))] p-3 shadow-[0_24px_52px_rgba(148,163,184,0.16),0_0_30px_rgba(56,189,248,0.08)] dark:border-cyan-400/15 dark:bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_42%),linear-gradient(180deg,rgba(8,12,28,0.84),rgba(8,12,28,0.74))] dark:shadow-[0_18px_48px_rgba(0,0,0,0.44),0_0_30px_rgba(34,211,238,0.10)]";

const TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "#081224",
  border: "1px solid rgba(148, 163, 184, 0.16)",
  borderRadius: "14px",
  color: "#e2e8f0",
  boxShadow: "0 20px 60px rgba(2, 6, 23, 0.6)",
  padding: "12px 14px",
  fontSize: "12px",
};

const LIGHT_TOOLTIP_STYLE: CSSProperties = {
  backgroundColor: "rgba(255, 255, 255, 0.98)",
  border: "1px solid rgba(148, 163, 184, 0.24)",
  borderRadius: "14px",
  color: "#0f172a",
  boxShadow: "0 18px 44px rgba(15, 23, 42, 0.12)",
  padding: "12px 14px",
  fontSize: "12px",
};

const AXIS_TICK = { fontSize: 11, fill: "#94a3b8" };
const GRID_STROKE = "rgba(148, 163, 184, 0.12)";
const LEGEND_STYLE: CSSProperties = { color: "#cbd5e1", fontSize: 12, paddingTop: 10 };

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getQuarterStart(date: Date) {
  return new Date(date.getFullYear(), Math.floor(date.getMonth() / 3) * 3, 1);
}
function resolveSelectedRange(range: AnalyticsRange) {
  const now = new Date();
  const today = formatLocalDate(now);

  switch (range) {
    case "quarter": {
      return { from: formatLocalDate(getQuarterStart(now)), to: today };
    }
    case "year":
      return { from: `${now.getFullYear()}-01-01`, to: today };
    case "month":
    default:
      return { from: formatLocalDate(getMonthStart(now)), to: today };
  }
}

function formatDateLabel(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
  });
}

function formatDateTimeLabel(value: string | null, locale: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(locale, {
    timeZone: "Europe/Berlin",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLastRefresh(value: Date, locale: string) {
  return value.toLocaleTimeString(locale, {
    timeZone: "Europe/Berlin",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center rounded-[24px] border border-dashed border-border/45 bg-background/35 px-6 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function PanelHeader({
  eyebrow,
  title,
  subtitle,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300/75">{eyebrow}</div>
        <div className="mt-2 text-lg font-semibold text-foreground">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

function getPeakBucket(data: HourBucket[]) {
  return data.reduce<HourBucket | null>((peak, entry) => {
    if (!peak || entry.count > peak.count) return entry;
    return peak;
  }, null);
}

function computeDistributionMetrics(values: number[]): DistributionMetrics {
  if (!values.length) {
    return {
      average: 0,
      min: 0,
      max: 0,
      spread: 0,
      topShare: 0,
      aboveAverageCount: 0,
    };
  }

  const total = values.reduce((sum, value) => sum + value, 0);
  const average = total / values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    average,
    min,
    max,
    spread: max - min,
    topShare: total > 0 ? Math.round((max / total) * 100) : 0,
    aboveAverageCount: values.filter((value) => value > average).length,
  };
}

function buildDailySeries(
  from: string | undefined,
  to: string | undefined,
  closedByDay: Array<{ day: string; count: number }>,
  manualByDay: Array<{ day: string; count: number }>,
  locale: string
) {
  if (!from || !to) return [];

  const closedMap = new Map(closedByDay.map((entry) => [entry.day, entry.count]));
  const manualMap = new Map(manualByDay.map((entry) => [entry.day, entry.count]));
  const rows: Array<{ day: string; label: string; closed: number; manual: number }> = [];

  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    const iso = formatLocalDate(cursor);
    rows.push({
      day: iso,
      label: formatDateLabel(iso, locale),
      closed: closedMap.get(iso) || 0,
      manual: manualMap.get(iso) || 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return rows;
}

function truncateLabel(value: string, maxLength = 12) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
}

function buildWorkerMixRows(
  rows: Array<OwnerRankingRow | CloserRankingRow>,
  valueKey: "total" | "closed",
  maxItems = 8
): WorkerMixRow[] {
  return rows.slice(0, maxItems).map((row) => {
    const total = valueKey === "total" ? (row as OwnerRankingRow).total : (row as CloserRankingRow).closed;
    const other = Math.max(0, total - row.sh - row.tt - row.cc);
    return {
      worker: row.worker,
      label: truncateLabel(row.worker, 11),
      total,
      sh: row.sh,
      tt: row.tt,
      cc: row.cc,
      other,
    };
  });
}

function computeExceptionalShiftThreshold(rows: WellbeingAnalyticsRow[]) {
  if (!rows.length) return Number.POSITIVE_INFINITY;
  const averageAssignments = rows.reduce((sum, row) => sum + row.totalAssignments, 0) / rows.length;
  return Math.max(12, Math.ceil(averageAssignments * 1.35));
}

function StatChip({ label, value, tone }: { label: string; value: number | string; tone: string }) {
  return (
    <div className="rounded-[20px] border border-border/45 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.38),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.12)),var(--surface-1)] px-3 py-2 shadow-[0_14px_30px_rgba(148,163,184,0.14)] dark:bg-background/35 dark:shadow-none">
      <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-black" style={{ color: tone }}>{value}</div>
    </div>
  );
}

function HourlyBarTile({
  eyebrow,
  title,
  subtitle,
  data,
  color,
  emptyLabel,
  valueLabel,
  peakLabel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  data: HourBucket[];
  color: string;
  emptyLabel: string;
  valueLabel: string;
  peakLabel: string;
  isLight?: boolean;
}) {
  const peak = useMemo(() => getPeakBucket(data), [data]);
  const maxCount = peak?.count || 0;

  return (
    <EnterpriseCard>
      <PanelHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={peak && peak.count > 0 ? (
          <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-100">
            {peakLabel}: {peak.label}
          </div>
        ) : null}
      />

      {data.every((entry) => entry.count === 0) ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className={`h-[300px] ${PREMIUM_CHART_FRAME_CLASS}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => String(value).slice(0, 2)}
                minTickGap={0}
              />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value: number) => [String(value), valueLabel]}
                labelFormatter={(label) => `${label}`}
              />
              <Bar dataKey="count" radius={[10, 10, 0, 0]} style={{ filter: "drop-shadow(0 0 12px rgba(56,189,248,0.22))" }}>
                {data.map((entry) => (
                  <Cell
                    key={entry.label}
                    fill={entry.count === maxCount && maxCount > 0 ? "#7dd3fc" : color}
                    opacity={entry.count === maxCount && maxCount > 0 ? 1 : 0.88}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </EnterpriseCard>
  );
}

function QueueRiskTile({
  title,
  subtitle,
  eyebrow,
  data,
  emptyLabel,
}: {
  title: string;
  subtitle: string;
  eyebrow: string;
  data: QueueBucket[];
  emptyLabel: string;
}) {
  const maxValue = Math.max(...data.map((entry) => entry.count), 1);

  return (
    <EnterpriseCard>
      <PanelHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />

      {data.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="space-y-4">
          {data.map((entry) => (
            <div key={entry.queue} className="rounded-[22px] border border-border/40 bg-background/35 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-foreground">{entry.queue}</span>
                <span className="font-semibold text-rose-600 dark:text-rose-200">{entry.count}</span>
              </div>
              <div className="h-2 rounded-full bg-background/70">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,#fb7185,#f43f5e)]"
                  style={{ width: `${Math.max(10, (entry.count / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </EnterpriseCard>
  );
}

function RankingTile({
  eyebrow,
  title,
  subtitle,
  rows,
  emptyLabel,
  valueKey,
  accentTone,
  valueLabel,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  rows: Array<OwnerRankingRow | CloserRankingRow>;
  emptyLabel: string;
  valueKey: "total" | "closed";
  accentTone: string;
  valueLabel: string;
}) {
  return (
    <EnterpriseCard>
      <PanelHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />

      {rows.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="space-y-3">
          {rows.slice(0, 10).map((row, index) => {
            const value = valueKey === "total" ? (row as OwnerRankingRow).total : (row as CloserRankingRow).closed;
            return (
              <div key={row.worker} className="rounded-[22px] border border-border/40 bg-background/35 px-4 py-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: accentTone }}>#{index + 1}</span>
                      <span className="truncate text-sm font-semibold text-foreground">{row.worker}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-2 py-0.5">SH {row.sh}</span>
                      <span className="rounded-full border border-rose-400/20 bg-rose-400/10 px-2 py-0.5">TT {row.tt}</span>
                      <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5">CC {row.cc}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-black" style={{ color: accentTone }}>{value}</div>
                    <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{valueLabel}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </EnterpriseCard>
  );
}

function DistributionTile({
  eyebrow,
  title,
  subtitle,
  metrics,
  topRows,
  valueKey,
  emptyLabel,
  isGerman,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  metrics: DistributionMetrics;
  topRows: OwnerRankingRow[];
  valueKey: "total";
  emptyLabel: string;
  isGerman: boolean;
}) {
  const chartRows = useMemo(() => buildWorkerMixRows(topRows, valueKey), [topRows, valueKey]);
  const maxValue = Math.max(...topRows.map((row) => row[valueKey]), 1);

  return (
    <EnterpriseCard>
      <PanelHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />

      {topRows.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatChip label={isGerman ? "Ø Load" : "Avg load"} value={metrics.average.toFixed(1)} tone="#38bdf8" />
            <StatChip label={isGerman ? "Top Share" : "Top share"} value={`${metrics.topShare}%`} tone="#f59e0b" />
            <StatChip label={isGerman ? "Spread" : "Spread"} value={metrics.spread} tone="#a78bfa" />
            <StatChip label={isGerman ? "Max" : "Max"} value={metrics.max} tone="#22c55e" />
            <StatChip label={isGerman ? "Min" : "Min"} value={metrics.min} tone="#94a3b8" />
            <StatChip label={isGerman ? "> Ø" : "> avg"} value={metrics.aboveAverageCount} tone="#fb7185" />
          </div>

          <div className={PREMIUM_CHART_FRAME_CLASS}>
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{isGerman ? "Aktive Last pro Owner" : "Active load per owner"}</span>
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-1 text-cyan-700 dark:text-cyan-100">
                {isGerman ? "Ø" : "Avg"} {metrics.average.toFixed(1)}
              </span>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 10, right: 10, bottom: 4, left: -18 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={4} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(label, payload) => {
                      const row = Array.isArray(payload) ? (payload[0]?.payload as WorkerMixRow | undefined) : undefined;
                      return row?.worker || String(label);
                    }}
                    formatter={(value: number) => [String(value), isGerman ? "aktive Tickets" : "active tickets"]}
                  />
                  <ReferenceLine y={Number(metrics.average.toFixed(1))} stroke="#7dd3fc" strokeDasharray="4 4" ifOverflow="extendDomain" />
                  <Bar dataKey="total" radius={[10, 10, 0, 0]} style={{ filter: "drop-shadow(0 0 12px rgba(56,189,248,0.22))" }}>
                    {chartRows.map((row) => (
                      <Cell key={row.worker} fill={row.total === metrics.max ? "#7dd3fc" : "#38bdf8"} opacity={row.total === metrics.max ? 1 : 0.86} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="space-y-3">
            {topRows.slice(0, 8).map((row) => (
              <div key={row.worker} className="rounded-[20px] border border-border/40 bg-background/35 px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-foreground">{row.worker}</span>
                  <span className="font-semibold text-cyan-700 dark:text-cyan-100">{row[valueKey]}</span>
                </div>
                <div className="h-2 rounded-full bg-background/70">
                  <div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#818cf8)]"
                    style={{ width: `${Math.max(8, (row[valueKey] / maxValue) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </EnterpriseCard>
  );
}

function ManualTakeoverTile({
  rows,
  emptyLabel,
  locale,
  isGerman,
}: {
  rows: ManualTakeoverRow[];
  emptyLabel: string;
  locale: string;
  isGerman: boolean;
}) {
  const chartRows = useMemo(
    () => rows.slice(0, 8).map((row) => ({
      worker: row.worker,
      label: truncateLabel(row.worker, 13),
      count: row.count,
      percentage: row.percentage,
      total: row.total,
    })),
    [rows]
  );

  return (
    <EnterpriseCard>
      <PanelHeader
        eyebrow={isGerman ? "Manuelle Übernahmen" : "Manual takeovers"}
        title={isGerman ? "Wer Tickets ohne Auto-Zuweisung genommen hat" : "Who picked tickets without auto-assignment"}
        subtitle={isGerman ? "Selbstständig übernommene Tickets im gewählten Zeitraum." : "Self-picked tickets in the selected period."}
      />

      {rows.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="space-y-3">
          <div className={PREMIUM_CHART_FRAME_CLASS}>
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>{isGerman ? "Takeover Verteilung" : "Takeover distribution"}</span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1 text-amber-700 dark:text-amber-100">
                {rows[0]?.worker || (isGerman ? "Kein Leader" : "No leader")}
              </span>
            </div>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={chartRows} margin={{ top: 4, right: 18, bottom: 4, left: 16 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" horizontal vertical={false} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={88} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(label, payload) => {
                      const row = Array.isArray(payload) ? (payload[0]?.payload as { worker?: string; percentage?: number } | undefined) : undefined;
                      if (!row?.worker) return String(label);
                      return `${row.worker} | ${row.percentage || 0}%`;
                    }}
                    formatter={(value: number) => [String(value), isGerman ? "Übernahmen" : "takeovers"]}
                  />
                  <Bar dataKey="count" radius={[0, 10, 10, 0]} style={{ filter: "drop-shadow(0 0 12px rgba(245,158,11,0.22))" }}>
                    {chartRows.map((row) => (
                      <Cell
                        key={row.worker}
                        fill={row.percentage >= 50 ? "#f59e0b" : row.percentage >= 25 ? "#fbbf24" : "#fde68a"}
                        opacity={0.95}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {rows.slice(0, 10).map((row, index) => (
            <div key={row.worker} className="rounded-[22px] border border-amber-400/15 bg-amber-500/10 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/70">#{index + 1}</span>
                    <span className="truncate text-sm font-semibold text-foreground">{row.worker}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">{row.ticketTypes.join(", ") || (isGerman ? "Keine Typen" : "No ticket types")}</div>
                  <div className="mt-2 text-[11px] text-muted-foreground">
                    {isGerman ? "Letzte Übernahme" : "Last takeover"}: {formatDateTimeLabel(row.lastTakeover, locale)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-amber-700 dark:text-amber-100">{row.count}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-amber-700/75 dark:text-amber-100/75">{row.percentage}%</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </EnterpriseCard>
  );
}

function WorkerMixChartTile({
  eyebrow,
  title,
  subtitle,
  rows,
  valueKey,
  emptyLabel,
  isGerman,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  rows: Array<OwnerRankingRow | CloserRankingRow>;
  valueKey: "total" | "closed";
  emptyLabel: string;
  isGerman: boolean;
}) {
  const data = useMemo(() => buildWorkerMixRows(rows, valueKey), [rows, valueKey]);
  const average = data.length ? data.reduce((sum, row) => sum + row.total, 0) / data.length : 0;

  return (
    <EnterpriseCard>
      <PanelHeader
        eyebrow={eyebrow}
        title={title}
        subtitle={subtitle}
        actions={
          average > 0 ? (
            <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-100">
              {isGerman ? "Ø" : "Avg"}: {average.toFixed(1)}
            </div>
          ) : null
        }
      />

      {data.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className={`h-[320px] ${PREMIUM_CHART_FRAME_CLASS}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, bottom: 4, left: -18 }}>
              <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={6} />
              <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                labelFormatter={(label, payload) => {
                  const row = Array.isArray(payload) ? (payload[0]?.payload as WorkerMixRow | undefined) : undefined;
                  return row?.worker || String(label);
                }}
                formatter={(value: number, name: string) => {
                  const labels: Record<string, string> = {
                    sh: "SH",
                    tt: "TT",
                    cc: "CC",
                    other: isGerman ? "Andere" : "Other",
                  };
                  return [String(value), labels[name] || name];
                }}
              />
              <Legend wrapperStyle={LEGEND_STYLE} />
              <ReferenceLine y={Number(average.toFixed(1))} stroke="#7dd3fc" strokeDasharray="4 4" ifOverflow="extendDomain" />
              <Bar dataKey="sh" stackId="mix" fill="#38bdf8" name="SH" style={{ filter: "drop-shadow(0 0 10px rgba(56,189,248,0.18))" }} />
              <Bar dataKey="tt" stackId="mix" fill="#fb7185" name="TT" style={{ filter: "drop-shadow(0 0 10px rgba(251,113,133,0.18))" }} />
              <Bar dataKey="cc" stackId="mix" fill="#f59e0b" name="CC" style={{ filter: "drop-shadow(0 0 10px rgba(245,158,11,0.18))" }} />
              <Bar dataKey="other" stackId="mix" fill="#6366f1" name={isGerman ? "Andere" : "Other"} radius={[8, 8, 0, 0]} style={{ filter: "drop-shadow(0 0 10px rgba(99,102,241,0.18))" }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </EnterpriseCard>
  );
}

function WellbeingStackedTile({
  eyebrow,
  title,
  subtitle,
  rows,
  emptyLabel,
  isGerman,
  tooltipStyle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  rows: WellbeingAnalyticsRow[];
  emptyLabel: string;
  isGerman: boolean;
  tooltipStyle: CSSProperties;
}) {
  const chartRows = useMemo(
    () => rows.map((row) => ({
      ...row,
      label: truncateLabel(row.worker, 16),
    })),
    [rows]
  );

  return (
    <EnterpriseCard>
      <PanelHeader eyebrow={eyebrow} title={title} subtitle={subtitle} />

      {chartRows.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1 text-rose-700 dark:text-rose-100">{isGerman ? "Nacht" : "Night"}</span>
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-amber-700 dark:text-amber-100">{isGerman ? "Wochenende" : "Weekend"}</span>
            <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-3 py-1 text-fuchsia-700 dark:text-fuchsia-100">{isGerman ? "Feiertag" : "Holiday"}</span>
            <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-sky-700 dark:text-sky-100">{isGerman ? "Spätschicht" : "Late shift"}</span>
          </div>

          <div className={PREMIUM_CHART_FRAME_CLASS}>
            <div className="h-[560px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={chartRows} margin={{ top: 6, right: 20, bottom: 6, left: 16 }}>
                  <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" horizontal vertical={false} />
                  <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} width={112} />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(label, payload) => {
                      const row = Array.isArray(payload) ? (payload[0]?.payload as WellbeingAnalyticsRow | undefined) : undefined;
                      return row?.worker || String(label);
                    }}
                  />
                  <Legend wrapperStyle={LEGEND_STYLE} />
                  <Bar dataKey="holidayCount" stackId="burden" fill="#d946ef" name={isGerman ? "Feiertag" : "Holiday"} style={{ filter: "drop-shadow(0 0 10px rgba(217,70,239,0.16))" }} />
                  <Bar dataKey="weekendCount" stackId="burden" fill="#f59e0b" name={isGerman ? "Wochenende" : "Weekend"} style={{ filter: "drop-shadow(0 0 10px rgba(245,158,11,0.16))" }} />
                  <Bar dataKey="nightCount" stackId="burden" fill="#f43f5e" name={isGerman ? "Nacht" : "Night"} style={{ filter: "drop-shadow(0 0 10px rgba(244,63,94,0.16))" }} />
                  <Bar dataKey="lateCount" stackId="burden" fill="#38bdf8" name={isGerman ? "Spätschicht" : "Late shift"} radius={[0, 10, 10, 0]} style={{ filter: "drop-shadow(0 0 10px rgba(56,189,248,0.16))" }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </EnterpriseCard>
  );
}

function WellbeingRankingTile({
  rows,
  emptyLabel,
  isGerman,
  config,
  highLoadThreshold,
}: {
  rows: WellbeingAnalyticsRow[];
  emptyLabel: string;
  isGerman: boolean;
  config: WellbeingAnalyticsResponse["config"] | null;
  highLoadThreshold: number;
}) {
  return (
    <EnterpriseCard>
      <PanelHeader
        eyebrow={isGerman ? "Wellbeing Ranking" : "Wellbeing ranking"}
        title={isGerman ? "Absteigende Liste der belasteten Schichtmuster" : "Descending list of high-burden shift patterns"}
        subtitle={isGerman ? "Sortiert nach Belastungsscore aus Nacht-, Spät-, Wochenend- und Feiertagsschichten. Abwesenheit wird separat angezeigt und nicht in Burden eingerechnet." : "Sorted by burden score across night, late, weekend, and holiday shifts. Absence is shown separately and never counted into burden."}
        actions={config ? (
          <div className="rounded-full border border-sky-400/20 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-700 dark:text-sky-100">
            N {config.nightThreshold} | WE {config.weekendThreshold} | ST {config.streakThreshold}
          </div>
        ) : null}
      />

      {rows.length === 0 ? (
        <EmptyState label={emptyLabel} />
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => {
            const hasExceptionalLoad = row.totalAssignments >= highLoadThreshold;
            return (
            <div key={row.worker} className={`rounded-[22px] border border-border/40 bg-background/35 px-4 py-3 ${hasExceptionalLoad ? "premium-signal-pulse border-sky-300/60 shadow-[0_0_28px_rgba(56,189,248,0.14)] dark:border-cyan-300/30 dark:shadow-[0_0_32px_rgba(34,211,238,0.12)]" : ""}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700 dark:text-sky-300/80">#{index + 1}</span>
                    <span className="truncate text-sm font-semibold text-foreground">{row.worker}</span>
                    {hasExceptionalLoad ? (
                      <span className="rounded-full border border-sky-300/50 bg-sky-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700 dark:border-cyan-300/30 dark:bg-cyan-400/12 dark:text-cyan-100">
                        {isGerman ? "High Load" : "High load"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <span className="rounded-full border border-rose-400/20 bg-rose-500/10 px-2 py-0.5">{row.nightCount} {isGerman ? "Nacht" : "night"}</span>
                    <span className="rounded-full border border-sky-400/20 bg-sky-500/10 px-2 py-0.5">{row.lateCount} {isGerman ? "Spät" : "late"}</span>
                    <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-0.5">{row.weekendCount} {isGerman ? "WE" : "weekend"}</span>
                    <span className="rounded-full border border-fuchsia-400/20 bg-fuchsia-500/10 px-2 py-0.5">{row.holidayCount} {isGerman ? "Feiertag" : "holiday"}</span>
                    <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2 py-0.5">{row.maxStreak} {isGerman ? "Streak" : "streak"}</span>
                    <span className="rounded-full border border-slate-300/40 bg-white/80 px-2 py-0.5 text-slate-600 shadow-[0_10px_24px_rgba(148,163,184,0.1)] dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:shadow-none">{row.totalAssignments} {isGerman ? "Schichten" : "shifts"}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black text-sky-700 dark:text-sky-100">{row.burdenScore}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{isGerman ? "Burden" : "Burden"}</div>
                </div>
              </div>
            </div>
          );})}
        </div>
      )}
    </EnterpriseCard>
  );
}

export default function DashboardStatistik() {
  const { language } = useLanguage();
  const { theme } = useTheme();
  const isGerman = language === "de";
  const isLight = theme === "light";
  const locale = getLanguageLocale(language);

  const [range, setRange] = useState<AnalyticsRange>("month");
  const [group, setGroup] = useState<AnalyticsGroup>("tickets");
  const [analytics, setAnalytics] = useState<DashboardAnalyticsResponse | null>(null);
  const [wellbeingAnalytics, setWellbeingAnalytics] = useState<WellbeingAnalyticsResponse | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [employeeDrilldown, setEmployeeDrilldown] = useState<EmployeeDrilldownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [drilldownError, setDrilldownError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const rangeOptions = useMemo(
    () => [
      { key: "month" as const, label: isGerman ? "Monat" : "Month" },
      { key: "quarter" as const, label: isGerman ? "Quartal" : "Quarter" },
      { key: "year" as const, label: isGerman ? "Jahr" : "Year" },
    ],
    [isGerman]
  );

  const groupOptions = useMemo(
    () => [
      {
        key: "tickets" as const,
        label: isGerman ? "Ticket Statistiken" : "Ticket statistics",
        subtitle: isGerman ? "Drop-Zeiten, Commit-Risiko und Peak-Stunden" : "Drop times, commit risk, and peak hours",
      },
      {
        key: "team" as const,
        label: isGerman ? "Team Statistiken" : "Team statistics",
        subtitle: isGerman ? "Owner-Ranking, Closures, Fairness und Drilldown" : "Owner ranking, closures, fairness, and drilldown",
      },
      {
        key: "wellbeing" as const,
        label: isGerman ? "Wellbeing" : "Wellbeing",
        subtitle: isGerman ? "Belastende Schichtmuster, Feiertage und Fairness je Mitarbeiter" : "Demanding shift patterns, holidays, and fairness per employee",
      },
    ],
    [isGerman]
  );

  const logInteraction = useCallback((action: string, details: Record<string, unknown> = {}) => {
    logActivityEventSafe({
      action,
      module: "DASHBOARD",
      details: {
        screen: "statistics-hub-v3",
        range,
        group,
        ...details,
      },
    });
  }, [group, range]);

  const activeParams = useMemo(() => ({ range }), [range]);

  const handleRangeChange = useCallback((nextRange: AnalyticsRange) => {
    if (range === nextRange) return;
    logInteraction("STATISTICS_RANGE_CHANGED", { nextRange });
    setRange(nextRange);
  }, [logInteraction, range]);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const [dashboardResponse, wellbeingResponse] = await Promise.all([
        api.get<DashboardAnalyticsResponse>("/stats/audit/dashboard-analytics", {
          params: activeParams,
        }),
        fetchWellbeingAnalytics(activeParams),
      ]);
      setAnalytics(dashboardResponse.data);
      setWellbeingAnalytics(wellbeingResponse);
      setLastRefresh(new Date());
    } catch (error) {
      console.error("Failed to load dashboard statistics", error);
      setFetchError(isGerman ? "Statistiken konnten nicht geladen werden." : "Statistics could not be loaded.");
      setAnalytics(null);
      setWellbeingAnalytics(null);
    } finally {
      setLoading(false);
    }
  }, [activeParams, isGerman]);

  useEffect(() => {
    logActivityEventSafe({
      action: "PAGE_VIEW",
      module: "DASHBOARD",
      details: { view: "statistics-hub-v3" },
    });
  }, []);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  const employeeOptions = useMemo(() => {
    const values: string[] = [];

    for (const row of analytics?.team.closerRanking || []) {
      values.push(row.worker);
    }
    for (const row of analytics?.team.ownerRanking || []) {
      values.push(row.worker);
    }
    for (const row of analytics?.team.manualTakeovers || []) {
      values.push(row.worker);
    }

    return dedupeEmployeeNames(values);
  }, [analytics]);

  useEffect(() => {
    if (!employeeOptions.length) {
      setSelectedEmployee("");
      return;
    }
    setSelectedEmployee((current) => (employeeOptions.includes(current) ? current : employeeOptions[0]));
  }, [employeeOptions]);

  const fetchDrilldown = useCallback(async () => {
    if (!selectedEmployee) {
      setEmployeeDrilldown(null);
      return;
    }

    setDrilldownLoading(true);
    setDrilldownError(null);
    try {
      const response = await api.get<EmployeeDrilldownResponse>("/stats/audit/employee-drilldown", {
        params: {
          ...activeParams,
          worker: selectedEmployee,
        },
      });
      setEmployeeDrilldown(response.data);
    } catch (error) {
      console.error("Failed to load employee drilldown", error);
      setDrilldownError(isGerman ? "Mitarbeiter-Drilldown konnte nicht geladen werden." : "Employee drilldown could not be loaded.");
      setEmployeeDrilldown(null);
    } finally {
      setDrilldownLoading(false);
    }
  }, [activeParams, isGerman, selectedEmployee]);

  useEffect(() => {
    void fetchDrilldown();
  }, [fetchDrilldown]);

  const peakDispatch = useMemo(() => getPeakBucket(analytics?.tickets.dispatchByHour || []), [analytics]);
  const peakClosed = useMemo(() => getPeakBucket(analytics?.tickets.closedByHour || []), [analytics]);
  const peakTrouble = useMemo(() => getPeakBucket(analytics?.tickets.troubleDispatchByHour || []), [analytics]);

  const ownerMetrics = useMemo(
    () => computeDistributionMetrics((analytics?.team.ownerRanking || []).map((row) => row.total)),
    [analytics]
  );
  const closureMetrics = useMemo(
    () => computeDistributionMetrics((analytics?.team.closerRanking || []).map((row) => row.closed)),
    [analytics]
  );
  const averageOwnerLoad = useMemo(() => ownerMetrics.average, [ownerMetrics]);
  const totalManualTakeovers = useMemo(
    () => (analytics?.team.manualTakeovers || []).reduce((sum, entry) => sum + entry.count, 0),
    [analytics]
  );

  const rangePreview = useMemo(() => resolveSelectedRange(range), [range]);

  const currentPeriodLabel = useMemo(() => {
    const activeRange = analytics ? { from: analytics.from, to: analytics.to } : rangePreview;
    return `${activeRange.from} - ${activeRange.to}`;
  }, [analytics, rangePreview]);

  const ticketKpis = useMemo(() => {
    if (!analytics) return [];
    return [
      {
        label: isGerman ? "Tickets im Zeitraum" : "Tickets in period",
        value: analytics.summary.dispatchTotal,
        color: "#e2e8f0",
        accent: "#38bdf8",
        icon: Ticket,
        sub: currentPeriodLabel,
      },
      {
        label: isGerman ? "Geschlossen" : "Closed",
        value: analytics.summary.closedTotal,
        color: "#bbf7d0",
        accent: "#22c55e",
        icon: CheckCircle2,
        sub: peakClosed?.count ? `${isGerman ? "Peak" : "Peak"} ${peakClosed.label}` : undefined,
        trend: "up" as const,
      },
      {
        label: isGerman ? "Ueber Commit" : "Past commit date",
        value: analytics.summary.overdueActive,
        color: analytics.summary.overdueActive > 0 ? "#fecdd3" : "#cbd5e1",
        accent: "#fb7185",
        icon: ShieldAlert,
        sub: isGerman ? "Aktive Tickets" : "Active tickets",
        trend: analytics.summary.overdueActive > 0 ? "down" as const : "neutral" as const,
      },
      {
        label: isGerman ? "Peak Dispatch" : "Peak dispatch",
        value: peakDispatch?.label || "-",
        color: "#bfdbfe",
        accent: "#818cf8",
        icon: Clock3,
        sub: peakDispatch?.count ? `${peakDispatch.count} ${isGerman ? "Tickets" : "tickets"}` : undefined,
      },
    ];
  }, [analytics, currentPeriodLabel, isGerman, peakClosed, peakDispatch]);

  const teamKpis = useMemo(() => {
    if (!analytics) return [];
    return [
      {
        label: isGerman ? "Aktive Owner" : "Active owners",
        value: analytics.summary.activeOwners,
        color: "#e2e8f0",
        accent: "#38bdf8",
        icon: Users,
        sub: `${analytics.summary.activeOwned} ${isGerman ? "aktive Tickets mit Owner" : "active owned tickets"}`,
      },
      {
        label: isGerman ? "Schnitt Owner-Load" : "Avg owner load",
        value: averageOwnerLoad ? averageOwnerLoad.toFixed(1) : "0.0",
        color: "#bfdbfe",
        accent: "#6366f1",
        icon: TrendingUp,
        sub: analytics.summary.activeUnassigned > 0 ? `${analytics.summary.activeUnassigned} ${isGerman ? "ohne Owner" : "unassigned"}` : undefined,
      },
      {
        label: isGerman ? "Top Closer" : "Top closer",
        value: analytics.team.closerRanking[0]?.closed || 0,
        color: "#bbf7d0",
        accent: "#22c55e",
        icon: Crown,
        sub: analytics.team.closerRanking[0]?.worker || (isGerman ? "Keine Daten" : "No data"),
      },
      {
        label: isGerman ? "Manuelle Übernahmen" : "Manual takeovers",
        value: totalManualTakeovers,
        color: "#fef3c7",
        accent: "#f59e0b",
        icon: UserCheck,
        sub: analytics.team.manualTakeovers[0]?.worker || (isGerman ? "Keine Daten" : "No data"),
      },
    ];
  }, [analytics, averageOwnerLoad, isGerman, totalManualTakeovers]);

  const wellbeingKpis = useMemo(() => {
    if (!wellbeingAnalytics) return [];
    return [
      {
        label: isGerman ? "Mitarbeiter im Fokus" : "Employees in scope",
        value: wellbeingAnalytics.summary.employeeCount,
        color: "#e2e8f0",
        accent: "#38bdf8",
        icon: Users,
        sub: currentPeriodLabel,
      },
      {
        label: isGerman ? "Nacht + Feiertag" : "Night + holiday",
        value: wellbeingAnalytics.summary.totalNight + wellbeingAnalytics.summary.totalHoliday,
        color: "#fbcfe8",
        accent: "#ec4899",
        icon: ShieldAlert,
        sub: `${wellbeingAnalytics.summary.totalNight} N | ${wellbeingAnalytics.summary.totalHoliday} ${isGerman ? "FT" : "H"}`,
      },
      {
        label: isGerman ? "Wochenende + Spät" : "Weekend + late",
        value: wellbeingAnalytics.summary.totalWeekend + wellbeingAnalytics.summary.totalLate,
        color: "#fde68a",
        accent: "#f59e0b",
        icon: Clock3,
        sub: `${wellbeingAnalytics.summary.totalWeekend} WE | ${wellbeingAnalytics.summary.totalLate} ${isGerman ? "Spät" : "Late"}`,
      },
      {
        label: isGerman ? "Höchste Belastung" : "Highest burden",
        value: wellbeingAnalytics.summary.maxBurden,
        color: "#bfdbfe",
        accent: "#6366f1",
        icon: Crown,
        sub: wellbeingAnalytics.summary.highestBurdenWorker || (isGerman ? "Keine Daten" : "No data"),
      },
    ];
  }, [currentPeriodLabel, isGerman, wellbeingAnalytics]);

  const wellbeingRows = wellbeingAnalytics?.rows || [];
  const wellbeingTopRows = wellbeingRows.slice(0, 12);
  const highestBurdenRow = wellbeingRows[0] || null;
  const exceptionalShiftThreshold = useMemo(() => computeExceptionalShiftThreshold(wellbeingRows), [wellbeingRows]);
  const tooltipStyle = isLight ? LIGHT_TOOLTIP_STYLE : TOOLTIP_STYLE;

  const groupSpotlight = useMemo(() => {
    if (group === "tickets") {
      return {
        eyebrow: isGerman ? "Flow Spotlight" : "Flow spotlight",
        title: isGerman ? "Ticketfluss und Commit-Druck im Fokus" : "Ticket flow and commit pressure in focus",
        subtitle: isGerman
          ? "Die aktive Ansicht verbindet Volumen, Peak-Stunden und Commit-Risiko zu einem schnellen Lagebild."
          : "The active view combines volume, peak hours, and commit risk into a fast operational picture.",
        accent: "from-sky-400/20 via-blue-400/10 to-transparent",
        chips: [
          {
            label: isGerman ? "Dispatch gesamt" : "Total dispatch",
            value: analytics?.summary.dispatchTotal ?? 0,
            tone: "text-sky-700 dark:text-sky-100",
          },
          {
            label: isGerman ? "Peak Stunde" : "Peak hour",
            value: peakDispatch?.label || "-",
            tone: "text-indigo-700 dark:text-indigo-100",
          },
          {
            label: isGerman ? "Über Commit" : "Past commit",
            value: analytics?.summary.overdueActive ?? 0,
            tone: "text-rose-700 dark:text-rose-100",
          },
        ],
      };
    }

    if (group === "team") {
      return {
        eyebrow: isGerman ? "Team Spotlight" : "Team spotlight",
        title: isGerman ? "Owner-Load, Closures und Fairness kompakt" : "Owner load, closures, and fairness in one frame",
        subtitle: isGerman
          ? "Diese Ansicht zeigt sofort, ob Arbeit breit verteilt ist oder einzelne Personen dominieren."
          : "This view quickly shows whether work is broadly shared or concentrated around a few people.",
        accent: "from-emerald-400/20 via-cyan-400/10 to-transparent",
        chips: [
          {
            label: isGerman ? "Aktive Owner" : "Active owners",
            value: analytics?.summary.activeOwners ?? 0,
            tone: "text-emerald-700 dark:text-emerald-100",
          },
          {
            label: isGerman ? "Ø Load" : "Avg load",
            value: averageOwnerLoad ? averageOwnerLoad.toFixed(1) : "0.0",
            tone: "text-sky-700 dark:text-sky-100",
          },
          {
            label: isGerman ? "Top Closer" : "Top closer",
            value: analytics?.team.closerRanking[0]?.worker || "-",
            tone: "text-indigo-700 dark:text-indigo-100",
          },
        ],
      };
    }

    return {
      eyebrow: isGerman ? "Wellbeing Spotlight" : "Wellbeing spotlight",
      title: isGerman ? "Belastende Schichtmuster sofort sichtbar" : "Demanding shift patterns visible at a glance",
      subtitle: isGerman
        ? "Wochenende, Nacht, Feiertag und Serien werden zu einem klar lesbaren Belastungsbild verdichtet."
        : "Weekend, night, holiday, and streak exposure are condensed into one readable burden picture.",
      accent: "from-amber-400/20 via-fuchsia-400/10 to-transparent",
      chips: [
        {
          label: isGerman ? "Top Belastung" : "Top burden",
          value: wellbeingAnalytics?.summary.highestBurdenWorker || "-",
          tone: "text-fuchsia-700 dark:text-fuchsia-100",
        },
        {
          label: isGerman ? "Ø Burden" : "Avg burden",
          value: wellbeingAnalytics?.summary.averageBurden ?? 0,
          tone: "text-sky-700 dark:text-sky-100",
        },
        {
          label: isGerman ? "WE + Nacht" : "Weekend + night",
          value: (wellbeingAnalytics?.summary.totalWeekend ?? 0) + (wellbeingAnalytics?.summary.totalNight ?? 0),
          tone: "text-amber-700 dark:text-amber-100",
        },
        {
          label: isGerman ? "Abwesend geplant" : "Planned absent",
          value: wellbeingAnalytics?.summary.totalAbsent ?? 0,
          tone: "text-slate-700 dark:text-slate-100",
        },
      ],
    };
  }, [analytics, averageOwnerLoad, group, isGerman, peakDispatch, wellbeingAnalytics]);

  const drilldownSeries = useMemo(
    () => buildDailySeries(
      employeeDrilldown?.from,
      employeeDrilldown?.to,
      employeeDrilldown?.closedByDay || [],
      employeeDrilldown?.manualByDay || [],
      locale
    ),
    [employeeDrilldown, locale]
  );

  return (
    <EnterprisePageShell className="gap-5">
      {fetchError && !loading ? (
        <div className="rounded-[24px] border border-rose-400/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200">
          {fetchError}
        </div>
      ) : null}

      <section className={isLight
        ? "relative overflow-hidden rounded-[36px] border border-sky-200/90 bg-[radial-gradient(circle_at_top_left,rgba(56,189,248,0.34),transparent_25%),radial-gradient(circle_at_88%_8%,rgba(37,99,235,0.24),transparent_22%),radial-gradient(circle_at_52%_118%,rgba(245,158,11,0.18),transparent_30%),radial-gradient(circle_at_68%_42%,rgba(99,102,241,0.12),transparent_26%),linear-gradient(180deg,rgba(255,255,255,0.995),rgba(243,248,255,0.995)_44%,rgba(236,245,255,1)_100%)] p-6 shadow-[0_36px_140px_rgba(148,163,184,0.24),0_0_60px_rgba(56,189,248,0.1)]"
        : "relative overflow-hidden rounded-[36px] border border-cyan-400/16 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.22),transparent_28%),radial-gradient(circle_at_82%_10%,rgba(99,102,241,0.16),transparent_24%),linear-gradient(180deg,rgba(7,14,34,0.985),rgba(3,8,22,0.98))] p-6 shadow-[0_28px_96px_rgba(2,6,23,0.52),0_0_48px_rgba(34,211,238,0.08)]"}>
        <div className={isLight ? "pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-sky-400/65 to-transparent" : "pointer-events-none absolute inset-x-8 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/40 to-transparent"} />
        <div className={isLight ? "pointer-events-none absolute right-[-46px] top-[-36px] h-64 w-64 rounded-full bg-sky-400/24 blur-3xl" : "pointer-events-none absolute right-[-44px] top-[-34px] h-60 w-60 rounded-full bg-cyan-400/14 blur-3xl"} />
        {isLight ? <div className="pointer-events-none absolute bottom-[-54px] left-[18%] h-44 w-44 rounded-full bg-amber-300/22 blur-3xl" /> : null}
        {isLight ? <div className="pointer-events-none absolute left-[42%] top-[18%] h-36 w-36 rounded-full bg-indigo-300/16 blur-3xl" /> : null}
        {!isLight ? <div className="pointer-events-none absolute bottom-[-46px] left-[20%] h-40 w-40 rounded-full bg-indigo-400/10 blur-3xl" /> : null}
        {isLight ? <div className="pointer-events-none absolute inset-0 opacity-70" style={{ backgroundImage: "linear-gradient(rgba(96,165,250,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.08) 1px, transparent 1px)", backgroundSize: "24px 24px", maskImage: "linear-gradient(180deg, rgba(0,0,0,0.5), transparent 84%)" }} /> : null}

        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className={isLight ? "text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700" : "text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-300/72"}>
              {isGerman ? "STATISTIK HUB" : "STATISTICS HUB"}
            </div>
            <h1 className={isLight ? "mt-3 text-3xl font-black tracking-tight text-slate-950 xl:text-[2.15rem]" : "mt-3 text-3xl font-black tracking-tight text-slate-50 xl:text-[2.15rem]"}>
              {isGerman ? "Einheitliche Statistik für Ticketfluss und Teamleistung" : "Unified statistics for ticket flow and team performance"}
            </h1>
            <p className={isLight ? "mt-3 max-w-2xl text-sm leading-6 text-slate-600" : "mt-3 max-w-2xl text-sm leading-6 text-slate-300"}>
              {isGerman
                ? "Der Statistik-Hub folgt jetzt derselben Premium-Linie wie der Rest der App. Ticket-, Team- und Wellbeing-Kennzahlen sind in klaren Gruppen organisiert und lassen sich direkt zwischen Monat, Quartal und Jahr umschalten."
                : "The statistics hub now follows the same premium language as the rest of the app. Ticket, team, and wellbeing metrics are organised into clear groups and switch instantly between month, quarter, and year."}
            </p>
            {isLight ? (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className={`${STATS_PREMIUM_PILL} border-sky-300/70 bg-white/95 text-sky-800 shadow-[0_14px_34px_rgba(56,189,248,0.18),0_0_28px_rgba(56,189,248,0.12)]`}>
                  {isGerman ? "Premium Bright View" : "Premium bright view"}
                </span>
                <span className={`${STATS_PREMIUM_PILL} border-amber-300/70 bg-amber-50/95 text-amber-700 shadow-[0_14px_34px_rgba(245,158,11,0.16)]`}>
                  {currentPeriodLabel}
                </span>
                <span className={`${STATS_PREMIUM_PILL} border-indigo-300/70 bg-indigo-50/95 text-indigo-700 shadow-[0_14px_34px_rgba(99,102,241,0.16)]`}>
                  {groupOptions.find((option) => option.key === group)?.label}
                </span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col items-stretch gap-3 xl:min-w-[34rem] xl:items-end">
            <div className="flex flex-wrap gap-2 xl:justify-end">
              {rangeOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => handleRangeChange(option.key)}
                  className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    range === option.key
                      ? (isLight
                        ? "border-sky-300/80 bg-[radial-gradient(circle_at_top,rgba(56,189,248,0.2),transparent_70%),linear-gradient(180deg,rgba(255,255,255,1),rgba(241,248,255,0.98))] text-slate-950 shadow-[0_18px_40px_rgba(148,163,184,0.18),0_0_34px_rgba(56,189,248,0.12)]"
                        : "border-cyan-300/40 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_70%),linear-gradient(180deg,rgba(10,18,40,0.98),rgba(8,14,32,0.96))] text-cyan-100 shadow-[0_0_28px_rgba(34,211,238,0.14),0_18px_42px_rgba(2,6,23,0.36)]")
                      : (isLight
                        ? "border-slate-200/80 bg-white/82 text-slate-600 shadow-[0_10px_24px_rgba(148,163,184,0.08)] hover:bg-white hover:text-slate-950 hover:shadow-[0_16px_34px_rgba(148,163,184,0.14)]"
                        : "border-white/10 bg-white/6 text-slate-300 shadow-[0_12px_28px_rgba(2,6,23,0.26)] hover:bg-white/10 hover:shadow-[0_18px_36px_rgba(2,6,23,0.34)]")
                  }`}
                >
                  {option.label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => {
                  logInteraction("STATISTICS_REFRESH");
                  void fetchAnalytics();
                  void fetchDrilldown();
                }}
                className={isLight
                  ? "inline-flex items-center gap-2 rounded-2xl border border-sky-300/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(224,242,254,0.96))] px-4 py-2 text-sm font-semibold text-sky-800 shadow-[0_16px_34px_rgba(56,189,248,0.16)] transition hover:shadow-[0_20px_42px_rgba(56,189,248,0.22)]"
                    : "inline-flex items-center gap-2 rounded-2xl border border-sky-400/34 bg-[linear-gradient(180deg,rgba(14,165,233,0.16),rgba(8,12,28,0.76))] px-4 py-2 text-sm font-semibold text-sky-100 shadow-[0_0_28px_rgba(34,211,238,0.12)] transition hover:bg-sky-500/25"}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {isGerman ? "Aktualisieren" : "Refresh"}
              </button>
            </div>

            <div className={isLight ? "rounded-[26px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_44%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,251,255,0.92))] px-4 py-4 shadow-[0_18px_42px_rgba(148,163,184,0.14)] xl:w-full" : "rounded-[26px] border border-cyan-400/14 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_42%),linear-gradient(180deg,rgba(8,12,28,0.82),rgba(8,12,28,0.7))] px-4 py-4 shadow-[0_18px_42px_rgba(2,6,23,0.34),0_0_32px_rgba(34,211,238,0.08)] xl:w-full"}>
              <div className={isLight ? "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500" : "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400"}>
                {isGerman ? "Zeitraum Einstellungen" : "Period settings"}
              </div>
              <div className={isLight ? "mt-3 text-xs leading-5 text-slate-500" : "mt-3 text-xs leading-5 text-slate-400"}>
                {isGerman
                  ? "Die Zeitraumwahl ist jetzt bewusst straffer geführt: Monat, Quartal oder Jahr. So bleibt die Auswertung fokussiert und konsistent über alle Premium-Kacheln hinweg."
                  : "The period selection is now intentionally tighter: month, quarter, or year. This keeps the analysis focused and consistent across the premium tiles."}
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {rangeOptions.map((option) => (
                  <div key={option.key} className={range === option.key ? (isLight ? "rounded-[20px] border border-sky-300/60 bg-white/92 px-3 py-3 text-sm font-semibold text-slate-950 shadow-[0_14px_28px_rgba(56,189,248,0.12)]" : "rounded-[20px] border border-cyan-300/30 bg-cyan-400/10 px-3 py-3 text-sm font-semibold text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.1)]") : (isLight ? "rounded-[20px] border border-slate-200/80 bg-white/75 px-3 py-3 text-sm text-slate-500" : "rounded-[20px] border border-white/8 bg-white/5 px-3 py-3 text-sm text-slate-400")}>
                    {option.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3 xl:w-full">
              {groupOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    if (group === option.key) return;
                    logInteraction("STATISTICS_GROUP_CHANGED", { nextGroup: option.key });
                    setGroup(option.key);
                  }}
                  className={`group relative overflow-hidden rounded-[26px] border px-4 py-3 text-left transition duration-200 ${
                    group === option.key
                      ? (isLight
                        ? "border-sky-300/75 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.24),transparent_45%),radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.14),transparent_40%),linear-gradient(180deg,rgba(255,255,255,1),rgba(239,246,255,0.96))] shadow-[0_24px_54px_rgba(148,163,184,0.18),0_0_34px_rgba(56,189,248,0.12)]"
                        : "border-cyan-300/35 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.16),transparent_44%),linear-gradient(180deg,rgba(10,18,40,0.96),rgba(8,14,32,0.92))] shadow-[0_0_32px_rgba(34,211,238,0.14),0_18px_38px_rgba(2,6,23,0.34)]")
                      : (isLight ? "border-slate-200/80 bg-white/82 shadow-[0_12px_30px_rgba(148,163,184,0.1)] hover:bg-white/94 hover:shadow-[0_18px_40px_rgba(148,163,184,0.16)]" : "border-white/10 bg-white/6 shadow-[0_14px_30px_rgba(2,6,23,0.28)] hover:bg-white/9 hover:shadow-[0_20px_40px_rgba(2,6,23,0.36)]")
                  }`}
                >
                  {group === option.key && isLight ? <div className="pointer-events-none absolute inset-x-4 top-0 h-px bg-linear-to-r from-transparent via-sky-400/70 to-transparent" /> : null}
                  <div className={isLight ? "text-sm font-semibold text-slate-950" : "text-sm font-semibold text-slate-100"}>{option.label}</div>
                  <div className={isLight ? "mt-1 text-xs text-slate-500" : "mt-1 text-xs text-slate-400"}>{option.subtitle}</div>
                  {group === option.key ? <div className={isLight ? "mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-sky-700" : "mt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200"}>{isGerman ? "Aktive Ansicht" : "Active view"}</div> : null}
                </button>
              ))}
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:w-full">
              <div className={isLight ? "rounded-[22px] border border-slate-200/80 bg-white/75 px-4 py-3" : "rounded-[22px] border border-white/10 bg-white/5 px-4 py-3"}>
                <div className={isLight ? "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500" : "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400"}>{isGerman ? "Aktiver Zeitraum" : "Active period"}</div>
                <div className={isLight ? "mt-2 text-sm font-semibold text-slate-950" : "mt-2 text-sm font-semibold text-slate-100"}>{currentPeriodLabel}</div>
              </div>
              <div className={isLight ? "rounded-[22px] border border-slate-200/80 bg-white/75 px-4 py-3" : "rounded-[22px] border border-white/10 bg-white/5 px-4 py-3"}>
                <div className={isLight ? "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500" : "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400"}>{isGerman ? "Letztes Update" : "Last refresh"}</div>
                <div className={isLight ? "mt-2 text-sm font-semibold text-slate-950" : "mt-2 text-sm font-semibold text-slate-100"}>
                  {loading ? (isGerman ? "Aktualisierung läuft" : "Refreshing") : formatLastRefresh(lastRefresh, locale)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={isLight
        ? `relative overflow-hidden rounded-[32px] border border-sky-200/80 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.97),rgba(248,251,255,0.96))] px-5 py-5 shadow-[0_24px_72px_rgba(148,163,184,0.2),0_0_42px_rgba(56,189,248,0.08)]`
        : "relative overflow-hidden rounded-[30px] border border-cyan-400/14 bg-[linear-gradient(180deg,rgba(7,16,34,0.96),rgba(3,8,22,0.96))] px-5 py-5 shadow-[0_20px_60px_rgba(2,6,23,0.38)]"}>
        <div className={`pointer-events-none absolute inset-y-0 right-0 w-56 bg-gradient-to-l ${groupSpotlight.accent}`} />
        {isLight ? <div className="pointer-events-none absolute -right-6 top-8 h-32 w-32 rounded-full bg-sky-300/20 blur-3xl" /> : null}
        <div className={isLight ? "pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-sky-400/50 to-transparent" : "pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/30 to-transparent"} />

        <div className="relative grid gap-4 xl:grid-cols-[1.15fr_0.85fr] xl:items-end">
          <div>
            <div className={isLight ? "text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700" : "text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300/75"}>
              {groupSpotlight.eyebrow}
            </div>
            <div className={isLight ? "mt-2 text-2xl font-black tracking-tight text-slate-950" : "mt-2 text-2xl font-black tracking-tight text-slate-50"}>
              {groupSpotlight.title}
            </div>
            <div className={isLight ? "mt-2 max-w-3xl text-sm leading-6 text-slate-600" : "mt-2 max-w-3xl text-sm leading-6 text-slate-300"}>
              {groupSpotlight.subtitle}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {groupSpotlight.chips.map((chip) => (
              <div key={chip.label} className={isLight ? "rounded-[24px] border border-slate-200/85 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.5),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,250,255,0.9))] px-4 py-4 shadow-[0_16px_38px_rgba(148,163,184,0.14)]" : "rounded-[22px] border border-white/10 bg-white/5 px-4 py-4"}>
                <div className={isLight ? "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500" : "text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400"}>
                  {chip.label}
                </div>
                <div className={`mt-3 text-xl font-black tracking-tight ${chip.tone}`}>
                  {chip.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {(group === "tickets" ? ticketKpis : group === "team" ? teamKpis : wellbeingKpis).map((entry, index) => (
          <EnterpriseKpiCard key={entry.label} index={index} {...entry} />
        ))}
      </div>

      {group === "tickets" ? (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
            <HourlyBarTile
              eyebrow={isGerman ? "Dispatch Zeit" : "Dispatch timing"}
              title={isGerman ? "Wann Tickets droppen" : "When tickets drop"}
              subtitle={isGerman ? "Stundenverteilung aller Ticket-Dispatches im gewählten Zeitraum." : "Hourly distribution of all ticket dispatches in the selected period."}
              data={analytics?.tickets.dispatchByHour || []}
              color="#818cf8"
              emptyLabel={isGerman ? "Keine Dispatch-Daten im gewählten Zeitraum." : "No dispatch data in the selected period."}
              valueLabel={isGerman ? "Tickets" : "tickets"}
              peakLabel={isGerman ? "Peak" : "Peak"}
            />

            <QueueRiskTile
              eyebrow={isGerman ? "Commit Risiko" : "Commit risk"}
              title={isGerman ? "Tickets ueber Commit Date" : "Tickets past commit date"}
              subtitle={isGerman ? "Aktive überfällige Tickets nach Queue-Gruppe." : "Active overdue tickets by queue group."}
              data={analytics?.tickets.overdueByQueue || []}
              emptyLabel={isGerman ? "Keine überfälligen Tickets vorhanden." : "No overdue tickets found."}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <HourlyBarTile
              eyebrow={isGerman ? "Closure Zeit" : "Closure timing"}
              title={isGerman ? "Wann das Team am meisten schließt" : "When the team closes the most tickets"}
              subtitle={isGerman ? "Stundenverteilung geschlossener Tickets im gewählten Zeitraum." : "Hourly distribution of closed tickets in the selected period."}
              data={analytics?.tickets.closedByHour || []}
              color="#22c55e"
              emptyLabel={isGerman ? "Keine Closure-Daten im gewählten Zeitraum." : "No closure data in the selected period."}
              valueLabel={isGerman ? "geschlossen" : "closed"}
              peakLabel={isGerman ? "Peak" : "Peak"}
            />

            <HourlyBarTile
              eyebrow={isGerman ? "Trouble Tickets" : "Trouble tickets"}
              title={isGerman ? "Wann Trouble Tickets am haeufigsten droppen" : "When trouble tickets drop most often"}
              subtitle={isGerman ? "Nur Trouble-Ticket-Dispatches über den gewählten Zeitraum." : "Only trouble ticket dispatches across the selected period."}
              data={analytics?.tickets.troubleDispatchByHour || []}
              color="#f43f5e"
              emptyLabel={isGerman ? "Keine Trouble-Ticket-Daten im gewählten Zeitraum." : "No trouble ticket data in the selected period."}
              valueLabel={isGerman ? "Trouble Tickets" : "trouble tickets"}
              peakLabel={isGerman ? "Peak" : "Peak"}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <EnterpriseCard>
              <PanelHeader
                eyebrow={isGerman ? "Zusatz Insight" : "Additional insight"}
                title={isGerman ? "Commit Health" : "Commit health"}
                subtitle={isGerman ? "Auf einen Blick für aktive Tickets." : "At a glance for active tickets."}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <StatChip label={isGerman ? "On Track" : "On track"} value={analytics?.summary.onTrackActive || 0} tone="#22c55e" />
                <StatChip label={isGerman ? "Überfällig" : "Overdue"} value={analytics?.summary.overdueActive || 0} tone="#fb7185" />
              </div>
            </EnterpriseCard>

            <EnterpriseCard>
              <PanelHeader
                eyebrow={isGerman ? "Peak Stunde" : "Peak hour"}
                title={isGerman ? "Bester Closing Slot" : "Best closing slot"}
                subtitle={isGerman ? "Stunde mit den meisten geschlossenen Tickets." : "Hour with the most closed tickets."}
              />
              <div className="rounded-[24px] border border-emerald-400/15 bg-emerald-500/10 px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.24em] text-emerald-200/72">{isGerman ? "Team Peak" : "Team peak"}</div>
                <div className="mt-3 text-4xl font-black text-emerald-700 dark:text-emerald-100">{peakClosed?.label || "-"}</div>
                <div className="mt-2 text-sm text-emerald-700/80 dark:text-emerald-100/80">
                  {peakClosed?.count ? `${peakClosed.count} ${isGerman ? "geschlossene Tickets" : "closed tickets"}` : (isGerman ? "Keine Daten" : "No data")}
                </div>
              </div>
            </EnterpriseCard>

            <EnterpriseCard>
              <PanelHeader
                eyebrow={isGerman ? "TT Muster" : "TT pattern"}
                title={isGerman ? "Trouble Ticket Peak" : "Trouble ticket peak"}
                subtitle={isGerman ? "Schneller Indikator für Störungswellen." : "Quick signal for trouble waves."}
              />
              <div className="rounded-[24px] border border-rose-400/15 bg-rose-500/10 px-5 py-5">
                <div className="text-[11px] uppercase tracking-[0.24em] text-rose-200/72">{isGerman ? "TT Peak" : "TT peak"}</div>
                <div className="mt-3 text-4xl font-black text-rose-700 dark:text-rose-100">{peakTrouble?.label || "-"}</div>
                <div className="mt-2 text-sm text-rose-700/80 dark:text-rose-100/80">
                  {peakTrouble?.count ? `${peakTrouble.count} ${isGerman ? "Trouble Tickets" : "trouble tickets"}` : (isGerman ? "Keine Daten" : "No data")}
                </div>
              </div>
            </EnterpriseCard>
          </div>
        </>
      ) : group === "team" ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <WorkerMixChartTile
              eyebrow={isGerman ? "Owner Mix" : "Owner mix"}
              title={isGerman ? "Aktive Last als Mix pro Owner" : "Active load mix per owner"}
              subtitle={isGerman ? "Stacked-Graph zeigt SH, TT, CC und sonstige Tickets pro Owner." : "Stacked graph shows SH, TT, CC and other tickets per owner."}
              rows={analytics?.team.ownerRanking || []}
              valueKey="total"
              emptyLabel={isGerman ? "Keine aktiven Owner-Daten vorhanden." : "No active owner data available."}
              isGerman={isGerman}
            />

            <WorkerMixChartTile
              eyebrow={isGerman ? "Closure Mix" : "Closure mix"}
              title={isGerman ? "Geschlossene Tickets als Mix pro Mitarbeiter" : "Closed tickets mix per employee"}
              subtitle={isGerman ? "Stacked-Graph für die Ticketarten im Closure-Volumen." : "Stacked graph for ticket types inside closure volume."}
              rows={analytics?.team.closerRanking || []}
              valueKey="closed"
              emptyLabel={isGerman ? "Keine Closure-Daten im gewählten Zeitraum." : "No closure data in the selected period."}
              isGerman={isGerman}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <RankingTile
              eyebrow={isGerman ? "Owner Ranking" : "Owner ranking"}
              title={isGerman ? "Wer aktuell wie viele Tickets als Owner hat" : "Who currently owns how many tickets"}
              subtitle={isGerman ? "Aktive Tickets nach aktuellem Owner, als Rangliste." : "Active tickets by current owner, shown as a ranking."}
              rows={analytics?.team.ownerRanking || []}
              emptyLabel={isGerman ? "Keine aktiven Owner-Daten vorhanden." : "No active owner data available."}
              valueKey="total"
              accentTone="#7dd3fc"
              valueLabel={isGerman ? "aktiv" : "active"}
            />

            <RankingTile
              eyebrow={isGerman ? "Closure Ranking" : "Closure ranking"}
              title={isGerman ? "Wer wie viele Tickets geschlossen hat" : "Who closed how many tickets"}
              subtitle={isGerman ? "Verteilung geschlossener Tickets im gewählten Zeitraum." : "Distribution of closed tickets in the selected period."}
              rows={analytics?.team.closerRanking || []}
              emptyLabel={isGerman ? "Keine Closure-Daten im gewählten Zeitraum." : "No closure data in the selected period."}
              valueKey="closed"
              accentTone="#86efac"
              valueLabel="closed"
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <DistributionTile
              eyebrow={isGerman ? "Load Snapshot" : "Load snapshot"}
              title={isGerman ? "Sinnvolle Zusatzstatistiken zur Lastverteilung" : "Useful extra stats for load distribution"}
              subtitle={isGerman ? "Zeigt, wie konzentriert Owner- und Closure-Last verteilt sind." : "Shows how concentrated owner and closure load are distributed."}
              metrics={{
                average: ownerMetrics.average,
                min: ownerMetrics.min,
                max: ownerMetrics.max,
                spread: ownerMetrics.spread,
                topShare: Math.max(ownerMetrics.topShare, closureMetrics.topShare),
                aboveAverageCount: ownerMetrics.aboveAverageCount,
              }}
              topRows={analytics?.team.ownerRanking || []}
              valueKey="total"
              emptyLabel={isGerman ? "Keine Lastdaten vorhanden." : "No load data available."}
              isGerman={isGerman}
            />

            <ManualTakeoverTile
              rows={analytics?.team.manualTakeovers || []}
              emptyLabel={isGerman ? "Keine manuellen Übernahmen im gewählten Zeitraum." : "No manual takeovers in the selected period."}
              locale={locale}
              isGerman={isGerman}
            />
          </div>

          <EnterpriseCard>
            <PanelHeader
              eyebrow={isGerman ? "Mitarbeiter Drilldown" : "Employee drilldown"}
              title={isGerman ? "Wie viele Tickets Mitarbeiter X in einer bestimmten Periode geschlossen hat" : "How many tickets employee X closed in a selected period"}
              subtitle={isGerman ? "Tagesverlauf für geschlossene Tickets plus manuelle Übernahmen derselben Person." : "Daily trend for closed tickets plus manual takeovers for the same employee."}
              actions={
                employeeOptions.length ? (
                  <select
                    value={selectedEmployee}
                    onChange={(event) => {
                      logInteraction("STATISTICS_EMPLOYEE_CHANGED", { worker: event.target.value });
                      setSelectedEmployee(event.target.value);
                    }}
                    className={isLight ? "rounded-2xl border border-slate-200/80 bg-white/90 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-300/50" : "rounded-2xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-cyan-300/40"}
                  >
                    {employeeOptions.map((worker) => (
                      <option key={worker} value={worker}>{worker}</option>
                    ))}
                  </select>
                ) : null
              }
            />

            {drilldownError && !drilldownLoading ? (
              <div className="mb-4 rounded-[20px] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {drilldownError}
              </div>
            ) : null}

            {!selectedEmployee ? (
              <EmptyState label={isGerman ? "Keine Mitarbeiterdaten im gewählten Zeitraum." : "No employee data in the selected period."} />
            ) : drilldownLoading && !employeeDrilldown ? (
              <EmptyState label={isGerman ? "Mitarbeiter-Drilldown wird geladen." : "Loading employee drilldown."} />
            ) : employeeDrilldown ? (
              <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
                <div className="rounded-[24px] border border-border/40 bg-background/35 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-1">{isGerman ? "Geschlossen" : "Closed"}</span>
                    <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2 py-1">{isGerman ? "Manuell genommen" : "Manual pickups"}</span>
                  </div>
                  {drilldownSeries.length === 0 ? (
                    <EmptyState label={isGerman ? "Keine Tagesdaten für den ausgewählten Mitarbeiter." : "No daily data for the selected employee."} />
                  ) : (
                    <div className={`h-[340px] ${PREMIUM_CHART_FRAME_CLASS}`}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={drilldownSeries} margin={{ top: 10, right: 10, bottom: 4, left: -18 }}>
                          <CartesianGrid stroke={GRID_STROKE} strokeDasharray="4 4" vertical={false} />
                          <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} minTickGap={16} />
                          <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                          <Tooltip
                            contentStyle={tooltipStyle}
                            labelFormatter={(label) => `${label}`}
                            formatter={(value: number, name: string) => [String(value), name === "closed" ? (isGerman ? "Geschlossen" : "Closed") : (isGerman ? "Manuell" : "Manual")]}
                          />
                          <Legend wrapperStyle={LEGEND_STYLE} />
                          <Line
                            type="monotone"
                            dataKey="closed"
                            stroke="#22c55e"
                            strokeWidth={3}
                            dot={{ r: 3, strokeWidth: 0, fill: "#22c55e" }}
                            activeDot={{ r: 5 }}
                            style={{ filter: "drop-shadow(0 0 10px rgba(34,197,94,0.18))" }}
                            name={isGerman ? "Geschlossen" : "Closed"}
                          />
                          <Line
                            type="monotone"
                            dataKey="manual"
                            stroke="#f59e0b"
                            strokeWidth={3}
                            dot={{ r: 3, strokeWidth: 0, fill: "#f59e0b" }}
                            activeDot={{ r: 5 }}
                            style={{ filter: "drop-shadow(0 0 10px rgba(245,158,11,0.18))" }}
                            name={isGerman ? "Manuell" : "Manual"}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="rounded-[24px] border border-cyan-400/15 bg-cyan-500/10 px-5 py-5">
                    <div className="text-[10px] uppercase tracking-[0.22em] text-cyan-200/72">{isGerman ? "Zeitraum" : "Period"}</div>
                    <div className="mt-2 text-lg font-semibold text-foreground">{employeeDrilldown.from} - {employeeDrilldown.to}</div>
                    <div className="mt-4 text-5xl font-black text-cyan-700 dark:text-cyan-100">{employeeDrilldown.summary.closedTotal}</div>
                    <div className="mt-2 text-sm text-cyan-700/80 dark:text-cyan-100/80">{isGerman ? "geschlossene Tickets" : "closed tickets"}</div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                    <StatChip label={isGerman ? "Aktiv im Owner" : "Active in owner"} value={employeeDrilldown.summary.activeOwned} tone="#7dd3fc" />
                    <StatChip label={isGerman ? "Manuelle Übernahmen" : "Manual takeovers"} value={employeeDrilldown.summary.manualTakeovers} tone="#f59e0b" />
                    <StatChip label="SH" value={employeeDrilldown.summary.sh} tone="#38bdf8" />
                    <StatChip label="TT" value={employeeDrilldown.summary.tt} tone="#fb7185" />
                    <StatChip label="CC" value={employeeDrilldown.summary.cc} tone="#f59e0b" />
                    <StatChip
                      label={isGerman ? "TT Anteil" : "TT share"}
                      value={employeeDrilldown.summary.closedTotal > 0 ? `${Math.round((employeeDrilldown.summary.tt / employeeDrilldown.summary.closedTotal) * 100)}%` : "0%"}
                      tone="#a78bfa"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState label={isGerman ? "Keine Mitarbeiterdaten im gewählten Zeitraum." : "No employee data in the selected period."} />
            )}
          </EnterpriseCard>
        </>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
            <WellbeingStackedTile
              eyebrow={isGerman ? "Shift Burden" : "Shift burden"}
              title={isGerman ? "Wellbeing-Mix pro Mitarbeiter" : "Wellbeing mix per employee"}
              subtitle={isGerman ? "Jeder Balken setzt sich aus Nacht-, Spät-, Wochenend- und Feiertagsschichten zusammen." : "Each bar is stacked from night, late, weekend, and holiday shifts."}
              rows={wellbeingRows}
              emptyLabel={isGerman ? "Keine Wellbeing-Daten im gewählten Zeitraum." : "No wellbeing data in the selected period."}
              isGerman={isGerman}
              tooltipStyle={tooltipStyle}
            />

            <WellbeingRankingTile
              rows={wellbeingTopRows}
              emptyLabel={isGerman ? "Keine Wellbeing-Daten im gewählten Zeitraum." : "No wellbeing data in the selected period."}
              isGerman={isGerman}
              config={wellbeingAnalytics?.config || null}
              highLoadThreshold={exceptionalShiftThreshold}
            />
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <EnterpriseCard>
              <PanelHeader
                eyebrow={isGerman ? "Top Belastung" : "Top burden"}
                title={isGerman ? "Höchste Belastung im Zeitraum" : "Highest burden in period"}
                subtitle={isGerman ? "Mitarbeiter mit dem höchsten kombinierten Schichtdruck." : "Employee with the highest combined shift pressure."}
              />
              <div className={`rounded-[26px] border border-rose-400/20 bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.18),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.12),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,241,242,0.88))] px-5 py-5 shadow-[0_22px_50px_rgba(251,113,133,0.14)] dark:bg-rose-500/10 dark:shadow-none ${highestBurdenRow && highestBurdenRow.totalAssignments >= exceptionalShiftThreshold ? "premium-signal-pulse" : ""}`}>
                <div className="text-[11px] uppercase tracking-[0.24em] text-rose-700/72 dark:text-rose-200/72">{isGerman ? "Leader" : "Leader"}</div>
                <div className="mt-3 text-2xl font-black text-foreground">{wellbeingAnalytics?.summary.highestBurdenWorker || (isGerman ? "Keine Daten" : "No data")}</div>
                <div className="mt-3 text-4xl font-black text-rose-700 dark:text-rose-100">{wellbeingAnalytics?.summary.maxBurden || 0}</div>
                <div className="mt-2 text-sm text-rose-700/80 dark:text-rose-100/80">{isGerman ? "Belastungsscore" : "Burden score"}</div>
                <div className="mt-3 text-xs text-muted-foreground">{isGerman ? "Abwesenheit wird separat ausgewiesen und zählt nicht in die Burden-Auswertung." : "Absence is listed separately and does not count into the burden evaluation."}</div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <StatChip label={isGerman ? "Abwesend geplant" : "Planned absent"} value={highestBurdenRow?.absentCount || 0} tone="#475569" />
                  <StatChip label={isGerman ? "Max Streak" : "Max streak"} value={highestBurdenRow?.maxStreak || 0} tone="#8b5cf6" />
                  <StatChip label={isGerman ? "Schichten gesamt" : "Total shifts"} value={highestBurdenRow?.totalAssignments || 0} tone="#0f766e" />
                  <StatChip label={isGerman ? "Signal" : "Signal"} value={highestBurdenRow && highestBurdenRow.totalAssignments >= exceptionalShiftThreshold ? (isGerman ? "Auffällig" : "Elevated") : (isGerman ? "Normal" : "Normal")} tone="#0369a1" />
                </div>
              </div>
            </EnterpriseCard>

            <EnterpriseCard>
              <PanelHeader
                eyebrow={isGerman ? "Fairness Snapshot" : "Fairness snapshot"}
                title={isGerman ? "Durchschnittlicher Druck pro Person" : "Average pressure per employee"}
                subtitle={isGerman ? "Hilft schnell zu erkennen, ob Belastung breit verteilt oder konzentriert ist." : "Helps spot whether pressure is broadly shared or concentrated."}
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <StatChip label={isGerman ? "Ø Burden" : "Avg burden"} value={wellbeingAnalytics?.summary.averageBurden || 0} tone="#38bdf8" />
                <StatChip label={isGerman ? "Nacht gesamt" : "Total night"} value={wellbeingAnalytics?.summary.totalNight || 0} tone="#fb7185" />
                <StatChip label={isGerman ? "Wochenende gesamt" : "Total weekend"} value={wellbeingAnalytics?.summary.totalWeekend || 0} tone="#f59e0b" />
                <StatChip label={isGerman ? "Feiertag gesamt" : "Total holiday"} value={wellbeingAnalytics?.summary.totalHoliday || 0} tone="#d946ef" />
                <StatChip label={isGerman ? "Abwesend geplant" : "Planned absent"} value={wellbeingAnalytics?.summary.totalAbsent || 0} tone="#475569" />
              </div>
            </EnterpriseCard>

            <EnterpriseCard>
              <PanelHeader
                eyebrow={isGerman ? "Guardrails" : "Guardrails"}
                title={isGerman ? "Aktive Wellbeing-Schwellen" : "Active wellbeing thresholds"}
                subtitle={isGerman ? "Aktuelle Leitplanken für Nacht, Wochenende und Serien." : "Current guardrails for night, weekend, and streak exposure."}
              />
              <div className="space-y-3">
                <div className="rounded-[22px] border border-sky-400/15 bg-sky-500/10 px-4 py-3 text-sm text-foreground">
                  {isGerman ? "Nacht-Schwelle" : "Night threshold"}: <span className="font-bold text-sky-700 dark:text-sky-100">{wellbeingAnalytics?.config.nightThreshold || 0}</span>
                </div>
                <div className="rounded-[22px] border border-amber-400/15 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
                  {isGerman ? "Wochenend-Schwelle" : "Weekend threshold"}: <span className="font-bold text-amber-700 dark:text-amber-100">{wellbeingAnalytics?.config.weekendThreshold || 0}</span>
                </div>
                <div className="rounded-[22px] border border-violet-400/15 bg-violet-500/10 px-4 py-3 text-sm text-foreground">
                  {isGerman ? "Streak-Schwelle" : "Streak threshold"}: <span className="font-bold text-violet-700 dark:text-violet-100">{wellbeingAnalytics?.config.streakThreshold || 0}</span>
                </div>
              </div>
            </EnterpriseCard>
          </div>
        </>
      )}
    </EnterprisePageShell>
  );
}