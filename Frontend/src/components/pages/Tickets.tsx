import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Layers3,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Ticket as TicketIcon,
  UserCheck,
} from "lucide-react";

import { QueueApi, getWritebackBlockDisplay, isWritebackButtonDisabled, type Ticket, type WritebackEmployee } from "../../api/queue";
import { fetchDashboardCriticalWorkload } from "../../api/criticalWorkload";
import type { CriticalWorkloadSnapshot, CriticalWorkloadTicket } from "../../types/criticalWorkload";
import { EnterpriseCard, EnterpriseHeader, EnterprisePageShell } from "../layout/EnterpriseLayout";
import { CreateHandoverModal } from "../handover/CreateHandoverModal";
import { type HandoverType } from "../handover/handover.types";
import { getLanguageLocale, useLanguage, type LanguageCode } from "../../context/LanguageContext";
import { useTheme } from "../ThemeProvider";
import { formatDateTimeForLocale } from "../../utils/dateFormat";
import { formatRemainingTime, getColorTier, getRemainingMs } from "../../utils/ticketColors";
import {
  formatBucket,
  formatCriticalDateTime,
  formatRemainingTimeMinutes,
  getCriticalityTone,
  getOdinStatusTone,
} from "../critical-workload/criticalWorkload.shared";

const HANDOVER_TYPES: HandoverType[] = ["Workload", "Terminiert", "Other Teams"];

type QueueKey = "SmartHands" | "TroubleTickets" | "CCInstalls" | "Deinstall";
type TicketScope = "critical" | QueueKey;
type SortDirection = "asc" | "desc";

type QueueScopeDefinition = {
  key: TicketScope;
  accentClass: string;
  lightAccentClass: string;
  label: Record<LanguageCode, string>;
  eyebrow: Record<LanguageCode, string>;
  description: Record<LanguageCode, string>;
};

type GroupChip = {
  name: string;
  count: number;
};

type DisplayTicket = {
  id: string;
  source: "queue" | "critical";
  queueLabel: string;
  groupKey: string | null;
  primaryId: string;
  activitySales: string;
  systemName: string;
  owner: string;
  status: string;
  subtype: string;
  commitLabel: string;
  scheduleLabel: string;
  remainingMs: number | null;
  remainingLabel: string;
  badges: Array<{ label: string; className: string }>;
  handoverTicket: Ticket;
  queueItemId: number | null;
  odinAssignedWorkerId: number | null;
  canWriteback: boolean;
  canResetAssignment: boolean;
};

const SCOPE_DEFINITIONS: QueueScopeDefinition[] = [
  {
    key: "critical",
    accentClass: "border-rose-300/25 bg-[linear-gradient(165deg,rgba(244,63,94,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_80px_rgba(244,63,94,0.16)]",
    lightAccentClass: "border-rose-200/80 bg-[linear-gradient(165deg,rgba(244,63,94,0.12),rgba(255,255,255,0.96)_56%,rgba(255,241,242,0.98))] shadow-[0_18px_52px_rgba(244,63,94,0.12)]",
    label: { de: "Kritische Tickets", en: "Critical tickets" },
    eyebrow: { de: "Prioritaet zuerst", en: "Priority first" },
    description: { de: "Direkt die kritischsten Tickets mit ODIN-Kontext", en: "Immediate access to the most critical tickets with ODIN context" },
  },
  {
    key: "SmartHands",
    accentClass: "border-cyan-300/25 bg-[linear-gradient(165deg,rgba(34,211,238,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_80px_rgba(34,211,238,0.16)]",
    lightAccentClass: "border-cyan-200/80 bg-[linear-gradient(165deg,rgba(34,211,238,0.12),rgba(255,255,255,0.96)_56%,rgba(236,254,255,0.98))] shadow-[0_18px_52px_rgba(34,211,238,0.12)]",
    label: { de: "Smart Hands", en: "Smart hands" },
    eyebrow: { de: "Operative Queue", en: "Operations queue" },
    description: { de: "Alle aktiven Smart-Hands-Tickets und Gruppen", en: "All active smart hands tickets and groups" },
  },
  {
    key: "TroubleTickets",
    accentClass: "border-amber-300/25 bg-[linear-gradient(165deg,rgba(245,158,11,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_80px_rgba(245,158,11,0.16)]",
    lightAccentClass: "border-amber-200/80 bg-[linear-gradient(165deg,rgba(245,158,11,0.12),rgba(255,255,255,0.96)_56%,rgba(255,251,235,0.98))] shadow-[0_18px_52px_rgba(245,158,11,0.12)]",
    label: { de: "Trouble Tickets", en: "Trouble tickets" },
    eyebrow: { de: "Störungen", en: "Incidents" },
    description: { de: "Störungen und Eskalationen in voller Übersicht", en: "Incidents and escalations in one full overview" },
  },
  {
    key: "CCInstalls",
    accentClass: "border-indigo-300/25 bg-[linear-gradient(165deg,rgba(99,102,241,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_80px_rgba(99,102,241,0.16)]",
    lightAccentClass: "border-indigo-200/80 bg-[linear-gradient(165deg,rgba(99,102,241,0.12),rgba(255,255,255,0.96)_56%,rgba(238,242,255,0.98))] shadow-[0_18px_52px_rgba(99,102,241,0.12)]",
    label: { de: "Cross Connect", en: "Cross connect" },
    eyebrow: { de: "Installationen", en: "Installations" },
    description: { de: "Install- und Schaltauftraege nach Gruppen", en: "Install and switching work grouped for review" },
  },
  {
    key: "Deinstall",
    accentClass: "border-violet-300/25 bg-[linear-gradient(165deg,rgba(167,139,250,0.18),rgba(2,6,23,0.92))] shadow-[0_24px_80px_rgba(167,139,250,0.16)]",
    lightAccentClass: "border-violet-200/80 bg-[linear-gradient(165deg,rgba(167,139,250,0.12),rgba(255,255,255,0.96)_56%,rgba(245,243,255,0.98))] shadow-[0_18px_52px_rgba(167,139,250,0.12)]",
    label: { de: "Deinstall", en: "Deinstall" },
    eyebrow: { de: "Rueckbau", en: "Decommission" },
    description: { de: "Rueckbau- und Shutdown-Tickets", en: "Decommission and shutdown tickets" },
  },
];

