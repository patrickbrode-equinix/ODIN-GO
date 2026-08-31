import { useCallback, useEffect, useMemo, useState } from "react";

import { logActivityEventSafe } from "../../api/activity";
import { AssignmentApi } from "../../api/assignment";
import { fetchDashboardCriticalWorkload } from "../../api/criticalWorkload";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGE_TO_LOCALE, useLanguage, type LanguageCode } from "../../context/LanguageContext";
import { useDashboardData } from "../../hooks/useDashboardData";
import { useHealthStatus } from "../../hooks/useHealthStatus";
import { useRealtimeUpdates } from "../../hooks/useRealtimeUpdates";
import type { AssignmentDecision } from "../../types/assignment";
import type { CriticalWorkloadSnapshot, CriticalWorkloadTicket } from "../../types/criticalWorkload";
import { formatDateTimeForLocale, formatTimeForLocale } from "../../utils/dateFormat";
import { findBestMatch, normalizeName } from "../../utils/fuzzyName";
import { getRemainingMs } from "../../utils/ticketColors";
import { getUserDisplayName } from "../../utils/userDisplay";
import { useCommitStore } from "../../store/commitStore";
import { useHandoverStore } from "../../store/handoverStore";
import { shiftTypes, useShiftStore } from "../../store/shiftStore";
import { MapBackground } from "../dashboard/MapBackground";
import { type MyTicketPriorityTone, type MyTicketPanelItem } from "../dashboard/MyTicketsPanel";
import { OperationalStatePanel } from "../dashboard/OperationalStatePanel";
import { PremiumKpiCard, type KpiTone, type KpiTrendData } from "../dashboard/PremiumKpiCard";
import { OdinDecisionPanel, getDefaultDecisionFactors, type AssignmentFeedEntry } from "../dashboard/OdinDecisionPanel";
import type { ExcludedCandidate as OdinExcludedCandidate } from "../dashboard/OdinDecisionPanel";
import type { OwnTicketEntry } from "../dashboard/OperationalStatePanel";
import { ShiftOverviewPanel } from "../dashboard/ShiftOverviewPanel";
import { CriticalTicketsPanel, type CriticalTicketEntry } from "../dashboard/CriticalTicketsPanel";
import { useTheme } from "../ThemeProvider";

type TicketRecord = Record<string, unknown>;
type QueueCardKey = "SmartHands" | "TroubleTickets" | "CCInstalls" | "Deinstall" | "Handover";



type QueueCardDefinition = {
  key: QueueCardKey;
  label: Record<LanguageCode, string>;
  badgeLabel: Record<LanguageCode, string>;
  to: string;
  accent: string;
};

type ShiftCardDefinition = {
  key: string;
  label: string;
  timeRange: string;
  count: number;
  accent: string;
  footerLabel: string;
  to: string;
};

const DASHBOARD_COPY = {
  de: {
    welcomePrefix: "GUTEN TAG,",
    welcomeSubtitle: "Schön, dass du da bist. Hier ist dein aktueller Überblick.",
    commandSurface: "Command Surface",
    roleLabel: "Techniker",
    activeTickets: "Aktive Tickets",
    crewOnline: "Crew online",
    handovers: "Handover offen",
    systemStatus: "Systemstatus",
    systemOnline: "Alle Systeme online",
    systemDegraded: "Teilweise eingeschränkt",
    crawlerHealthy: "Keine aktuellen Crawler-Warnungen",
    crawlerDelayed: "Crawler-Update verzögert",
    crawlerUnknown: "Crawler-Status wird geladen",
    crawlerLastUpdate: "Letztes Update",
    myTickets: "MEINE TICKETS",
    allTickets: "Alle Tickets anzeigen",
    noOwnedTickets: "Aktuell sind dir keine offenen Tickets zugeordnet.",
    stockLabel: "Equinix Aktie",
    quoteUnavailable: "Nicht verfügbar",
    queueCards: {
      smartHands: "SMART HANDS",
      troubleTickets: "TROUBLE TICKETS",
      crossConnect: "CROSS CONNECT",
      deinstall: "DEINSTALL",
      handover: "HANDOVER",
    },
    badgeCritical: "Kritisch",
    badgeOpen: "Offen",
    shiftsHeading: "SCHICHTEN",
    dayPlanningCta: "Zur Schichtplanung",
    shiftCards: {
      early: "FRÜHSCHICHT",
      late: "SPÄTSCHICHT",
      night: "NACHTSCHICHT",
      weekend: "WOCHENENDE",
    },
    nav: {
      dashboard: "Dashboard",
      tickets: "Tickets",
      shiftplan: "Schichtplan",
      day: "Tagesplanung",
      week: "Wochenplanung",
      planner: "Schichtplaner",
      handover: "Handover",
      odin: "ODIN-Logik",
      tv: "TV Dashboard",
      compliance: "Commit Compliance",
      settings: "Einstellungen",
    },
    priorityCritical: "Kritisch",
    priorityHigh: "Hoch",
    priorityMedium: "Mittel",
  },
  en: {
    welcomePrefix: "GOOD DAY,",
    welcomeSubtitle: "Good to see you. Here is your current overview.",
    commandSurface: "Command Surface",
    roleLabel: "Technician",
    activeTickets: "Active tickets",
    crewOnline: "Crew online",
    handovers: "Open handovers",
    systemStatus: "System status",
    systemOnline: "All systems online",
    systemDegraded: "Partial degradation",
    crawlerHealthy: "No current crawler warnings",
    crawlerDelayed: "Crawler update delayed",
    crawlerUnknown: "Crawler status loading",
    crawlerLastUpdate: "Last update",
    myTickets: "MY TICKETS",
    allTickets: "Open all tickets",
    noOwnedTickets: "You do not own any open tickets right now.",
    stockLabel: "Equinix stock",
    quoteUnavailable: "Unavailable",
    queueCards: {
      smartHands: "SMART HANDS",
      troubleTickets: "TROUBLE TICKETS",
      crossConnect: "CROSS CONNECT",
      deinstall: "DEINSTALL",
      handover: "HANDOVER",
    },
    badgeCritical: "Critical",
    badgeOpen: "Open",
    shiftsHeading: "SHIFTS",
    dayPlanningCta: "Open shift planning",
    shiftCards: {
      early: "EARLY SHIFT",
      late: "LATE SHIFT",
      night: "NIGHT SHIFT",
      weekend: "WEEKEND",
    },
    nav: {
      dashboard: "Dashboard",
      tickets: "Tickets",
      shiftplan: "Shiftplan",
      day: "Day planning",
      week: "Week planning",
      planner: "Shift planner",
      handover: "Handover",
      odin: "ODIN Logic",
      tv: "TV Dashboard",
      compliance: "Commit Compliance",
      settings: "Settings",
    },
    priorityCritical: "Critical",
    priorityHigh: "High",
    priorityMedium: "Medium",
  },
} as const;

