/* ------------------------------------------------ */
/* TEAMS COMMUNICATION CENTER                      */
/* Full-featured Teams management page             */
/* ------------------------------------------------ */

import React, { useCallback, useEffect, useState } from "react";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader } from "../layout/EnterpriseLayout";
import {
  fetchTeamsStatus, fetchTeamsDiagnostics, fetchTeamsEvents, updateTeamsEvent,
  fetchTeamsRouting, createTeamsRoutingRule, updateTeamsRoutingRule, deleteTeamsRoutingRule,
  fetchTeamsTemplates, updateTeamsTemplate, previewTemplate,
  fetchTeamsSettings, updateTeamsSettings,
  fetchTeamsLog, fetchTeamsErrors, retryTeamsMessage,
  sendTeamsAssignmentTestMessage, sendTeamsTestMessage, testPowerAutomateWebhook, testTeamsTemplate, fetchTeamsEmployees,
  type TeamsStatus, type TeamsDiagnostics, type TeamsDiagnosticCheck, type TeamsEventConfig, type TeamsRoutingRule,
  type TeamsTemplate, type TeamsMessageLog, type TeamsEmployee,
} from "../../api/teamsConfig";
import {
  CheckCircle2, XCircle, AlertTriangle, Send, RefreshCw, Settings,
  Users, FileText, TestTube, Clock, Zap, Eye, ToggleLeft, ToggleRight,
  Loader2, Play, RotateCcw, ShieldAlert, Activity, Mail, Network
} from "lucide-react";
import { InfoTooltip } from "../ui/InfoTooltip";
import { useLanguage, type LanguageCode, getLanguageLocale } from "../../context/LanguageContext";
import { ShiftVerificationPanel } from "../verification/ShiftVerificationPanel";
import { TextRepairBoundary, repairTextDeep } from "../../utils/textRepair";
import { useAuth } from "../../context/AuthContext";

/* ---- Tab type ---- */
type TabId = "overview" | "diagnostics" | "employees" | "events" | "routing" | "templates" | "test" | "log" | "errors" | "settings" | "verification";

interface RecipientGroup {
  id: string;
  name: string;
  description: string;
  recipients: string[];
}

const TABS: { id: TabId; icon: React.ElementType }[] = [
  { id: "overview", icon: Eye },
  { id: "diagnostics", icon: ShieldAlert },
  { id: "employees", icon: Network },
  { id: "events", icon: Zap },
  { id: "routing", icon: Users },
  { id: "templates", icon: FileText },
  { id: "test", icon: TestTube },
  { id: "log", icon: Clock },
  { id: "errors", icon: AlertTriangle },
  { id: "verification", icon: CheckCircle2 },
  { id: "settings", icon: Settings },
];

const TEAMS_INPUT_CLASS = "border border-border/60 rounded-xl px-3 py-1.5 text-sm bg-background/85 shadow-[0_12px_24px_rgba(148,163,184,0.10),inset_0_1px_0_rgba(255,255,255,0.72)] outline-none transition focus:border-sky-300/70 focus:ring-4 focus:ring-sky-100 dark:focus:ring-sky-500/10";
const TEAMS_BUTTON_NEUTRAL_CLASS = "flex items-center gap-2 rounded-xl border border-border/60 bg-background/85 px-3 py-1.5 text-sm shadow-[0_12px_24px_rgba(148,163,184,0.10)] transition hover:bg-accent/40";
const TEAMS_BUTTON_PRIMARY_CLASS = "flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-1.5 text-sm text-white shadow-[0_14px_30px_rgba(37,99,235,0.26)] transition hover:bg-blue-700 disabled:opacity-50";
const TEAMS_BUTTON_SUCCESS_CLASS = "flex items-center gap-2 rounded-xl bg-green-600 px-3 py-1.5 text-sm text-white shadow-[0_14px_30px_rgba(22,163,74,0.22)] transition hover:bg-green-700 disabled:opacity-50";
const TEAMS_TABLE_HEAD_CLASS = "text-left text-muted-foreground border-b border-border/60";
const TEAMS_TABLE_ROW_CLASS = "border-b border-border/40 hover:bg-accent/30";
const TEAMS_SOFT_PANEL_CLASS = "rounded-xl border border-border/60 bg-background/72 shadow-[0_16px_36px_rgba(148,163,184,0.12)]";

const TAB_SUMMARIES_DE: Record<TabId, { title: string; description: string }> = {
  overview: {
    title: "Schnellueberblick",
    description: "Status, Versandlage und die wichtigsten Blocker in einer kompakten Leitwarte.",
  },
  diagnostics: {
    title: "Fehlercenter",
    description: "Technische Checks mit Klartext-Erklaerung: was geprueft wurde, warum es wichtig ist und welcher naechste Schritt noetig ist.",
  },
  employees: {
    title: "Gemappte Mitarbeiter",
    description: "Alle vorhandenen Teams-Mappings aus der Datenbank inklusive Mailquelle, Override-Status und verknuepftem ODIN-User.",
  },
  events: {
    title: "Events",
    description: "Steuert, welche ODIN-Ereignisse ueberhaupt Teams-Nachrichten ausloesen und wie aggressiv diese ausgeliefert werden.",
  },
  routing: {
    title: "Routing",
    description: "Ordnet Ereignisse Personen, Rollen, Schichten oder gespeicherten Empfaengergruppen zu.",
  },
  templates: {
    title: "Templates",
    description: "Formulierung und Informationsdichte der Teams-Nachrichten inklusive Testvorschau.",
  },
  test: {
    title: "Test Center",
    description: "Validiert Webhooks, Bot-Pfade und Templates ohne ein echtes produktives Event auszuloesen.",
  },
  log: {
    title: "Verlauf",
    description: "Chronologischer Ueberblick ueber bereits gesendete oder fehlgeschlagene Teams-Nachrichten.",
  },
  errors: {
    title: "Fehler & Retry",
    description: "Gezielte Nachbearbeitung fehlgeschlagener Zustellungen mit klarer technischer Fehlerursache.",
  },
  settings: {
    title: "Einstellungen",
    description: "Globale Versandregeln wie Quiet Hours, Deduplizierung, Fallbacks und Eskalationszeiten.",
  },
  verification: {
    title: "Schicht-Verifizierung",
    description: "Automatische Anwesenheitspruefung per Teams nach Schichtbeginn. Status, Konfiguration und Audit-Log.",
  },
};

const TAB_SUMMARIES_EN: Record<TabId, { title: string; description: string }> = {
  overview: { title: "Quick overview", description: "Status, delivery load, and the main blockers in one compact control room." },
  diagnostics: { title: "Diagnostics", description: "Technical checks with plain-language explanations, importance, and next steps." },
  employees: { title: "Mapped employees", description: "All Teams mappings from the database including mail source, override status, and linked ODIN user." },
  events: { title: "Events", description: "Controls which ODIN events trigger Teams messages and how aggressively they are delivered." },
  routing: { title: "Routing", description: "Assigns events to people, roles, shifts, or saved recipient groups." },
  templates: { title: "Templates", description: "Wording and information density of Teams messages including test preview." },
  test: { title: "Test center", description: "Validates webhooks, bot paths, and templates without triggering a real production event." },
  log: { title: "History", description: "Chronological overview of sent or failed Teams messages." },
  errors: { title: "Errors & retry", description: "Targeted reprocessing of failed deliveries with a clear technical root cause." },
  settings: { title: "Settings", description: "Global delivery rules such as quiet hours, deduplication, fallbacks, and escalation times." },
  verification: { title: "Shift Verification", description: "Automatic attendance check via Teams after shift start. Status, configuration, and audit log." },
};

const TEAMS_COPY: Record<LanguageCode, any> = {
  de: {
    pageTitle: "Teams Communication Center",
    pageSubtitle: "Microsoft Teams Nachrichtensteuerung",
    strapline: "Teams Center - transparent und operativ nutzbar",
    tabs: { overview: "Uebersicht", diagnostics: "Fehlercenter", employees: "Mappings", events: "Events", routing: "Routing", templates: "Templates", test: "Test Center", log: "Verlauf", errors: "Fehler & Retry", verification: "Schicht-Verifizierung", settings: "Einstellungen" },
    summaries: TAB_SUMMARIES_DE,
    statusError: "Status konnte nicht geladen werden",
    diagnosticsError: "Fehlercenter konnte nicht geladen werden",
    refresh: "Aktualisieren",
    recheck: "Neu pruefen",
    ready: "Bereit",
    blocked: "Blockiert",
    teamsReady: "Teams bereit",
    teamsBlocked: "Teams blockiert",
    sentToday: "Gesendet heute",
    failedToday: "Fehlgeschlagen heute",
    openRetries: "Offene Retries (24h)",
    mappedEmployees: "Gemappte Mitarbeiter",
    lastSuccess: "Letzter erfolgreicher Versand",
    lastError: "Letzter Fehler",
    time: "Zeit",
    type: "Typ",
    recipient: "Empfaenger",
    status: "Status",
    noSend: "Noch keine Sendung",
    noErrors: "Keine Fehler",
    quickStatus: "Fehlercenter-Schnellstatus",
    whatChecks: "Was das Fehlercenter prueft",
    commonFailures: "Typische Fehlerbilder",
    operationsUsage: "Operative Nutzung",
    latestDiagnosis: "Letzte Diagnose",
    asOf: "Stand",
    blockingPoints: "Blockierende Punkte",
    noBlockingPoints: "Aktuell wurden keine blockierenden Teams-Probleme erkannt.",
    activeMappings: "Aktive Teams-Mappings",
    linkedUsers: "Mit ODIN-User verknuepft",
    manualOverrides: "Manuelle Overrides",
    employeeMappings: "Mitarbeiter-Mappings",
    filterHint: "Filterbar nach Mitarbeitername, E-Mail oder Mailquelle.",
    searchNameOrMail: "Suche nach Name oder E-Mail",
    employee: "Mitarbeiter",
    teamsMail: "Teams-Mail",
    mailSource: "Mailquelle",
    override: "Override",
    odinUser: "ODIN-User",
    lastUpdated: "Zuletzt aktualisiert",
    manual: "Manuell",
    automatic: "Automatisch",
    notLinked: "Nicht verknuepft",
    noEmployees: "Keine Mitarbeiter-Mappings passend zum aktuellen Filter.",
    active: "Aktiv",
    inactive: "Inaktiv",
    statusFilterAll: "Alle Status",
    sent: "Gesendet",
    failed: "Fehlgeschlagen",
    entriesTotal: "Eintraege gesamt",
    content: "Inhalt",
    error: "Fehler",
    failedMessages: "Fehlgeschlagene Nachrichten - manuelles Retry moeglich",
    noFailedMessages: "Keine fehlgeschlagenen Nachrichten",
    retry: "Retry",
    remove: "Entfernen",
    disabledLabel: "deaktiviert",
    errorsRetryTooltipTitle: "Fehler & Retry",
    errorsRetryTooltipIntro: "Hier werden alle Nachrichten aufgelistet, deren Zustellung fehlgeschlagen ist. Moegliche Ursachen:",
    errorsRetryWebhook: "Die URL ist abgelaufen oder wurde in Teams geloescht.",
    errorsRetryNetwork: "Der Backend-Server konnte die Teams-API nicht erreichen.",
    errorsRetryToken: "Das OAuth-Token muss erneuert werden.",
    errorsRetryRateLimit: "Zu viele Nachrichten in kurzer Zeit - Teams drosselt die API.",
    errorsRetryHelp: "Klicken Sie auf Retry, um die Nachricht erneut zu senden. Bei Erfolg wird sie aus der Liste entfernt und im Log als sent vermerkt.",
    save: "Speichern",
  },
  en: { pageTitle: "Teams Communication Center", pageSubtitle: "Microsoft Teams message control", strapline: "Teams Center - transparent and operational", tabs: { overview: "Overview", diagnostics: "Diagnostics", employees: "Mappings", events: "Events", routing: "Routing", templates: "Templates", test: "Test center", log: "History", errors: "Errors & retry", verification: "Shift verification", settings: "Settings" }, summaries: TAB_SUMMARIES_EN, statusError: "Status could not be loaded", diagnosticsError: "Diagnostics could not be loaded", refresh: "Refresh", recheck: "Run again", ready: "Ready", blocked: "Blocked", teamsReady: "Teams ready", teamsBlocked: "Teams blocked", sentToday: "Sent today", failedToday: "Failed today", openRetries: "Open retries (24h)", mappedEmployees: "Mapped employees", lastSuccess: "Last successful delivery", lastError: "Last error", time: "Time", type: "Type", recipient: "Recipient", status: "Status", noSend: "No delivery yet", noErrors: "No errors", quickStatus: "Diagnostics quick status", whatChecks: "What diagnostics checks", commonFailures: "Typical failure patterns", operationsUsage: "Operational usage", latestDiagnosis: "Latest diagnosis", asOf: "As of", blockingPoints: "Blocking issues", noBlockingPoints: "No blocking Teams issues were detected.", activeMappings: "Active Teams mappings", linkedUsers: "Linked to ODIN user", manualOverrides: "Manual overrides", employeeMappings: "Employee mappings", filterHint: "Filter by employee name, email or email source.", searchNameOrMail: "Search by name or email", employee: "Employee", teamsMail: "Teams email", mailSource: "Mail source", override: "Override", odinUser: "ODIN user", lastUpdated: "Last updated", manual: "Manual", automatic: "Automatic", notLinked: "Not linked", noEmployees: "No employee mappings match the current filter.", active: "Active", inactive: "Inactive", statusFilterAll: "All statuses", sent: "Sent", failed: "Failed", entriesTotal: "entries total", content: "Content", error: "Error", failedMessages: "Failed messages - manual retry available", noFailedMessages: "No failed messages", retry: "Retry", remove: "Remove", disabledLabel: "disabled", errorsRetryTooltipTitle: "Errors & retry", errorsRetryTooltipIntro: "All messages whose delivery failed are listed here. Common causes:", errorsRetryWebhook: "The URL expired or was deleted in Teams.", errorsRetryNetwork: "The backend server could not reach the Teams API.", errorsRetryToken: "The OAuth token needs to be renewed.", errorsRetryRateLimit: "Too many messages were sent in a short time, so Teams is throttling the API.", errorsRetryHelp: "Click Retry to send the message again. On success it is removed from the list and marked as sent in the log.", save: "Save" },
};

