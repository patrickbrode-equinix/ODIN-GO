import { useEffect, useMemo, useState } from "react";
import { ActivityLogEntry, getActivityLog, getActivityStats } from "../../api/activity";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import { Button } from "../ui/button";
import { Loader2, RefreshCw, FileText, Search, UserCircle, CalendarRange, X } from "lucide-react";
import { EnterprisePageShell, EnterpriseCard, EnterpriseHeader } from "../layout/EnterpriseLayout";
import { useLanguage, type LanguageCode, getLanguageLocale } from "../../context/LanguageContext";
import { TextRepairBoundary, repairTextDeep } from "../../utils/textRepair";

const MODULE_COLORS: Record<string, string> = {
  SHIFTPLAN: "bg-indigo-500/15 text-indigo-300 border-indigo-500/25",
  YEAR2027: "bg-purple-500/15 text-purple-300 border-purple-500/25",
  DASHBOARD: "bg-blue-500/15 text-blue-300 border-blue-500/25",
  NAVIGATION: "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
  ADMIN_SETTINGS: "bg-violet-500/15 text-violet-300 border-violet-500/25",
  AUTH: "bg-amber-500/15 text-amber-300 border-amber-500/25",
  SYSTEM: "bg-slate-500/15 text-slate-300 border-slate-500/25",
  HANDOVER: "bg-teal-500/15 text-teal-300 border-teal-500/25",
  INGEST: "bg-green-500/15 text-green-300 border-green-500/25",
};

const PAGE_COPY: Partial<Record<LanguageCode, {
  title: string;
  subtitle: string;
  refresh: string;
  module: string;
  allModules: string;
  user: string;
  actorPlaceholder: string;
  action: string;
  actionPlaceholder: string;
  from: string;
  to: string;
  count: string;
  clearFilters: string;
  search: string;
  timestamp: string;
  actor: string;
  context: string;
  details: string;
  noEntries: string;
  shownEntries: string;
  filtered: string;
  activityHub: string;
  changeTrail: string;
}>> = {
  de: {
    title: "PROTOKOLL",
    subtitle: "Systemaktivitaeten und Aenderungen nachvollziehen",
    refresh: "Aktualisieren",
    module: "Modul",
    allModules: "Alle Module",
    user: "Benutzer",
    actorPlaceholder: "z.B. admin",
    action: "Aktion",
    actionPlaceholder: "z.B. UPLOAD",
    from: "Von",
    to: "Bis",
    count: "Anzahl",
    clearFilters: "Filter zuruecksetzen",
    search: "Suchen",
    timestamp: "Zeitstempel",
    actor: "Akteur",
    context: "Ort / Objekt",
    details: "Details",
    noEntries: "Keine Eintraege gefunden.",
    shownEntries: "Eintraege angezeigt",
    filtered: "gefiltert",
    activityHub: "Aktivitaets-Hub",
    changeTrail: "Ort, Aenderung, Zeit und Benutzer in einer Ansicht.",
  },
  en: {
    title: "LOG",
    subtitle: "Track system activity and changes",
    refresh: "Refresh",
    module: "Module",
    allModules: "All modules",
    user: "User",
    actorPlaceholder: "e.g. admin",
    action: "Action",
    actionPlaceholder: "e.g. UPLOAD",
    from: "From",
    to: "To",
    count: "Count",
    clearFilters: "Clear filters",
    search: "Search",
    timestamp: "Timestamp",
    actor: "Actor",
    context: "Location / entity",
    details: "Details",
    noEntries: "No entries found.",
    shownEntries: "entries shown",
    filtered: "filtered",
    activityHub: "Activity hub",
    changeTrail: "Location, change, time, and actor in one view.",
  },
};

type ActivityLogPanelProps = {
  embedded?: boolean;
};