const DASHBOARD_SHELL_CSS = `
@keyframes dashboardAuroraDrift {
  0%, 100% { transform: translate3d(0, 0, 0) scale(1); opacity: 0.42; }
  33% { transform: translate3d(32px, -16px, 0) scale(1.12); opacity: 0.72; }
  66% { transform: translate3d(-18px, 10px, 0) scale(0.95); opacity: 0.48; }
}

@keyframes dashboardGridPulse {
  0%, 100% { opacity: 0.12; }
  50% { opacity: 0.28; }
}

@keyframes dashKpiReveal {
  from { opacity: 0; transform: translateY(18px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes dashHeroShine {
  0% { transform: translateX(-120%) skewX(-15deg); }
  100% { transform: translateX(300%) skewX(-15deg); }
}
`;

const CRITICAL_WINDOW_MS = 24 * 60 * 60 * 1000;
const HIGH_WINDOW_MS = 72 * 60 * 60 * 1000;

const SHIFT_CARD_ORDER: Record<string, number> = {
  E1: 10,
  HE1: 11,
  E2: 12,
  HE2: 13,
  E1SA: 14,
  E1WE: 15,
  L1: 20,
  HL1: 21,
  L1WE: 22,
  L2: 23,
  HL2: 24,
  N: 30,
  DBS: 40,
  SEMINAR: 50,
};



function normalizeQueueKey(value: unknown): Exclude<QueueCardKey, "Handover"> | null {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!normalized) return null;
  if (normalized.includes("smarthand")) return "SmartHands";
  if (normalized.includes("trouble")) return "TroubleTickets";
  if (normalized.includes("crossconnect") || normalized.includes("ccinstall")) return "CCInstalls";
  if (normalized.includes("deinstall")) return "Deinstall";
  return null;
}

function normalizeOwnerKey(value: string) {
  return normalizeName(value).replace(/\s+/g, "");
}

function buildPersonOwnerKeys(name: string) {
  const tokens = normalizeName(name).split(" ").filter(Boolean);
  if (tokens.length === 0) return [];

  const keys = new Set<string>();
  keys.add(tokens.join(""));

  if (tokens.length >= 2) {
    const firstToken = tokens[0];
    const secondToken = tokens[1];
    const lastToken = tokens[tokens.length - 1];

    if (secondToken) keys.add(`${secondToken.charAt(0)}${firstToken}`);
    if (lastToken) {
      keys.add(`${lastToken.charAt(0)}${firstToken}`);
      keys.add(`${firstToken.charAt(0)}${lastToken}`);
      keys.add(`${lastToken}${firstToken.charAt(0)}`);
    }
  }

  return [...keys].filter(Boolean);
}

function buildUserOwnerMatcher(user: {
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
  email?: string | null;
}) {
  const names = Array.from(
    new Set([
      `${user.firstName || ""} ${user.lastName || ""}`.trim(),
      String(user.displayName || "").trim(),
      String(user.firstName || "").trim(),
      String(user.lastName || "").trim(),
    ].filter(Boolean)),
  );

  const keys = new Set<string>();
  for (const name of names) {
    keys.add(normalizeOwnerKey(name));
    for (const ownerKey of buildPersonOwnerKeys(name)) {
      keys.add(ownerKey);
    }
  }

  const mailAlias = String(user.email || "").split("@")[0];
  if (mailAlias) keys.add(normalizeOwnerKey(mailAlias));

  return {
    names,
    keys: [...keys].filter(Boolean),
  };
}

function buildOwnerMatcherFromNames(names: string[]) {
  const normalizedNames = Array.from(new Set(names.map((name) => String(name || "").trim()).filter(Boolean)));
  const keys = new Set<string>();

  for (const name of normalizedNames) {
    keys.add(normalizeOwnerKey(name));
    for (const ownerKey of buildPersonOwnerKeys(name)) {
      keys.add(ownerKey);
    }
  }

  return {
    names: normalizedNames,
    keys: [...keys].filter(Boolean),
  };
}

function ticketMatchesUserOwner(owner: unknown, matcher: ReturnType<typeof buildUserOwnerMatcher>) {
  const ownerValue = String(owner ?? "").trim();
  if (!ownerValue || matcher.keys.length === 0) return false;

  const ownerKey = normalizeOwnerKey(ownerValue);
  if (matcher.keys.includes(ownerKey)) return true;
  if (findBestMatch(ownerKey, matcher.keys, 0.88)) return true;
  return Boolean(findBestMatch(ownerValue, matcher.names, 0.82));
}

function getTicketPriorityTone(ticket: TicketRecord): MyTicketPriorityTone {
  const priorityValue = String(
    ticket.priority ?? ticket.severity ?? ticket.ticket_priority ?? ticket.ticketPriority ?? "",
  ).toLowerCase();

  if (priorityValue.includes("critical") || priorityValue.includes("krit") || priorityValue.includes("p1") || priorityValue.includes("sev1")) {
    return "critical";
  }

  if (priorityValue.includes("high") || priorityValue.includes("hoch") || priorityValue.includes("p2") || priorityValue.includes("sev2")) {
    return "high";
  }

  const remainingMs = getRemainingMs(ticket as Record<string, any>);
  if (remainingMs !== null && remainingMs <= CRITICAL_WINDOW_MS) return "critical";
  if (remainingMs !== null && remainingMs <= HIGH_WINDOW_MS) return "high";
  return "medium";
}

function getTicketIdentifier(ticket: TicketRecord) {
  return String(ticket.external_id ?? ticket.ticketNumber ?? ticket.activity_no ?? ticket.id ?? "-").trim() || "-";
}

function getTicketTitle(ticket: TicketRecord) {
  const value = ticket.activity ?? ticket.title ?? ticket.subtype ?? ticket.customer_trouble_type ?? ticket.system_name ?? ticket.systemName ?? ticket.queue_type;
  return String(value ?? "Ticket").trim() || "Ticket";
}