const PAGE_COPY: Record<LanguageCode, {
  title: string;
  subtitle: string;
  refresh: string;
  loading: string;
  error: string;
  empty: string;
  searchPlaceholder: string;
  criticalWindow: string;
  allGroups: string;
  groups: string;
  sortAsc: string;
  sortDesc: string;
  totalVisible: string;
  ticket: string;
  queue: string;
  system: string;
  owner: string;
  statusSubtype: string;
  commitStart: string;
  remaining: string;
  createHandover: string;
  noGroups: string;
  scheduled: string;
  commit: string;
  yes: string;
  no: string;
  activitySales: string;
  sourceCritical: string;
  sourceQueue: string;
  criticalSummary: string;
  writeback: string;
  resetAssignment: string;
  resetAllAssignments: string;
  resetAllConfirm: string;
  resetAllRunning: string;
  writebackSuccess: string;
  resetSuccess: string;
  resetAllSuccess: string;
  actionUnavailable: string;
  ownerSelectLabel: string;
  ownerSelectPlaceholder: string;
  setOdinOwner: string;
  setOdinOwnerFirst: string;
  setOdinOwnerSuccess: string;
}> = {
  de: {
    title: "Tickets",
    subtitle: "Kritische Tickets zuerst, danach Queue- und Gruppenübersichten mit Suche und sortierbarer Restzeit.",
    refresh: "Aktualisieren",
    loading: "Tickets werden geladen...",
    error: "Ticketdaten konnten nicht geladen werden.",
    empty: "Keine Tickets für die aktuelle Auswahl gefunden.",
    searchPlaceholder: "Suche nach Systemname, Activity, Sales Order oder Owner",
    criticalWindow: "Kritisches Fenster",
    allGroups: "Alle Gruppen",
    groups: "Gruppen",
    sortAsc: "Restzeit aufsteigend",
    sortDesc: "Restzeit absteigend",
    totalVisible: "Treffer",
    ticket: "Ticket",
    queue: "Queue / Gruppe",
    system: "System",
    owner: "Owner",
    statusSubtype: "Status / Subtyp",
    commitStart: "Commit / Start",
    remaining: "Restzeit",
    createHandover: "Handover erstellen",
    noGroups: "Keine Gruppen vorhanden",
    scheduled: "Start",
    commit: "Commit",
    yes: "Ja",
    no: "Nein",
    activitySales: "Activity / Sales Order",
    sourceCritical: "Kritische Sicht",
    sourceQueue: "Queue-Sicht",
    criticalSummary: "Direkt priorisierte Tickets aus dem ODIN-Kritikfenster.",
    writeback: "Writeback anstoßen",
    resetAssignment: "ODIN-Zuweisung zurücknehmen",
    resetAllAssignments: "Alle ODIN-Zuweisungen zurücknehmen",
    resetAllConfirm: "Alle von ODIN gesetzten Ticket-Zuweisungen zurücknehmen?",
    resetAllRunning: "Reset läuft...",
    writebackSuccess: "Writeback-Action wurde erstellt und validiert.",
    resetSuccess: "ODIN-Zuweisung wurde zurückgenommen.",
    resetAllSuccess: "ODIN-Zuweisungen wurden zurückgenommen.",
    actionUnavailable: "Nur für ODIN-zugewiesene Queue-Tickets verfügbar.",
    ownerSelectLabel: "Writeback-Test Owner",
    ownerSelectPlaceholder: "Mitarbeiter auswählen",
    setOdinOwner: "ODIN-Test-Owner setzen",
    setOdinOwnerFirst: "Bitte zuerst einen Writeback-Test Owner auswählen.",
    setOdinOwnerSuccess: "ODIN-Test-Owner wurde gesetzt. Jetzt Writeback anstoßen, damit der Crawler Jarvis aktualisiert.",
  },
  en: {
    title: "Tickets",
    subtitle: "Critical tickets first, then full queue and group overviews with search and clickable remaining-time sorting.",
    refresh: "Refresh",
    loading: "Loading tickets...",
    error: "Ticket data could not be loaded.",
    empty: "No tickets found for the current selection.",
    searchPlaceholder: "Search by system name, activity, sales order, or owner",
    criticalWindow: "Critical window",
    allGroups: "All groups",
    groups: "Groups",
    sortAsc: "Remaining ascending",
    sortDesc: "Remaining descending",
    totalVisible: "Results",
    ticket: "Ticket",
    queue: "Queue / group",
    system: "System",
    owner: "Owner",
    statusSubtype: "Status / subtype",
    commitStart: "Commit / start",
    remaining: "Remaining",
    createHandover: "Create handover",
    noGroups: "No groups available",
    scheduled: "Start",
    commit: "Commit",
    yes: "Yes",
    no: "No",
    activitySales: "Activity / sales order",
    sourceCritical: "Critical view",
    sourceQueue: "Queue view",
    criticalSummary: "Directly prioritized tickets from the ODIN critical window.",
    writeback: "Trigger writeback",
    resetAssignment: "Reset ODIN assignment",
    resetAllAssignments: "Reset all ODIN assignments",
    resetAllConfirm: "Reset all ticket assignments set by ODIN?",
    resetAllRunning: "Reset running...",
    writebackSuccess: "Writeback action was created and validated.",
    resetSuccess: "ODIN assignment was reset.",
    resetAllSuccess: "ODIN assignments were reset.",
    actionUnavailable: "Only available for ODIN-assigned queue tickets.",
    ownerSelectLabel: "Writeback test owner",
    ownerSelectPlaceholder: "Select employee",
    setOdinOwner: "Set ODIN test owner",
    setOdinOwnerFirst: "Please select a writeback test owner first.",
    setOdinOwnerSuccess: "ODIN test owner was set. Trigger writeback next so the crawler updates Jarvis.",
  },
};

const HANDOVER_LABELS: Record<HandoverType, Partial<Record<LanguageCode, string>>> = {
  Workload: { de: "Arbeitslast", en: "Workload" },
  Terminiert: { de: "Terminiert", en: "Scheduled" },
  "Other Teams": { de: "Andere Teams", en: "Other teams" },
  Task: { de: "Task", en: "Task" },
  Manual: { de: "Manuell", en: "Manual" },
};