export function ActivityLogPanel({ embedded = false }: ActivityLogPanelProps) {
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = repairTextDeep(PAGE_COPY[language] || PAGE_COPY.en!);
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [stats, setStats] = useState<{ module: string; count: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [limit, setLimit] = useState(100);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const params: Record<string, unknown> = { limit };
      if (moduleFilter !== "ALL") params.module = moduleFilter;
      if (actorFilter.trim()) params.actor = actorFilter.trim();
      if (actionFilter.trim()) params.action = actionFilter.trim();
      if (dateFrom) params.start = new Date(dateFrom).toISOString();
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        params.end = end.toISOString();
      }
      const [data, statsData] = await Promise.all([
        getActivityLog(params),
        getActivityStats().catch(() => []),
      ]);
      setLogs(data);
      setStats(statsData);
    } catch (error) {
      console.error("Failed to fetch logs", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchLogs();
  }, [moduleFilter, limit]);

  const clearFilters = () => {
    setModuleFilter("ALL");
    setActorFilter("");
    setActionFilter("");
    setDateFrom("");
    setDateTo("");
    setLimit(100);
  };

  const hasActiveFilters = moduleFilter !== "ALL" || Boolean(actorFilter) || Boolean(actionFilter) || Boolean(dateFrom) || Boolean(dateTo);
  const knownActions = useMemo(() => [...new Set(logs.map((log) => log.action_type).filter(Boolean))].sort(), [logs]);
  const knownActors = useMemo(() => [...new Set(logs.map((log) => log.actor).filter(Boolean))].sort(), [logs]);
  const totalCount = stats.reduce((sum, row) => sum + parseInt(row.count ?? "0", 10), 0);

  const content = (
    <>
      <EnterpriseHeader
        title={copy.title}
        subtitle={<span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{copy.subtitle}</span>}
        icon={<FileText className="h-5 w-5 text-indigo-400" />}
        rightContent={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchLogs()}
            disabled={loading}
            className="h-7 border border-white/10 bg-white/5 px-3 text-[11px] font-bold uppercase tracking-wider text-white/70 shadow-sm hover:bg-white/10"
          >
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            {copy.refresh}
          </Button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <EnterpriseCard className="border-white/10 bg-[radial-gradient(circle_at_top,#1e293b_0%,#020617_100%)]">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-300/80">{copy.activityHub}</div>
          <div className="mt-3 text-xl font-semibold text-slate-100">{copy.changeTrail}</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{copy.count}</div>
              <div className="mt-2 text-2xl font-black text-slate-100">{logs.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{copy.module}</div>
              <div className="mt-2 text-2xl font-black text-slate-100">{stats.length}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{copy.user}</div>
              <div className="mt-2 text-2xl font-black text-slate-100">{knownActors.length}</div>
            </div>
          </div>
        </EnterpriseCard>

        <EnterpriseCard className="border-white/10 bg-[radial-gradient(circle_at_top,#172554_0%,#020617_100%)]">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
            {stats.map((stat) => {
              const pct = totalCount > 0 ? Math.round((parseInt(stat.count, 10) / totalCount) * 100) : 0;
              const cls = MODULE_COLORS[stat.module] ?? "bg-slate-500/10 text-slate-300 border-slate-500/20";
              return (
                <button
                  key={stat.module}
                  type="button"
                  onClick={() => setModuleFilter(stat.module)}
                  className={`flex flex-col items-center gap-1 rounded-xl border px-2 py-3 transition-all hover:scale-[1.02] ${cls} ${moduleFilter === stat.module ? "ring-2 ring-white/20" : ""}`}
                >
                  <span className="text-xl font-black tabular-nums">{stat.count}</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-80">{stat.module}</span>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-current opacity-40" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        </EnterpriseCard>
      </div>

      <EnterpriseCard noPadding={false} className="flex flex-wrap items-end gap-3 border-white/10 bg-white/5">
        <div className="flex min-w-38 flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{copy.module}</label>
          <Select value={moduleFilter} onValueChange={setModuleFilter}>
            <SelectTrigger className="h-8 rounded-lg text-xs">
              <SelectValue placeholder={copy.allModules} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{copy.allModules}</SelectItem>
              {Object.keys(MODULE_COLORS).map((module) => (
                <SelectItem key={module} value={module}>{module}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-40 flex-col gap-1">
          <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <UserCircle className="h-3 w-3" /> {copy.user}
          </label>
          <div className="relative">
            <Input list="actors-list" placeholder={copy.actorPlaceholder} value={actorFilter} onChange={(event) => setActorFilter(event.target.value)} className="h-8 rounded-lg pr-6 text-xs" />
            <datalist id="actors-list">
              {knownActors.map((actor) => <option key={actor} value={actor} />)}
            </datalist>
            {actorFilter ? (
              <button type="button" onClick={() => setActorFilter("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex min-w-40 flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{copy.action}</label>
          <div className="relative">
            <Input list="actions-list" placeholder={copy.actionPlaceholder} value={actionFilter} onChange={(event) => setActionFilter(event.target.value)} className="h-8 rounded-lg pr-6 text-xs" />
            <datalist id="actions-list">
              {knownActions.map((action) => <option key={action} value={action} />)}
            </datalist>
            {actionFilter ? (
              <button type="button" onClick={() => setActionFilter("")} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <CalendarRange className="h-3 w-3" /> {copy.from}
          </label>
          <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-8 w-36 rounded-lg text-xs" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{copy.to}</label>
          <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-8 w-36 rounded-lg text-xs" />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{copy.count}</label>
          <Select value={String(limit)} onValueChange={(value) => setLimit(Number(value))}>
            <SelectTrigger className="h-8 w-24 rounded-lg text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[25, 50, 100, 250, 500].map((entry) => <SelectItem key={entry} value={String(entry)}>{entry}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="ml-auto flex items-end gap-2 self-end">
          {hasActiveFilters ? (
            <Button onClick={clearFilters} variant="ghost" size="sm" className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground">
              <X className="mr-1 h-3.5 w-3.5" /> {copy.clearFilters}
            </Button>
          ) : null}
          <Button onClick={() => void fetchLogs()} disabled={loading} size="sm" className="h-8 border border-indigo-400/20 bg-indigo-600/80 px-3 text-xs font-bold text-white hover:bg-indigo-600">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            {copy.search}
          </Button>
        </div>
      </EnterpriseCard>

      <EnterpriseCard noPadding className="flex min-h-0 flex-1 flex-col overflow-hidden border-white/10 bg-white/5">
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-white/5">
                <TableHead className="w-44 text-[11px] font-bold uppercase tracking-wider">{copy.timestamp}</TableHead>
                <TableHead className="w-36 text-[11px] font-bold uppercase tracking-wider">{copy.actor}</TableHead>
                <TableHead className="w-32 text-[11px] font-bold uppercase tracking-wider">{copy.module}</TableHead>
                <TableHead className="w-40 text-[11px] font-bold uppercase tracking-wider">{copy.action}</TableHead>
                <TableHead className="w-56 text-[11px] font-bold uppercase tracking-wider">{copy.context}</TableHead>
                <TableHead className="text-[11px] font-bold uppercase tracking-wider">{copy.details}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    {copy.noEntries}
                  </TableCell>
                </TableRow>
              ) : null}

              {!loading && logs.map((log) => {
                const modCls = MODULE_COLORS[log.module] ?? "bg-slate-500/10 text-slate-300 border-slate-500/15";
                const payloadStr = log.payload ? JSON.stringify(log.payload) : "-";
                const contextLabel = [log.entity_type, log.entity_id].filter(Boolean).join(" / ") || "-";

                return (
                  <TableRow key={log.id} className="border-white/5 hover:bg-white/2.5">
                    <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                      {new Date(log.ts).toLocaleDateString(locale, { timeZone: "Europe/Berlin" })}{" "}
                      <span className="text-foreground/80">{new Date(log.ts).toLocaleTimeString(locale, { timeZone: "Europe/Berlin" })}</span>
                    </TableCell>
                    <TableCell className="text-sm font-medium">{log.actor || "-"}</TableCell>
                    <TableCell>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase border ${modCls}`}>
                        {log.module}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-semibold tracking-wide">{log.action_type}</span>
                    </TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {contextLabel}
                    </TableCell>
                    <TableCell className="max-w-md font-mono text-[11px] text-muted-foreground">
                      <div className="truncate" title={payloadStr}>{payloadStr}</div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </EnterpriseCard>

      <div className="text-right text-[10px] text-muted-foreground">
        {logs.length} {copy.shownEntries}{hasActiveFilters ? ` (${copy.filtered})` : ""}
      </div>
    </>
  );

  return (
    <TextRepairBoundary>
      {embedded ? (
        <div className="space-y-4">{content}</div>
      ) : (
        <EnterprisePageShell>{content}</EnterprisePageShell>
      )}
    </TextRepairBoundary>
  );
}