function getTicketTimeLabel(ticket: TicketRecord, locale: string) {
  const value = ticket.revised_commit_date ?? ticket.commit_date ?? ticket.sched_start ?? ticket.Start_Date ?? null;
  const label = formatDateTimeForLocale(value as string | null | undefined, locale, { year: undefined });
  return label || "-";
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

function formatPriorityLabel(tone: MyTicketPriorityTone, language: LanguageCode) {
  if (language === "de") {
    if (tone === "critical") return DASHBOARD_COPY.de.priorityCritical;
    if (tone === "high") return DASHBOARD_COPY.de.priorityHigh;
    return DASHBOARD_COPY.de.priorityMedium;
  }

  if (tone === "critical") return DASHBOARD_COPY.en.priorityCritical;
  if (tone === "high") return DASHBOARD_COPY.en.priorityHigh;
  return DASHBOARD_COPY.en.priorityMedium;
}

function getShiftCardAccent(shiftCode: string, isLight: boolean) {
  const normalized = shiftCode.toUpperCase();

  if (normalized.startsWith("E") || normalized.startsWith("HE")) {
    return isLight
      ? "border-orange-200/85 bg-[linear-gradient(165deg,rgba(251,146,60,0.16),rgba(255,255,255,0.97)_54%,rgba(255,247,237,0.99))] shadow-[0_18px_42px_rgba(251,146,60,0.12)] hover:shadow-[0_24px_56px_rgba(251,146,60,0.18)]"
      : "border-orange-300/22 bg-[linear-gradient(165deg,rgba(249,115,22,0.22),rgba(57,22,6,0.22)_22%,rgba(8,17,37,0.88)_58%,rgba(5,12,28,0.94))] shadow-[0_24px_70px_rgba(249,115,22,0.16)] hover:shadow-[0_0_36px_rgba(249,115,22,0.24)]";
  }

  if (normalized.startsWith("L") || normalized.startsWith("HL")) {
    return isLight
      ? "border-amber-200/85 bg-[linear-gradient(165deg,rgba(250,204,21,0.18),rgba(255,255,255,0.97)_54%,rgba(254,252,232,0.99))] shadow-[0_18px_42px_rgba(250,204,21,0.11)] hover:shadow-[0_24px_56px_rgba(250,204,21,0.18)]"
      : "border-amber-300/20 bg-[linear-gradient(165deg,rgba(250,204,21,0.20),rgba(66,48,4,0.18)_22%,rgba(8,17,37,0.88)_58%,rgba(5,12,28,0.94))] shadow-[0_24px_70px_rgba(250,204,21,0.14)] hover:shadow-[0_0_34px_rgba(250,204,21,0.20)]";
  }

  if (normalized === "N") {
    return isLight
      ? "border-sky-200/85 bg-[linear-gradient(165deg,rgba(56,189,248,0.16),rgba(255,255,255,0.97)_54%,rgba(240,249,255,0.99))] shadow-[0_18px_42px_rgba(56,189,248,0.10)] hover:shadow-[0_24px_56px_rgba(56,189,248,0.16)]"
      : "border-sky-300/20 bg-[linear-gradient(165deg,rgba(56,189,248,0.20),rgba(6,30,56,0.20)_22%,rgba(8,17,37,0.88)_58%,rgba(5,12,28,0.94))] shadow-[0_24px_70px_rgba(56,189,248,0.14)] hover:shadow-[0_0_34px_rgba(56,189,248,0.20)]";
  }

  if (normalized === "DBS") {
    return isLight
      ? "border-violet-200/85 bg-[linear-gradient(165deg,rgba(167,139,250,0.18),rgba(255,255,255,0.97)_54%,rgba(245,243,255,0.99))] shadow-[0_18px_42px_rgba(167,139,250,0.11)] hover:shadow-[0_24px_56px_rgba(167,139,250,0.18)]"
      : "border-violet-300/20 bg-[linear-gradient(165deg,rgba(167,139,250,0.20),rgba(52,33,91,0.18)_22%,rgba(8,17,37,0.88)_58%,rgba(5,12,28,0.94))] shadow-[0_24px_70px_rgba(167,139,250,0.14)] hover:shadow-[0_0_34px_rgba(167,139,250,0.20)]";
  }

  return isLight
    ? "border-slate-200/85 bg-[linear-gradient(165deg,rgba(148,163,184,0.16),rgba(255,255,255,0.97)_54%,rgba(248,250,252,0.99))] shadow-[0_18px_42px_rgba(148,163,184,0.10)] hover:shadow-[0_24px_56px_rgba(148,163,184,0.16)]"
    : "border-slate-300/18 bg-[linear-gradient(165deg,rgba(148,163,184,0.16),rgba(24,30,45,0.18)_22%,rgba(8,17,37,0.88)_58%,rgba(5,12,28,0.94))] shadow-[0_24px_70px_rgba(15,23,42,0.18)] hover:shadow-[0_0_34px_rgba(148,163,184,0.14)]";
}

function asTicketRecord(ticket: unknown): TicketRecord {
  return ticket as TicketRecord;
}

export default function Dashboard() {
  const { theme } = useTheme();
  const { language } = useLanguage();
  const locale = LANGUAGE_TO_LOCALE[language];
  const copy = DASHBOARD_COPY[language];
  const { user } = useAuth();
  const { status, error: healthError } = useHealthStatus();
  const rawTickets = useCommitStore((state) => state.rawTickets);
  const handovers = useHandoverStore((state) => state.handovers);
  const loadHandovers = useHandoverStore((state) => state.load);
  const getEmployeesForTodayAll = useShiftStore((state) => state.getEmployeesForTodayAll);
  const { crawlerStatus, refreshCommit } = useDashboardData();
  const isLight = theme === "light";

  // Real ODIN decision data from assignment engine
  const [latestDecision, setLatestDecision] = useState<{
    ticketId: string;
    ticketType: string;
    assignedEmployee: string;
    confidence: number;
    poolSize: number;
    excludedCandidates: OdinExcludedCandidate[];
    result: string;
  } | null>(null);
  const [recentAssignedDecisions, setRecentAssignedDecisions] = useState<AssignmentDecision[]>([]);
  const [criticalSnapshot, setCriticalSnapshot] = useState<CriticalWorkloadSnapshot | null>(null);

  const loadSupportingDashboardData = useCallback(() => {
    void fetchDashboardCriticalWorkload().then(setCriticalSnapshot).catch(() => { /* ignore */ });

    void AssignmentApi.getDecisions({ limit: 36, result: "assigned" }).then((decisions) => {
      setRecentAssignedDecisions(decisions);

      if (decisions.length === 0) return;

      const d = decisions[0];
      const initialCount = d.initial_candidates?.length ?? 0;
      const excludedCount = d.excluded_candidates?.length ?? 0;
      const remainingCount = d.remaining_candidates?.length ?? 0;

      const excludedMap = new Map<string, string>();
      for (const ec of d.excluded_candidates ?? []) {
        if (!excludedMap.has(ec.name)) {
          excludedMap.set(ec.name, ec.reason || "—");
        }
      }
      const excludedList = Array.from(excludedMap.entries())
        .slice(0, 5)
        .map(([name, reason]) => ({ name, reason }));

      const conf = initialCount > 0
        ? Math.round(((initialCount - excludedCount + remainingCount) / (initialCount * 2)) * 100)
        : 0;
      const clampedConf = Math.max(45, Math.min(99, conf || 78));

      setLatestDecision({
        ticketId: d.external_id ?? d.ticket_id ?? "—",
        ticketType: d.ticket_type ?? "Ticket",
        assignedEmployee: d.assigned_worker_name ?? "—",
        confidence: clampedConf,
        poolSize: initialCount,
        excludedCandidates: excludedList,
        result: d.result,
      });
    }).catch(() => { /* silently fall back to computed data */ });
  }, []);

  const refreshDashboard = useCallback(() => {
    void refreshCommit();
    void useHandoverStore.getState().load({ force: true });
    loadSupportingDashboardData();
  }, [loadSupportingDashboardData, refreshCommit]);

  useRealtimeUpdates({
    ingest_complete: refreshDashboard,
    handover_created: () => {
      void useHandoverStore.getState().load({ force: true });
    },
  });

  useEffect(() => {
    logActivityEventSafe({ action: "PAGE_VIEW", module: "DASHBOARD", details: { view: "Live Command Deck" } });
    void refreshCommit();
    void loadHandovers({ force: true });
    loadSupportingDashboardData();
  }, [loadHandovers, loadSupportingDashboardData, refreshCommit]);

  const ownerMatcher = useMemo(() => {
    if (!user) return null;
    return buildUserOwnerMatcher(user);
  }, [user]);

  const greetingName = useMemo(() => {
    if (!user) return language === "de" ? "KOLLEGE" : "OPERATOR";
    return getUserDisplayName(user).toUpperCase();
  }, [language, user]);

  const employeesToday = useMemo(() => {
    try {
      return getEmployeesForTodayAll();
    } catch {
      return [];
    }
  }, [getEmployeesForTodayAll]);

  const currentShiftEmployees = useMemo(() => {
    if (!ownerMatcher) return [];

    const userShiftEntry = employeesToday.find((employee) => ticketMatchesUserOwner(employee.name, ownerMatcher));
    if (!userShiftEntry) return [];

    return employeesToday.filter((employee) => employee.shift === userShiftEntry.shift);
  }, [employeesToday, ownerMatcher]);

  const currentShiftMatcher = useMemo(() => {
    if (currentShiftEmployees.length === 0) return null;
    return buildOwnerMatcherFromNames(currentShiftEmployees.map((employee) => employee.name));
  }, [currentShiftEmployees]);

  const currentShiftLabel = useMemo(() => {
    if (currentShiftEmployees.length === 0) return null;
    const shiftEntry = currentShiftEmployees[0];
    return `${shiftEntry.info.label} · ${shiftEntry.info.name} · ${shiftEntry.time}`;
  }, [currentShiftEmployees]);

  const openHandovers = useMemo(
    () => handovers.filter((handover) => handover.status !== "Erledigt").length,
    [handovers],
  );

  const crawlerOverview = useMemo<{ value: string; detail: string; tone: "cyan" | "amber" }>(() => {
    if (!crawlerStatus.lastUpdate) {
      return { value: "--", detail: copy.crawlerUnknown, tone: "amber" };
    }

    const parsed = new Date(crawlerStatus.lastUpdate);
    if (Number.isNaN(parsed.getTime())) {
      return { value: "--", detail: copy.crawlerUnknown, tone: "amber" };
    }

    const delayed = Date.now() - parsed.getTime() > 5 * 60 * 1000;
    const countLabel = crawlerStatus.count == null
      ? null
      : `${crawlerStatus.count} ${language === "de" ? "Tickets im Feed" : "tickets in feed"}`;

    return {
      value: formatTimeForLocale(crawlerStatus.lastUpdate, locale) || "--",
      detail: [countLabel, delayed ? copy.crawlerDelayed : copy.crawlerHealthy].filter(Boolean).join(" · "),
      tone: delayed ? "amber" : "cyan",
    };
  }, [copy.crawlerDelayed, copy.crawlerHealthy, copy.crawlerUnknown, crawlerStatus.count, crawlerStatus.lastUpdate, language, locale]);

  const myTickets = useMemo(() => {
    if (!ownerMatcher) return [];

    const items = rawTickets
      .filter((ticket) => {
        const ticketRecord = asTicketRecord(ticket);
        return ticketMatchesUserOwner(ticketRecord.owner ?? ticketRecord.Owner, ownerMatcher);
      })
      .map((ticket) => {
        const ticketRecord = asTicketRecord(ticket);
        const priorityTone = getTicketPriorityTone(ticketRecord);
        const remainingMs = getRemainingMs(ticketRecord as Record<string, any>);
        const sortTime = remainingMs === null ? Number.MAX_SAFE_INTEGER : remainingMs;

        return {
          id: getTicketIdentifier(ticketRecord),
          title: getTicketTitle(ticketRecord),
          priorityLabel: formatPriorityLabel(priorityTone, language),
          priorityTone,
          timeLabel: getTicketTimeLabel(ticketRecord, locale),
          priorityRank: priorityTone === "critical" ? 0 : priorityTone === "high" ? 1 : 2,
          sortTime,
        };
      })
      .sort((left, right) => left.priorityRank - right.priorityRank || left.sortTime - right.sortTime || left.title.localeCompare(right.title, locale));

    return items.slice(0, 5).map(({ priorityRank, sortTime, ...ticket }) => ticket) as MyTicketPanelItem[];
  }, [language, locale, ownerMatcher, rawTickets]);

  const queueMetrics = useMemo(() => {
    const metrics = new Map<QueueCardKey, { total: number; critical: number }>([
      ["SmartHands", { total: 0, critical: 0 }],
      ["TroubleTickets", { total: 0, critical: 0 }],
      ["CCInstalls", { total: 0, critical: 0 }],
      ["Deinstall", { total: 0, critical: 0 }],
      ["Handover", { total: openHandovers, critical: openHandovers }],
    ]);

    for (const ticket of rawTickets) {
      const ticketRecord = asTicketRecord(ticket);
      const queueKey = normalizeQueueKey(ticketRecord.queue_type ?? ticketRecord.queueType ?? ticketRecord.type ?? ticketRecord.activityType);
      if (!queueKey) continue;

      const entry = metrics.get(queueKey);
      if (!entry) continue;

      entry.total += 1;
      if (getTicketPriorityTone(ticketRecord) === "critical") {
        entry.critical += 1;
      }
    }

    return metrics;
  }, [openHandovers, rawTickets]);

  // Trend data: compare current counts to last saved snapshot (persisted daily)
  const kpiTrends = useMemo(() => {
    const STORAGE_KEY = "odin_kpi_snapshots";
    const now = new Date();
    const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterdayKey = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

    const currentCounts: Record<string, number> = {};
    for (const [key, val] of queueMetrics.entries()) {
      currentCounts[key] = val.total;
    }

    let previousCounts: Record<string, number> | null = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : {};
      const snapshots = parsed && typeof parsed === "object" ? parsed as Record<string, Record<string, number>> : {};

      if (snapshots[yesterdayKey]) {
        previousCounts = snapshots[yesterdayKey];
      } else {
        const fallbackKey = Object.keys(snapshots)
          .filter((key) => key < todayKey)
          .sort()
          .at(-1);
        if (fallbackKey) {
          previousCounts = snapshots[fallbackKey] ?? null;
        }
      }

      if (rawTickets.length > 0) {
        snapshots[todayKey] = currentCounts;
        const recentKeys = Object.keys(snapshots).sort().slice(-7);
        const trimmedSnapshots = recentKeys.reduce<Record<string, Record<string, number>>>((accumulator, key) => {
          accumulator[key] = snapshots[key];
          return accumulator;
        }, {});
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedSnapshots));
      }
    } catch { /* ignore */ }

    const trends = new Map<string, KpiTrendData>();
    for (const key of queueMetrics.keys()) {
      if (!previousCounts) continue;
      const prev = previousCounts[key] ?? 0;
      const curr = currentCounts[key] ?? 0;
      const diff = curr - prev;
      const pct = prev === 0 ? (curr > 0 ? 100 : 0) : (diff / prev) * 100;
      trends.set(key, {
        previousTotal: prev,
        delta: diff,
        percentChange: pct,
        direction: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat",
      });
    }
    return trends;
  }, [queueMetrics, rawTickets.length]);

  const queueCards = useMemo<QueueCardDefinition[]>(() => ([
    {
      key: "SmartHands",
      label: { de: copy.queueCards.smartHands, en: copy.queueCards.smartHands },
      badgeLabel: { de: copy.badgeCritical, en: copy.badgeCritical },
      to: "/tickets?type=SmartHands",
      accent: isLight
        ? "border-orange-300/90 bg-[linear-gradient(165deg,rgba(251,146,60,0.28),rgba(255,237,213,0.92)_54%,rgba(255,247,237,0.99))] shadow-[0_20px_56px_rgba(251,146,60,0.20)] hover:shadow-[0_28px_72px_rgba(251,146,60,0.28)]"
        : "border-orange-400/35 bg-[linear-gradient(165deg,rgba(249,115,22,0.36),rgba(92,32,6,0.30)_24%,rgba(8,17,37,0.90)_60%,rgba(5,12,28,0.95))] shadow-[0_24px_80px_rgba(249,115,22,0.22),0_0_48px_rgba(249,115,22,0.12)] hover:shadow-[0_0_56px_rgba(249,115,22,0.36)]",
    },
    {
      key: "TroubleTickets",
      label: { de: copy.queueCards.troubleTickets, en: copy.queueCards.troubleTickets },
      badgeLabel: { de: copy.badgeCritical, en: copy.badgeCritical },
      to: "/tickets?type=TroubleTickets",
      accent: isLight
        ? "border-red-300/90 bg-[linear-gradient(165deg,rgba(248,113,113,0.28),rgba(254,226,226,0.92)_54%,rgba(254,242,242,0.99))] shadow-[0_20px_56px_rgba(248,113,113,0.20)] hover:shadow-[0_28px_72px_rgba(248,113,113,0.28)]"
        : "border-red-400/35 bg-[linear-gradient(165deg,rgba(239,68,68,0.36),rgba(102,20,30,0.32)_24%,rgba(8,17,37,0.90)_60%,rgba(5,12,28,0.95))] shadow-[0_24px_80px_rgba(239,68,68,0.22),0_0_48px_rgba(239,68,68,0.12)] hover:shadow-[0_0_56px_rgba(239,68,68,0.32)]",
    },
    {
      key: "CCInstalls",
      label: { de: copy.queueCards.crossConnect, en: copy.queueCards.crossConnect },
      badgeLabel: { de: copy.badgeCritical, en: copy.badgeCritical },
      to: "/tickets?type=CCInstalls",
      accent: isLight
        ? "border-yellow-300/90 bg-[linear-gradient(165deg,rgba(250,204,21,0.28),rgba(254,249,195,0.92)_54%,rgba(254,252,232,0.99))] shadow-[0_20px_56px_rgba(250,204,21,0.20)] hover:shadow-[0_28px_72px_rgba(250,204,21,0.28)]"
        : "border-yellow-400/35 bg-[linear-gradient(165deg,rgba(250,204,21,0.34),rgba(102,76,6,0.28)_24%,rgba(8,17,37,0.90)_60%,rgba(5,12,28,0.95))] shadow-[0_24px_80px_rgba(250,204,21,0.20),0_0_48px_rgba(250,204,21,0.10)] hover:shadow-[0_0_56px_rgba(250,204,21,0.30)]",
    },
    {
      key: "Deinstall",
      label: { de: copy.queueCards.deinstall, en: copy.queueCards.deinstall },
      badgeLabel: { de: copy.badgeOpen, en: copy.badgeOpen },
      to: "/tickets?type=Deinstall",
      accent: isLight
        ? "border-violet-300/90 bg-[linear-gradient(165deg,rgba(167,139,250,0.28),rgba(237,233,254,0.92)_54%,rgba(245,243,255,0.99))] shadow-[0_20px_56px_rgba(167,139,250,0.20)] hover:shadow-[0_28px_72px_rgba(167,139,250,0.28)]"
        : "border-violet-400/35 bg-[linear-gradient(165deg,rgba(167,139,250,0.34),rgba(68,42,108,0.30)_24%,rgba(8,17,37,0.90)_60%,rgba(5,12,28,0.95))] shadow-[0_24px_80px_rgba(167,139,250,0.22),0_0_48px_rgba(167,139,250,0.12)] hover:shadow-[0_0_56px_rgba(167,139,250,0.32)]",
    },
    {
      key: "Handover",
      label: { de: copy.queueCards.handover, en: copy.queueCards.handover },
      badgeLabel: { de: copy.badgeOpen, en: copy.badgeOpen },
      to: "/handover",
      accent: isLight
        ? "border-cyan-200/90 bg-[linear-gradient(165deg,rgba(103,232,249,0.22),rgba(236,254,255,0.92)_54%,rgba(236,254,255,0.99))] shadow-[0_20px_56px_rgba(103,232,249,0.16)] hover:shadow-[0_28px_72px_rgba(103,232,249,0.24)]"
        : "border-cyan-300/30 bg-[linear-gradient(165deg,rgba(103,232,249,0.18),rgba(12,50,68,0.22)_24%,rgba(8,17,37,0.88)_56%,rgba(5,12,28,0.94))] shadow-[0_24px_80px_rgba(103,232,249,0.16),0_0_40px_rgba(103,232,249,0.08)] hover:shadow-[0_0_48px_rgba(103,232,249,0.24)]",
    },
  ]), [copy.badgeCritical, copy.badgeOpen, copy.queueCards.crossConnect, copy.queueCards.deinstall, copy.queueCards.handover, copy.queueCards.smartHands, copy.queueCards.troubleTickets, isLight]);

  const shiftCards = useMemo<ShiftCardDefinition[]>(() => {
    const grouped = new Map<string, {
      label: string;
      count: number;
      times: Set<string>;
      footerLabel: string;
      accent: string;
      to: string;
    }>();

    for (const employee of employeesToday) {
      const shiftCode = String(employee.shift || "").trim();
      if (!shiftCode || shiftCode === "FS" || shiftCode === "ABW") continue;

      const shiftInfo = shiftTypes[shiftCode];
      if (!shiftInfo) continue;

      const entry = grouped.get(shiftCode) ?? {
        label: shiftInfo.label || shiftCode,
        count: 0,
        times: new Set<string>(),
        footerLabel: shiftInfo.name,
        accent: getShiftCardAccent(shiftCode, isLight),
        to: "/shiftplan/week",
      };

      entry.count += 1;
      if (employee.time && employee.time !== "—") {
        entry.times.add(employee.time.replace(/-/g, " - "));
      }

      grouped.set(shiftCode, entry);
    }

    return Array.from(grouped.entries())
      .sort((left, right) => {
        const leftWeight = SHIFT_CARD_ORDER[left[0]] ?? 999;
        const rightWeight = SHIFT_CARD_ORDER[right[0]] ?? 999;
        if (leftWeight !== rightWeight) return leftWeight - rightWeight;
        return left[0].localeCompare(right[0], locale);
      })
      .map(([key, entry]) => ({
        key,
        label: entry.label,
        timeRange: entry.times.size > 0 ? Array.from(entry.times).join(" · ") : "—",
        count: entry.count,
        accent: entry.accent,
        footerLabel: entry.footerLabel,
        to: entry.to,
      }));
  }, [employeesToday, isLight, locale]);

  const systemState = healthError || status?.backend !== "ok" || status?.database !== "ok" ? "error" : "ok";

  // Compute total and critical tickets
  const totalTickets = rawTickets.length;
  const totalCriticalTickets = useMemo(() => {
    return rawTickets.filter((t) => getTicketPriorityTone(asTicketRecord(t)) === "critical").length;
  }, [rawTickets]);

  // Next escalation: find closest critical ticket time
  const nextEscalationLabel = useMemo(() => {
    let minMs = Infinity;
    for (const ticket of rawTickets) {
      const remaining = getRemainingMs(asTicketRecord(ticket) as Record<string, any>);
      if (remaining !== null && remaining > 0 && remaining < minMs) {
        minMs = remaining;
      }
    }
    if (!Number.isFinite(minMs)) return "—";
    const hours = Math.floor(minMs / 3600000);
    const minutes = Math.floor((minMs % 3600000) / 60000);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, [rawTickets]);

  // Build critical tickets list for the panel
  const criticalTicketEntries = useMemo<CriticalTicketEntry[]>(() => {
    if (!criticalSnapshot) return [];

    return [...criticalSnapshot.tickets]
      .sort((left, right) => {
        const leftTime = getCriticalTicketDeadlineMs(left);
        const rightTime = getCriticalTicketDeadlineMs(right);
        if (leftTime !== rightTime) return leftTime - rightTime;
        return (left.ticketNumber || left.activityId || left.ticketId).localeCompare(right.ticketNumber || right.activityId || right.ticketId);
      })
      .slice(0, 8)
      .map((ticket) => ({
        id: ticket.ticketNumber || ticket.activityId || ticket.ticketId,
        title: ticket.systemName || ticket.ticketType || ticket.ticketId,
        location: ticket.owner || undefined,
        escalationLabel: ticket.remainingTimeMinutes == null
          ? "—"
          : ticket.remainingTimeMinutes >= 60
            ? `${Math.floor(ticket.remainingTimeMinutes / 60)}h ${ticket.remainingTimeMinutes % 60}m`
            : `${ticket.remainingTimeMinutes}m`,
        isCritical: ticket.criticalityLevel === "critical",
      }));
  }, [criticalSnapshot]);

  // Build shift entries for the overview panel
  const shiftOverviewEntries = useMemo(() => {
    const now = new Date();
    const currentHour = now.getHours();

    return shiftCards.map((sc) => {
      const shiftInfo = shiftTypes[sc.key];
      const startHour = shiftInfo ? parseInt(shiftInfo.time.split(":")[0] || "0", 10) : 0;
      const endHour = shiftInfo ? parseInt((shiftInfo.time.split("-")[1] || "").split(":")[0] || "23", 10) : 23;
      const isActive = sc.key === "N"
        ? currentHour >= 21 || currentHour < 7
        : currentHour >= startHour && currentHour < endHour;

      return {
        code: sc.key,
        label: sc.label,
        timeRange: sc.timeRange,
        employeeCount: sc.count,
        isActive,
      };
    });
  }, [shiftCards]);

  // ODIN Decision panel: use most recent critical ticket as example
  const odinDecisionData = useMemo(() => {
    const criticalTicket = rawTickets.find((t) => getTicketPriorityTone(asTicketRecord(t)) === "critical");
    const tr = criticalTicket ? asTicketRecord(criticalTicket) : null;
    return {
      ticketId: tr ? getTicketIdentifier(tr) : "—",
      ticketType: tr ? String(tr.queue_type ?? tr.queueType ?? tr.type ?? "Ticket").trim() : "—",
      assignedEmployee: tr ? String(tr.owner ?? tr.Owner ?? "—").trim() : "—",
    };
  }, [rawTickets]);

  const shiftAssignmentFeed = useMemo<AssignmentFeedEntry[]>(() => {
    if (!currentShiftMatcher) return [];

    return recentAssignedDecisions
      .filter((decision) => decision.assigned_worker_name && ticketMatchesUserOwner(decision.assigned_worker_name, currentShiftMatcher))
      .slice(0, 18)
      .map((decision) => ({
        ticketId: decision.external_id ?? decision.ticket_id,
        ticketType: decision.ticket_type ?? (language === "de" ? "Ticket" : "Ticket"),
        assignedEmployee: decision.assigned_worker_name ?? "—",
        decidedAtLabel: formatTimeForLocale(decision.decided_at, locale) || formatDateTimeForLocale(decision.decided_at, locale) || "—",
        isCurrentUser: ownerMatcher ? ticketMatchesUserOwner(decision.assigned_worker_name, ownerMatcher) : false,
      }));
  }, [currentShiftMatcher, language, locale, ownerMatcher, recentAssignedDecisions]);

  // KPI card config with tones
  const kpiCards: Array<{ key: QueueCardKey; tone: KpiTone; ctaLabel: string }> = [
    { key: "TroubleTickets", tone: "red", ctaLabel: language === "de" ? "Zur Ticketliste →" : "Open ticket list →" },
    { key: "SmartHands", tone: "amber", ctaLabel: language === "de" ? "Zur Ticketliste →" : "Open ticket list →" },
    { key: "CCInstalls", tone: "cyan", ctaLabel: language === "de" ? "Zur Ticketliste →" : "Open ticket list →" },
    { key: "Deinstall", tone: "blue", ctaLabel: language === "de" ? "Zur Ticketliste →" : "Open ticket list →" },
    { key: "Handover", tone: "violet", ctaLabel: language === "de" ? "Zum Handover →" : "Open handover →" },
  ];

  // Next scheduled / due ticket (the closest ticket with a commit date in the future)
  const nextScheduledData = useMemo(() => {
    let closestMs = Infinity;
    let closestTicket: TicketRecord | null = null;
    const now = Date.now();
    for (const ticket of rawTickets) {
      const tr = asTicketRecord(ticket);
      const dateValue = tr.revised_commit_date ?? tr.commit_date ?? tr.sched_start ?? tr.Start_Date;
      if (!dateValue) continue;
      const parsed = new Date(dateValue as string);
      if (Number.isNaN(parsed.getTime())) continue;
      const diff = parsed.getTime() - now;
      if (diff > 0 && diff < closestMs) {
        closestMs = diff;
        closestTicket = tr;
      }
    }
    if (!closestTicket) return { label: "—", id: undefined };
    const hours = Math.floor(closestMs / 3600000);
    const minutes = Math.floor((closestMs % 3600000) / 60000);
    const timeLabel = hours > 24
      ? `${Math.floor(hours / 24)}d ${hours % 24}h`
      : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
    return {
      label: timeLabel,
      id: getTicketIdentifier(closestTicket),
    };
  }, [rawTickets]);

  // Build "own tickets" entries for the hero panel
  const ownTicketEntries = useMemo<OwnTicketEntry[]>(() => {
    return myTickets.map((t) => ({
      id: t.id,
      title: t.title,
      timeLabel: t.timeLabel,
      isCritical: t.priorityTone === "critical",
    }));
  }, [myTickets]);

  // Personalized greeting
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    let prefix: string;
    if (language === "de") {
      prefix = hour < 12 ? "Guten Morgen" : hour < 18 ? "Guten Tag" : "Guten Abend";
    } else {
      prefix = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    }
    return `${prefix}, ${greetingName}`;
  }, [greetingName, language]);

  return (
    <section className={isLight
      ? "relative min-h-full overflow-hidden bg-[linear-gradient(180deg,#eef3f8_0%,#f7fafc_18%,#edf2f7_46%,#f8fafc_100%)] text-slate-900"
      : "relative min-h-full overflow-hidden text-white"
    }>
      <style>{DASHBOARD_SHELL_CSS}</style>

      {isLight && <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.40),transparent_26%),radial-gradient(ellipse_at_top_right,rgba(56,189,248,0.14),transparent_24%),radial-gradient(ellipse_at_center,rgba(148,163,184,0.10),transparent_56%),linear-gradient(180deg,rgba(255,255,255,0.30),transparent_22%)]" />}
      {isLight && <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(15,23,42,0.03),transparent)]" />}

      {/* Subtle ambient orbs */}
      <div className="pointer-events-none absolute left-[-8%] top-[-10%] h-96 w-96 rounded-full bg-[radial-gradient(circle,rgba(255,255,255,0.48),transparent_66%)] blur-[120px]" style={{ animation: "dashboardAuroraDrift 18s ease-in-out infinite" }} />
      <div className="pointer-events-none absolute right-[-5%] top-[-8%] h-80 w-80 rounded-full bg-[radial-gradient(circle,rgba(56,189,248,0.14),transparent_68%)] blur-[120px]" style={{ animation: "dashboardAuroraDrift 16s ease-in-out infinite 2s" }} />
      <div className="pointer-events-none absolute inset-x-[14%] top-[6%] h-64 rounded-full bg-[radial-gradient(circle,rgba(148,163,184,0.14),transparent_70%)] blur-[130px]" />
      <div className="pointer-events-none absolute bottom-[10%] left-[40%] h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(79,70,229,0.06),transparent_70%)] blur-[100px]" style={{ animation: "dashboardAuroraDrift 22s ease-in-out infinite 4s" }} />

      <div className="relative px-4 py-5 lg:px-6 lg:py-6">
        {/* HERO: Operational State Panel with Map Background */}
        <div className={isLight
            ? "relative mb-6 overflow-hidden rounded-4xl border border-slate-300/80 bg-[linear-gradient(155deg,rgba(255,255,255,0.92),rgba(242,246,250,0.90)_42%,rgba(230,238,246,0.86)_100%)] shadow-[0_48px_120px_rgba(148,163,184,0.24),0_20px_52px_rgba(15,23,42,0.10),0_0_80px_rgba(56,189,248,0.12)] backdrop-blur-xl"
          : "relative mb-6 overflow-hidden rounded-4xl border shadow-[0_28px_100px_rgba(0,0,0,0.50),0_0_56px_rgba(0,180,255,0.10),0_0_120px_rgba(0,120,255,0.05)]"
          } style={isLight ? undefined : { borderColor: "rgba(0,210,255,0.12)", background: "linear-gradient(180deg,rgba(6,14,30,0.10),rgba(4,10,22,0.18))" }}>
          <MapBackground isLight={isLight} />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[linear-gradient(180deg,rgba(255,255,255,0.12),transparent)] dark:bg-[linear-gradient(180deg,rgba(34,211,238,0.10),transparent)]" />
            <div className={`pointer-events-none absolute inset-0 ${isLight ? "opacity-[0.05]" : "opacity-[0.02]"}`} style={{
            backgroundImage: "linear-gradient(rgba(173,225,255,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(173,225,255,0.10) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
            animation: "dashboardGridPulse 5s ease-in-out infinite",
          }} />
          {isLight && <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.66),transparent_70%)]" />}
          {isLight && <div className="pointer-events-none absolute inset-x-0 top-0 h-0.75 bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.88)_12%,rgba(148,163,184,0.44)_48%,rgba(56,189,248,0.30)_78%,transparent)] shadow-[0_0_18px_rgba(255,255,255,0.36)]" />}
          <div className="relative z-10 p-5 lg:p-8">
            <div className="mb-6 overflow-hidden rounded-[28px] border border-white/45 bg-[linear-gradient(135deg,rgba(255,255,255,0.74),rgba(255,255,255,0.24))] px-5 py-5 shadow-[0_22px_54px_rgba(15,23,42,0.10),inset_0_1px_0_rgba(255,255,255,0.70)] dark:border-cyan-300/14 dark:bg-[linear-gradient(135deg,rgba(6,18,40,0.78),rgba(4,12,28,0.54))] dark:shadow-[0_24px_60px_rgba(2,6,23,0.34),0_0_30px_rgba(34,211,238,0.08)]">
              <div className="pointer-events-none absolute inset-y-0 left-[-18%] w-28 opacity-60" style={{ background: isLight ? "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.38) 55%, transparent 100%)" : "linear-gradient(90deg, transparent 0%, rgba(34,211,238,0.18) 55%, transparent 100%)", filter: "blur(16px)", animation: "dashHeroShine 8.5s linear infinite" }} />
              <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className={isLight ? "font-display-brand text-[10px] font-black uppercase tracking-[0.34em] text-sky-700/80" : "font-display-brand text-[10px] font-black uppercase tracking-[0.34em] text-cyan-200/60"}>
                    {copy.commandSurface}
                  </div>
                  <h2 className={isLight ? "font-display-brand mt-3 text-[34px] font-black leading-none tracking-[-0.04em] text-slate-950" : "font-display-brand mt-3 text-[34px] font-black leading-none tracking-[-0.04em] text-white"}>
                    {greeting}
                  </h2>
                  <p className={isLight ? "mt-3 max-w-2xl text-sm leading-7 text-slate-600" : "mt-3 max-w-2xl text-sm leading-7 text-slate-300/88"}>
                    {copy.welcomeSubtitle}
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3 lg:min-w-110">
                  <div className={isLight ? "rounded-[20px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)]" : "rounded-[20px] border border-cyan-300/12 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}>
                    <div className={isLight ? "text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500" : "text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/48"}>{copy.systemStatus}</div>
                    <div className={isLight ? "mt-2 text-sm font-black text-slate-950" : "mt-2 text-sm font-black text-white"}>{systemState === "ok" ? copy.systemOnline : copy.systemDegraded}</div>
                  </div>
                  <div className={isLight ? "rounded-[20px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)]" : "rounded-[20px] border border-cyan-300/12 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}>
                    <div className={isLight ? "text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500" : "text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/48"}>{copy.activeTickets}</div>
                    <div className={isLight ? "mt-2 text-sm font-black text-slate-950" : "mt-2 text-sm font-black text-white"}>{totalTickets}</div>
                  </div>
                  <div className={isLight ? "rounded-[20px] border border-slate-200/80 bg-white/88 px-4 py-3 shadow-[0_16px_34px_rgba(15,23,42,0.05)]" : "rounded-[20px] border border-cyan-300/12 bg-white/4 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"}>
                    <div className={isLight ? "text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500" : "text-[10px] font-bold uppercase tracking-[0.24em] text-cyan-200/48"}>{copy.crewOnline}</div>
                    <div className={isLight ? "mt-2 text-sm font-black text-slate-950" : "mt-2 text-sm font-black text-white"}>{employeesToday.length}</div>
                  </div>
                </div>
              </div>
            </div>
            <OperationalStatePanel
              openTickets={totalTickets}
              criticalTickets={totalCriticalTickets}
              nextEscalationLabel={nextEscalationLabel}
              nextScheduledLabel={nextScheduledData.label}
              nextScheduledId={nextScheduledData.id}
              allSystemsOnline={systemState === "ok"}
              isLight={isLight}
              language={language}
              greeting={greeting}
              ownTickets={ownTicketEntries}
            />
          </div>
        </div>

        {/* KPI CARDS ROW */}
        <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {kpiCards.map((kpi, index) => {
            const metrics = queueMetrics.get(kpi.key) ?? { total: 0, critical: 0 };
            const queueCard = queueCards.find((c) => c.key === kpi.key);
            return (
              <PremiumKpiCard
                key={kpi.key}
                label={queueCard?.label[language] ?? kpi.key}
                total={metrics.total}
                critical={metrics.critical}
                badgeLabel={language === "de" ? copy.badgeCritical : "Critical"}
                to={queueCard?.to ?? "/tickets"}
                tone={kpi.tone}
                delay={0.1 + index * 0.05}
                isLight={isLight}
                language={language}
                ctaLabel={kpi.ctaLabel}
                trend={kpiTrends.get(kpi.key) ?? null}
              />
            );
          })}
        </div>

        {/* LOWER DASHBOARD: 3-column layout */}
        <div className="grid gap-5 lg:grid-cols-3">
          {/* Left: Shift Overview */}
          <ShiftOverviewPanel
            shifts={shiftOverviewEntries}
            isLight={isLight}
            language={language}
          />

          {/* Center: ODIN Decision Panel (real data from assignment engine) */}
          <OdinDecisionPanel
            ticketId={latestDecision?.ticketId ?? odinDecisionData.ticketId}
            ticketType={latestDecision?.ticketType ?? odinDecisionData.ticketType}
            assignedEmployee={latestDecision?.assignedEmployee ?? odinDecisionData.assignedEmployee}
            confidence={latestDecision?.confidence ?? 78}
            factors={getDefaultDecisionFactors(language)}
            excludedCandidates={latestDecision?.excludedCandidates ?? []}
            poolSize={latestDecision?.poolSize ?? (employeesToday.length || 8)}
            assignmentFeed={shiftAssignmentFeed}
            shiftLabel={currentShiftLabel}
            isLight={isLight}
            language={language}
          />

          {/* Right: Critical Tickets */}
          <CriticalTicketsPanel
            tickets={criticalTicketEntries}
            isLight={isLight}
            language={language}
          />
        </div>
      </div>
    </section>
  );
}