function isQueueKey(value: string | null): value is QueueKey {
  return value === "SmartHands" || value === "TroubleTickets" || value === "CCInstalls" || value === "Deinstall";
}

function formatTicketWindowLabel(value: string | null | undefined, locale: string) {
  if (!value) return "-";
  if (!value.includes(" - ")) return formatCriticalDateTime(value, locale);

  const parts = value
    .split(" - ")
    .map((part) => formatCriticalDateTime(part, locale))
    .filter((part) => part !== "-");

  return parts.length > 0 ? parts.join(" -> ") : "-";
}

function parseTicketTimeMs(value: string | null | undefined) {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function getCriticalTicketDeadlineMs(ticket: CriticalWorkloadTicket) {
  const revisedCommitMs = parseTicketTimeMs(ticket.revisedCommitDate);
  if (Number.isFinite(revisedCommitMs)) return revisedCommitMs;

  if (ticket.scheduledWindow?.includes(" - ")) {
    const [, end] = ticket.scheduledWindow.split(" - ");
    const endMs = parseTicketTimeMs(end);
    if (Number.isFinite(endMs)) return endMs;
  }

  return parseTicketTimeMs(ticket.scheduledWindow || null);
}

function getCriticalTicketRemainingMs(ticket: CriticalWorkloadTicket) {
  if (ticket.remainingTimeMinutes != null) return ticket.remainingTimeMinutes * 60_000;
  const deadlineMs = getCriticalTicketDeadlineMs(ticket);
  return Number.isFinite(deadlineMs) ? deadlineMs - Date.now() : null;
}

function toSearchBlob(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part || "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
}

function normalizeCriticalToHandoverTicket(ticket: CriticalWorkloadTicket, language: LanguageCode): Ticket {
  const scheduledStart = ticket.scheduledWindow?.includes(" - ") ? ticket.scheduledWindow.split(" - ")[0] : null;
  return {
    id: Number(ticket.ticketId) || 0,
    external_id: ticket.ticketNumber || ticket.activityId || ticket.ticketId,
    queue_type: ticket.ticketType || "Critical",
    group_key: "",
    status: ticket.status || ticket.odinStatus,
    subtype: ticket.severity || ticket.priority || ticket.criticalityReason || "",
    owner: ticket.owner || "",
    sched_start: scheduledStart || "",
    commit_date: ticket.revisedCommitDate || "",
    revised_commit_date: ticket.revisedCommitDate || "",
    active: true,
    system_name: ticket.systemName || "",
    activity: ticket.activityId || ticket.ticketType || "",
    account_name: "",
    remaining_time_text: formatRemainingTimeMinutes(ticket.remainingTimeMinutes, language),
    remaining_hours: ticket.remainingTimeMinutes == null ? null : Number((ticket.remainingTimeMinutes / 60).toFixed(2)),
  } as Ticket;
}

function normalizeQueueTicket(ticket: Ticket, language: LanguageCode, locale: string): DisplayTicket {
  const remainingMs = getRemainingMs(ticket);
  const activitySales = [
    ticket.activity,
    ticket.activity_no,
    ticket.sales_order,
    ticket.salesorder,
    ticket.salesOrder,
  ].filter(Boolean).join(" / ");

  const badges: DisplayTicket["badges"] = [];
  const tier = getColorTier(remainingMs);
  if (tier === "red") {
    badges.push({ label: language === "de" ? "Kritisch" : "Critical", className: "border-rose-400/30 bg-rose-500/15 text-rose-100" });
  } else if (tier === "orange") {
    badges.push({ label: language === "de" ? "Bald fällig" : "Due soon", className: "border-amber-300/30 bg-amber-400/15 text-amber-100" });
  }

  return {
    id: String(ticket.id ?? ticket.external_id ?? Math.random()),
    source: "queue",
    queueLabel: String(ticket.queue_type || "-"),
    groupKey: String(ticket.group_key || "").trim() || null,
    primaryId: String(ticket.external_id || ticket.id || "-"),
    activitySales: activitySales || "-",
    systemName: String(ticket.system_name || "-"),
    owner: String(ticket.owner || "-"),
    status: String(ticket.status || "-"),
    subtype: String(ticket.customer_trouble_type || ticket.subtype || "-"),
    commitLabel: formatDateTimeForLocale(ticket.revised_commit_date ?? ticket.commit_date ?? null, locale) || "-",
    scheduleLabel: formatDateTimeForLocale(ticket.sched_start ?? null, locale) || "-",
    remainingMs,
    remainingLabel: formatRemainingTime(remainingMs),
    badges,
    handoverTicket: ticket,
    queueItemId: Number.isFinite(Number(ticket.id)) ? Number(ticket.id) : null,
    odinAssignedWorkerId: Number.isFinite(Number(ticket.assigned_worker_id)) ? Number(ticket.assigned_worker_id) : null,
    canWriteback: Number.isFinite(Number(ticket.id)) && Number.isFinite(Number(ticket.assigned_worker_id)),
    canResetAssignment: Number.isFinite(Number(ticket.id)) && Number.isFinite(Number(ticket.assigned_worker_id)),
  };
}

function normalizeCriticalTicket(ticket: CriticalWorkloadTicket, language: LanguageCode, locale: string): DisplayTicket {
  const remainingMs = getCriticalTicketRemainingMs(ticket);
  const badges: DisplayTicket["badges"] = [
    { label: formatBucket(ticket.priorityBucket, language), className: getCriticalityTone(ticket.criticalityLevel, ticket.isTroubleTicket) },
    { label: ticket.odinStatus, className: getOdinStatusTone(ticket.odinStatus) },
  ];

  if (ticket.isTroubleTicket) {
    badges.splice(1, 0, { label: "TT", className: "border-rose-400/30 bg-rose-500/15 text-rose-100" });
  }
  if (ticket.isExpedite) {
    badges.splice(1, 0, { label: "Expedite", className: "border-amber-300/30 bg-amber-400/15 text-amber-100" });
  }

  return {
    id: ticket.ticketId,
    source: "critical",
    queueLabel: ticket.ticketType || "Critical",
    groupKey: null,
    primaryId: ticket.ticketNumber || ticket.activityId || ticket.ticketId,
    activitySales: ticket.activityId || ticket.ticketNumber || "-",
    systemName: ticket.systemName || "-",
    owner: ticket.owner || "-",
    status: ticket.odinStatus,
    subtype: ticket.severity || ticket.priority || ticket.criticalityReason || "-",
    commitLabel: ticket.revisedCommitDate ? formatCriticalDateTime(ticket.revisedCommitDate, locale) : "-",
    scheduleLabel: ticket.scheduledWindow ? formatTicketWindowLabel(ticket.scheduledWindow, locale) : "-",
    remainingMs,
    remainingLabel: ticket.remainingTimeMinutes == null
      ? formatRemainingTime(remainingMs)
      : formatRemainingTimeMinutes(ticket.remainingTimeMinutes, language),
    badges,
    handoverTicket: normalizeCriticalToHandoverTicket(ticket, language),
    queueItemId: null,
    odinAssignedWorkerId: null,
    canWriteback: false,
    canResetAssignment: false,
  };
}

function getScopeCount(scope: TicketScope, queueCounts: Map<QueueKey, number>, criticalSnapshot: CriticalWorkloadSnapshot | null) {
  if (scope === "critical") return criticalSnapshot?.summary.totalCritical || 0;
  return queueCounts.get(scope) || 0;
}

function ScopeCard({
  scope,
  active,
  count,
  language,
  isLight,
  onClick,
}: {
  scope: QueueScopeDefinition;
  active: boolean;
  count: number;
  language: LanguageCode;
  isLight: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-[28px] border p-5 text-left transition duration-300 hover:-translate-y-1 ${isLight ? scope.lightAccentClass : scope.accentClass} ${active ? (isLight ? "ring-2 ring-sky-200/80" : "ring-2 ring-white/18") : "opacity-88 hover:opacity-100"}`}
    >
      <div className="pointer-events-none absolute inset-0 opacity-0 transition duration-300 group-hover:opacity-100" style={{ background: isLight ? "radial-gradient(circle at top right, rgba(59,130,246,0.12), transparent 35%)" : "radial-gradient(circle at top right, rgba(255,255,255,0.12), transparent 35%)" }} />
      <div className="relative flex min-h-[170px] flex-col justify-between">
        <div>
          <div className={isLight ? "text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500" : "text-[10px] font-semibold uppercase tracking-[0.24em] text-white/65"}>{scope.eyebrow[language]}</div>
          <div className={isLight ? "mt-3 text-2xl font-black tracking-tight text-slate-950" : "mt-3 text-2xl font-black tracking-tight text-white"}>{scope.label[language]}</div>
          <div className={isLight ? "mt-3 text-sm leading-6 text-slate-600" : "mt-3 text-sm leading-6 text-white/72"}>{scope.description[language]}</div>
        </div>
        <div className={isLight ? "mt-4 text-[54px] font-black leading-none tracking-[-0.05em] text-slate-950" : "mt-4 text-[54px] font-black leading-none tracking-[-0.05em] text-white"}>{count}</div>
      </div>
    </button>
  );
}

function GroupFilterBar({
  groups,
  selectedGroup,
  language,
  copy,
  onSelect,
}: {
  groups: GroupChip[];
  selectedGroup: string | null;
  language: LanguageCode;
  copy: typeof PAGE_COPY[LanguageCode];
  onSelect: (group: string | null) => void;
}) {
  return (
    <div className="rounded-[24px] border border-white/10 bg-slate-950/55 p-3">
      <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-400">
        <Layers3 className="h-3.5 w-3.5 text-cyan-300/80" />
        {copy.groups}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedGroup == null ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
        >
          {copy.allGroups}
        </button>
        {groups.length === 0 ? <span className="px-3 py-1.5 text-xs text-slate-500">{copy.noGroups}</span> : null}
        {groups.map((group) => (
          <button
            key={group.name}
            type="button"
            onClick={() => onSelect(group.name)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${selectedGroup === group.name ? "border-cyan-300/35 bg-cyan-400/15 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            {group.name} <span className="ml-1 text-slate-400">{group.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TicketRow({
  ticket,
  language,
  copy,
  onHandover,
  onWriteback,
  onSetOdinOwner,
  onResetAssignment,
  busyAction,
  selectedWritebackEmployeeId,
}: {
  ticket: DisplayTicket;
  language: LanguageCode;
  copy: typeof PAGE_COPY[LanguageCode];
  onHandover: (ticket: Ticket, type: HandoverType) => void;
  onWriteback: (ticket: DisplayTicket) => void;
  onSetOdinOwner: (ticket: DisplayTicket) => void;
  onResetAssignment: (ticket: DisplayTicket) => void;
  busyAction: "writeback" | "reset" | null;
  selectedWritebackEmployeeId: number | null;
}) {
  const remainingTone = ticket.remainingMs == null
    ? "text-slate-400"
    : ticket.remainingMs < 0
      ? "text-rose-300"
      : ticket.remainingMs <= 2 * 60 * 60 * 1000
        ? "text-amber-100"
        : "text-cyan-100";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="grid grid-cols-[1.45fr_1fr_1fr_0.9fr_0.95fr_1.1fr_130px] gap-3 border-b border-white/6 px-4 py-3 transition hover:bg-white/4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {ticket.badges.map((badge) => (
                <span key={`${ticket.id}-${badge.label}`} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] ${badge.className}`}>
                  {badge.label}
                </span>
              ))}
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-300">
                {ticket.source === "critical" ? copy.sourceCritical : copy.sourceQueue}
              </span>
            </div>
            <div className="mt-2 truncate text-sm font-semibold text-slate-100">{ticket.primaryId}</div>
            <div className="mt-1 truncate text-xs text-slate-400">{ticket.activitySales}</div>
          </div>

          <div className="min-w-0">
            <div className="truncate text-sm text-slate-200">{ticket.queueLabel}</div>
            <div className="mt-1 truncate text-xs text-slate-500">{ticket.groupKey || "-"}</div>
          </div>

          <div className="truncate text-sm text-slate-200">{ticket.systemName}</div>
          <div className="truncate text-sm text-slate-200">{ticket.owner}</div>

          <div className="min-w-0">
            <div className="truncate text-sm text-slate-200">{ticket.status}</div>
            <div className="mt-1 truncate text-xs text-slate-500">{ticket.subtype}</div>
          </div>

          <div className="min-w-0 text-xs text-slate-300">
            <div>{copy.commit}: <span className="font-mono">{ticket.commitLabel}</span></div>
            <div className="mt-1">{copy.scheduled}: <span className="font-mono">{ticket.scheduleLabel}</span></div>
          </div>

          <div className={`text-right text-sm font-black ${remainingTone}`}>{ticket.remainingLabel}</div>
        </div>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-45 rounded-md border border-white/20 bg-sky-950 p-1 text-white shadow-md z-50">
          <ContextMenu.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            {copy.createHandover}
          </ContextMenu.Label>
          <ContextMenu.Separator className="my-1 h-px bg-white/10" />
          {HANDOVER_TYPES.map((type) => (
            <ContextMenu.Item
              key={type}
              className="relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-white/10 focus:text-white"
              onSelect={() => onHandover(ticket.handoverTicket, type)}
            >
              {HANDOVER_LABELS[type][language] || HANDOVER_LABELS[type].en || type}
            </ContextMenu.Item>
          ))}
          <ContextMenu.Separator className="my-1 h-px bg-white/10" />
          <ContextMenu.Label className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
            ODIN
          </ContextMenu.Label>
          <ContextMenu.Item
            disabled={!ticket.queueItemId || busyAction != null}
            className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-white/10 focus:text-white data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
            onSelect={(event) => {
              if (!ticket.queueItemId || busyAction != null) {
                event.preventDefault();
                return;
              }
              onSetOdinOwner(ticket);
            }}
          >
            <UserCheck className="h-3.5 w-3.5 text-emerald-300" />
            {selectedWritebackEmployeeId ? copy.setOdinOwner : copy.setOdinOwnerFirst}
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={isWritebackButtonDisabled(ticket.canWriteback, busyAction)}
            className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-white/10 focus:text-white data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
            onSelect={(event) => {
              if (isWritebackButtonDisabled(ticket.canWriteback, busyAction)) {
                event.preventDefault();
                return;
              }
              onWriteback(ticket);
            }}
          >
            <Send className="h-3.5 w-3.5 text-cyan-300" />
            {busyAction === "writeback" ? `${copy.writeback}...` : copy.writeback}
          </ContextMenu.Item>
          <ContextMenu.Item
            disabled={!ticket.canResetAssignment || busyAction != null}
            className="relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-white/10 focus:text-white data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45"
            onSelect={(event) => {
              if (!ticket.canResetAssignment || busyAction != null) {
                event.preventDefault();
                return;
              }
              onResetAssignment(ticket);
            }}
          >
            <RotateCcw className="h-3.5 w-3.5 text-amber-200" />
            {busyAction === "reset" ? `${copy.resetAssignment}...` : copy.resetAssignment}
          </ContextMenu.Item>
          {!ticket.canWriteback ? (
            <div className="px-2 py-1.5 text-[11px] text-slate-400">{copy.actionUnavailable}</div>
          ) : null}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