function useTeamsUi() {
  const { language, t } = useLanguage();
  const fallbackCopy = (TEAMS_COPY.en || TEAMS_COPY.de || {
    tabs: {},
    summaries: TAB_SUMMARIES_EN,
  }) as any;
  return {
    language,
    t,
    locale: getLanguageLocale(language),
    copy: repairTextDeep((TEAMS_COPY[language] || fallbackCopy) as any),
  };
}

const DIAGNOSTIC_HELP_DE: Record<string, { title: string; summary: string; detail: string }> = {
  channel_webhook: {
    title: "Webhook-Pruefung",
    summary: "Prueft, ob ueberhaupt ein Teams-Ziel fuer Kanalnachrichten konfiguriert ist.",
    detail: "Ohne Webhook kann ODIN keine Kanalnachrichten an Teams uebergeben. Der Check prueft nur die Konfiguration, nicht den tatsaechlichen Versand einer Nachricht.",
  },
  bot_api: {
    title: "Bot-Pfad",
    summary: "Bewertet, ob persoenliche 1:1-Nachrichten ueber die interne Bot-Anbindung vorbereitet sind.",
    detail: "Der Bot-Pfad ist fuer private Nachrichten relevant. Fehlt er, kann Kanalversand trotzdem funktionieren, persoenliche Zustellung aber unvollstaendig bleiben.",
  },
  graph_credentials: {
    title: "Graph-Credentials",
    summary: "Prueft, ob Tenant, Client und Secret fuer Entra ID vollstaendig vorhanden sind.",
    detail: "Fehlende oder vertauschte Werte blockieren die Authentifizierung, bevor ueberhaupt ein Graph-Aufruf stattfinden kann.",
  },
  graph_token: {
    title: "Graph-Authentifizierung",
    summary: "Versucht aktiv, ueber Client Credentials ein Access Token von Entra ID zu holen.",
    detail: "Damit sieht man sofort, ob das Problem an falschen Secrets, ungueltiger App-Registrierung oder an Netzwerk/Proxy liegt.",
  },
  graph_permissions: {
    title: "Graph-Berechtigungen",
    summary: "Liest Rollen und Scopes direkt aus dem ausgestellten Token.",
    detail: "Ein technisch gueltiges Token ohne Rollen ist in der Praxis trotzdem wertlos. Genau das zeigt dieser Check.",
  },
  graph_users_probe: {
    title: "Graph-/users-Probe",
    summary: "Macht einen echten Lesezugriff gegen Microsoft Graph /users.",
    detail: "So wird sichtbar, ob die Berechtigungen in Azure zwar hinterlegt, aber noch nicht per Admin Consent freigegeben wurden.",
  },
  recipient_mapping: {
    title: "Empfaenger-Aufloesung",
    summary: "Prueft, ob ODIN ueberhaupt reale Zieladressen oder einen Fallback hat.",
    detail: "Auch wenn Graph technisch funktioniert, koennen persoenliche Nachrichten ohne Mitarbeiter-Mapping oder Fallback nicht zielgerichtet zugestellt werden.",
  },
  delivery_health: {
    title: "Aktuelle Versandlage",
    summary: "Wertet das Nachrichtenlog auf aktuelle Fehler und offene Retries aus.",
    detail: "Das ist der operative Check: selbst bei korrekter Konfiguration kann der Versand an Rate Limits, ungueltigen URLs oder temporaeren Teams-Fehlern scheitern.",
  },
};

const DIAGNOSTIC_HELP_EN: Record<string, { title: string; summary: string; detail: string }> = {
  channel_webhook: { title: "Webhook check", summary: "Checks whether a Teams target is configured for channel delivery.", detail: "Without a webhook, ODIN cannot hand channel messages over to Teams. This check validates configuration only, not real delivery." },
  bot_api: { title: "Bot path", summary: "Evaluates whether personal 1:1 messages are prepared through the internal bot integration.", detail: "The bot path matters for private messages. If it is missing, channel delivery can still work while personal delivery remains incomplete." },
  graph_credentials: { title: "Graph credentials", summary: "Checks whether tenant, client, and secret for Entra ID are fully configured.", detail: "Missing or swapped values block authentication before any Graph call can even be made." },
  graph_token: { title: "Graph authentication", summary: "Actively tries to obtain an access token from Entra ID via client credentials.", detail: "This immediately shows whether the problem is caused by wrong secrets, invalid app registration, or network/proxy issues." },
  graph_permissions: { title: "Graph permissions", summary: "Reads roles and scopes directly from the issued token.", detail: "A technically valid token without roles is still useless in practice. This is exactly what this check surfaces." },
  graph_users_probe: { title: "Graph /users probe", summary: "Performs a real read request against Microsoft Graph /users.", detail: "This reveals whether permissions exist in Azure but have not yet been granted by admin consent." },
  recipient_mapping: { title: "Recipient resolution", summary: "Checks whether ODIN has real target addresses or at least a fallback.", detail: "Even if Graph works technically, personal messages cannot be delivered correctly without employee mapping or a fallback." },
  delivery_health: { title: "Current delivery health", summary: "Evaluates the message log for current errors and open retries.", detail: "This is the operational check: even with correct configuration, delivery can fail because of rate limits, invalid URLs, or temporary Teams errors." },
};

const CAPABILITY_HELP_DE: Record<string, string> = {
  "Kanalversand": "Kanalversand ist aktiv, wenn ein Webhook vorhanden ist. Damit kann ODIN Nachrichten in einen Teams-Kanal posten.",
  "Graph Lookup": "Graph Lookup ist aktiv, wenn ODIN erfolgreich Benutzerdaten aus Microsoft Graph lesen kann. Das ist die Grundlage fuer User-Aufloesung.",
  "Persoenliche Nachrichten": "Persoenliche Nachrichten benoetigen sowohl Graph-Zugriff als auch den Bot-Pfad. Fehlt eines davon, bleibt nur Kanal- oder Fallback-Versand.",
};

const CAPABILITY_HELP_EN: Record<string, string> = {
  "Kanalversand": "Channel delivery is active when a webhook is configured. This allows ODIN to post messages into a Teams channel.",
  "Graph Lookup": "Graph lookup is active when ODIN can successfully read user data from Microsoft Graph. This is the basis for user resolution.",
  "Persoenliche Nachrichten": "Personal messages require both Graph access and the bot path. If one is missing, only channel or fallback delivery remains.",
};

function parseRecipientGroups(rawValue: string | undefined): RecipientGroup[] {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((entry) => {
        const name = String(entry?.name || "").trim();
        if (!name) return null;
        return {
          id: String(entry?.id || name.toLowerCase().replace(/[^a-z0-9]+/g, "-")).trim(),
          name,
          description: String(entry?.description || "").trim(),
          recipients: Array.isArray(entry?.recipients)
            ? entry.recipients.map((recipient: unknown) => String(recipient || "").trim()).filter(Boolean)
            : [],
        };
      })
      .filter(Boolean) as RecipientGroup[];
  } catch {
    return [];
  }
}

export default function TeamsCommunicationCenter() {
  return <TeamsCommunicationCenterPanel />;
}