const Tickets: React.FC = () => {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = PAGE_COPY[language];
  const isLight = theme === "light";
  const [searchParams, setSearchParams] = useSearchParams();
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [criticalSnapshot, setCriticalSnapshot] = useState<CriticalWorkloadSnapshot | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [handoverTicket, setHandoverTicket] = useState<Ticket | null>(null);
  const [handoverType, setHandoverType] = useState<HandoverType>("Workload");
  const [isHandoverOpen, setIsHandoverOpen] = useState(false);
  const [ticketActionBusy, setTicketActionBusy] = useState<string | null>(null);
  const [ticketActionMessage, setTicketActionMessage] = useState<string | null>(null);
  const [ticketActionError, setTicketActionError] = useState<string | null>(null);
  const [writebackEmployees, setWritebackEmployees] = useState<WritebackEmployee[]>([]);
  const [selectedWritebackEmployeeId, setSelectedWritebackEmployeeId] = useState<number | null>(null);

  const activeScope: TicketScope = useMemo(() => {
    const type = searchParams.get("type");
    if (isQueueKey(type)) return type;
    const view = searchParams.get("view");
    const queue = searchParams.get("queue");
    if (view === "queue" && isQueueKey(queue)) return queue;
    return "critical";
  }, [searchParams]);

  const selectedGroup = activeScope === "critical" ? null : searchParams.get("group");

  const openHandover = useCallback((ticket: Ticket, type: HandoverType) => {
    setHandoverTicket(ticket);
    setHandoverType(type);
    setIsHandoverOpen(true);
  }, []);

  const load = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const [queueResult, criticalResult] = await Promise.allSettled([
        QueueApi.getTickets(),
        fetchDashboardCriticalWorkload(),
      ]);

      const queueFailed = queueResult.status === "rejected";
      const criticalFailed = criticalResult.status === "rejected";

      if (queueResult.status === "fulfilled") {
        setAllTickets(queueResult.value);
      }
      if (criticalResult.status === "fulfilled") {
        setCriticalSnapshot(criticalResult.value);
      }

      if (queueFailed && criticalFailed) {
        setError(copy.error);
      } else {
        setError(null);
      }

      setLastRefreshed(new Date());
    } catch {
      setError(copy.error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [copy.error]);

  useEffect(() => {
    let cancelled = false;
    QueueApi.getWritebackEmployees()
      .then((employees) => {
        if (cancelled) return;
        setWritebackEmployees(employees);
        setSelectedWritebackEmployeeId((current) => current ?? employees[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setWritebackEmployees([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const describeApiError = useCallback((err: unknown) => {
    const maybe = err as { response?: { data?: { error?: string; detail?: string; message?: string; reason?: string } }; message?: string };
    const blocked = getWritebackBlockDisplay(maybe.response?.data as any);
    return blocked || maybe.response?.data?.message || maybe.response?.data?.detail || maybe.response?.data?.error || maybe.message || copy.error;
  }, [copy.error]);

  const handleTicketWriteback = useCallback(async (ticket: DisplayTicket) => {
    if (!ticket.queueItemId) return;
    const busyKey = `${ticket.source}-${ticket.id}-writeback`;
    if (ticketActionBusy === busyKey) return;
    setTicketActionBusy(busyKey);
    setTicketActionMessage(null);
    setTicketActionError(null);
    try {
      const result = await QueueApi.triggerTicketWriteback(ticket.queueItemId);
      const blocked = getWritebackBlockDisplay(result);
      if (blocked) {
        setTicketActionError(blocked);
        return;
      }
      const validationSuffix = result.validation && !result.validation.valid
        ? ` (${result.validation.errors.join("; ")})`
        : "";
      setTicketActionMessage(`${copy.writebackSuccess}${validationSuffix}`);
      await load(true);
    } catch (err) {
      setTicketActionError(describeApiError(err));
    } finally {
      setTicketActionBusy(null);
    }
  }, [copy.writebackSuccess, describeApiError, load, ticketActionBusy]);

  const handleSetOdinOwner = useCallback(async (ticket: DisplayTicket) => {
    if (!ticket.queueItemId) return;
    if (!selectedWritebackEmployeeId) {
      setTicketActionMessage(null);
      setTicketActionError(copy.setOdinOwnerFirst);
      return;
    }

    const busyKey = `${ticket.source}-${ticket.id}-writeback`;
    setTicketActionBusy(busyKey);
    setTicketActionMessage(null);
    setTicketActionError(null);
    try {
      const result = await QueueApi.setTicketOdinOwner(ticket.queueItemId, selectedWritebackEmployeeId);
      setTicketActionMessage(result.message || copy.setOdinOwnerSuccess);
      await load(true);
    } catch (err) {
      setTicketActionError(describeApiError(err));
    } finally {
      setTicketActionBusy(null);
    }
  }, [copy.setOdinOwnerFirst, copy.setOdinOwnerSuccess, describeApiError, load, selectedWritebackEmployeeId]);

  const handleResetAssignment = useCallback(async (ticket: DisplayTicket) => {
    if (!ticket.queueItemId) return;
    const busyKey = `${ticket.source}-${ticket.id}-reset`;
    setTicketActionBusy(busyKey);
    setTicketActionMessage(null);
    setTicketActionError(null);
    try {
      const result = await QueueApi.resetTicketAssignment(ticket.queueItemId);
      const validationSuffix = result.validation && !result.validation.valid
        ? ` (${result.validation.errors.join("; ")})`
        : "";
      setTicketActionMessage(`${result.message || copy.resetSuccess}${validationSuffix}`);
      await load(true);
    } catch (err) {
      setTicketActionError(describeApiError(err));
    } finally {
      setTicketActionBusy(null);
    }
  }, [copy.resetSuccess, describeApiError, load]);

  const handleResetAllAssignments = useCallback(async () => {
    if (!window.confirm(copy.resetAllConfirm)) return;
    setTicketActionBusy("reset-all");
    setTicketActionMessage(null);
    setTicketActionError(null);
    try {
      const result = await QueueApi.resetAllTicketAssignments();
      const countSuffix = typeof result.resetCount === "number" ? ` (${result.resetCount})` : "";
      const validationSuffix = result.validationFailedCount && result.validationFailedCount > 0
        ? ` (${result.validationFailedCount} validation failed)`
        : "";
      setTicketActionMessage(`${result.message || copy.resetAllSuccess}${countSuffix}${validationSuffix}`);
      await load(true);
    } catch (err) {
      setTicketActionError(describeApiError(err));
    } finally {
      setTicketActionBusy(null);
    }
  }, [copy.resetAllConfirm, copy.resetAllSuccess, describeApiError, load]);

  useEffect(() => {
    void load();
    const intervalId = window.setInterval(() => { void load(true); }, 30_000);
    return () => window.clearInterval(intervalId);
  }, [load]);

  const queueCounts = useMemo(() => {
    const counts = new Map<QueueKey, number>([
      ["SmartHands", 0],
      ["TroubleTickets", 0],
      ["CCInstalls", 0],
      ["Deinstall", 0],
    ]);

    for (const ticket of allTickets) {
      const queueKey = String(ticket.queue_type || "").trim();
      if (isQueueKey(queueKey)) {
        counts.set(queueKey, (counts.get(queueKey) || 0) + 1);
      }
    }

    return counts;
  }, [allTickets]);

  const groupsForQueue = useMemo(() => {
    if (activeScope === "critical") return [] as GroupChip[];

    const map = new Map<string, number>();
    for (const ticket of allTickets) {
      if (String(ticket.queue_type || "") !== activeScope) continue;
      const groupName = String(ticket.group_key || "").trim();
      if (!groupName) continue;
      map.set(groupName, (map.get(groupName) || 0) + 1);
    }

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  }, [activeScope, allTickets]);

  const filteredTickets = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const baseTickets = activeScope === "critical"
      ? (criticalSnapshot?.tickets || []).map((ticket) => normalizeCriticalTicket(ticket, language, locale))
      : allTickets
          .filter((ticket) => String(ticket.queue_type || "") === activeScope)
          .filter((ticket) => !selectedGroup || String(ticket.group_key || "").trim() === selectedGroup)
          .map((ticket) => normalizeQueueTicket(ticket, language, locale));

    const searched = normalizedSearch.length === 0
      ? baseTickets
      : baseTickets.filter((ticket) => toSearchBlob([
          ticket.primaryId,
          ticket.activitySales,
          ticket.systemName,
          ticket.owner,
          ticket.queueLabel,
          ticket.groupKey,
          ticket.status,
          ticket.subtype,
        ]).includes(normalizedSearch));

    const effectiveSortDirection = activeScope === "critical" ? "asc" : sortDirection;

    return [...searched].sort((left, right) => {
      const leftValue = left.remainingMs == null ? (effectiveSortDirection === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : left.remainingMs;
      const rightValue = right.remainingMs == null ? (effectiveSortDirection === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : right.remainingMs;
      if (leftValue !== rightValue) {
        return effectiveSortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }
      return left.primaryId.localeCompare(right.primaryId);
    });
  }, [activeScope, allTickets, criticalSnapshot?.tickets, language, locale, searchTerm, selectedGroup, sortDirection]);

  const activeScopeDefinition = SCOPE_DEFINITIONS.find((scope) => scope.key === activeScope) || SCOPE_DEFINITIONS[0];
  const activeScopeCount = getScopeCount(activeScope, queueCounts, criticalSnapshot);

  const applyScope = (scope: TicketScope) => {
    const next = new URLSearchParams(searchParams);
    if (scope === "critical") {
      next.set("view", "critical");
      next.delete("queue");
      next.delete("group");
    } else {
      next.set("view", "queue");
      next.set("queue", scope);
      next.delete("group");
    }
    setSearchParams(next, { replace: true });
  };

  const applyGroup = (group: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!group) next.delete("group");
    else next.set("group", group);
    setSearchParams(next, { replace: true });
  };

  return (
    <EnterprisePageShell>
      <EnterpriseHeader
        title={copy.title}
        subtitle={<span className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">{copy.subtitle}</span>}
        icon={<TicketIcon className="h-5 w-5 text-cyan-300" />}
        rightContent={
          <button
            type="button"
            onClick={() => void load(true)}
            className="inline-flex items-center gap-2 rounded-2xl border border-cyan-400/25 bg-cyan-400/12 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/18"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {copy.refresh}
          </button>
        }
      />

      <div className={isLight
        ? "overflow-hidden rounded-[34px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.985),rgba(241,245,249,0.98))] p-6 shadow-[0_30px_84px_rgba(148,163,184,0.18)]"
        : "overflow-hidden rounded-[34px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.14),transparent_24%),linear-gradient(180deg,#071223,#020611)] p-6 shadow-[0_34px_94px_rgba(2,6,23,0.48)]"
      }>
        <div className="relative overflow-hidden rounded-[28px] border border-white/50 bg-[linear-gradient(135deg,rgba(255,255,255,0.72),rgba(255,255,255,0.24))] px-5 py-5 shadow-[0_22px_50px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,0.72)] dark:border-cyan-300/14 dark:bg-[linear-gradient(135deg,rgba(6,18,40,0.76),rgba(4,12,28,0.52))] dark:shadow-[0_24px_60px_rgba(2,6,23,0.34),0_0_28px_rgba(34,211,238,0.07)]">
          <div className="pointer-events-none absolute inset-y-0 left-[-18%] w-28 opacity-60" style={{ background: isLight ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.38) 55%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.18) 55%, transparent 100%)", filter: "blur(16px)", animation: "shellSweep 8.5s linear infinite" }} />
          <div className="relative grid gap-5 lg:grid-cols-[1.3fr_0.9fr] lg:items-end">
            <div>
              <div className={isLight ? "font-display-brand text-[10px] font-black uppercase tracking-[0.34em] text-sky-700/80" : "font-display-brand text-[10px] font-black uppercase tracking-[0.34em] text-cyan-200/60"}>
                {activeScope === "critical" ? copy.sourceCritical : copy.sourceQueue}
              </div>
              <h2 className={isLight ? "font-display-brand mt-3 text-[34px] font-black tracking-[-0.04em] text-slate-950" : "font-display-brand mt-3 text-[34px] font-black tracking-[-0.04em] text-white"}>
                {activeScopeDefinition.label[language]}
              </h2>
              <p className={isLight ? "mt-3 max-w-2xl text-sm leading-7 text-slate-600" : "mt-3 max-w-2xl text-sm leading-7 text-slate-300/88"}>
                {activeScope === "critical" ? copy.criticalSummary : activeScopeDefinition.description[language]}
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={isLight ? "rounded-[20px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)]" : "rounded-[20px] border border-cyan-300/12 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}>
                <div className={isLight ? "text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500" : "text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/48"}>{copy.totalVisible}</div>
                <div className={isLight ? "mt-2 text-sm font-black text-slate-950" : "mt-2 text-sm font-black text-white"}>{filteredTickets.length}</div>
              </div>
              <div className={isLight ? "rounded-[20px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)]" : "rounded-[20px] border border-cyan-300/12 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}>
                <div className={isLight ? "text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500" : "text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/48"}>{activeScope === "critical" ? copy.criticalWindow : copy.groups}</div>
                <div className={isLight ? "mt-2 text-sm font-black text-slate-950" : "mt-2 text-sm font-black text-white"}>{activeScope === "critical" ? `${criticalSnapshot?.criticalWindowHours || 72}h` : groupsForQueue.length}</div>
              </div>
              <div className={isLight ? "rounded-[20px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)]" : "rounded-[20px] border border-cyan-300/12 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}>
                <div className={isLight ? "text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500" : "text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/48"}>Snapshot</div>
                <div className={isLight ? "mt-2 text-sm font-black text-slate-950" : "mt-2 text-sm font-black text-white"}>{lastRefreshed.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={isLight
        ? "overflow-hidden rounded-[34px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.12),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.08),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(241,245,249,0.98))] p-6 shadow-[0_24px_72px_rgba(148,163,184,0.18)]"
        : "overflow-hidden rounded-[34px] border border-cyan-400/15 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(244,63,94,0.14),transparent_24%),linear-gradient(180deg,#081223,#020611)] p-6 shadow-[0_30px_90px_rgba(2,6,23,0.45)]"
      }>
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <div>
            <div className={isLight ? "text-[11px] font-semibold uppercase tracking-[0.28em] text-sky-700" : "text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/72"}>
              {activeScope === "critical" ? <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-cyan-300" /> {copy.sourceCritical}</span> : <span className="inline-flex items-center gap-2"><Layers3 className="h-4 w-4 text-cyan-300" /> {copy.sourceQueue}</span>}
            </div>
            <h2 className={isLight ? "mt-4 text-4xl font-black tracking-tight text-slate-950" : "mt-4 text-4xl font-black tracking-tight text-slate-50"}>{activeScopeDefinition.label[language]}</h2>
            <p className={isLight ? "mt-3 max-w-2xl text-sm leading-7 text-slate-600" : "mt-3 max-w-2xl text-sm leading-7 text-slate-300"}>
              {activeScope === "critical"
                ? copy.criticalSummary
                : activeScopeDefinition.description[language]}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <EnterpriseCard className={isLight ? "border-slate-200/80 bg-white/88 px-5 py-5" : "border-white/10 bg-white/6 px-5 py-5"}>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{copy.totalVisible}</div>
              <div className={isLight ? "mt-3 text-4xl font-black text-slate-950" : "mt-3 text-4xl font-black text-slate-50"}>{filteredTickets.length}</div>
            </EnterpriseCard>
            <EnterpriseCard className={isLight ? "border-slate-200/80 bg-white/88 px-5 py-5" : "border-white/10 bg-white/6 px-5 py-5"}>
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">{activeScope === "critical" ? copy.criticalWindow : copy.groups}</div>
              <div className={isLight ? "mt-3 text-2xl font-black text-slate-950" : "mt-3 text-2xl font-black text-slate-50"}>
                {activeScope === "critical" ? `${criticalSnapshot?.criticalWindowHours || 72}h` : groupsForQueue.length}
              </div>
            </EnterpriseCard>
            <EnterpriseCard className={isLight ? "border-slate-200/80 bg-white/88 px-5 py-5 sm:col-span-2" : "border-white/10 bg-white/6 px-5 py-5 sm:col-span-2"}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-slate-400">Snapshot</div>
                  <div className={isLight ? "mt-3 text-lg font-semibold text-slate-950" : "mt-3 text-lg font-semibold text-slate-50"}>{lastRefreshed.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                </div>
                {criticalSnapshot?.crawler.isStale ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-rose-400/25 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100">
                    <AlertTriangle className="h-3.5 w-3.5 text-rose-300" />
                    {copy.error}
                  </div>
                ) : null}
              </div>
            </EnterpriseCard>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {SCOPE_DEFINITIONS.map((scope) => (
          <ScopeCard
            key={scope.key}
            scope={scope}
            active={scope.key === activeScope}
            count={getScopeCount(scope.key, queueCounts, criticalSnapshot)}
            language={language}
            isLight={isLight}
            onClick={() => applyScope(scope.key)}
          />
        ))}
      </div>

      {activeScope !== "critical" ? (
        <div className="mt-5">
          <GroupFilterBar groups={groupsForQueue} selectedGroup={selectedGroup} language={language} copy={copy} onSelect={applyGroup} />
        </div>
      ) : null}

      <div className="mt-5 flex flex-col gap-3 rounded-[28px] border border-white/10 bg-slate-950/55 p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={copy.searchPlaceholder}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyan-300/30 focus:bg-white/8"
          />
        </div>

        <label className="flex min-w-[260px] flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
          {copy.ownerSelectLabel}
          <select
            value={selectedWritebackEmployeeId ?? ""}
            onChange={(event) => setSelectedWritebackEmployeeId(event.target.value ? Number(event.target.value) : null)}
            className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold normal-case tracking-normal text-slate-100 outline-none transition focus:border-cyan-300/30"
          >
            <option value="">{copy.ownerSelectPlaceholder}</option>
            {writebackEmployees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.name || employee.jarvisDisplayName || employee.email || employee.id}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void handleResetAllAssignments()}
          disabled={ticketActionBusy != null}
          className="inline-flex items-center gap-2 rounded-2xl border border-amber-300/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/16 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RotateCcw className={`h-4 w-4 text-amber-200 ${ticketActionBusy === "reset-all" ? "animate-spin" : ""}`} />
          {ticketActionBusy === "reset-all" ? copy.resetAllRunning : copy.resetAllAssignments}
        </button>

        <button
          type="button"
          onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
          className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
        >
          {sortDirection === "asc" ? <ArrowDown className="h-4 w-4 text-cyan-300" /> : <ArrowUp className="h-4 w-4 text-cyan-300" />}
          {sortDirection === "asc" ? copy.sortAsc : copy.sortDesc}
        </button>
      </div>

      {ticketActionMessage || ticketActionError ? (
        <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${ticketActionError ? "border-rose-400/25 bg-rose-500/10 text-rose-100" : "border-cyan-300/25 bg-cyan-400/10 text-cyan-100"}`}>
          {ticketActionError || ticketActionMessage}
        </div>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.88),rgba(2,6,23,0.96))] shadow-[0_24px_70px_rgba(2,6,23,0.4)]">
        <div className="grid grid-cols-[1.45fr_1fr_1fr_0.9fr_0.95fr_1.1fr_130px] gap-3 border-b border-white/10 bg-slate-950/80 px-4 py-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400 backdrop-blur">
          <div>
            <div>{copy.ticket}</div>
            <button type="button" className="mt-1 text-[10px] font-medium tracking-[0.18em] text-slate-500 transition hover:text-cyan-200" onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}>
              {copy.activitySales}
            </button>
          </div>
          <div>{copy.queue}</div>
          <div>{copy.system}</div>
          <div>{copy.owner}</div>
          <div>{copy.statusSubtype}</div>
          <div>{copy.commitStart}</div>
          <button type="button" onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")} className="text-right transition hover:text-cyan-200">
            {copy.remaining}
          </button>
        </div>

        <div className="max-h-[62vh] overflow-auto">
          {loading ? <div className="px-4 py-8 text-center text-sm text-slate-400">{copy.loading}</div> : null}
          {!loading && error ? <div className="px-4 py-8 text-center text-sm text-rose-200">{error}</div> : null}
          {!loading && !error && filteredTickets.length === 0 ? <div className="px-4 py-8 text-center text-sm text-slate-400">{copy.empty}</div> : null}
          {!loading && !error && filteredTickets.map((ticket) => (
            <TicketRow
              key={`${ticket.source}-${ticket.id}`}
              ticket={ticket}
              language={language}
              copy={copy}
              onHandover={openHandover}
              onWriteback={handleTicketWriteback}
              onSetOdinOwner={handleSetOdinOwner}
              onResetAssignment={handleResetAssignment}
              busyAction={ticketActionBusy === `${ticket.source}-${ticket.id}-writeback` ? "writeback" : ticketActionBusy === `${ticket.source}-${ticket.id}-reset` ? "reset" : null}
              selectedWritebackEmployeeId={selectedWritebackEmployeeId}
            />
          ))}
        </div>
      </div>

      {handoverTicket ? (
        <CreateHandoverModal
          ticket={handoverTicket}
          isOpen={isHandoverOpen}
          onClose={() => setIsHandoverOpen(false)}
          defaultType={handoverType}
        />
      ) : null}
    </EnterprisePageShell>
  );
};

export default Tickets;