export function TeamsCommunicationCenterPanel({ embedded = false, initialTab = "overview" }: { embedded?: boolean; initialTab?: TabId }) {
  const { copy } = useTeamsUi();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const tabSummary = copy?.summaries?.[activeTab] || TAB_SUMMARIES_EN[activeTab];

  const content = (
    <>
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border/60 pb-2">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === t.id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-4 h-4" />
            {copy?.tabs?.[t.id] || TAB_SUMMARIES_EN[t.id].title}
          </button>
        ))}
      </div>

      <EnterpriseCard className="mb-6">
        <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-sm font-semibold text-foreground">{tabSummary.title}</div>
            <div className="text-sm text-muted-foreground">{tabSummary.description}</div>
          </div>
          <div className="text-xs text-muted-foreground">{copy.strapline}</div>
        </div>
      </EnterpriseCard>

      {activeTab === "overview" && <OverviewTab />}
      {activeTab === "diagnostics" && <DiagnosticsTab />}
      {activeTab === "employees" && <EmployeesTab />}
      {activeTab === "events" && <EventsTab />}
      {activeTab === "routing" && <RoutingTab />}
      {activeTab === "templates" && <TemplatesTab />}
      {activeTab === "test" && <TestCenterTab />}
      {activeTab === "log" && <LogTab />}
      {activeTab === "errors" && <ErrorsTab />}
      {activeTab === "settings" && <SettingsTab />}
      {activeTab === "verification" && <ShiftVerificationPanel />}
    </>
  );

  if (embedded) return <TextRepairBoundary><div className="space-y-0">{content}</div></TextRepairBoundary>;

  return (
    <TextRepairBoundary>
      <EnterprisePageShell>
        <EnterpriseHeader title={copy.pageTitle} subtitle={copy.pageSubtitle} />
        <EnterpriseFeatureHero
          tone="cyan"
          eyebrow={copy.strapline}
          title={copy.pageTitle}
          description={copy.pageSubtitle}
          metrics={[
            { label: 'Tabs', value: TABS.length },
            { label: 'Primary', value: copy.tabs.overview },
            { label: 'Verification', value: copy.tabs.verification },
          ]}
        />
        {content}
      </EnterprisePageShell>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* OVERVIEW TAB                                     */
/* ================================================ */

function OverviewTab() {
  const { copy, locale, language } = useTeamsUi();
  const [status, setStatus] = useState<TeamsStatus | null>(null);
  const [diagnostics, setDiagnostics] = useState<TeamsDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextStatus, nextDiagnostics] = await Promise.all([
        fetchTeamsStatus(),
        fetchTeamsDiagnostics(),
      ]);
      setStatus(nextStatus);
      setDiagnostics(nextDiagnostics);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (!status) return <ErrorBox message={copy.statusError} />;

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${ok ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
      {ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {label}
    </div>
  );

  return (
    <TextRepairBoundary>
      <div className="space-y-6">
      {/* Status Badges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="flex items-center gap-1">
          <StatusBadge ok={status.webhook_configured} label="Webhook" />
          <InfoTooltip title="Webhook-Status">
            <p><strong>Bedeutung:</strong> Zeigt an, ob der Microsoft Teams Webhook-Endpunkt konfiguriert ist. Der Webhook wird benoetigt, um Nachrichten in Teams-Kanaele zu senden.</p>
            <p><strong>Nicht konfiguriert:</strong> Es fehlt die Webhook-URL in den Umgebungsvariablen. Ohne diesen Endpunkt koennen keine Kanalnachrichten gesendet werden.</p>
          </InfoTooltip>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge ok={status.bot_configured} label="Bot API" />
          <InfoTooltip title="Bot API Status">
            <p><strong>Bedeutung:</strong> Zeigt an, ob der Microsoft Bot Framework Endpunkt konfiguriert ist. Der Bot wird fuer persoenliche 1:1-Nachrichten an Mitarbeiter benoetigt.</p>
            <p><strong>Voraussetzung:</strong> Azure Bot Registration, gueltige App-ID und Secret. Ohne Bot-Konfiguration koennen keine persoenlichen Benachrichtigungen versendet werden.</p>
          </InfoTooltip>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge ok={status.graph_configured} label="Graph API" />
          <InfoTooltip title="Microsoft Graph API">
            <p><strong>Bedeutung:</strong> Zeigt an, ob die Microsoft Graph API Credentials (Tenant-ID, Client-ID, Client-Secret) hinterlegt sind.</p>
            <p><strong>Wofuer:</strong> Graph API wird benoetigt, um Teams-Benutzer aufzuloesen (User Resolve), Chat-Installationen zu erstellen und Conversation References zu verwalten.</p>
            <p><strong>Nicht konfiguriert:</strong> User-Mapping und persoenliche Nachrichten funktionieren nicht.</p>
          </InfoTooltip>
        </div>
        <div className="flex items-center gap-1">
          <StatusBadge ok={status.mapped_employees > 0} label={`${status.mapped_employees} Mappings`} />
          <InfoTooltip title="Employee Mappings">
            <p><strong>Bedeutung:</strong> Anzahl der Mitarbeiter, deren ODIN-Account mit einem Teams-Benutzer verknuepft ist.</p>
            <p><strong>Wichtig:</strong> Nur gemappte Mitarbeiter koennen persoenliche Teams-Nachrichten erhalten. Mitarbeiter ohne Mapping werden bei persoenlichen Benachrichtigungen uebersprungen.</p>
          </InfoTooltip>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <EnterpriseCard>
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600">{status.sent_today}</div>
            <div className="text-sm text-gray-500">{copy.sentToday}</div>
          </div>
        </EnterpriseCard>
        <EnterpriseCard>
          <div className="text-center">
            <div className="text-3xl font-bold text-red-600">{status.failed_today}</div>
            <div className="text-sm text-gray-500">{copy.failedToday}</div>
          </div>
        </EnterpriseCard>
        <EnterpriseCard>
          <div className="text-center">
            <div className="text-3xl font-bold text-orange-600">{status.pending_retries}</div>
            <div className="text-sm text-gray-500">{copy.openRetries}</div>
          </div>
        </EnterpriseCard>
        <EnterpriseCard>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600">{status.mapped_employees}</div>
            <div className="text-sm text-gray-500">{copy.mappedEmployees}</div>
          </div>
        </EnterpriseCard>
      </div>

      {/* Last Success / Error */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <EnterpriseCard>
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">{copy.lastSuccess}</h3>
          {status.last_success ? (
            <div className="text-sm space-y-1">
              <div><span className="text-gray-500">{copy.time}:</span> {new Date(status.last_success.sent_at).toLocaleString(locale)}</div>
              <div><span className="text-gray-500">{copy.type}:</span> {status.last_success.message_type}</div>
              <div><span className="text-gray-500">{copy.recipient}:</span> {status.last_success.recipient || "â€“"}</div>
            </div>
          ) : <div className="text-gray-400 text-sm">{copy.noSend}</div>}
        </EnterpriseCard>
        <EnterpriseCard>
          <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">{copy.lastError}</h3>
          {status.last_error ? (
            <div className="text-sm space-y-1">
              <div><span className="text-gray-500">{copy.time}:</span> {new Date(status.last_error.sent_at).toLocaleString(locale)}</div>
              <div><span className="text-gray-500">{copy.type}:</span> {status.last_error.message_type}</div>
              <div className="text-red-600 text-xs font-mono break-all">{status.last_error.error_msg}</div>
            </div>
          ) : <div className="text-green-500 text-sm">{copy.noErrors}</div>}
        </EnterpriseCard>
      </div>

      {diagnostics && (
        <EnterpriseCard>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-2">{copy.quickStatus}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">{diagnostics.summary}</p>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${diagnostics.ready ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
              {diagnostics.ready ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              {diagnostics.ready ? copy.ready : copy.blocked}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <CapabilityCard label={language === "de" ? "Kanalversand" : "Channel delivery"} active={diagnostics.capabilities.channel_notifications} />
            <CapabilityCard label="Graph Lookup" active={diagnostics.capabilities.graph_lookup} />
            <CapabilityCard label={language === "de" ? "Persoenliche Nachrichten" : "Personal messages"} active={diagnostics.capabilities.personal_notifications} />
          </div>
          {diagnostics.blocking_issues.length > 0 && (
            <div className="mt-4 space-y-2">
              {diagnostics.blocking_issues.slice(0, 3).map((issue) => (
                <div key={issue} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                  {issue}
                </div>
              ))}
            </div>
          )}
        </EnterpriseCard>
      )}

      <div className="flex justify-end">
        <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600">
          <RefreshCw className="w-4 h-4" /> {copy.refresh}
        </button>
      </div>
      </div>
    </TextRepairBoundary>
  );
}

function DiagnosticsTab() {
  const { copy, locale, language } = useTeamsUi();
  const isGerman = language === "de";
  const capabilityHelp = isGerman ? CAPABILITY_HELP_DE : CAPABILITY_HELP_EN;
  const [diagnostics, setDiagnostics] = useState<TeamsDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDiagnostics(await fetchTeamsDiagnostics());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;
  if (!diagnostics) return <ErrorBox message={copy.diagnosticsError} />;

  return (
    <TextRepairBoundary>
      <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EnterpriseCard>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShieldAlert className="w-4 h-4" />
            {copy.whatChecks}
            <InfoTooltip title={isGerman ? "PrÃ¼fumfang" : "Scope"} side="right">
              <p>{isGerman ? "Das Fehlercenter kombiniert Konfiguration, echte Authentifizierung, Graph-Lesetest und aktuelle Versandlage." : "Diagnostics combine configuration, real authentication, a Graph read test, and the current delivery state."}</p>
              <p>{isGerman ? <>Dadurch sieht man nicht nur <strong>dass</strong> Teams nicht funktioniert, sondern <strong>woran</strong> es konkret scheitert.</> : <>This shows not only <strong>that</strong> Teams is failing, but also <strong>why</strong> it is failing.</>}</p>
            </InfoTooltip>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{isGerman ? "Jeder Check dokumentiert Pruefschritt, Ergebnis, technische Details und den naechsten sinnvollen Arbeitsschritt." : "Each check documents the verification step, the result, technical details, and the next sensible action."}</p>
        </EnterpriseCard>
        <EnterpriseCard>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Mail className="w-4 h-4" />
            {copy.commonFailures}
            <InfoTooltip title={isGerman ? "HÃ¤ufige Ursachen" : "Common causes"} side="right">
              <p>{isGerman ? "In der Praxis blockieren am hÃ¤ufigsten drei Dinge: fehlender Webhook, fehlende Graph-Rechte oder ein gÃ¼ltiges Token ohne Admin Consent." : "In practice, three things block delivery most often: a missing webhook, missing Graph permissions, or a valid token without admin consent."}</p>
            </InfoTooltip>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{isGerman ? "Wenn Kanalversand laeuft, persoenliche Nachrichten aber nicht, liegt die Ursache fast immer im Graph- oder Bot-Pfad." : "If channel delivery works but personal messages do not, the root cause is almost always the Graph or bot path."}</p>
        </EnterpriseCard>
        <EnterpriseCard>
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Activity className="w-4 h-4" />
            {copy.operationsUsage}
            <InfoTooltip title={isGerman ? "Wie man es nutzt" : "How to use it"} side="right">
              <p>{isGerman ? "Erst die roten Blocker beheben, dann die Hinweise prÃ¼fen, danach im Test Center mit Kanal- und Personaltest verifizieren." : "Fix the red blockers first, review the warnings second, then verify the result in the test center with channel and personal tests."}</p>
            </InfoTooltip>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{isGerman ? "So bleibt die Fehleranalyse nachvollziehbar und endet nicht bei einem reinen Konfigurations-Check." : "This keeps troubleshooting traceable instead of ending at a pure configuration check."}</p>
        </EnterpriseCard>
      </div>

      <EnterpriseCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Activity className="w-4 h-4" />
              {copy.latestDiagnosis}
            </div>
            <div className="text-sm text-muted-foreground">{diagnostics.summary}</div>
            <div className="text-xs text-muted-foreground">{copy.asOf}: {new Date(diagnostics.generated_at).toLocaleString(locale)}</div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${diagnostics.ready ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
              {diagnostics.ready ? <CheckCircle2 className="w-4 h-4" /> : <ShieldAlert className="w-4 h-4" />}
              {diagnostics.ready ? copy.teamsReady : copy.teamsBlocked}
            </div>
            <button onClick={load} className={TEAMS_BUTTON_NEUTRAL_CLASS}>
              <RefreshCw className="w-4 h-4" /> {copy.recheck}
            </button>
          </div>
        </div>
      </EnterpriseCard>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CapabilityCard label={isGerman ? "Kanalversand" : "Channel delivery"} active={diagnostics.capabilities.channel_notifications} tooltip={capabilityHelp["Kanalversand"]} />
        <CapabilityCard label="Graph Lookup" active={diagnostics.capabilities.graph_lookup} tooltip={capabilityHelp["Graph Lookup"]} />
        <CapabilityCard label={isGerman ? "Persoenliche Nachrichten" : "Personal messages"} active={diagnostics.capabilities.personal_notifications} tooltip={capabilityHelp["Persoenliche Nachrichten"]} />
      </div>

      <EnterpriseCard>
        <h3 className="text-sm font-semibold mb-3">{copy.blockingPoints}</h3>
        {diagnostics.blocking_issues.length === 0 ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-900/50 dark:bg-green-900/20 dark:text-green-300">
            {copy.noBlockingPoints}
          </div>
        ) : (
          <div className="space-y-2">
            {diagnostics.blocking_issues.map((issue) => (
              <div key={issue} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300">
                {issue}
              </div>
            ))}
          </div>
        )}
      </EnterpriseCard>

      <div className="space-y-3">
        {diagnostics.checks.map((check) => (
          <DiagnosticCheckCard key={check.key} check={check} />
        ))}
      </div>
      </div>
    </TextRepairBoundary>
  );
}

function EmployeesTab() {
  const { copy, locale } = useTeamsUi();
  const [employees, setEmployees] = useState<TeamsEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setEmployees(await fetchTeamsEmployees());
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;

  const filteredEmployees = employees.filter((employee) => {
    const haystack = [employee.employee_name, employee.email, employee.email_source]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    return haystack.includes(search.toLowerCase());
  });

  const activeMappings = employees.filter((employee) => employee.is_active !== false).length;
  const linkedUsers = employees.filter((employee) => employee.user_id).length;
  const manualOverrides = employees.filter((employee) => employee.manual_override).length;

  return (
    <TextRepairBoundary>
      <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EnterpriseCard>
          <div className="text-3xl font-bold text-blue-600">{activeMappings}</div>
          <div className="text-sm text-muted-foreground">{copy.activeMappings}</div>
        </EnterpriseCard>
        <EnterpriseCard>
          <div className="text-3xl font-bold text-green-600">{linkedUsers}</div>
          <div className="text-sm text-muted-foreground">{copy.linkedUsers}</div>
        </EnterpriseCard>
        <EnterpriseCard>
          <div className="text-3xl font-bold text-amber-600">{manualOverrides}</div>
          <div className="text-sm text-muted-foreground">{copy.manualOverrides}</div>
        </EnterpriseCard>
      </div>

      <EnterpriseCard>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">{copy.employeeMappings}
              <InfoTooltip title="Was hier sichtbar ist" side="right" width="w-96">
                <p>Hier sehen Sie die Datenbasis fuer persoenliche Teams-Nachrichten. Ohne Mapping kann ODIN einen Mitarbeiter zwar fachlich auswaehlen, aber nicht persoenlich in Teams adressieren.</p>
                <p><strong>Mailquelle:</strong> Zeigt, aus welchem Prozess die Adresse stammt. <strong>Override:</strong> Markiert manuell gepflegte Werte.</p>
              </InfoTooltip>
            </h3>
            <p className="text-sm text-muted-foreground">{copy.filterHint}</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={copy.searchNameOrMail}
              className={`w-72 ${TEAMS_INPUT_CLASS}`}
            />
            <button onClick={load} className={TEAMS_BUTTON_NEUTRAL_CLASS}>
              <RefreshCw className="w-4 h-4" /> {copy.refresh}
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className={TEAMS_TABLE_HEAD_CLASS}>
                <th className="py-2 px-3">{copy.employee}</th>
                <th className="py-2 px-3">{copy.teamsMail}</th>
                <th className="py-2 px-3">{copy.mailSource}</th>
                <th className="py-2 px-3">{copy.override}</th>
                <th className="py-2 px-3">{copy.odinUser}</th>
                <th className="py-2 px-3">{copy.lastUpdated}</th>
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map((employee) => (
                <tr key={`${employee.employee_name}-${employee.email || 'nomail'}`} className={TEAMS_TABLE_ROW_CLASS}>
                  <td className="py-2 px-3 font-medium">{employee.employee_name}</td>
                  <td className="py-2 px-3">{employee.email || "-"}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{employee.email_source || "-"}</td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${employee.manual_override ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                      {employee.manual_override ? copy.manual : copy.automatic}
                    </span>
                  </td>
                  <td className="py-2 px-3">{employee.user_id ? `User #${employee.user_id}` : copy.notLinked}</td>
                  <td className="py-2 px-3 text-xs text-muted-foreground">{new Date(employee.updated_at).toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredEmployees.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">{copy.noEmployees}</div>
        )}
      </EnterpriseCard>
      </div>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* EVENTS TAB                                       */
/* ================================================ */

function EventsTab() {
  const { language, t } = useTeamsUi();
  const isGerman = language === "de";
  const [events, setEvents] = useState<TeamsEventConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEvents(await fetchTeamsEvents()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleEvent = async (e: TeamsEventConfig) => {
    try {
      const updated = await updateTeamsEvent(e.event_key, { enabled: !e.enabled });
      setEvents(prev => prev.map(ev => ev.event_key === e.event_key ? updated : ev));
    } catch (err) { console.error(err); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <TextRepairBoundary>
      <div className="space-y-2">
      <p className="mb-4 text-sm text-muted-foreground">{t('teams.eventDescription')}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={TEAMS_TABLE_HEAD_CLASS}>
              <th className="py-2 px-3">
                <span className="flex items-center gap-1">{t('common.active')}
                  <InfoTooltip title={isGerman ? "Event aktiv/inaktiv" : "Event active/inactive"}>
                    <p>{isGerman ? <>Schaltet das Event ein oder aus. Inaktive Events loesen <em>keine</em> Teams-Nachrichten aus, auch wenn die Bedingung im System eintritt.</> : <>Turns the event on or off. Inactive events trigger <em>no</em> Teams messages even if the condition occurs in the system.</>}</p>
                    <p><strong>{isGerman ? "Wichtig" : "Important"}:</strong> {isGerman ? "Deaktivierung betrifft nur den Nachrichtenversand. Das Event selbst wird weiterhin im System erkannt und geloggt." : "Disabling only affects message delivery. The event itself is still recognized and logged by the system."}</p>
                  </InfoTooltip>
                </span>
              </th>
              <th className="py-2 px-3">Event</th>
              <th className="py-2 px-3">
                <span className="flex items-center gap-1">{isGerman ? "Prioritaet" : "Priority"}
                  <InfoTooltip title={isGerman ? "Event-Prioritaet" : "Event priority"}>
                    <p>{isGerman ? "Bestimmt die Dringlichkeit der Nachricht. P1 = hoechste Prioritaet, zum Beispiel kritische Stoerungen, P5 = niedrigste." : "Determines message urgency. P1 is the highest priority, for example critical incidents, and P5 is the lowest."}</p>
                    <p><strong>{isGerman ? "Auswirkung" : "Effect"}:</strong> {isGerman ? "Hoehere Prioritaeten umgehen gegebenenfalls Quiet Hours und Digest-Buendelung. P1-Nachrichten werden auch nachts gesendet, wenn nur kritische Nachtzustellung aktiv ist." : "Higher priorities can bypass quiet hours and digest bundling. P1 messages are also sent overnight when only critical overnight delivery is enabled."}</p>
                  </InfoTooltip>
                </span>
              </th>
              <th className="py-2 px-3">
                <span className="flex items-center gap-1">{isGerman ? "Modus" : "Mode"}
                  <InfoTooltip title={isGerman ? "Sendemodus" : "Send mode"}>
                    <p><strong>{isGerman ? "Sofort" : "Immediate"}:</strong> {isGerman ? "Nachricht wird unmittelbar bei Event-Eintritt versendet." : "The message is sent immediately when the event occurs."}</p>
                    <p><strong>Digest:</strong> {isGerman ? "Nachricht wird gesammelt und im naechsten Digest-Intervall gebuendelt versendet. Reduziert die Anzahl einzelner Benachrichtigungen." : "The message is collected and sent in the next digest interval. This reduces the number of individual notifications."}</p>
                  </InfoTooltip>
                </span>
              </th>
              <th className="py-2 px-3">
                <span className="flex items-center gap-1">Quiet Hours
                  <InfoTooltip title={isGerman ? "Quiet Hours beachten" : "Respect quiet hours"}>
                    <p>{isGerman ? "Bei Ja wird die Nachricht ausserhalb der konfigurierten Betriebszeiten zurueckgehalten und erst nach Ende der Quiet Hours gesendet." : "If enabled, the message is held outside the configured operating hours and sent only after quiet hours end."}</p>
                    <p>{isGerman ? "Bei Nein wird die Nachricht unabhÃ¤ngig von der Uhrzeit sofort gesendet." : "If disabled, the message is sent immediately regardless of time."}</p>
                  </InfoTooltip>
                </span>
              </th>
              <th className="py-2 px-3">
                <span className="flex items-center gap-1">Cooldown
                  <InfoTooltip title={isGerman ? "Cooldown-Dauer" : "Cooldown duration"}>
                    <p>{isGerman ? "Mindestzeit zwischen zwei aufeinanderfolgenden Nachrichten desselben Event-Typs. Verhindert Nachrichtenflut bei haeufig auftretenden Events." : "Minimum time between two consecutive messages of the same event type. Prevents message floods for frequently occurring events."}</p>
                    <p><strong>{isGerman ? "Beispiel" : "Example"}:</strong> {isGerman ? "30 min Cooldown bedeutet, dass nach einer Crawler-stale-Nachricht fruehestens 30 Minuten spaeter die naechste gesendet wird." : "30 minute cooldown means that after one crawler stale message, the next one is sent no earlier than 30 minutes later."}</p>
                  </InfoTooltip>
                </span>
              </th>
              <th className="py-2 px-3">
                <span className="flex items-center gap-1">{t('teams.duplicateProtection')}
                  <InfoTooltip title={t('teams.duplicateProtection')}>
                    <p>{isGerman ? "Verhindert, dass identische Nachrichten innerhalb des Duplikat-Fensters mehrfach gesendet werden." : "Prevents identical messages from being sent repeatedly within the duplicate window."}</p>
                    <p><strong>{isGerman ? "Beispiel" : "Example"}:</strong> {isGerman ? "Wenn dasselbe Ticket in zwei aufeinanderfolgenden Runs identisch zugewiesen wird, wird die Nachricht nur einmal gesendet." : "If the same ticket is assigned identically in two consecutive runs, the message is sent only once."}</p>
                  </InfoTooltip>
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map(e => (
              <tr key={e.event_key} className={TEAMS_TABLE_ROW_CLASS}>
                <td className="py-2 px-3">
                  <button onClick={() => toggleEvent(e)} className="focus:outline-none">
                    {e.enabled
                      ? <ToggleRight className="w-6 h-6 text-green-500" />
                      : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                  </button>
                </td>
                <td className="py-2 px-3 font-medium">{e.label}</td>
                <td className="py-2 px-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${e.priority <= 1 ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : e.priority <= 2 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"}`}>
                    P{e.priority}
                  </span>
                </td>
                <td className="py-2 px-3 text-muted-foreground">{e.send_mode === "immediate" ? t('teams.immediate') : "Digest"}</td>
                <td className="py-2 px-3">{e.respect_quiet_hours ? t('teams.yes') : t('teams.no')}</td>
                <td className="py-2 px-3">{e.cooldown_minutes > 0 ? `${e.cooldown_minutes} min` : "-"}</td>
                <td className="py-2 px-3">{e.deduplicate ? t('teams.yes') : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* ROUTING TAB                                      */
/* ================================================ */

function RoutingTab() {
  const { language } = useTeamsUi();
  const isGerman = language === "de";
  const [rules, setRules] = useState<TeamsRoutingRule[]>([]);
  const [events, setEvents] = useState<TeamsEventConfig[]>([]);
  const [groups, setGroups] = useState<RecipientGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState<{ event_key: string; target_type: TeamsRoutingRule["target_type"]; target_value: string }>({ event_key: "", target_type: "person", target_value: "" });
  const [groupDraft, setGroupDraft] = useState({ name: "", description: "", recipients: "" });
  const [savingGroups, setSavingGroups] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, e, settings] = await Promise.all([fetchTeamsRouting(), fetchTeamsEvents(), fetchTeamsSettings()]);
      setRules(r);
      setEvents(e);
      setGroups(parseRecipientGroups(settings.recipient_groups));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addRule = async () => {
    if (!newRule.event_key || !newRule.target_value) return;
    try {
      const created = await createTeamsRoutingRule(newRule);
      setRules(prev => [...prev, created]);
      setNewRule({ event_key: "", target_type: "person", target_value: "" });
      setShowAdd(false);
    } catch (err) { console.error(err); }
  };

  const removeRule = async (id: number) => {
    try {
      await deleteTeamsRoutingRule(id);
      setRules(prev => prev.filter(r => r.id !== id));
    } catch (err) { console.error(err); }
  };

  const saveGroups = async (nextGroups: RecipientGroup[]) => {
    setSavingGroups(true);
    try {
      await updateTeamsSettings({ recipient_groups: JSON.stringify(nextGroups) });
      setGroups(nextGroups);
    } catch (err) {
      console.error(err);
    }
    setSavingGroups(false);
  };

  const addGroup = async () => {
    const name = groupDraft.name.trim();
    if (!name) return;

    const nextGroup: RecipientGroup = {
      id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || `group-${Date.now()}`,
      name,
      description: groupDraft.description.trim(),
      recipients: groupDraft.recipients.split(",").map((entry) => entry.trim()).filter(Boolean),
    };

    const nextGroups = [...groups.filter((group) => group.name.toLowerCase() !== name.toLowerCase()), nextGroup]
      .sort((left, right) => left.name.localeCompare(right.name, "de-DE"));
    await saveGroups(nextGroups);
    setGroupDraft({ name: "", description: "", recipients: "" });
  };

  const removeGroup = async (groupId: string) => {
    await saveGroups(groups.filter((group) => group.id !== groupId));
  };

  if (loading) return <LoadingSpinner />;

  // Group by event_key
  const grouped = rules.reduce<Record<string, TeamsRoutingRule[]>>((acc, r) => {
    (acc[r.event_key] ||= []).push(r);
    return acc;
  }, {});

  return (
    <TextRepairBoundary>
      <div className="space-y-4">
      <EnterpriseCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              {isGerman ? "Empfaengergruppen" : "Recipient groups"}
              <InfoTooltip title={isGerman ? "Empfaengergruppen" : "Recipient groups"} side="right" width="w-96">
                <p>{isGerman ? "Hier definieren Sie wiederverwendbare Gruppenbezeichnungen fuer das Routing, zum Beispiel Dispatcher, Shift Leads oder Management." : "Define reusable group names for routing here, for example Dispatcher, Shift Leads, or Management."}</p>
                <p>{isGerman ? <>Die Gruppe wird danach im Routing als Zieltyp <strong>Gruppe</strong> verwendet und muss nicht jedes Mal neu getippt werden.</> : <>The group can then be used in routing as the target type <strong>Group</strong> instead of being typed again every time.</>}</p>
              </InfoTooltip>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{isGerman ? "Speichert saubere, nachvollziehbare Routing-Ziele statt freier Einzelfelder." : "Stores clean, traceable routing targets instead of free-form one-off entries."}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              {groups.length === 0 && <div className="text-sm text-muted-foreground">{isGerman ? "Noch keine Empfaengergruppen gespeichert." : "No recipient groups have been saved yet."}</div>}
              {groups.map((group) => (
                <div key={group.id} className={`${TEAMS_SOFT_PANEL_CLASS} px-3 py-2`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{group.name}</span>
                    <span className="text-[10px] text-muted-foreground">{group.recipients.length} {isGerman ? "Empfaenger" : "recipients"}</span>
                    <button onClick={() => removeGroup(group.id)} disabled={savingGroups} className="text-xs text-red-500 hover:text-red-700">{isGerman ? "Entfernen" : "Remove"}</button>
                  </div>
                  {group.description && <div className="mt-1 text-xs text-muted-foreground">{group.description}</div>}
                  {group.recipients.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{group.recipients.join(", ")}</div>}
                </div>
              ))}
            </div>
          </div>

          <div className={`w-full max-w-md space-y-2 p-4 ${TEAMS_SOFT_PANEL_CLASS}`}>
            <div className="text-sm font-semibold">{isGerman ? "Neue Gruppe anlegen" : "Create new group"}</div>
            <input value={groupDraft.name} onChange={(event) => setGroupDraft((state) => ({ ...state, name: event.target.value }))} placeholder={isGerman ? "Gruppenname" : "Group name"} className={`w-full ${TEAMS_INPUT_CLASS}`} />
            <input value={groupDraft.description} onChange={(event) => setGroupDraft((state) => ({ ...state, description: event.target.value }))} placeholder={isGerman ? "Beschreibung" : "Description"} className={`w-full ${TEAMS_INPUT_CLASS}`} />
            <textarea value={groupDraft.recipients} onChange={(event) => setGroupDraft((state) => ({ ...state, recipients: event.target.value }))} rows={3} placeholder={isGerman ? "Empfaenger kommasepariert, z. B. dispatcher@firma.de, lead@firma.de" : "Recipients separated by commas, e.g. dispatcher@company.com, lead@company.com"} className={`w-full ${TEAMS_INPUT_CLASS}`} />
            <button onClick={addGroup} disabled={savingGroups} className={TEAMS_BUTTON_PRIMARY_CLASS}>{savingGroups ? (isGerman ? "Speichert..." : "Saving...") : (isGerman ? "Gruppe speichern" : "Save group")}</button>
          </div>
        </div>
      </EnterpriseCard>

      <div className="flex justify-between items-center">
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {isGerman ? "Routing-Regeln: Welche Events gehen an wen?" : "Routing rules: which events go to whom?"}
          <InfoTooltip title={isGerman ? "Routing-Regeln" : "Routing rules"} side="right" width="w-96">
            <p>{isGerman ? "Routing-Regeln bestimmen, welche Personen oder Gruppen bei welchen Events eine Teams-Nachricht erhalten." : "Routing rules define which people or groups receive a Teams message for which events."}</p>
            <p><strong>{isGerman ? "Zieltypen" : "Target types"}:</strong></p>
            <ul className="list-disc ml-4 space-y-0.5">
              <li><strong>{isGerman ? "Person" : "Person"}:</strong> {isGerman ? "Einzelne Person (Name oder E-Mail)" : "Single person (name or email)"}</li>
              <li><strong>{isGerman ? "Gruppe" : "Group"}:</strong> {isGerman ? "Zum Beispiel Dispatcher, Management oder Leads" : "For example Dispatcher, Management, Leads"}</li>
              <li><strong>{isGerman ? "Rolle" : "Role"}:</strong> {isGerman ? "Schichtrolle, zum Beispiel dispatcher oder smarthands" : "Shift role, for example dispatcher or smarthands"}</li>
              <li><strong>{isGerman ? "Schicht" : "Shift"}:</strong> {isGerman ? "Aktive Schichtgruppe, zum Beispiel E1 oder L2" : "Active shift group, for example E1 or L2"}</li>
            </ul>
            <p><strong>{isGerman ? "Beispiel" : "Example"}:</strong> {isGerman ? "Beim Event Trouble Ticket High wird an den Schichtleiter und zusaetzlich an die Dispatcher-Gruppe geroutet." : "Event Trouble Ticket High -> route to the shift lead plus the Dispatcher group."}</p>
          </InfoTooltip>
        </p>
        <button onClick={() => setShowAdd(!showAdd)} className={TEAMS_BUTTON_PRIMARY_CLASS}>
          {isGerman ? "+ Regel hinzufuegen" : "+ Add rule"}
        </button>
      </div>

      {showAdd && (
        <EnterpriseCard>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Event</label>
              <select value={newRule.event_key} onChange={e => setNewRule(p => ({ ...p, event_key: e.target.value }))} className={TEAMS_INPUT_CLASS}>
                <option value="">{isGerman ? "Wählen..." : "Select..."}</option>
                {events.map(e => <option key={e.event_key} value={e.event_key}>{e.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{isGerman ? "Zieltyp" : "Target type"}</label>
              <select value={newRule.target_type} onChange={e => setNewRule(p => ({ ...p, target_type: e.target.value as any }))} className={TEAMS_INPUT_CLASS}>
                <option value="person">{isGerman ? "Person" : "Person"}</option>
                <option value="group">{isGerman ? "Gruppe" : "Group"}</option>
                <option value="role">{isGerman ? "Rolle" : "Role"}</option>
                <option value="shift">{isGerman ? "Schicht" : "Shift"}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">{isGerman ? "Zielwert" : "Target value"}</label>
              <input value={newRule.target_value} onChange={e => setNewRule(p => ({ ...p, target_value: e.target.value }))} className={TEAMS_INPUT_CLASS} placeholder={isGerman ? "Name / Gruppe / Rolle" : "Name / group / role"} />
              {newRule.target_type === "group" && groups.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5 max-w-md">
                  {groups.map((group) => (
                    <button key={group.id} type="button" onClick={() => setNewRule((state) => ({ ...state, target_value: group.name }))} className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30">
                      {group.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={addRule} className={TEAMS_BUTTON_SUCCESS_CLASS}>{isGerman ? "Speichern" : "Save"}</button>
          </div>
        </EnterpriseCard>
      )}

      {Object.entries(grouped).map(([eventKey, eventRules]) => (
        <EnterpriseCard key={eventKey}>
          <h3 className="text-sm font-semibold mb-2">{eventRules[0]?.event_label || eventKey}</h3>
          <div className="space-y-1">
            {eventRules.map(r => (
              <div key={r.id} className="flex items-center justify-between rounded-xl border border-border/50 bg-background/72 px-2 py-2 text-sm shadow-[0_12px_26px_rgba(148,163,184,0.08)]">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">{r.target_type}</span>
                  <div>
                    <div>{r.target_value}</div>
                    {r.target_type === "group" && groups.find((group) => group.name === r.target_value)?.description && (
                      <div className="text-xs text-muted-foreground">{groups.find((group) => group.name === r.target_value)?.description}</div>
                    )}
                  </div>
                  {!r.enabled && <span className="text-xs text-muted-foreground">({isGerman ? "deaktiviert" : "disabled"})</span>}
                </div>
                <button onClick={() => removeRule(r.id)} className="text-red-500 hover:text-red-700 text-xs">{isGerman ? "Entfernen" : "Remove"}</button>
              </div>
            ))}
          </div>
        </EnterpriseCard>
      ))}
      {Object.keys(grouped).length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">{isGerman ? "Noch keine Routing-Regeln definiert." : "No routing rules have been defined yet."}</div>
      )}
      </div>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* TEMPLATES TAB                                    */
/* ================================================ */

function TemplatesTab() {
  const { language } = useTeamsUi();
  const isGerman = language === "de";
  const [templates, setTemplates] = useState<TeamsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setTemplates(await fetchTeamsTemplates()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const startEdit = (t: TeamsTemplate) => {
    setEditing(t.template_key);
    setEditBody(t.body_text);
    setPreview(null);
  };

  const saveEdit = async (key: string) => {
    try {
      const updated = await updateTeamsTemplate(key, { body_text: editBody });
      setTemplates(prev => prev.map(t => t.template_key === key ? updated : t));
      setEditing(null);
    } catch (err) { console.error(err); }
  };

  const showPreview = async () => {
    try {
      const result = await previewTemplate(editBody);
      setPreview(result.rendered);
    } catch (err) { console.error(err); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <TextRepairBoundary>
      <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">
        {isGerman ? "Nachrichtenvorlagen mit Platzhaltern." : "Message templates with placeholders."}
        <InfoTooltip title={isGerman ? "Template-System" : "Template system"} side="right" width="w-96">
          <p>{isGerman ? "Templates definieren den Text, der bei einem Event als Teams-Nachricht versendet wird. Platzhalter werden beim Versand automatisch mit den tatsÃ¤chlichen Werten ersetzt." : "Templates define the text sent as a Teams message for an event. Placeholders are replaced automatically with real values during delivery."}</p>
          <p><strong>{isGerman ? "VerfÃ¼gbare Platzhalter" : "Available placeholders"}:</strong></p>
          <ul className="list-disc ml-4 space-y-0.5 font-mono text-[10px]">
            <li>{"{{employeeName}}"} {isGerman ? "â€” Name des Mitarbeiters" : "- employee name"}</li>
            <li>{"{{ticketId}}"} {isGerman ? "â€” Ticket-Nummer" : "- ticket number"}</li>
            <li>{"{{systemName}}"} {isGerman ? "â€” Betroffenes System" : "- affected system"}</li>
            <li>{"{{restTime}}"} {isGerman ? "â€” Verbleibende Zeit bis Commit" : "- time remaining until commit"}</li>
            <li>{"{{priority}}"} {isGerman ? "â€” Ticket-PrioritÃ¤t" : "- ticket priority"}</li>
            <li>{"{{shift}}"} {isGerman ? "â€” Aktuelle Schicht" : "- current shift"}</li>
            <li>{"{{reason}}"} {isGerman ? "â€” Ereignisgrund" : "- event reason"}</li>
          </ul>
          <p><strong>{isGerman ? "Tipp" : "Tip"}:</strong> {isGerman ? "Verwenden Sie die Vorschau-Funktion, um das gerenderte Template mit Beispieldaten zu prÃ¼fen." : "Use preview to inspect the rendered template with sample data."}</p>
        </InfoTooltip>
      </p>
      {templates.map(t => (
        <EnterpriseCard key={t.template_key}>
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="text-sm font-semibold">{t.title}</h3>
              <span className="text-xs text-gray-400">{t.template_key}</span>
            </div>
            {editing !== t.template_key && (
              <button onClick={() => startEdit(t)} className="text-xs text-blue-600 hover:text-blue-800">{isGerman ? "Bearbeiten" : "Edit"}</button>
            )}
          </div>

          {editing === t.template_key ? (
            <div className="space-y-2">
              <textarea
                value={editBody}
                onChange={e => setEditBody(e.target.value)}
                className="w-full border dark:border-gray-600 rounded p-2 text-sm font-mono bg-white dark:bg-gray-800 min-h-20"
                rows={4}
              />
              <div className="flex gap-2">
                <button onClick={showPreview} className="px-3 py-1 text-xs bg-gray-200 dark:bg-gray-700 rounded hover:bg-gray-300 dark:hover:bg-gray-600">{isGerman ? "Vorschau" : "Preview"}</button>
                <button onClick={() => saveEdit(t.template_key)} className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">{isGerman ? "Speichern" : "Save"}</button>
                <button onClick={() => setEditing(null)} className="px-3 py-1 text-xs text-gray-500 hover:text-gray-700">{isGerman ? "Abbrechen" : "Cancel"}</button>
              </div>
              {preview && (
                <div className="mt-2 p-3 rounded bg-blue-50 dark:bg-blue-900/20 text-sm border border-blue-200 dark:border-blue-800">
                  <div className="text-xs text-blue-600 font-semibold mb-1">{isGerman ? "Vorschau:" : "Preview:"}</div>
                  <div>{preview}</div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-gray-600 dark:text-gray-400 font-mono bg-gray-50 dark:bg-gray-800/50 rounded p-2">{t.body_text}</div>
          )}

          <div className="flex gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-0.5">Deep-Link: {t.include_deep_link ? (isGerman ? "Ja" : "Yes") : (isGerman ? "Nein" : "No")}
              <InfoTooltip title="Deep-Link">
                <p>{isGerman ? "FÃ¼gt der Nachricht einen direkten Link zum Ticket im OES-System hinzu. Der EmpfÃ¤nger kann mit einem Klick zum Ticket springen." : "Adds a direct link to the ticket in the OES system. The recipient can jump to the ticket with one click."}</p>
                <p><strong>{isGerman ? "Empfehlung" : "Recommendation"}:</strong> {isGerman ? "Immer aktiviert lassen, um die Reaktionszeit zu verkÃ¼rzen." : "Keep this enabled to reduce reaction time."}</p>
              </InfoTooltip>
            </span>
            <span className="flex items-center gap-0.5">{isGerman ? "Ticketdetails" : "Ticket details"}: {t.include_ticket_details ? (isGerman ? "Ja" : "Yes") : (isGerman ? "Nein" : "No")}
              <InfoTooltip title={isGerman ? "Ticketdetails" : "Ticket details"}>
                <p>{isGerman ? "Blendet eine Zusammenfassung der Ticketdaten direkt in der Nachricht ein (System, Kategorie, Erstelldatum)." : "Shows a summary of ticket data directly inside the message, including system, category, and creation date."}</p>
                <p><strong>{isGerman ? "Vorteil" : "Benefit"}:</strong> {isGerman ? "EmpfÃ¤nger sieht sofort den Kontext, ohne das Ticket Ã¶ffnen zu mÃ¼ssen." : "Recipients see the context immediately without opening the ticket first."}</p>
              </InfoTooltip>
            </span>
            <span className="flex items-center gap-0.5">{isGerman ? "Restzeit" : "Remaining time"}: {t.include_remaining_time ? (isGerman ? "Ja" : "Yes") : (isGerman ? "Nein" : "No")}
              <InfoTooltip title={isGerman ? "Restzeit" : "Remaining time"}>
                <p>{isGerman ? "Zeigt die verbleibende SLA-Zeit bis zum nÃ¤chsten Commit-Termin an. Hilft dem EmpfÃ¤nger, die Dringlichkeit einzuschÃ¤tzen." : "Shows the remaining SLA time until the next commit target. This helps the recipient judge urgency."}</p>
                <p><strong>{isGerman ? "Hinweis" : "Note"}:</strong> {isGerman ? "Nur sinnvoll bei Tickets mit SLA-Bindung." : "Mainly useful for tickets with SLA commitments."}</p>
              </InfoTooltip>
            </span>
            <span className="flex items-center gap-0.5">{isGerman ? "PrioritÃ¤tsbadge" : "Priority badge"}: {t.include_priority_badge ? (isGerman ? "Ja" : "Yes") : (isGerman ? "Nein" : "No")}
              <InfoTooltip title={isGerman ? "PrioritÃ¤tsbadge" : "Priority badge"}>
                <p>{isGerman ? "FÃ¼gt ein farbiges Badge (P1â€“P4) in die Nachricht ein, das die PrioritÃ¤t visuell hervorhebt." : "Adds a colored badge (P1-P4) to the message so the priority stands out visually."}</p>
                <p><strong>{isGerman ? "Effekt" : "Effect"}:</strong> {isGerman ? "EmpfÃ¤nger erkennt auf einen Blick, ob sofortiges Handeln nÃ¶tig ist." : "Recipients can immediately see whether instant action is required."}</p>
              </InfoTooltip>
            </span>
          </div>
        </EnterpriseCard>
      ))}
      </div>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* TEST CENTER TAB                                  */
/* ================================================ */

function TestCenterTab() {
  const { copy, language } = useTeamsUi();
  const { user } = useAuth();
  const isGerman = language === "de";
  const [channel, setChannel] = useState<"channel" | "personal">("channel");
  const [title, setTitle] = useState("ODIN Test Message");
  const [body, setBody] = useState(isGerman ? "Dies ist eine Testnachricht von ODIN." : "This is a test message from ODIN.");
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [assignmentTest, setAssignmentTest] = useState({
    recipientName: user?.displayName || "",
    recipientUpn: user?.email || "",
    ticketNumber: "TEST-123456",
    location: user?.location || "",
    priority: "Normal",
  });

  const [templates, setTemplates] = useState<TeamsTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");

  useEffect(() => {
    fetchTeamsTemplates().then(setTemplates).catch(console.error);
  }, []);

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    try {
      await sendTeamsTestMessage({ channel, title, body });
      setResult({ success: true, message: isGerman ? "Testnachricht erfolgreich gesendet!" : "Test message sent successfully!" });
    } catch (err: any) {
      setResult({ success: false, message: err?.response?.data?.error || (isGerman ? "Senden fehlgeschlagen" : "Sending failed") });
    }
    setSending(false);
  };

  const sendAssignmentTest = async () => {
    setSending(true);
    setResult(null);
    try {
      const res = await sendTeamsAssignmentTestMessage(assignmentTest);
      setResult({
        success: true,
        message: `${isGerman ? "Assignment-Testnachricht gesendet" : "Assignment test notification sent"} · HTTP ${res.httpStatus ?? "-"} · Event ${res.eventId ?? "-"}`,
      });
    } catch (err: any) {
      const data = err?.response?.data || {};
      setResult({
        success: false,
        message: `${data.message || (isGerman ? "Assignment-Test fehlgeschlagen" : "Assignment test failed")}${data.eventId ? ` · Event ${data.eventId}` : ""}${data.httpStatus ? ` · HTTP ${data.httpStatus}` : ""}`,
      });
    }
    setSending(false);
  };

  const sendTemplateTest = async () => {
    if (!selectedTemplate) return;
    setSending(true);
    setResult(null);
    try {
      const res = await testTeamsTemplate(selectedTemplate, channel);
      setResult({ success: true, message: isGerman ? `Template "${selectedTemplate}" gesendet!` : `Template "${selectedTemplate}" sent!` });
    } catch (err: any) {
      setResult({ success: false, message: err?.response?.data?.error || (isGerman ? "Template-Test fehlgeschlagen" : "Template test failed") });
    }
    setSending(false);
  };

  return (
    <TextRepairBoundary>
      <div className="space-y-6">
      {/* Manual Test */}
      <EnterpriseCard>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">{isGerman ? "Manuelle Testnachricht" : "Manual test message"}
          <InfoTooltip title={isGerman ? "Manuelle Testnachricht" : "Manual test message"}>
            <p>{isGerman ? "Sendet eine frei formulierte Nachricht Ã¼ber den konfigurierten Teams-Kanal oder als persÃ¶nliche Nachricht an den Fallback-EmpfÃ¤nger." : "Sends a free-form message through the configured Teams channel or as a personal message to the fallback recipient."}</p>
            <p><strong>{isGerman ? "Zweck" : "Purpose"}:</strong> {isGerman ? "PrÃ¼fen, ob die Webhook-/Bot-Verbindung funktioniert, ohne ein echtes Event auszulÃ¶sen." : "Verify that the webhook or bot connection works without triggering a real event."}</p>
            <p><strong>{isGerman ? "Hinweis" : "Note"}:</strong> {isGerman ? "Diese Nachricht erscheint im Log, wird aber nicht als Event-Benachrichtigung gezÃ¤hlt." : "This message appears in the log but is not counted as an event notification."}</p>
          </InfoTooltip>
        </h3>
        <div className="space-y-3">
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={channel === "channel"} onChange={() => setChannel("channel")} /> Channel
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" checked={channel === "personal"} onChange={() => setChannel("personal")} /> Personal
            </label>
            <InfoTooltip title={isGerman ? "Kanal vs. PersÃ¶nlich" : "Channel vs. personal"}>
              <p><strong>Channel:</strong> {isGerman ? "Nachricht wird in den konfigurierten Teams-Kanal gepostet (sichtbar fÃ¼r alle Kanalmitglieder)." : "The message is posted into the configured Teams channel and is visible to all channel members."}</p>
              <p><strong>Personal:</strong> {isGerman ? "Nachricht wird als 1:1-Chat an den Fallback-EmpfÃ¤nger gesendet (privat)." : "The message is sent as a 1:1 chat to the fallback recipient and stays private."}</p>
              <p><strong>{isGerman ? "Tipp" : "Tip"}:</strong> {isGerman ? "Nutzen Sie Personal fÃ¼r vertrauliche Tests und Channel, um die Kanalanbindung zu verifizieren." : "Use personal for confidential tests and channel to verify channel connectivity."}</p>
            </InfoTooltip>
          </div>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={isGerman ? "Titel" : "Title"} className="w-full border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800" />
          <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={isGerman ? "Nachricht" : "Message"} rows={3} className="w-full border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800" />
          <button onClick={sendTest} disabled={sending} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isGerman ? "Testnachricht senden" : "Send test message"}
          </button>
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
          {isGerman ? "Ticket-Zuweisung testen" : "Test ticket assignment notification"}
          <InfoTooltip title={isGerman ? "Ticket-Zuweisung testen" : "Test ticket assignment notification"}>
            <p>{isGerman ? "Sendet dieselbe strukturierte Teams-Karte wie eine echte ODIN-Zuweisung, erzeugt aber keine echte Ticketzuweisung." : "Sends the same structured Teams card as a real ODIN assignment without creating a real ticket assignment."}</p>
            <p>{isGerman ? "Der Empfaenger wird maschinenlesbar ueber recipientUpn uebergeben und muss nicht aus dem Anzeigenamen erraten werden." : "The recipient is passed as machine-readable recipientUpn and does not need to be inferred from the display name."}</p>
          </InfoTooltip>
        </h3>
        <div className="grid gap-3 md:grid-cols-2">
          <input
            value={assignmentTest.recipientName}
            onChange={(event) => setAssignmentTest((current) => ({ ...current, recipientName: event.target.value }))}
            placeholder={isGerman ? "Empfaengername" : "Recipient name"}
            className={TEAMS_INPUT_CLASS}
          />
          <input
            value={assignmentTest.recipientUpn}
            onChange={(event) => setAssignmentTest((current) => ({ ...current, recipientUpn: event.target.value }))}
            placeholder={isGerman ? "Empfaenger-E-Mail / UPN" : "Recipient email / UPN"}
            className={TEAMS_INPUT_CLASS}
          />
          <input
            value={assignmentTest.ticketNumber}
            onChange={(event) => setAssignmentTest((current) => ({ ...current, ticketNumber: event.target.value }))}
            placeholder={isGerman ? "Test-Ticketnummer" : "Test ticket number"}
            className={TEAMS_INPUT_CLASS}
          />
          <input
            value={assignmentTest.location}
            onChange={(event) => setAssignmentTest((current) => ({ ...current, location: event.target.value }))}
            placeholder={isGerman ? "Standort / IBX optional" : "Location / IBX optional"}
            className={TEAMS_INPUT_CLASS}
          />
          <input
            value={assignmentTest.priority}
            onChange={(event) => setAssignmentTest((current) => ({ ...current, priority: event.target.value }))}
            placeholder={isGerman ? "Prioritaet optional" : "Priority optional"}
            className={TEAMS_INPUT_CLASS}
          />
          <button
            onClick={sendAssignmentTest}
            disabled={sending || !assignmentTest.recipientName || !assignmentTest.recipientUpn || !assignmentTest.ticketNumber}
            className={TEAMS_BUTTON_SUCCESS_CLASS}
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {isGerman ? "Testnachricht senden" : "Send test notification"}
          </button>
        </div>
      </EnterpriseCard>

      {/* Template Test */}
      <EnterpriseCard>
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">{isGerman ? "Template testen" : "Test template"}
          <InfoTooltip title={isGerman ? "Template-Test" : "Template test"}>
            <p>{isGerman ? "Sendet ein konkretes Template mit Beispieldaten Ã¼ber den gewÃ¤hlten Kanal. Die Platzhalter werden mit Testdaten befÃ¼llt." : "Sends a specific template with sample data through the selected channel. Placeholders are filled with test values."}</p>
            <p><strong>{isGerman ? "Nutzen" : "Benefit"}:</strong> {isGerman ? "PrÃ¼ft, ob das Template korrekt gerendert wird und alle Platzhalter aufgelÃ¶st werden." : "Checks whether the template renders correctly and all placeholders resolve."}</p>
            <p><strong>{isGerman ? "Wichtig" : "Important"}:</strong> {isGerman ? "Die Testnachricht wird im Log als Testeintrag vermerkt." : "The test message is recorded in the log as a test entry."}</p>
          </InfoTooltip>
        </h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} className="w-full border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800">
              <option value="">{isGerman ? "Template auswÃ¤hlen..." : "Select template..."}</option>
              {templates.map(t => <option key={t.template_key} value={t.template_key}>{t.title}</option>)}
            </select>
          </div>
          <button onClick={sendTemplateTest} disabled={!selectedTemplate || sending} className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50">
            <Play className="w-4 h-4" /> {isGerman ? "Testen" : "Test"}
          </button>
        </div>
      </EnterpriseCard>

      {/* Result */}
      {result && (
        <div className={`p-3 rounded text-sm ${result.success ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"}`}>
          {result.success ? <CheckCircle2 className="w-4 h-4 inline mr-2" /> : <XCircle className="w-4 h-4 inline mr-2" />}
          {result.message}
        </div>
      )}
      </div>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* LOG TAB                                          */
/* ================================================ */

function LogTab() {
  const { copy, locale, language } = useTeamsUi();
  const isGerman = language === "de";
  const [data, setData] = useState<{ rows: TeamsMessageLog[]; total: number }>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ status?: string }>({});

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await fetchTeamsLog({ ...filter, limit: 100 })); } catch (e) { console.error(e); }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingSpinner />;

  return (
    <TextRepairBoundary>
      <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <select value={filter.status || ""} onChange={e => setFilter(f => ({ ...f, status: e.target.value || undefined }))} className="border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800">
          <option value="">{copy.statusFilterAll}</option>
          <option value="sent">{copy.sent}</option>
          <option value="failed">{copy.failed}</option>
        </select>
        <InfoTooltip title={isGerman ? "Status-Filter" : "Status filter"}>
          <p><strong>{isGerman ? "Gesendet" : "Sent"}:</strong> {isGerman ? "Nachricht wurde erfolgreich an Teams Ã¼bermittelt (HTTP 200/202)." : "The message was delivered successfully to Teams (HTTP 200/202)."}</p>
          <p><strong>{isGerman ? "Fehlgeschlagen" : "Failed"}:</strong> {isGerman ? "Nachricht konnte nicht zugestellt werden â€“ siehe Fehlerspalte fÃ¼r Details." : "The message could not be delivered. See the error column for details."}</p>
          <p>{isGerman ? "Der Filter zeigt nur die letzten 100 EintrÃ¤ge an." : "The filter only shows the most recent 100 entries."}</p>
        </InfoTooltip>
        <button onClick={load} className="text-sm text-blue-600 hover:underline">{copy.refresh}</button>
        <span className="text-xs text-gray-400">{data.total} {copy.entriesTotal}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b dark:border-gray-700">
              <th className="py-2 px-3"><span className="flex items-center gap-1">{copy.status} <InfoTooltip title={isGerman ? "Status" : "Status"}><p>{isGerman ? "GrÃ¼ner Haken = zugestellt. Rotes X = fehlgeschlagen. Fehlgeschlagene Nachrichten kÃ¶nnen im Errors-Tab erneut versendet werden." : "Green check = delivered. Red X = failed. Failed messages can be retried in the errors tab."}</p></InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="flex items-center gap-1">{copy.time} <InfoTooltip title={isGerman ? "Zeitpunkt" : "Timestamp"}><p>{isGerman ? "Zeitpunkt der Ãœbergabe an die Teams-API (nicht Zustellzeitpunkt beim EmpfÃ¤nger)." : "Timestamp when the message was handed to the Teams API, not when it appeared for the recipient."}</p></InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="flex items-center gap-1">{copy.type} <InfoTooltip title={isGerman ? "Nachrichtentyp" : "Message type"}><p>{isGerman ? "Der Event-Typ, der die Nachricht ausgelÃ¶st hat (z.B. assignment, escalation, handover, test)." : "The event type that triggered the message, such as assignment, escalation, handover, or test."}</p></InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="flex items-center gap-1">{copy.recipient} <InfoTooltip title={isGerman ? "EmpfÃ¤nger" : "Recipient"}><p>{isGerman ? "Teams-Kanal oder Person. Ein Bindestrich bedeutet Broadcast an den Standardkanal." : "Teams channel or person. A dash means broadcast to the default channel."}</p></InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="flex items-center gap-1">{copy.content} <InfoTooltip title={isGerman ? "Inhalt" : "Content"}><p>{isGerman ? "GekÃ¼rzte Vorschau des Nachrichteninhalts." : "Short preview of the message content."}</p></InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="flex items-center gap-1">{copy.error} <InfoTooltip title={isGerman ? "Fehlermeldung" : "Error message"}><p>{isGerman ? "Technische Fehlermeldung bei fehlgeschlagener Zustellung. HÃ¤ufige Ursachen: ungÃ¼ltiger Webhook, Netzwerkfehler, Bot-Token abgelaufen." : "Technical error message for a failed delivery. Common causes are invalid webhooks, network failures, or expired bot tokens."}</p></InfoTooltip></span></th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map(msg => (
              <tr key={msg.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="py-2 px-3">
                  {msg.status === "sent"
                    ? <CheckCircle2 className="w-4 h-4 text-green-500" />
                    : <XCircle className="w-4 h-4 text-red-500" />}
                </td>
                <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{new Date(msg.sent_at).toLocaleString(locale)}</td>
                <td className="py-2 px-3">{msg.message_type}</td>
                <td className="py-2 px-3">{msg.recipient || "â€“"}</td>
                <td className="py-2 px-3 max-w-xs truncate">{msg.content}</td>
                <td className="py-2 px-3 text-xs text-red-500 max-w-xs truncate">{msg.error_msg || "â€“"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* ERRORS TAB                                       */
/* ================================================ */

function ErrorsTab() {
  const { copy, locale, language } = useTeamsUi();
  const isGerman = language === "de";
  const [errors, setErrors] = useState<TeamsMessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setErrors(await fetchTeamsErrors()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const retry = async (id: number) => {
    setRetrying(id);
    try {
      await retryTeamsMessage(id);
      setErrors(prev => prev.filter(e => e.id !== id));
    } catch (err) { console.error(err); }
    setRetrying(null);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <TextRepairBoundary>
      <div className="space-y-3">
      <p className="text-sm text-gray-500 mb-4 flex items-center gap-1.5">{copy.failedMessages}
        <InfoTooltip title={copy.errorsRetryTooltipTitle} width="w-96">
          <p>{copy.errorsRetryTooltipIntro}</p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li><strong>Webhook:</strong> {copy.errorsRetryWebhook}</li>
            <li><strong>{isGerman ? "Netzwerkfehler" : "Network error"}:</strong> {copy.errorsRetryNetwork}</li>
            <li><strong>{isGerman ? "Bot-Token abgelaufen" : "Bot token expired"}:</strong> {copy.errorsRetryToken}</li>
            <li><strong>Rate limit:</strong> {copy.errorsRetryRateLimit}</li>
          </ul>
          <p><strong>{copy.retry}:</strong> {copy.errorsRetryHelp}</p>
        </InfoTooltip>
      </p>
      {errors.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
          {copy.noFailedMessages}
        </div>
      ) : errors.map(e => (
        <EnterpriseCard key={e.id}>
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <div className="text-sm font-medium">
                {e.message_type} â€“ {new Date(e.sent_at).toLocaleString(locale)}
              </div>
              <div className="text-xs text-gray-500">{e.content}</div>
              <div className="text-xs text-red-500 font-mono">{e.error_msg}</div>
            </div>
            <button
              onClick={() => retry(e.id)}
              disabled={retrying === e.id}
              className="flex items-center gap-1 px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 text-xs rounded hover:bg-orange-200 disabled:opacity-50"
            >
              {retrying === e.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              {copy.retry}
            </button>
          </div>
        </EnterpriseCard>
      ))}
      </div>
    </TextRepairBoundary>
  );
}

/* ================================================ */
/* SETTINGS TAB                                     */
/* ================================================ */

function SettingsTab() {
  const { copy, language, t } = useTeamsUi();
  const isGerman = language === "de";
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSettings(await fetchTeamsSettings()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateTeamsSettings(settings);
      setSettings(updated);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const testWebhook = async () => {
    const webhookUrl = String(settings["teams.powerAutomateWebhookUrl"] || settings["teams.webhookUrl"] || "").trim();
    if (webhookUrl.includes("...")) {
      setWebhookTestResult({
        success: false,
        message: isGerman ? "Bitte Webhook-Link neu einfuegen. Gespeicherte Links werden aus Sicherheitsgruenden nur maskiert angezeigt." : "Please paste the webhook URL again. Stored URLs are only shown masked for security.",
      });
      return;
    }
    setWebhookTesting(true);
    setWebhookTestResult(null);
    try {
      const result = await testPowerAutomateWebhook(webhookUrl);
      setSettings((current) => ({
        ...current,
        "teams.powerAutomateWebhookUrl": webhookUrl,
        "teams.webhookUrl": webhookUrl,
        "teams.webhookEnabled": "true",
        "teams.powerAutomateWebhookStatus": result.status,
        "teams.powerAutomateWebhookLastTestAt": result.lastTestAt || new Date().toISOString(),
        "teams.powerAutomateWebhookLastError": "",
      }));
      setWebhookTestResult({
        success: true,
        message: isGerman ? "Webhook erfolgreich getestet. Status ist aktiv." : "Webhook tested successfully. Status is active.",
      });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.response?.data?.error || (isGerman ? "Webhook-Test fehlgeschlagen" : "Webhook test failed");
      setSettings((current) => ({
        ...current,
        "teams.powerAutomateWebhookStatus": "failed",
        "teams.powerAutomateWebhookLastTestAt": new Date().toISOString(),
        "teams.powerAutomateWebhookLastError": message,
      }));
      setWebhookTestResult({ success: false, message });
    }
    setWebhookTesting(false);
  };

  if (loading) return <LoadingSpinner />;

  const coreFields: SettingField[] = [
    { key: "quiet_hours_start", label: t('teams.quietHoursStart'), type: "text", tooltip: <><p>{isGerman ? "Beginn der Ruhezeit im Format HH:MM, zum Beispiel 22:00. WÃ¤hrend der Quiet Hours werden nur kritische Nachrichten zugestellt." : "Start of the quiet period in HH:MM format, for example 22:00. During quiet hours, only critical messages are delivered."}</p><p><strong>{isGerman ? "Tipp" : "Tip"}:</strong> {isGerman ? "Setzen Sie den Wert auf die Uhrzeit, ab der Ihr Team nicht mehr im Dienst ist." : "Set this to the time when your team is no longer on duty."}</p></> },
    { key: "quiet_hours_end", label: t('teams.quietHoursEnd'), type: "text", tooltip: <><p>{isGerman ? "Ende der Ruhezeit im Format HH:MM, zum Beispiel 06:00. Ab diesem Zeitpunkt werden alle Nachrichten wieder normal versendet." : "End of the quiet period in HH:MM format, for example 06:00. From this point on, messages are delivered normally again."}</p><p><strong>{isGerman ? "Aufgeschobene Nachrichten" : "Deferred messages"}:</strong> {isGerman ? "Nicht-kritische Nachrichten aus der Nacht werden als Digest zusammengefasst." : "Non-critical overnight messages are bundled into a digest."}</p></> },
    { key: "quiet_hours_critical_only", label: t('teams.criticalOnly'), type: "toggle", tooltip: <><p>{isGerman ? "Wenn aktiv, werden wÃ¤hrend der Quiet Hours nur Nachrichten mit kritischer PrioritÃ¤t (P1) sofort zugestellt. Alle anderen werden bis zum Ende der Ruhezeit zurÃ¼ckgehalten." : "If enabled, only critical priority messages (P1) are delivered immediately during quiet hours. All others are held until the quiet period ends."}</p><p><strong>{isGerman ? "Deaktiviert" : "Disabled"}:</strong> {isGerman ? "Alle Nachrichten werden auch nachts sofort gesendet." : "All messages are also sent immediately overnight."}</p></> },
    { key: "daily_max_messages", label: t('teams.maxMessagesDay'), type: "number", tooltip: <><p>{isGerman ? "Maximale Anzahl an Teams-Nachrichten pro Tag. Bei Ãœberschreitung werden weitere Nachrichten in eine Warteschlange gestellt." : "Maximum number of Teams messages per day. Additional messages are queued once the limit is exceeded."}</p><p><strong>{isGerman ? "Zweck" : "Purpose"}:</strong> {isGerman ? "SchÃ¼tzt vor Nachrichtenflut bei Massenevents. Empfehlung: 200â€“500 je nach TeamgrÃ¶ÃŸe." : "Protects against message floods during mass events. Recommended range: 200-500 depending on team size."}</p></> },
    { key: "digest_interval_minutes", label: t('teams.digestInterval'), type: "number", tooltip: <><p>{isGerman ? "Zeitraum in Minuten, in dem Ã¤hnliche Nachrichten zu einem Digest zusammengefasst werden, statt einzeln gesendet zu werden." : "Time window in minutes during which similar messages are combined into a digest instead of being sent one by one."}</p><p><strong>{isGerman ? "Beispiel" : "Example"}:</strong> {isGerman ? "Bei 15 Min werden alle Assignment-Benachrichtigungen innerhalb von 15 Min zu einer einzelnen Zusammenfassung gebÃ¼ndelt." : "At 15 minutes, all assignment notifications within that window are combined into one summary."}</p></> },
    { key: "cooldown_default_minutes", label: t('teams.defaultCooldown'), type: "number", tooltip: <><p>{isGerman ? "Mindestabstand in Minuten zwischen zwei Nachrichten desselben Typs an denselben EmpfÃ¤nger. Verhindert Spam bei schnell aufeinanderfolgenden Events." : "Minimum gap in minutes between two messages of the same type to the same recipient. Prevents spam during rapidly repeated events."}</p><p><strong>{isGerman ? "Empfehlung" : "Recommendation"}:</strong> {isGerman ? "5â€“15 Minuten, je nach Benachrichtigungstyp." : "5-15 minutes depending on the notification type."}</p></> },
    { key: "escalation_delay_minutes", label: t('teams.escalationDelay'), type: "number", tooltip: <><p>{isGerman ? "Wartezeit in Minuten, bevor eine Eskalationsnachricht gesendet wird. Gibt dem primÃ¤ren EmpfÃ¤nger Zeit zu reagieren, bevor die Eskalation greift." : "Waiting time in minutes before an escalation message is sent. Gives the primary recipient time to react before escalation kicks in."}</p><p><strong>{isGerman ? "Beispiel" : "Example"}:</strong> {isGerman ? "Bei 30 Min wird die Eskalation erst 30 Min nach der ersten Benachrichtigung ausgelÃ¶st, falls keine Reaktion erfolgt." : "At 30 minutes, escalation starts 30 minutes after the first notification if there is no reaction."}</p></> },
    { key: "fallback_recipient", label: t('teams.fallbackRecipient'), type: "text", tooltip: <><p>{isGerman ? "Teams-Benutzer-ID oder E-Mail-Adresse, die als EmpfÃ¤nger verwendet wird, wenn kein spezifischer EmpfÃ¤nger ermittelt werden kann." : "Teams user ID or email address used as the recipient if no specific recipient can be resolved."}</p><p><strong>{isGerman ? "Typisch" : "Typical"}:</strong> {isGerman ? "Teamleiter oder Dispatcher-Mailbox. Wird auch fÃ¼r persÃ¶nliche Testnachrichten verwendet." : "Team lead or dispatcher mailbox. Also used for personal test messages."}</p></> },
    { key: "deduplicate_window_minutes", label: t('teams.duplicateWindow'), type: "number", tooltip: <><p>{isGerman ? "Zeitfenster in Minuten, innerhalb dessen identische Nachrichten (gleicher Typ, gleicher EmpfÃ¤nger, gleicher Inhalt) als Duplikat erkannt und unterdrÃ¼ckt werden." : "Time window in minutes during which identical messages with the same type, recipient, and content are treated as duplicates and suppressed."}</p><p><strong>{isGerman ? "Empfehlung" : "Recommendation"}:</strong> {isGerman ? "10â€“30 Minuten. Zu kurz = Spam, zu lang = verzÃ¶gerte Updates." : "10-30 minutes. Too short means spam, too long means delayed updates."}</p></> },
  ];

  const dispatcherFields: SettingField[] = [
    { key: "dispatcher_manual_review_notify_systems", label: t('teams.notifySystemExclusions'), type: "toggle", tooltip: <><p>{isGerman ? "Wenn aktiv, erhalten Dispatcher eine Teams-Nachricht, sobald ein Ticket wegen Systemname aus ODIN ausgeschlossen und in den manuellen Review geschoben wird." : "If enabled, dispatchers receive a Teams message as soon as a ticket is excluded from ODIN because of its system name and moved into manual review."}</p><p>{isGerman ? "Diese Einstellung ist bereits mit der Backend-Logik verdrahtet." : "This setting is already wired into the backend logic."}</p></> },
    { key: "dispatcher_manual_review_notify_subtypes", label: t('teams.notifySubtypeExclusions'), type: "toggle", tooltip: <><p>{isGerman ? "Wenn aktiv, werden manuelle Reviews aufgrund eines ausgeschlossenen Subtypes sofort an Dispatcher gemeldet." : "If enabled, manual reviews caused by an excluded subtype are reported to dispatchers immediately."}</p><p>{isGerman ? "Dadurch sieht das Team frÃ¼h, welche Tickets bewusst nicht automatisch verteilt wurden." : "This lets the team see early which tickets were intentionally not auto-assigned."}</p></> },
    { key: "dispatcher_manual_review_live_only", label: t('teams.liveOnly'), type: "toggle", tooltip: <><p>{isGerman ? "Begrenzt die Dispatcher-Benachrichtigung auf echte Live-LÃ¤ufe." : "Limits dispatcher notifications to real live runs."}</p><p>{isGerman ? "Dry-Run- und Shadow-Run-Szenarien bleiben damit ruhig." : "Dry-run and shadow-run scenarios stay quiet."}</p></> },
    { key: "dispatcher_manual_review_recipients", label: t('teams.directRecipients'), type: "text", tooltip: <><p>{isGerman ? "Kommaseparierte Liste aus E-Mail-Adressen oder Mitarbeiterkennungen fÃ¼r die direkte Zustellung." : "Comma-separated list of email addresses or employee identifiers for direct delivery."}</p><p>{isGerman ? "ODIN versucht zuerst die persÃ¶nliche Zustellung Ã¼ber den Bot-Pfad, falls dieser vorhanden ist." : "ODIN tries personal delivery through the bot path first if it is available."}</p></>, placeholder: isGerman ? "dispatcher@firma.de, schichtleitung@firma.de" : "dispatcher@company.com, shiftlead@company.com" },
    { key: "dispatcher_manual_review_shift_filter", label: t('teams.specificShifts'), type: "text", tooltip: <><p>{isGerman ? "Optionaler Schichtfilter, z. B. 1,2 oder D,N. Nur aktive Mitarbeiter aus diesen Schichten werden als EmpfÃ¤nger berÃ¼cksichtigt." : "Optional shift filter, for example 1,2 or D,N. Only active employees from those shifts are considered as recipients."}</p><p>{isGerman ? "So lassen sich Nachtdispatcher und Tagesdispatch getrennt steuern." : "This allows night dispatch and day dispatch to be controlled separately."}</p></>, placeholder: "1,2,N" },
    { key: "dispatcher_manual_review_group_targets", label: t('teams.groupTargets'), type: "text", tooltip: <><p>{isGerman ? "Kommaseparierte Gruppennamen fÃ¼r den spÃ¤teren Gruppenversand oder Fallback-Zusammenfassungen." : "Comma-separated group names for later group delivery or fallback summaries."}</p><p>{isGerman ? "Die Gruppennamen sollten mit den Routing-Gruppen abgestimmt sein." : "The group names should be aligned with the routing groups."}</p></>, placeholder: "Dispatcher, Shift Leads" },
    { key: "dispatcher_manual_review_channel_fallback", label: t('teams.channelFallback'), type: "toggle", tooltip: <><p>{isGerman ? "Wenn persÃ¶nliche Zustellung nicht mÃ¶glich ist, darf ODIN stattdessen eine Kanal- oder Sammelnachricht erzeugen." : "If personal delivery is not possible, ODIN may generate a channel or bundled message instead."}</p><p>{isGerman ? "Empfohlen, solange nicht alle Mitarbeiter sauber im Bot gemappt sind." : "Recommended as long as not all employees are mapped cleanly in the bot."}</p></> },
    { key: "dispatcher_manual_review_title", label: t('teams.titleTemplate'), type: "text", tooltip: <><p>{isGerman ? "Optionaler eigener Nachrichtentitel fÃ¼r manuelle Reviews." : "Optional custom message title for manual reviews."}</p><p>{isGerman ? "Freilassen bedeutet: der Standardtitel aus dem Backend wird verwendet." : "Leave empty to use the default title from the backend."}</p></>, placeholder: isGerman ? "Manual Review fÃ¼r Dispatcher" : "Manual review for dispatchers" },
    { key: "dispatcher_manual_review_body", label: t('teams.bodyTemplate'), type: "textarea", tooltip: <><p>{isGerman ? <>Optionaler Nachrichtentext fÃ¼r Dispatcher-Benachrichtigungen. UnterstÃ¼tzt Platzhalter wie <code>{"{{ticketId}}"}</code>, <code>{"{{systemName}}"}</code>, <code>{"{{reason}}"}</code> und <code>{"{{category}}"}</code>.</> : <>Optional message body for dispatcher notifications. Supports placeholders such as <code>{"{{ticketId}}"}</code>, <code>{"{{systemName}}"}</code>, <code>{"{{reason}}"}</code>, and <code>{"{{category}}"}</code>.</>}</p><p>{isGerman ? "Wenn leer, verwendet das Backend den Standardtext." : "If empty, the backend default text is used."}</p></>, placeholder: isGerman ? "Ticket {{ticketId}} wurde wegen {{reason}} in den manuellen Review verschoben." : "Ticket {{ticketId}} was moved into manual review because of {{reason}}." },
    { key: "bot_internal_base_url", label: t('teams.botBaseUrl'), type: "text", tooltip: <><p>{isGerman ? "Interne Basis-URL des Teams-Bots fÃ¼r persÃ¶nliche Zustellung." : "Internal base URL of the Teams bot for personal delivery."}</p><p>{isGerman ? "Nur notwendig, wenn persÃ¶nliche Bot-Benachrichtigungen aus dem Backend genutzt werden sollen." : "Only needed if personal bot notifications should be sent from the backend."}</p></>, placeholder: "http://teams-bot:3978" },
  ];

  const orchestrationFields: SettingField[] = [
    { key: "notification_timing_matrix", label: t('teams.timingMatrix'), type: "textarea", tooltip: <><p>{isGerman ? "Freie Regelmatrix fÃ¼r kÃ¼nftige erweiterte Benachrichtigungslogik." : "Free-form rule matrix for future advanced notification logic."}</p><p>{isGerman ? <>Empfohlenes Format pro Zeile: <code>trigger|zieltyp|ziel|bedingung</code>.</> : <>Recommended format per line: <code>trigger|targetType|target|condition</code>.</>}</p></>, placeholder: "manual_review|group|Dispatcher|live-only\nassignment|shift|N|priority=P1" },
    { key: "standard_person_shift_messages", label: t('teams.standardPersonShift'), type: "textarea", tooltip: <><p>{isGerman ? "Speichert Standardtexte fÃ¼r bestimmte Personen in bestimmten Schichten." : "Stores standard texts for specific people in specific shifts."}</p><p>{isGerman ? <>Empfohlenes Format pro Zeile: <code>schicht|person|nachricht</code>.</> : <>Recommended format per line: <code>shift|person|message</code>.</>}</p></>, placeholder: isGerman ? "N|dispatcher@firma.de|Bitte Ticket sofort prÃ¼fen." : "N|dispatcher@company.com|Please review the ticket immediately." },
    { key: "standard_group_messages", label: t('teams.standardGroupMessages'), type: "textarea", tooltip: <><p>{isGerman ? "Speichert Gruppen- oder Rollenansprachen fÃ¼r spÃ¤tere automatische Verwendung." : "Stores group or role messages for later automatic use."}</p><p>{isGerman ? <>Empfohlenes Format pro Zeile: <code>gruppe|trigger|nachricht</code>.</> : <>Recommended format per line: <code>group|trigger|message</code>.</>}</p></>, placeholder: isGerman ? "Dispatcher|manual_review|Bitte manuell priorisieren." : "Dispatcher|manual_review|Please prioritize manually." },
  ];

  const updateValue = (key: string, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const enabledLabel = (value: string | undefined) => value === "true" ? t('teams.on') : t('teams.off');
  const webhookActive = settings["teams.powerAutomateWebhookStatus"] === "active";

  return (
    <TextRepairBoundary>
      <div className="space-y-4">

      {/* Communication Mode Section */}
      <EnterpriseCard>
        <div className="px-1 pb-2">
          <h3 className="text-sm font-semibold text-foreground mb-1">
            {isGerman ? "Kommunikationsmodus" : "Communication Mode"}
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {isGerman
              ? "Legt fest, wie ODIN mit Microsoft Teams kommuniziert. Aktuell ist die Webhook-basierte Einwegkommunikation aktiv, da Azure Admin Consent für den Bot noch aussteht."
              : "Determines how ODIN communicates with Microsoft Teams. Currently, webhook-based one-way communication is active because Azure Admin Consent for the bot is still pending."}
          </p>
          <div className="grid gap-2 md:grid-cols-3 mb-3">
            {(["webhook", "bot", "disabled"] as const).map((mode) => {
              const active = (settings["teams.communicationMode"] || "webhook") === mode;
              const labels: Record<string, { de: string; en: string; desc_de: string; desc_en: string }> = {
                webhook: { de: "Webhook / Power Automate", en: "Webhook / Power Automate", desc_de: "Einwegkommunikation über Webhook-URL. Ideal für Power Automate Flows.", desc_en: "One-way communication via webhook URL. Ideal for Power Automate flows." },
                bot: { de: "Bot-basiert (zukünftig)", en: "Bot-based (future)", desc_de: "Vollständiger Teams-Bot mit bidirektionaler Kommunikation. Erfordert Azure Admin Consent.", desc_en: "Full Teams bot with bidirectional communication. Requires Azure Admin Consent." },
                disabled: { de: "Deaktiviert", en: "Disabled", desc_de: "Kein Teams-Versand aktiv.", desc_en: "No Teams delivery active." },
              };
              const l = labels[mode];
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => updateValue("teams.communicationMode", mode)}
                  className={`rounded-lg border px-3 py-2.5 text-left transition ${active
                    ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                    : "border-border/40 bg-background/50 hover:border-primary/40"
                  }`}
                >
                  <div className="text-sm font-medium">{isGerman ? l.de : l.en}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{isGerman ? l.desc_de : l.desc_en}</div>
                </button>
              );
            })}
          </div>
          {(settings["teams.communicationMode"] || "webhook") === "bot" && (
            <div className="rounded-md bg-amber-500/10 border border-amber-400/20 px-3 py-2 text-xs text-amber-200">
              ⚠ {isGerman
                ? "Bot-Modus erfordert Azure Admin Consent. Solange dieser nicht erteilt ist, werden alle Nachrichten über den Webhook-Fallback gesendet."
                : "Bot mode requires Azure Admin Consent. Until granted, all messages are sent via the webhook fallback."}
            </div>
          )}
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <div className="px-1 pb-2">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-1">
                {isGerman ? "Power Automate Webhook" : "Power Automate webhook"}
              </h3>
              <p className="text-xs text-muted-foreground">
                {isGerman
                  ? "Trage hier den HTTP-Trigger-Link deines Power-Automate-Flows ein. ODIN sendet Test- und Assignment-Nachrichten an diesen Link."
                  : "Enter the HTTP trigger URL of your Power Automate flow. ODIN sends test and assignment messages to this URL."}
              </p>
            </div>
            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${
              webhookActive
                ? "bg-green-500/10 text-green-600 dark:text-green-300"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-300"
            }`}>
              {webhookActive ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {webhookActive ? (isGerman ? "Aktiv" : "Active") : (isGerman ? "Nicht aktiv" : "Not active")}
            </div>
          </div>

          <div className="mt-4 grid gap-3">
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
              {isGerman ? "Webhook-Link" : "Webhook URL"}
              <InfoTooltip title={isGerman ? "Webhook-Link" : "Webhook URL"}>
                <p>{isGerman ? "Das ist die URL aus Power Automate fuer den Trigger 'When an HTTP request is received'." : "This is the URL from Power Automate for the 'When an HTTP request is received' trigger."}</p>
                <p>{isGerman ? "Der Test sendet eine echte Nachricht an den Flow. Nur bei erfolgreicher Antwort wird der Status gruen markiert." : "The test sends a real message to the flow. The status turns green only after a successful response."}</p>
              </InfoTooltip>
            </label>
            <div className="flex flex-col gap-2 md:flex-row">
              <input
                type="url"
                value={settings["teams.powerAutomateWebhookUrl"] || settings["teams.webhookUrl"] || ""}
                onChange={(event) => {
                  updateValue("teams.powerAutomateWebhookUrl", event.target.value);
                  updateValue("teams.webhookUrl", event.target.value);
                  updateValue("teams.powerAutomateWebhookStatus", "inactive");
                }}
                placeholder="https://prod-xx.westeurope.logic.azure.com/workflows/..."
                className={`${TEAMS_INPUT_CLASS} flex-1`}
              />
              <button
                type="button"
                onClick={testWebhook}
                disabled={webhookTesting || !(settings["teams.powerAutomateWebhookUrl"] || settings["teams.webhookUrl"])}
                className={TEAMS_BUTTON_SUCCESS_CLASS}
              >
                {webhookTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                {isGerman ? "Testen & aktivieren" : "Test and activate"}
              </button>
            </div>

            {webhookTestResult && (
              <div className={`rounded-lg px-3 py-2 text-xs ${
                webhookTestResult.success
                  ? "bg-green-500/10 text-green-700 dark:text-green-300"
                  : "bg-red-500/10 text-red-700 dark:text-red-300"
              }`}>
                {webhookTestResult.message}
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <SettingInput
                field={{
                  key: "teams.notificationsEnabled",
                  label: isGerman ? "Ticket-Zuweisungen an Teams senden" : "Send ticket assignments to Teams",
                  type: "toggle",
                  tooltip: <p>{isGerman ? "Wenn aktiv, postet ODIN eine Kanalnachricht, sobald die Assignment Engine ein Ticket einem Mitarbeiter zuweist." : "When enabled, ODIN posts a channel message whenever the assignment engine assigns a ticket to an employee."}</p>,
                }}
                value={settings["teams.notificationsEnabled"] || settings["teams.assignmentNotificationsEnabled"] || "false"}
                onChange={(key, value) => {
                  updateValue(key, value);
                  updateValue("teams.assignmentNotificationsEnabled", value);
                }}
              />
              <SettingInput
                field={{
                  key: "teams.sendOnlyForLiveAssignments",
                  label: isGerman ? "Nur bei Live-Zuweisungen senden" : "Send only for live assignments",
                  type: "toggle",
                  tooltip: <p>{isGerman ? "Wenn aktiv, werden Shadow-/Dry-Run-Entscheidungen nicht an Teams gesendet." : "When enabled, shadow and dry-run decisions are not sent to Teams."}</p>,
                }}
                value={settings["teams.sendOnlyForLiveAssignments"] || settings["teams.assignmentNotificationsLiveOnly"] || "true"}
                onChange={(key, value) => {
                  updateValue(key, value);
                  updateValue("teams.assignmentNotificationsLiveOnly", value);
                }}
              />
            </div>
          </div>
        </div>
      </EnterpriseCard>

      {/* Quick Summary */}
      <EnterpriseCard>
        <div className="grid gap-4 md:grid-cols-3">
          <SettingsSummaryTile title={t('teams.dispatcherReview')} value={`${enabledLabel(settings.dispatcher_manual_review_notify_systems)} / ${enabledLabel(settings.dispatcher_manual_review_notify_subtypes)}`} hint={t('teams.systemSubtypeExclusions')} />
          <SettingsSummaryTile title={t('teams.deliveryPath')} value={settings.bot_internal_base_url ? "Bot + Fallback" : "Webhook / Fallback"} hint={t('teams.peopleChannelRouting')} />
          <SettingsSummaryTile title={t('teams.routingPrep')} value={settings.notification_timing_matrix ? t('teams.advancedConfigured') : t('teams.basic')} hint={t('teams.whoGetsWhat')} />
        </div>
      </EnterpriseCard>

      <SettingsSectionCard title={t('teams.globalDeliveryRules')} description={t('teams.globalDeliveryRulesDesc')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {coreFields.map((field) => (
            <SettingInput key={field.key} field={field} value={settings[field.key] || ""} onChange={updateValue} />
          ))}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title={t('teams.dispatcherExcluded')} description={t('teams.dispatcherExcludedDesc')}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dispatcherFields.map((field) => (
            <SettingInput key={field.key} field={field} value={settings[field.key] || ""} onChange={updateValue} />
          ))}
        </div>
      </SettingsSectionCard>

      <SettingsSectionCard title={t('teams.messageOrchestration')} description={t('teams.messageOrchestrationDesc')}>
        <div className="grid grid-cols-1 gap-4">
          {orchestrationFields.map((field) => (
            <SettingInput key={field.key} field={field} value={settings[field.key] || ""} onChange={updateValue} />
          ))}
        </div>
      </SettingsSectionCard>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4" />}
          {copy.save}
        </button>
      </div>
      </div>
    </TextRepairBoundary>
  );
}

type SettingField = {
  key: string;
  label: string;
  type: "text" | "number" | "toggle" | "textarea";
  tooltip: React.ReactNode;
  placeholder?: string;
};

function SettingsSectionCard({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <TextRepairBoundary>
      <EnterpriseCard>
        <div className="mb-4">
          <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</div>
          <div className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</div>
        </div>
        {children}
      </EnterpriseCard>
    </TextRepairBoundary>
  );
}

function SettingsSummaryTile({ title, value, hint }: { title: string; value: string; hint: string }) {
  return (
    <TextRepairBoundary>
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="text-xs uppercase tracking-wide text-gray-400">{title}</div>
        <div className="mt-2 text-base font-semibold text-gray-900 dark:text-gray-100">{value}</div>
        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</div>
      </div>
    </TextRepairBoundary>
  );
}

function SettingInput({ field, value, onChange }: { field: SettingField; value: string; onChange: (key: string, value: string) => void }) {
  return (
    <TextRepairBoundary>
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 flex items-center gap-1">
          {field.label}
          <InfoTooltip title={field.label}>{field.tooltip}</InfoTooltip>
        </label>
        {field.type === "toggle" ? (
          <button
            onClick={() => onChange(field.key, value === "true" ? "false" : "true")}
            className="focus:outline-none"
            type="button"
          >
            {value === "true"
              ? <ToggleRight className="w-6 h-6 text-green-500" />
              : <ToggleLeft className="w-6 h-6 text-gray-400" />}
          </button>
        ) : field.type === "textarea" ? (
          <textarea
            value={value}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            rows={4}
            className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-800"
          />
        ) : (
          <input
            type={field.type}
            value={value}
            onChange={(event) => onChange(field.key, event.target.value)}
            placeholder={field.placeholder}
            className="w-full border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800"
          />
        )}
      </div>
    </TextRepairBoundary>
  );
}

function asEnabledLabel(value: string | undefined) {
  return value === "true" ? "An" : "Aus";
}

function CapabilityCard({ label, active, tooltip }: { label: string; active: boolean; tooltip?: string }) {
  const { copy } = useTeamsUi();
  return (
    <TextRepairBoundary>
      <EnterpriseCard>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300">
            {label}
            {tooltip && (
              <InfoTooltip title={label} side="right">
                <p>{tooltip}</p>
              </InfoTooltip>
            )}
          </div>
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${active ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
            {active ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
            {active ? copy.active : copy.inactive}
          </div>
        </div>
      </EnterpriseCard>
    </TextRepairBoundary>
  );
}

function DiagnosticCheckCard({ check }: { check: TeamsDiagnosticCheck }) {
  const { language } = useTeamsUi();
  const isGerman = language === "de";
  const badgeClass = check.status === "ok"
    ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
    : check.status === "warning"
      ? "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
      : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400";
  const explanation = (isGerman ? DIAGNOSTIC_HELP_DE : DIAGNOSTIC_HELP_EN)[check.key];

  return (
    <TextRepairBoundary>
      <EnterpriseCard>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold">{check.title}</h3>
              {explanation && (
                <InfoTooltip title={explanation.title} side="right" width="w-96">
                  <p><strong>{isGerman ? "Kurz" : "Summary"}:</strong> {explanation.summary}</p>
                  <p>{explanation.detail}</p>
                </InfoTooltip>
              )}
            </div>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>
              {check.status === "ok" ? <CheckCircle2 className="w-3.5 h-3.5" /> : check.status === "warning" ? <AlertTriangle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              {check.status === "ok" ? "OK" : check.status === "warning" ? (isGerman ? "Hinweis" : "Warning") : (isGerman ? "Fehler" : "Error")}
            </span>
          </div>

          {explanation && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300">
              <strong>{isGerman ? "Warum dieser Check wichtig ist" : "Why this check matters"}:</strong> {explanation.summary}
            </div>
          )}

          <div className="space-y-2 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">{isGerman ? "Prüfschritt" : "Check step"}</div>
              <div className="text-gray-700 dark:text-gray-300">{check.action}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-gray-400">{isGerman ? "Ergebnis" : "Result"}</div>
              <div className="text-gray-700 dark:text-gray-300">{check.detail}</div>
            </div>
            {check.next_step && (
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-400">{isGerman ? "Nächster Schritt" : "Next step"}</div>
                <div className="text-gray-700 dark:text-gray-300">{check.next_step}</div>
              </div>
            )}
          </div>
        </div>

        {check.data && Object.keys(check.data).length > 0 && (
          <div className="w-full md:w-80 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-800/60">
            <div className="mb-2 font-semibold text-gray-600 dark:text-gray-300">Technische Details</div>
            <div className="space-y-1.5">
              {Object.entries(check.data).map(([key, value]) => (
                <div key={key} className="flex items-start justify-between gap-3">
                  <span className="text-gray-500 dark:text-gray-400">{key}</span>
                  <span className="break-all text-right text-gray-700 dark:text-gray-200">{formatDiagnosticValue(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        </div>
      </EnterpriseCard>
    </TextRepairBoundary>
  );
}

function formatDiagnosticValue(value: unknown) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

/* ================================================ */
/* SHARED COMPONENTS                                 */
/* ================================================ */

function LoadingSpinner() {
  return (
    <TextRepairBoundary>
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
      </div>
    </TextRepairBoundary>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <TextRepairBoundary>
      <div className="p-4 rounded bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
        <XCircle className="w-4 h-4 inline mr-2" />
        {message}
      </div>
    </TextRepairBoundary>
  );
}
