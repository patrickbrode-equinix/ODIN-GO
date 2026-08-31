/* ------------------------------------------------ */
/* ADMIN SETTINGS PAGE                              */
/* TV Slides, Thresholds, Feature Toggles, Feedback */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState, type ElementType, type ReactNode, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader } from "../layout/EnterpriseLayout";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { ActivityLogPanel } from "../activity/ActivityLogPanel";
import { fetchTvSlideConfig, updateTvSlideConfig, type TvSlideConfig } from "../../api/tvConfig";
import { fetchSettingsAudit, type SettingsAuditEntry } from "../../api/settingsAudit";
import { api } from "../../api/api";
import { AssignmentSettingsPanel } from "../assignment/AssignmentSettingsPanel";
import { OdinAutomationControlPanel } from "../assignment/OdinAutomationControlPanel";
import AssignmentRulesEditor from "./AssignmentRulesEditor";
import { ShiftPlanningSettingsPanel } from "./ShiftAdminSettings";
import { TeamsCommunicationCenterPanel } from "./TeamsCommunicationCenter";
import AccessDenied from "./AccessDenied";
import OdinExclusions from "../odinlogic/OdinExclusions";
import EmployeeExclusions from "../odinlogic/EmployeeExclusions";
import { InfoTooltip } from "../ui/InfoTooltip";
import { isAdminTabEnabledInCurrentMode } from "../../config/appMode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../ui/alert-dialog";
import {
  Tv, Settings, Zap, MessageSquare, Shield, Clock, Save,
  ToggleLeft, ToggleRight, Loader2,
  History, GripVertical, Brain, Trash2, CalendarClock,
  Scale, Shuffle, BarChart3, CheckCircle2, CircleDot, KeyRound,
} from "lucide-react";

type TabId = "shiftplan" | "teams" | "tv" | "thresholds" | "toggles" | "feedback" | "odin" | "maintenance" | "audit" | "security";

const TAB_SPECS: { id: TabId; icon: ElementType; accent: string }[] = [
  { id: "shiftplan", icon: CalendarClock, accent: "from-sky-500/25 via-cyan-500/10 to-transparent" },
  { id: "security", icon: KeyRound, accent: "from-slate-500/25 via-zinc-500/10 to-transparent" },
  { id: "audit", icon: History, accent: "from-zinc-500/25 via-slate-500/10 to-transparent" },
];

function getTabs(t: (key: any) => string, language: string) {
  const isGerman = language === "de";
  return TAB_SPECS.map((tab) => {
    switch (tab.id) {
      case "shiftplan":
        return { ...tab, label: t('admin.tabShiftplan'), description: t('admin.tabShiftplanDesc') };
      case "teams":
        return { ...tab, label: "Teams", description: t('admin.tabTeamsDesc') };
      case "tv":
        return { ...tab, label: t('admin.tabTv'), description: t('admin.tabTvDesc') };
      case "thresholds":
        return { ...tab, label: t('admin.tabThresholds'), description: t('admin.tabThresholdsDesc') };
      case "toggles":
        return { ...tab, label: isGerman ? 'Funktionsschalter' : 'Feature toggles', description: t('admin.tabTogglesDesc') };
      case "feedback":
        return { ...tab, label: t('admin.tabFeedback'), description: t('admin.tabFeedbackDesc') };
      case "odin":
        return { ...tab, label: isGerman ? 'Auto-Zuweisung' : 'Auto assignment', description: t('admin.tabOdinDesc') };
      case "maintenance":
        return { ...tab, label: t('admin.tabMaintenance'), description: t('admin.tabMaintenanceDesc') };
      case "audit":
        return { ...tab, label: t('admin.tabAudit'), description: t('admin.tabAuditDesc') };
      case "security":
        return { ...tab, label: isGerman ? 'Sicherheit' : 'Security', description: isGerman ? 'Admin-Passwort ändern' : 'Change admin password' };
      default:
        return { ...tab, label: tab.id, description: tab.id };
    }
  });
}

const TAB_ACCESS: Record<TabId, Array<{ pageKey: string; min?: "view" | "write" }>> = {
  shiftplan: [{ pageKey: "shiftplan_control", min: "view" }],
  teams: [{ pageKey: "teams_center", min: "view" }],
  tv: [{ pageKey: "admin_settings", min: "view" }],
  thresholds: [{ pageKey: "admin_settings", min: "view" }],
  toggles: [{ pageKey: "admin_settings", min: "view" }],
  feedback: [{ pageKey: "admin_settings", min: "view" }],
  odin: [{ pageKey: "odin_logic", min: "view" }],
  maintenance: [{ pageKey: "admin_settings", min: "view" }],
  audit: [{ pageKey: "admin_settings", min: "view" }, { pageKey: "protokoll", min: "view" }],
  security: [{ pageKey: "admin_settings", min: "view" }],
};

const THRESHOLD_HELP: Record<string, { de: ReactNode; en: ReactNode }> = {
  "threshold.crawler_stale_minutes": {
    de: <p>Ab diesem Alter gelten Crawler-Daten als veraltet. ODIN und TV können dann Schutzmechanismen oder Warnungen auslösen.</p>,
    en: <p>After this age, crawler data is treated as stale. ODIN and the TV mode can then trigger safeguards or warnings.</p>,
  },
  "threshold.commit_risk_hours": {
    de: <p>Unterhalb dieser Restzeit werden Tickets im Dashboard und in operativen Ansichten als commit-kritisch behandelt.</p>,
    en: <p>Below this remaining time, tickets are treated as commit-critical in the dashboard and in operational views.</p>,
  },
  "threshold.critical_ticket_window_hours": {
    de: <p>Gemeinsames Zeitfenster fuer kritische Tickets in Dashboard und TV-Modus. Trouble Tickets und Expedites bleiben sichtbar, Commit-Risiken folgen dieser Grenze.</p>,
    en: <p>Shared time window for critical tickets in the dashboard and TV mode. Trouble tickets and expedites remain visible, while commit-risk tickets follow this threshold.</p>,
  },
  "threshold.escalation_minutes": {
    de: <p>Nach dieser Zeit ohne Reaktion können Folgeprozesse oder Eskalationen greifen.</p>,
    en: <p>After this amount of time without a reaction, follow-up processes or escalations can start.</p>,
  },
  "threshold.understaffing_missing": {
    de: <p>Definiert, ab wie vielen fehlenden Personen eine Schicht als unterbesetzt gilt. Diese Schwelle steuert die Unterbesetzungswarnung.</p>,
    en: <p>Defines from how many missing people a shift is considered understaffed. This threshold drives the understaffing warning.</p>,
  },
};

const TV_SETTINGS_HELP: Record<string, { de: ReactNode; en: ReactNode }> = {
  "tv.default_duration_ms": {
    de: <p>Standardlaufzeit pro Slide in Millisekunden. Einzelne Slides können in der Slide-Liste separat überschrieben werden.</p>,
    en: <p>Default runtime per slide in milliseconds. Individual slides can override this value in the slide list.</p>,
  },
  "tv.font_scale": {
    de: <p>Globaler Skalierungsfaktor für TV-Typografie. Höhere Werte vergrößern Texte auf allen Slides.</p>,
    en: <p>Global scaling factor for TV typography. Higher values increase text size on all slides.</p>,
  },
  "tv.compact_cards": {
    de: <p>Reduziert Innenabstände und Kartenhöhen. Sinnvoll für kleine Displays oder hohe Datendichte.</p>,
    en: <p>Reduces internal spacing and card height. Useful for smaller displays or high information density.</p>,
  },
  "tv.auto_scroll": {
    de: <p>Erlaubt automatisches Scrollen in Listen, wenn mehr Inhalte vorhanden sind als auf eine TV-Seite passen.</p>,
    en: <p>Allows lists to scroll automatically when more content exists than fits on one TV page.</p>,
  },
  "tv.animations": {
    de: <p>Steuert das Animationsprofil des TV-Modus, z. B. zurückhaltend oder auffällig.</p>,
    en: <p>Controls the animation profile of the TV mode, for example subtle or attention-grabbing.</p>,
  },
  "tv.commit_window_hours": {
    de: <p>Legt fest, wie weit in die Zukunft commit-relevante Tickets im TV priorisiert gezeigt werden.</p>,
    en: <p>Defines how far into the future commit-relevant tickets are prioritized in the TV mode.</p>,
  },
  "tv.show_stale_tickets": {
    de: <p>Wenn aktiv, bleiben auch ältere Tickets sichtbar. Deaktiviert bedeutet: Fokus auf aktuelle operative Daten.</p>,
    en: <p>If enabled, older tickets remain visible. When disabled, the focus stays on current operational data.</p>,
  },
  "tv.crawler_stale_threshold_minutes": {
    de: <p>Eigene Stale-Schwelle für TV-Anzeigen. Kann bewusst strenger oder lockerer als die globale Schwelle sein.</p>,
    en: <p>Dedicated stale threshold for TV views. It can intentionally be stricter or looser than the global threshold.</p>,
  },
};

const TV_ASSIGNMENT_ARENA_HELP: Record<string, { de: ReactNode; en: ReactNode }> = {
  "tv.assignment_visualization_mode": {
    de: <p>Steuert nur die TV-Darstellung der ODIN-Zuweisung. Die eigentliche Auswahl bleibt vollständig deterministisch und unverändert.</p>,
    en: <p>Controls only the TV presentation of ODIN assignment. The actual selection remains fully deterministic and unchanged.</p>,
  },
  "tv.assignment_animation_speed": {
    de: <p>Bestimmt, wie schnell Wheel oder Slot laufen und wie lang die Auflösung dauert.</p>,
    en: <p>Controls how quickly the wheel or slot runs and how long the reveal lasts.</p>,
  },
  "tv.assignment_celebration_intensity": {
    de: <p>Beeinflusst Glows, Partikel und die visuelle Wucht der Gewinnerphase.</p>,
    en: <p>Adjusts glow, particles, and the visual force of the winner phase.</p>,
  },
  "tv.assignment_auto_fallback": {
    de: <p>Bevorzugt bei unvollständigen Animationsdaten automatisch die Enterprise-Ansicht. Kritische Render- oder Datenfehler fallen immer auf Enterprise zurück.</p>,
    en: <p>Prefers the enterprise view automatically for incomplete animation data. Critical render or data failures always fall back to enterprise.</p>,
  },
  "tv.assignment_confetti_enabled": {
    de: <p>Aktiviert den Partikel-Burst nach erfolgreicher TV-Auflösung.</p>,
    en: <p>Enables the particle burst after a successful TV reveal.</p>,
  },
  "tv.assignment_applause_enabled": {
    de: <p>Blendet zusätzliche Celebration-Bars im Winner-State ein.</p>,
    en: <p>Shows extra celebration bars in the winner state.</p>,
  },
  "tv.assignment_display_reasoning": {
    de: <p>Zeigt nach der Animation wieder die komprimierte Entscheidungsbegründung an.</p>,
    en: <p>Shows the condensed decision reasoning again after the animation.</p>,
  },
};

const TV_ASSIGNMENT_DEFAULTS: Record<string, string> = {
  "tv.assignment_visualization_mode": "enterprise",
  "tv.assignment_animation_speed": "normal",
  "tv.assignment_celebration_intensity": "medium",
  "tv.assignment_auto_fallback": "true",
  "tv.assignment_confetti_enabled": "true",
  "tv.assignment_applause_enabled": "true",
  "tv.assignment_display_reasoning": "true",
};

const FEEDBACK_HELP: Record<string, { de: ReactNode; en: ReactNode }> = {
  "feedback.enabled": {
    de: <p>Schaltet die Feedback-Funktion insgesamt frei oder aus.</p>,
    en: <p>Enables or disables the feedback feature as a whole.</p>,
  },
  "feedback.allow_screenshots": {
    de: <p>Erlaubt explizit Bild-/Screenshot-Uploads für visuelle Fehlermeldungen.</p>,
    en: <p>Explicitly allows image or screenshot uploads for visual issue reports.</p>,
  },
  "feedback.max_size_mb": {
    de: <p>Maximale Größe aller hochgeladenen Dateien pro Feedback in Megabyte.</p>,
    en: <p>Maximum total size of all uploaded files per feedback entry in megabytes.</p>,
  },
};

type FeedbackEntry = {
  id: number;
  type: string;
  title: string;
  description: string;
  senderName: string | null;
  senderEmail: string | null;
  screenshotName: string | null;
  status: 'open' | 'in_progress' | 'done';
  createdAt: string;
};

const FEATURE_TOGGLE_HELP: Record<string, { de: ReactNode; en: ReactNode }> = {
  auto_assign: {
    de: <p>Schaltet automatische Zuweisungsfunktionen auf Feature-Ebene frei oder aus.</p>,
    en: <p>Enables or disables automatic assignment functions on a feature level.</p>,
  },
  teams_tt: {
    de: <p>Steuert Teams-Benachrichtigungen für Trouble Tickets.</p>,
    en: <p>Controls Teams notifications for trouble tickets.</p>,
  },
  teams_update: {
    de: <p>Erlaubt Update-Nachrichten an Teams bei Status- oder Inhaltsänderungen.</p>,
    en: <p>Allows update messages to Teams when status or content changes.</p>,
  },
  teams_expedite: {
    de: <p>Hebt Expedite-relevante Teams-Kommunikation gesondert hervor.</p>,
    en: <p>Highlights expedite-related Teams communication separately.</p>,
  },
  teams_assign: {
    de: <p>Steuert Teams-Meldungen für echte Ticket-Zuweisungen.</p>,
    en: <p>Controls Teams messages for real ticket assignments.</p>,
  },
  teams_info: {
    de: <p>Aktiviert rein informative Teams-Nachrichten ohne direkte Handlungsaufforderung.</p>,
    en: <p>Enables purely informational Teams messages without a direct action request.</p>,
  },
};

const TV_SLIDE_HELP: Record<string, { de: ReactNode; en: ReactNode }> = {
  active: {
    de: <p>Aktive Slides rotieren im TV-Modus. Inaktive Slides bleiben vollständig verborgen.</p>,
    en: <p>Active slides rotate in TV mode. Inactive slides stay completely hidden.</p>,
  },
  slide: {
    de: <p>Name des Slides. Das Critical-Workload-Modul bildet Ticketpriorität und ODIN-Entscheidungen gemeinsam ab und wird hier wie jeder andere Slide gesteuert.</p>,
    en: <p>Name of the slide. The critical workload module combines ticket priority and ODIN decisions and is controlled here like any other slide.</p>,
  },
  duration: {
    de: <p>Anzeigezeit dieses Slides in Sekunden. Überschreibt die Standard-Slide-Dauer.</p>,
    en: <p>Display time of this slide in seconds. Overrides the default slide duration.</p>,
  },
  order: {
    de: <p>Bestimmt die Reihenfolge innerhalb der TV-Rotation.</p>,
    en: <p>Determines the order within the TV rotation.</p>,
  },
  data: {
    de: <p>Wenn aktiv, erscheint der Slide nur dann, wenn passende Daten vorhanden sind.</p>,
    en: <p>If enabled, the slide only appears when matching data is available.</p>,
  },
};

function isTabId(value: string | null): value is TabId {
  return TAB_SPECS.some((tab) => tab.id === value);
}

export default function AdminSettings() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  const tabs = useMemo(() => getTabs(t, language), [language, t]);
  const { canAccess } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const accessibleTabs = useMemo(
    () => tabs.filter((tab) =>
      isAdminTabEnabledInCurrentMode(tab.id)
      && TAB_ACCESS[tab.id].some((requirement) => canAccess(requirement.pageKey, requirement.min || "view"))
    ),
    [canAccess, tabs]
  );
  const [activeTab, setActiveTab] = useState<TabId | null>(null);
  useEffect(() => {
    const section = searchParams.get("section");
    const fallbackTab = accessibleTabs[0]?.id ?? null;
    const requestedTab = isTabId(section) && accessibleTabs.some((tab) => tab.id === section)
      ? section
      : fallbackTab;

    if (requestedTab && requestedTab !== activeTab) {
      setActiveTab(requestedTab);
    }

    if (requestedTab && section !== requestedTab) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("section", requestedTab);
        return next;
      });
    }
  }, [activeTab, accessibleTabs, searchParams, setSearchParams]);

  const selectTab = (tabId: TabId) => {
    if (!accessibleTabs.some((tab) => tab.id === tabId)) return;
    if (activeTab === tabId) return;

    setActiveTab(tabId);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("section", tabId);
      return next;
    });

    api.post("/activity/log", {
      action: "TAB_SELECT",
      module: "ADMIN_SETTINGS",
      details: {
        tab: tabId,
        location: "/admin-settings",
      },
    }).catch(() => {});
  };

  if (accessibleTabs.length === 0) {
    return <AccessDenied />;
  }

  if (!activeTab) {
    return null;
  }

  const activeMeta = accessibleTabs.find((tab) => tab.id === activeTab) || accessibleTabs[0];

  return (
    <EnterprisePageShell className="admin-enterprise-surface">
      <EnterpriseHeader title={t('admin.title')} subtitle={t('admin.subtitle')} />

      <EnterpriseFeatureHero
        tone="cyan"
        eyebrow={t('admin.controlCenter')}
        title={t('admin.allSettings')}
        description={t('admin.tilesDescription')}
        metrics={[
          { label: 'Tabs', value: accessibleTabs.length },
          { label: 'Focus', value: activeMeta.label },
          { label: isGerman ? 'Bereich' : 'Area', value: activeMeta.label },
        ]}
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {accessibleTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => selectTab(tab.id)}
            className={`group rounded-[28px] border p-5 text-left transition-all duration-200 ${
              activeTab === tab.id
                ? "theme-admin-tile-active"
                : "theme-admin-tile hover:border-sky-300/30 hover:shadow-[0_18px_40px_rgba(14,165,233,0.10)]"
            }`}
          >
            <div className={`mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br ${tab.accent} ${activeTab === tab.id ? "text-sky-700 dark:text-sky-200" : "text-slate-600 dark:text-slate-300 group-hover:text-sky-700 dark:group-hover:text-sky-200"}`}>
              <tab.icon className="h-5 w-5" />
            </div>
            <div className="text-base font-semibold">
              {tab.label}
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300">{tab.description}</div>
          </button>
        ))}
      </div>

      <div className="theme-glass-panel mb-6 rounded-[28px] p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-linear-to-br ${activeMeta.accent} text-sky-700 dark:text-sky-200`}>
            <activeMeta.icon className="h-5 w-5" />
          </div>
          <div>
            <div className="text-lg font-semibold text-foreground">{activeMeta.label}</div>
            <div className="mt-1 text-sm text-muted-foreground">{activeMeta.description}</div>
          </div>
        </div>
      </div>

      {activeTab === "shiftplan" && <ShiftPlanningSettingsPanel embedded />}
      {activeTab === "teams" && <TeamsCommunicationCenterPanel embedded initialTab="settings" />}
      {activeTab === "tv" && <TVSettingsTab />}
      {activeTab === "thresholds" && <ThresholdsTab />}
      {activeTab === "toggles" && <TogglesTab />}
      {activeTab === "feedback" && <FeedbackTab />}
      {activeTab === "odin" && <OdinRulesTab />}
      {activeTab === "maintenance" && <MaintenanceTab />}
      {activeTab === "audit" && <AuditTab />}
      {activeTab === "security" && <AdminPasswordTab />}
    </EnterprisePageShell>
  );
}

function AdminPasswordTab() {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (!currentPassword || !newPassword || !confirmPassword) {
      setMessage({ ok: false, text: isGerman ? "Bitte alle Felder ausfüllen." : "Please fill in all fields." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setMessage({ ok: false, text: isGerman ? "Die neuen Passwörter stimmen nicht überein." : "The new passwords do not match." });
      return;
    }
    setBusy(true);
    try {
      await api.post("/standalone-admin/change-password", { currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage({ ok: true, text: isGerman ? "Admin-Passwort erfolgreich geändert." : "Admin password changed successfully." });
    } catch (error: any) {
      setMessage({ ok: false, text: error?.response?.data?.message || (isGerman ? "Passwort konnte nicht geändert werden." : "Password could not be changed.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <EnterpriseCard>
      <div className="mb-5 flex items-start gap-3">
        <KeyRound className="mt-0.5 h-5 w-5 text-slate-500" />
        <div>
          <h3 className="text-lg font-semibold text-foreground">{isGerman ? "Admin-Passwort ändern" : "Change admin password"}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{isGerman ? "Patrick Brode wird über SSO automatisch erkannt. Alle anderen Admin-Zugriffe bleiben passwortgeschützt." : "Patrick Brode is recognized automatically through SSO. All other admin access remains password protected."}</p>
        </div>
      </div>
      <form onSubmit={submit} className="max-w-xl space-y-4">
        <label className="block text-sm text-muted-foreground">{isGerman ? "Altes Passwort" : "Current password"}<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>
        <label className="block text-sm text-muted-foreground">{isGerman ? "Neues Passwort" : "New password"}<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>
        <label className="block text-sm text-muted-foreground">{isGerman ? "Neues Passwort wiederholen" : "Repeat new password"}<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground" /></label>
        {message && <div className={`rounded-lg border px-3 py-2 text-sm ${message.ok ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-red-500/40 bg-red-500/10 text-red-300"}`}>{message.text}</div>}
        <button type="submit" disabled={busy} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60">{busy ? (isGerman ? "Wird gespeichert..." : "Saving...") : (isGerman ? "Passwort speichern" : "Save password")}</button>
      </form>
    </EnterpriseCard>
  );
}

/* ================================================ */
/* TV SETTINGS TAB                                   */
/* ================================================ */

function TVSettingsTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  const [slides, setSlides] = useState<TvSlideConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSlides(await fetchTvSlideConfig()); } catch (e) { console.error(e); }
    setLoading(false);
    setDirty(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateSlide = (slideId: string, field: keyof TvSlideConfig, value: any) => {
    setSlides(prev => prev.map(s => s.slide_id === slideId ? { ...s, [field]: value } : s));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await updateTvSlideConfig(slides);
      setSlides(updated);
      setDirty(false);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  if (loading) return <LoadingSpinner />;

  const visibleSlides = [...slides]
    .filter((slide) => slide.slide_id !== 'assignment')
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 text-sm text-gray-500">
        <span>{t('admin.tvConfigHint')}</span>
        <InfoTooltip title={t('admin.tvSlides')} side="right" align="start" width="w-96">
          <p>{isGerman ? "Alle TV-Slides werden hier zentral gepflegt. Das Critical-Workload-Modul bündelt jetzt Ticketkritikalität und ODIN-Entscheidungen in einem gemeinsamen TV-Slide." : "All TV slides are maintained centrally here. The critical workload module now combines ticket criticality and ODIN decisions in a single TV slide."}</p>
        </InfoTooltip>
      </div>
      <p className="text-xs text-blue-500/80">{t('admin.tvHeaderNote')}</p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b dark:border-gray-700">
              <th className="py-2 px-3 w-8"></th>
              <th className="py-2 px-3"><span className="inline-flex items-center gap-1">{t('common.active')} <InfoTooltip title={t('common.active')} side="right">{TV_SLIDE_HELP.active[isGerman ? "de" : "en"]}</InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="inline-flex items-center gap-1">Slide <InfoTooltip title="Slide" side="right">{TV_SLIDE_HELP.slide[isGerman ? "de" : "en"]}</InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="inline-flex items-center gap-1">{t('admin.durationSec')} <InfoTooltip title={t('admin.duration')} side="right">{TV_SLIDE_HELP.duration[isGerman ? "de" : "en"]}</InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="inline-flex items-center gap-1">{t('admin.order')} <InfoTooltip title={t('admin.order')} side="right">{TV_SLIDE_HELP.order[isGerman ? "de" : "en"]}</InfoTooltip></span></th>
              <th className="py-2 px-3"><span className="inline-flex items-center gap-1">{t('admin.onlyWithData')} <InfoTooltip title={t('admin.onlyWithData')} side="right">{TV_SLIDE_HELP.data[isGerman ? "de" : "en"]}</InfoTooltip></span></th>
            </tr>
          </thead>
          <tbody>
            {visibleSlides.map(s => (
              <tr key={s.slide_id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="py-2 px-3 text-gray-300"><GripVertical className="w-4 h-4" /></td>
                <td className="py-2 px-3">
                  <button onClick={() => updateSlide(s.slide_id, "enabled", !s.enabled)} className="focus:outline-none">
                    {s.enabled ? <ToggleRight className="w-6 h-6 text-green-500" /> : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                  </button>
                </td>
                <td className="py-2 px-3 font-medium">{s.label}</td>
                <td className="py-2 px-3">
                  <input
                    type="number"
                    min={3}
                    max={120}
                    value={Math.round(s.duration_ms / 1000)}
                    onChange={e => updateSlide(s.slide_id, "duration_ms", parseInt(e.target.value) * 1000)}
                    className="w-20 border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-center"
                  />
                </td>
                <td className="py-2 px-3">
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={s.sort_order}
                    onChange={e => updateSlide(s.slide_id, "sort_order", parseInt(e.target.value))}
                    className="w-16 border dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-center"
                  />
                </td>
                <td className="py-2 px-3">
                  <button onClick={() => updateSlide(s.slide_id, "only_if_data", !s.only_if_data)} className="focus:outline-none">
                    {s.only_if_data ? <ToggleRight className="w-5 h-5 text-blue-500" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dirty && (
        <div className="flex justify-end">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('admin.saveChanges')}
          </button>
        </div>
      )}

      <div className="mt-4 text-xs text-gray-400">
        {slides.length > 0 && slides[0].updated_by && (
          <span>{t('admin.lastChangedBy')} {slides[0].updated_by} {t('admin.on')} {new Date(slides[0].updated_at!).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: 'Europe/Berlin' })}</span>
        )}
      </div>
    </div>
  );
}

function OdinRulesTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  return (
    <div className="space-y-4">
      <EnterpriseCard>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t('admin.odinLogic')}</h3>
            <InfoTooltip title={t('admin.odinLogic')} side="right" align="start" width="w-96">
              <p>{isGerman ? "Hier liegen die zentralen Regeln für Priorisierung, Rollen, Lastgrenzen und Ausschlüsse. Damit ist die gesamte operative ODIN-Steuerung an einem Ort gebündelt." : "This is where the core rules for prioritization, roles, load limits, and exclusions live. It bundles the entire operational ODIN control surface in one place."}</p>
            </InfoTooltip>
          </div>
          <p className="text-sm text-gray-500">
            {t('admin.odinLogicDesc')}
          </p>
        </div>
      </EnterpriseCard>
      <OdinAutomationControlPanel />
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1">
          <h3 className="text-sm font-semibold">{isGerman ? 'Engine-Zeitfenster & Schichtmodus' : 'Engine time window & shift mode'}</h3>
          <InfoTooltip title={isGerman ? 'Engine-Zeitfenster & Schichtmodus' : 'Engine time window & shift mode'} side="right" align="start" width="w-96">
            <p>{isGerman ? 'Hier steuerst du, wie weit ODIN in die Zukunft assignieren darf und ob ausschließlich die aktuelle Schichtinstanz zugelassen wird.' : 'Control here how far into the future ODIN may assign tickets and whether only the current shift instance is allowed.'}</p>
          </InfoTooltip>
        </div>
        <AssignmentSettingsPanel />
      </div>
      <EnterpriseCard>
        <AssignmentRulesEditor embedded />
      </EnterpriseCard>
      <EnterpriseCard>
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t('admin.ticketExclusions')}</h3>
            <InfoTooltip title={t('admin.ticketExclusions')} side="right" align="start" width="w-96">
              <p>{isGerman ? "Systemnamen und Subtypen in diesem Bereich werden bewusst aus der automatischen Zuweisung ausgeschlossen und landen im manuellen Review." : "System names and subtypes in this area are intentionally excluded from automatic assignment and land in manual review."}</p>
            </InfoTooltip>
          </div>
          <p className="text-sm text-muted-foreground">{t('admin.ticketExclusionsDesc')}</p>
        </div>
        <OdinExclusions />
      </EnterpriseCard>
      <EnterpriseCard>
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t('admin.employeeExclusions')}</h3>
            <InfoTooltip title={t('admin.employeeExclusions')} side="right" align="start" width="w-96">
              <p>{isGerman ? "Hier werden Personen gepflegt, die ODIN dauerhaft oder vorübergehend nicht automatisch berücksichtigen darf." : "Manage people here that ODIN must not consider automatically, either permanently or temporarily."}</p>
            </InfoTooltip>
          </div>
          <p className="text-sm text-muted-foreground">{t('admin.employeeExclusionsDesc')}</p>
        </div>
        <EmployeeExclusions />
      </EnterpriseCard>
      <FairnessPanel />
    </div>
  );
}

function ManualExclusionsTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  return (
    <div className="space-y-4">
      <EnterpriseCard>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t('admin.manualExclusionList')}</h3>
            <InfoTooltip title={t('admin.manualExclusionList')} side="right" align="start"><p>{isGerman ? "Separater Direktzugriff auf die Ticket-Ausschlusslisten für Systemnamen und Subtypes." : "Separate direct access to the ticket exclusion lists for system names and subtypes."}</p></InfoTooltip>
          </div>
          <p className="text-sm text-gray-500">
            {t('admin.manualExclusionSubDesc')}
          </p>
        </div>
      </EnterpriseCard>
      <EnterpriseCard>
        <OdinExclusions />
      </EnterpriseCard>
    </div>
  );
}

function EmployeeExclusionsTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  return (
    <div className="space-y-4">
      <EnterpriseCard>
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t('admin.permanentExclusions')}</h3>
            <InfoTooltip title={t('admin.permanentExclusions')} side="right" align="start"><p>{isGerman ? "Separater Direktzugriff auf Personen, die ODIN bei Auto-Assignments auslassen soll." : "Separate direct access to people ODIN should skip during auto assignments."}</p></InfoTooltip>
          </div>
          <p className="text-sm text-gray-500">
            {t('admin.permanentExclusionsDesc')}
          </p>
        </div>
      </EnterpriseCard>
      <EnterpriseCard>
        <EmployeeExclusions />
      </EnterpriseCard>
    </div>
  );
}

function MaintenanceTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState("");
  const [changeNote, setChangeNote] = useState("");
  const [resetting, setResetting] = useState(false);

  const handleReset = async () => {
    if (confirmPhrase !== "RESET TICKETS") return;

    setResetting(true);
    try {
      const { data } = await api.post("/app-settings/ticket-db/reset", {
        confirmReset: true,
        changeNote: changeNote || undefined,
      });

      const totalDeletedRows = Number(data?.totalDeletedRows || 0);
      toast.success(isGerman ? `Ticket-Datenbank zurückgesetzt (${totalDeletedRows} Datensätze entfernt)` : `Ticket database reset (${totalDeletedRows} records removed)`);
      setConfirmPhrase("");
      setChangeNote("");
      setResetDialogOpen(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || (isGerman ? "Ticket-Datenbank konnte nicht zurückgesetzt werden" : "Ticket database could not be reset"));
    } finally {
      setResetting(false);
    }
  };

  return (
    <EnterpriseCard>
      <div className="space-y-4">
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-sm font-semibold">{t('admin.resetTicketDb')}</h3>
            <InfoTooltip title={t('admin.resetTicketDb')} side="right" align="start" width="w-96">
              <p>{isGerman ? "Löscht operative Ticket- und Snapshot-Daten, ohne Stammdaten zu entfernen. Diese Aktion ist nur für bereinigte Neustarts oder Wartungsfälle gedacht." : "Deletes operational ticket and snapshot data without removing master data. This action is only intended for clean restarts or maintenance cases."}</p>
            </InfoTooltip>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {t('admin.resetTicketDbDesc')}
          </p>
        </div>

        <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-2">
          <div className="text-sm font-semibold text-red-600 dark:text-red-400">{t('admin.affectedAreas')}</div>
          <div className="text-sm text-red-900/80 dark:text-red-100/70">
            queue_items, expired_tickets, crawler_runs, crawler_run_deltas, snapshots, commit_imports sowie die daraus abgeleiteten ODIN-Run- und Decision-Logs.
          </div>
        </div>

        <AlertDialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <AlertDialogTrigger asChild>
            <button className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded hover:bg-red-700 disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
              {t('admin.resetTicketDb')}
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t('admin.resetDialogTitle')}</AlertDialogTitle>
              <AlertDialogDescription>
                {t('admin.resetDialogDesc')}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3 py-2">
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
                  <span>{t('admin.authPhrase')}</span>
                  <InfoTooltip title={t('admin.authPhrase')} side="right"><p>{isGerman ? "Nur wenn exakt RESET TICKETS eingetragen wird, kann der Reset ausgelöst werden." : "The reset can only be triggered if RESET TICKETS is entered exactly."}</p></InfoTooltip>
                </div>
                <input
                  value={confirmPhrase}
                  onChange={(e) => setConfirmPhrase(e.target.value)}
                  placeholder="RESET TICKETS"
                  className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-800"
                />
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
                  <span>{t('admin.auditNote')}</span>
                  <InfoTooltip title={t('admin.auditNote')} side="right"><p>{isGerman ? "Optionale fachliche Erklärung für das Änderungsprotokoll, z. B. warum ein Reset notwendig war." : "Optional business explanation for the change log, for example why a reset was necessary."}</p></InfoTooltip>
                </div>
                <input
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  placeholder={t('admin.auditNotePlaceholder')}
                  className="w-full border dark:border-gray-600 rounded px-3 py-2 text-sm bg-white dark:bg-gray-800"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => { setConfirmPhrase(""); setChangeNote(""); }}>{t('common.cancel')}</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleReset();
                }}
                disabled={resetting || confirmPhrase !== "RESET TICKETS"}
                className="bg-red-600 hover:bg-red-700"
              >
                {resetting ? t('admin.resetting') : t('admin.runReset')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </EnterpriseCard>
  );
}

/* ================================================ */
/* THRESHOLDS TAB                                    */
/* ================================================ */

function ThresholdsTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/app-settings");
      setSettings({
        "threshold.critical_ticket_window_hours": "72",
        ...TV_ASSIGNMENT_DEFAULTS,
        ...(data || {}),
      });
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      // Only send threshold/tv keys
      const filtered = Object.fromEntries(
        Object.entries(settings).filter(([k]) => k.startsWith("threshold.") || k.startsWith("tv."))
      );
      const { data } = await api.put("/app-settings", filtered);
      setSettings(data);
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  if (loading) return <LoadingSpinner />;

  const localeKey = isGerman ? "de" : "en";
  const thresholds: { key: string; label: string; unit: string; help: ReactNode }[] = [
    { key: "threshold.crawler_stale_minutes", label: t('admin.crawlerStaleAfter'), unit: t('admin.minutes'), help: THRESHOLD_HELP["threshold.crawler_stale_minutes"][localeKey] },
    { key: "threshold.commit_risk_hours", label: t('admin.commitRiskBelow'), unit: t('admin.hours'), help: THRESHOLD_HELP["threshold.commit_risk_hours"][localeKey] },
    { key: "threshold.critical_ticket_window_hours", label: isGerman ? "Zeitfenster kritische Tickets" : "Critical ticket window", unit: t('admin.hours'), help: THRESHOLD_HELP["threshold.critical_ticket_window_hours"][localeKey] },
    { key: "threshold.escalation_minutes", label: t('admin.escalateAfter'), unit: t('admin.minutes'), help: THRESHOLD_HELP["threshold.escalation_minutes"][localeKey] },
    { key: "threshold.understaffing_missing", label: t('admin.understaffingFrom'), unit: t('admin.missingPeople'), help: THRESHOLD_HELP["threshold.understaffing_missing"][localeKey] },
  ];

  const tvSettings: { key: string; label: string; type: "number" | "toggle" | "text"; unit?: string; help: ReactNode }[] = [
    { key: "tv.default_duration_ms", label: t('admin.defaultSlideDuration'), type: "number", unit: "ms", help: TV_SETTINGS_HELP["tv.default_duration_ms"][localeKey] },
    { key: "tv.font_scale", label: t('admin.fontScaleFactor'), type: "number", help: TV_SETTINGS_HELP["tv.font_scale"][localeKey] },
    { key: "tv.compact_cards", label: t('admin.compactCards'), type: "toggle", help: TV_SETTINGS_HELP["tv.compact_cards"][localeKey] },
    { key: "tv.auto_scroll", label: t('admin.autoScroll'), type: "toggle", help: TV_SETTINGS_HELP["tv.auto_scroll"][localeKey] },
    { key: "tv.animations", label: t('admin.animations'), type: "text", help: TV_SETTINGS_HELP["tv.animations"][localeKey] },
    { key: "tv.show_stale_tickets", label: t('admin.showStaleTickets'), type: "toggle", help: TV_SETTINGS_HELP["tv.show_stale_tickets"][localeKey] },
    { key: "tv.crawler_stale_threshold_minutes", label: t('admin.tvCrawlerStale'), type: "number", unit: t('admin.minutes'), help: TV_SETTINGS_HELP["tv.crawler_stale_threshold_minutes"][localeKey] },
  ];

  const assignmentVisualizationModeOptions = [
    { value: 'enterprise', label: isGerman ? 'Enterprise' : 'Enterprise' },
    { value: 'gamified_wheel', label: isGerman ? 'Gamified Wheel' : 'Gamified wheel' },
    { value: 'gamified_slot', label: isGerman ? 'Gamified Slot' : 'Gamified slot' },
  ];

  const assignmentAnimationSpeedOptions = [
    { value: 'slow', label: isGerman ? 'Langsam' : 'Slow' },
    { value: 'normal', label: isGerman ? 'Normal' : 'Normal' },
    { value: 'fast', label: isGerman ? 'Schnell' : 'Fast' },
  ];

  const assignmentCelebrationOptions = [
    { value: 'low', label: isGerman ? 'Zurückhaltend' : 'Low' },
    { value: 'medium', label: isGerman ? 'Standard' : 'Medium' },
    { value: 'high', label: isGerman ? 'Maximal' : 'High' },
  ];

  const assignmentArenaToggles: { key: string; label: string; help: ReactNode }[] = [
    { key: 'tv.assignment_auto_fallback', label: isGerman ? 'Enterprise-Fallback bevorzugen' : 'Prefer enterprise fallback', help: TV_ASSIGNMENT_ARENA_HELP['tv.assignment_auto_fallback'][localeKey] },
    { key: 'tv.assignment_confetti_enabled', label: isGerman ? 'Konfetti aktivieren' : 'Enable confetti', help: TV_ASSIGNMENT_ARENA_HELP['tv.assignment_confetti_enabled'][localeKey] },
    { key: 'tv.assignment_applause_enabled', label: isGerman ? 'Applaus-Animation aktivieren' : 'Enable applause animation', help: TV_ASSIGNMENT_ARENA_HELP['tv.assignment_applause_enabled'][localeKey] },
    { key: 'tv.assignment_display_reasoning', label: isGerman ? 'Begründung nach Animation zeigen' : 'Show reasoning after animation', help: TV_ASSIGNMENT_ARENA_HELP['tv.assignment_display_reasoning'][localeKey] },
  ];

  return (
    <div className="space-y-6">
      <EnterpriseCard>
        <div className="mb-4 flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{t('admin.globalThresholds')}</h3>
          <InfoTooltip title={t('admin.globalThresholds')} side="right" align="start"><p>{isGerman ? "Diese Grenzwerte beeinflussen Warnungen, Eskalationen und TV-/Dashboard-Verhalten systemweit." : "These limits influence warnings, escalations, and TV/dashboard behavior across the system."}</p></InfoTooltip>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {thresholds.map(t => (
            <div key={t.key}>
              <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500"><span>{t.label}</span><InfoTooltip title={t.label} side="right">{t.help}</InfoTooltip></div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={settings[t.key] || ""}
                  onChange={e => setSettings(s => ({ ...s, [t.key]: e.target.value }))}
                  className="w-24 border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800"
                />
                <span className="text-xs text-gray-400">{t.unit}</span>
              </div>
            </div>
          ))}
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <div className="mb-4 flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{t('admin.tvModePresentation')}</h3>
          <InfoTooltip title={t('admin.tvModePresentation')} side="right" align="start"><p>{isGerman ? "Diese Werte beeinflussen die generelle Darstellung des TV-Dashboards unabhängig von einzelnen Slides." : "These values influence the overall appearance of the TV dashboard independently of individual slides."}</p></InfoTooltip>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {tvSettings.map(t => (
            <div key={t.key}>
              <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500"><span>{t.label}</span><InfoTooltip title={t.label} side="right">{t.help}</InfoTooltip></div>
              {t.type === "toggle" ? (
                <button
                  onClick={() => setSettings(s => ({ ...s, [t.key]: s[t.key] === "true" ? "false" : "true" }))}
                  className="focus:outline-none"
                >
                  {settings[t.key] === "true"
                    ? <ToggleRight className="w-6 h-6 text-green-500" />
                    : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type={t.type}
                    value={settings[t.key] || ""}
                    onChange={e => setSettings(s => ({ ...s, [t.key]: e.target.value }))}
                    className="w-32 border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800"
                  />
                  {t.unit && <span className="text-xs text-gray-400">{t.unit}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <div className="mb-4 flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{isGerman ? 'ODIN Assignment Arena' : 'ODIN Assignment Arena'}</h3>
          <InfoTooltip title={isGerman ? 'ODIN Assignment Arena' : 'ODIN Assignment Arena'} side="right" align="start">
            <p>{isGerman ? 'TV-only Experiment für die Zuweisungsdarstellung. Die ODIN-Engine trifft weiterhin die echte Entscheidung, die Animation illustriert sie nur.' : 'TV-only experiment for assignment presentation. The ODIN engine still makes the real decision and the animation only illustrates it.'}</p>
          </InfoTooltip>
        </div>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          {isGerman
            ? 'Failsafe bleibt aktiv: Bei fehlenden Kandidaten, Trace-Lücken oder Renderfehlern zeigt der TV-Modus automatisch wieder die Enterprise-Ansicht.'
            : 'Failsafe remains active: if candidates are missing, trace data is incomplete, or rendering fails, TV mode automatically returns to the enterprise view.'}
        </p>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
              <span>{isGerman ? 'Visualisierungsmodus' : 'Visualization mode'}</span>
              <InfoTooltip title={isGerman ? 'Visualisierungsmodus' : 'Visualization mode'} side="right">{TV_ASSIGNMENT_ARENA_HELP['tv.assignment_visualization_mode'][localeKey]}</InfoTooltip>
            </div>
            <select
              value={settings['tv.assignment_visualization_mode'] || TV_ASSIGNMENT_DEFAULTS['tv.assignment_visualization_mode']}
              onChange={(e) => setSettings((current) => ({ ...current, 'tv.assignment_visualization_mode': e.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              {assignmentVisualizationModeOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
              <span>{isGerman ? 'Animationsgeschwindigkeit' : 'Animation speed'}</span>
              <InfoTooltip title={isGerman ? 'Animationsgeschwindigkeit' : 'Animation speed'} side="right">{TV_ASSIGNMENT_ARENA_HELP['tv.assignment_animation_speed'][localeKey]}</InfoTooltip>
            </div>
            <select
              value={settings['tv.assignment_animation_speed'] || TV_ASSIGNMENT_DEFAULTS['tv.assignment_animation_speed']}
              onChange={(e) => setSettings((current) => ({ ...current, 'tv.assignment_animation_speed': e.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              {assignmentAnimationSpeedOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500">
              <span>{isGerman ? 'Celebration-Intensität' : 'Celebration intensity'}</span>
              <InfoTooltip title={isGerman ? 'Celebration-Intensität' : 'Celebration intensity'} side="right">{TV_ASSIGNMENT_ARENA_HELP['tv.assignment_celebration_intensity'][localeKey]}</InfoTooltip>
            </div>
            <select
              value={settings['tv.assignment_celebration_intensity'] || TV_ASSIGNMENT_DEFAULTS['tv.assignment_celebration_intensity']}
              onChange={(e) => setSettings((current) => ({ ...current, 'tv.assignment_celebration_intensity': e.target.value }))}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              {assignmentCelebrationOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <div className="rounded-3xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-4 text-sm text-slate-600 dark:text-slate-300">
            <div className="font-semibold text-slate-900 dark:text-slate-100">{isGerman ? 'Architektur-Guardrail' : 'Architecture guardrail'}</div>
            <p className="mt-2">
              {isGerman
                ? 'Wheel und Slot lesen ausschließlich die bereits ausgewählte Person aus der ODIN-Trace. Sie erzeugen keine Zufälligkeit und ändern keine Business Rule.'
                : 'Wheel and slot only read the already selected person from the ODIN trace. They introduce no randomness and do not alter any business rule.'}
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignmentArenaToggles.map((toggle) => (
            <div key={toggle.key} className="rounded-3xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{toggle.label}</div>
                <InfoTooltip title={toggle.label} side="right">{toggle.help}</InfoTooltip>
              </div>
              <button
                onClick={() => setSettings((current) => ({ ...current, [toggle.key]: current[toggle.key] === 'true' ? 'false' : 'true' }))}
                className="focus:outline-none"
              >
                {settings[toggle.key] === 'true'
                  ? <ToggleRight className="h-6 w-6 text-green-500" />
                  : <ToggleLeft className="h-6 w-6 text-gray-400" />}
              </button>
            </div>
          ))}
        </div>
      </EnterpriseCard>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('common.save')}
        </button>
      </div>
    </div>
  );
}

/* ================================================ */
/* TOGGLES TAB                                       */
/* ================================================ */

function TogglesTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  const [toggles, setToggles] = useState<{ key: string; enabled: boolean; label: string }[]>([]);
  const [colleaguePreferencesEnabled, setColleaguePreferencesEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [toggleResponse, settingsResponse] = await Promise.all([
        api.get("/dashboard/feature-toggles").catch(() => ({ data: [] })),
        api.get('/app-settings').catch(() => ({ data: {} })),
      ]);
      setToggles(Array.isArray(toggleResponse.data) ? toggleResponse.data : []);
      const value = settingsResponse.data?.['shiftplan.colleague_preferences_enabled'];
      setColleaguePreferencesEnabled(value === undefined || !['false', '0', 'off'].includes(String(value).toLowerCase()));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (key: string) => {
    const item = toggles.find(t => t.key === key);
    if (!item) return;
    try {
      await api.put("/dashboard/feature-toggles", { [key]: !item.enabled });
      setToggles(prev => prev.map(t => t.key === key ? { ...t, enabled: !t.enabled } : t));
    } catch (err) { console.error(err); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <EnterpriseCard>
      <div className="mb-4 flex items-center gap-1.5">
        <h3 className="text-sm font-semibold">{isGerman ? "Funktionsschalter" : "Feature toggles"}</h3>
        <InfoTooltip title={isGerman ? "Funktionsschalter" : "Feature toggles"} side="right" align="start"><p>{isGerman ? "Funktionsschalter schalten Funktionen kurzfristig frei oder aus, ohne dass dafür Code geändert werden muss." : "Feature toggles enable or disable functions quickly without changing code."}</p></InfoTooltip>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded bg-gray-50 px-3 py-2 dark:bg-gray-800/50">
          <div>
            <div className="text-sm font-medium">{isGerman ? 'Wunschkollegen-Auswahl' : 'Preferred colleague selection'}</div>
            <div className="text-xs text-gray-400">{isGerman ? 'Mitarbeiter können Kollegen als gemeinsame Planungspräferenz auswählen.' : 'Employees can select colleagues as a shared planning preference.'}</div>
          </div>
          <button onClick={toggleColleaguePreferences} className="focus:outline-none" aria-label={isGerman ? 'Wunschkollegen umschalten' : 'Toggle preferred colleagues'}>
            {colleaguePreferencesEnabled ? <ToggleRight className="h-7 w-7 text-green-500" /> : <ToggleLeft className="h-7 w-7 text-gray-400" />}
          </button>
        </div>
        {toggles.map(t => (
          <div key={t.key} className="flex items-center justify-between py-2 px-3 rounded bg-gray-50 dark:bg-gray-800/50">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span>{t.label || t.key}</span>
                <InfoTooltip title={t.label || t.key} side="right">{FEATURE_TOGGLE_HELP[t.key]?.[isGerman ? "de" : "en"] || <p>{isGerman ? `Technischer Schalter für ${t.key}. Nur deaktivieren oder aktivieren, wenn die Auswirkung bekannt ist.` : `Technical switch for ${t.key}. Only disable or enable it if the impact is known.`}</p>}</InfoTooltip>
              </div>
              <div className="text-xs text-gray-400">{t.key}</div>
            </div>
            <button onClick={() => toggle(t.key)} className="focus:outline-none">
              {t.enabled
                ? <ToggleRight className="w-7 h-7 text-green-500" />
                : <ToggleLeft className="w-7 h-7 text-gray-400" />}
            </button>
          </div>
        ))}
        {toggles.length === 0 && <div className="text-sm text-gray-400 text-center py-4">{t('admin.noToggles')}</div>}
      </div>
    </EnterpriseCard>
  );
}

/* ================================================ */
/* FEEDBACK TAB                                      */
/* ================================================ */

function FeedbackTab() {
  const { language, t } = useLanguage();
  const isGerman = language === "de";
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data }, entriesRes] = await Promise.all([
        api.get("/app-settings"),
        api.get<FeedbackEntry[]>("/feedback/entries", { params: { limit: 100 } }),
      ]);
      const fb = Object.fromEntries(
        Object.entries(data).filter(([k]) => k.startsWith("feedback."))
      );
      setSettings(fb as Record<string, string>);
      setEntries(Array.isArray(entriesRes.data) ? entriesRes.data : []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const reloadEntries = useCallback(async () => {
    try {
      const entriesRes = await api.get<FeedbackEntry[]>("/feedback/entries", { params: { limit: 100 } });
      setEntries(Array.isArray(entriesRes.data) ? entriesRes.data : []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/app-settings", settings);
      toast.success(isGerman ? "Einstellungen gespeichert" : "Settings saved");
    } catch (err) {
      console.error(err);
      toast.error(isGerman ? "Fehler beim Speichern" : "Error saving");
    }
    setSaving(false);
  };

  const updateStatus = async (id: number, status: FeedbackEntry['status']) => {
    setUpdatingId(id);
    try {
      const { data } = await api.patch<FeedbackEntry>(`/feedback/entries/${id}/status`, { status });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, ...data } : e));
      toast.success(t('admin.feedbackStatusUpdated'));
    } catch (err) {
      console.error(err);
      toast.error(isGerman ? "Fehler beim Status-Update" : "Error updating status");
    }
    setUpdatingId(null);
  };

  const deleteEntry = async (id: number) => {
    setUpdatingId(id);
    try {
      await api.delete(`/feedback/entries/${id}`);
      setEntries(prev => prev.filter(e => e.id !== id));
      toast.success(t('admin.feedbackDeleted'));
    } catch (err) {
      console.error(err);
      toast.error(isGerman ? "Fehler beim Löschen" : "Error deleting");
    }
    setUpdatingId(null);
  };

  if (loading) return <LoadingSpinner />;

  const statusConfig: Record<FeedbackEntry['status'], { label: string; icon: typeof Clock; colorClass: string }> = {
    open: { label: t('admin.feedbackOpen'), icon: Clock, colorClass: 'bg-slate-500/15 text-slate-300' },
    in_progress: { label: t('admin.feedbackInProgress'), icon: CircleDot, colorClass: 'bg-amber-500/15 text-amber-300' },
    done: { label: t('admin.feedbackDone'), icon: CheckCircle2, colorClass: 'bg-emerald-500/15 text-emerald-300' },
  };

  const fields: { key: string; label: string; type: "text" | "toggle" | "number"; help: ReactNode }[] = [
    { key: "feedback.enabled", label: t('admin.feedbackEnabled'), type: "toggle", help: FEEDBACK_HELP["feedback.enabled"][isGerman ? "de" : "en"] },
    { key: "feedback.allow_screenshots", label: t('admin.allowScreenshots'), type: "toggle", help: FEEDBACK_HELP["feedback.allow_screenshots"][isGerman ? "de" : "en"] },
    { key: "feedback.max_size_mb", label: t('admin.maxFileSize'), type: "number", help: FEEDBACK_HELP["feedback.max_size_mb"][isGerman ? "de" : "en"] },
  ];

  return (
    <div className="space-y-4">
      <EnterpriseCard>
        <div className="mb-4 flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{t('admin.feedbackRules')}</h3>
          <InfoTooltip title={t('admin.feedbackRules')} side="right" align="start"><p>{isGerman ? "Hier steuerst du nur noch, ob Feedback aktiv ist und ob Screenshots in den gespeicherten User-Eintraegen erlaubt sind." : "Control here whether feedback is active and whether screenshots are allowed in stored user entries."}</p></InfoTooltip>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {fields.map(f => (
            <div key={f.key}>
              <div className="mb-1 flex items-center gap-1.5 text-xs text-gray-500"><span>{f.label}</span><InfoTooltip title={f.label} side="right">{f.help}</InfoTooltip></div>
              {f.type === "toggle" ? (
                <button
                  onClick={() => setSettings(s => ({ ...s, [f.key]: s[f.key] === "true" ? "false" : "true" }))}
                  className="focus:outline-none"
                >
                  {settings[f.key] === "true"
                    ? <ToggleRight className="w-6 h-6 text-green-500" />
                    : <ToggleLeft className="w-6 h-6 text-gray-400" />}
                </button>
              ) : (
                <input
                  type={f.type}
                  value={settings[f.key] || ""}
                  onChange={e => setSettings(s => ({ ...s, [f.key]: e.target.value }))}
                  className="w-full border dark:border-gray-600 rounded px-3 py-1.5 text-sm bg-white dark:bg-gray-800"
                />
              )}
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t('common.save')}
          </button>
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <div className="mb-4 flex items-center gap-1.5">
          <h3 className="text-sm font-semibold">{t('admin.submittedFeedback')}</h3>
          <span className="inline-flex items-center justify-center rounded-full bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] font-bold text-rose-300">{entries.length}</span>
          <InfoTooltip title={t('admin.submittedFeedback')} side="right" align="start"><p>{isGerman ? "Hier erscheinen nur Feedbacks, die Nutzer in ODIN erfasst haben. Mail-Einstellungen oder Weiterleitungen gibt es nicht mehr." : "Only feedback captured directly in ODIN appears here. Mail settings and forwarding are no longer used."}</p></InfoTooltip>
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-sm text-muted-foreground">
            {t('admin.noFeedback')}
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const status = statusConfig[entry.status] || statusConfig.open;
              const StatusIcon = status.icon;
              const isUpdating = updatingId === entry.id;

              return (
                <div key={entry.id} className={`rounded-2xl border bg-white/3 p-4 transition ${entry.status === 'done' ? 'border-emerald-500/20 opacity-70' : 'border-white/10'}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${entry.type === "Bug" ? "bg-red-500/15 text-red-300" : "bg-blue-500/15 text-blue-300"}`}>
                          {entry.type}
                        </span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${status.colorClass}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                        <span className="text-sm font-semibold text-slate-100">{entry.title}</span>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {t('admin.from')} {entry.senderName || entry.senderEmail || t('admin.unknown')} {t('admin.on')} {new Date(entry.createdAt).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: 'Europe/Berlin' })}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {entry.screenshotName ? (
                        <button
                          onClick={async () => {
                            try {
                              const res = await api.get(`/feedback/entries/${entry.id}/screenshot`, { responseType: 'blob' });
                              const url = URL.createObjectURL(res.data);
                              window.open(url, '_blank');
                            } catch { toast.error(isGerman ? 'Screenshot konnte nicht geladen werden' : 'Could not load screenshot'); }
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-indigo-400/25 bg-indigo-500/10 px-2 py-1 text-[11px] text-indigo-300 hover:bg-indigo-500/20 transition cursor-pointer"
                        >
                          📎 {entry.screenshotName}
                        </button>
                      ) : null}
                      {/* Status buttons */}
                      {entry.status !== 'in_progress' ? (
                        <button
                          onClick={() => updateStatus(entry.id, 'in_progress')}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-400/25 bg-amber-500/10 px-2.5 py-1.5 text-[11px] font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:opacity-50"
                          title={t('admin.feedbackInProgress')}
                        >
                          <CircleDot className="w-3 h-3" />
                          {t('admin.feedbackInProgress')}
                        </button>
                      ) : null}
                      {entry.status !== 'done' ? (
                        <button
                          onClick={() => updateStatus(entry.id, 'done')}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1.5 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-500/20 disabled:opacity-50"
                          title={t('admin.feedbackDone')}
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          {t('admin.feedbackDone')}
                        </button>
                      ) : null}
                      {entry.status === 'done' ? (
                        <button
                          onClick={() => updateStatus(entry.id, 'open')}
                          disabled={isUpdating}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-400/25 bg-slate-500/10 px-2.5 py-1.5 text-[11px] font-medium text-slate-300 transition hover:bg-slate-500/20 disabled:opacity-50"
                          title={t('admin.feedbackOpen')}
                        >
                          <Clock className="w-3 h-3" />
                          {t('admin.feedbackOpen')}
                        </button>
                      ) : null}
                      {/* Delete button with confirmation */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button
                            disabled={isUpdating}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-400/25 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-200 transition hover:bg-red-500/20 disabled:opacity-50"
                            title={t('admin.feedbackDelete')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('admin.feedbackDeleteTitle')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('admin.feedbackDeleteConfirm')}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('admin.feedbackCancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => deleteEntry(entry.id)} className="bg-red-600 hover:bg-red-700">
                              {t('admin.feedbackDelete')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="mt-3 whitespace-pre-wrap text-sm text-slate-300">
                    {entry.description}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </EnterpriseCard>
    </div>
  );
}

/* ================================================ */
/* AUDIT TAB                                         */
/* ================================================ */

function AuditTab() {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const [entries, setEntries] = useState<SettingsAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setEntries(await fetchSettingsAudit({ limit: 100 })); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const toggleColleaguePreferences = async () => {
    const next = !colleaguePreferencesEnabled;
    try {
      await api.put('/app-settings', { 'shiftplan.colleague_preferences_enabled': next });
      setColleaguePreferencesEnabled(next);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <EnterpriseCard className="border-white/10 bg-[radial-gradient(circle_at_top,#1f2937_0%,#020617_100%)]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300/75">
              {isGerman ? "Änderungsprotokoll" : "Change log"}
            </div>
            <div className="mt-2 text-lg font-semibold text-slate-100">
              {isGerman ? "Wer hat wann was geändert?" : "Who changed what and when?"}
            </div>
            <div className="mt-1 text-sm text-slate-400">
              {isGerman ? "Es werden nur Zeitpunkt, Person und die geänderte Einstellung angezeigt." : "Only the time, person, and changed setting are shown."}
            </div>
          </div>

        </div>

        {loading ? <LoadingSpinner /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.22em] text-slate-400">
                    <th className="px-3 py-2">{isGerman ? "Zeitpunkt" : "Time"}</th>
                    <th className="px-3 py-2">{isGerman ? "Person" : "Person"}</th>
                    <th className="px-3 py-2">{isGerman ? "Änderung" : "Change"}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-white/5 text-slate-200 hover:bg-white/5">
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{new Date(entry.created_at).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: 'Europe/Berlin' })}</td>
                      <td className="px-3 py-3 text-xs">{entry.changed_by}</td>
                      <td className="px-3 py-3 font-mono text-xs text-sky-200">{entry.domain} · {entry.setting_key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {entries.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">{isGerman ? "Noch keine Änderungen protokolliert." : "No changes logged yet."}</div> : null}
          </>
        )}
      </EnterpriseCard>
    </div>
  );
}

/* ---- Shared ---- */
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
    </div>
  );
}

/* ================================================ */
/* FAIRNESS & VARIETY PANEL (Block 8)               */
/* ================================================ */

interface FairnessSettings {
  consecutive_category_limit: number;
  fair_distribution_mode: 'strict' | 'balanced' | 'relaxed';
  tie_breaker_strategy: 'random' | 'round_robin' | 'least_recent';
  last_assignment_memory_days: number;
  variety_weight: number;
}

const FAIRNESS_DEFAULTS: FairnessSettings = {
  consecutive_category_limit: 0,
  fair_distribution_mode: 'balanced',
  tie_breaker_strategy: 'random',
  last_assignment_memory_days: 7,
  variety_weight: 0.30,
};

const FAIRNESS_COPY = {
  de: {
    title: 'Fairness, Vielfalt & Round-Robin',
    description: 'Steuert, wie ODIN die Arbeit gleichmäßig verteilt und für Abwechslung sorgt. Diese Einstellungen beeinflussen die Tie-Breaker-Logik bei gleichwertigen Kandidaten.',
    consecutiveLimitLabel: 'Max. aufeinanderfolgende Tickets gleicher Kategorie',
    consecutiveLimitHelp: '0 = unbegrenzt. Sobald ein Mitarbeiter diese Grenze erreicht, wird ein Kategorie-Refresh erzwungen.',
    distributionModeLabel: 'Verteilungsmodus',
    distributionStrict: 'Streng egalitär',
    distributionBalanced: 'Ausgewogen (Standard)',
    distributionRelaxed: 'Locker (bevorzugt die schnellste Zuweisung)',
    tieBreakerLabel: 'Tie-Breaker-Strategie',
    tieBreakerRandom: 'Zufällig',
    tieBreakerRoundRobin: 'Round-Robin (reihum)',
    tieBreakerLeastRecent: 'Am längsten ohne Zuweisung',
    memoryDaysLabel: 'Zuweisungsgedächtnis (Tage)',
    memoryDaysHelp: 'ODIN berücksichtigt vergangene Zuweisungen in diesem Zeitfenster für die faire Verteilung.',
    varietyWeightLabel: 'Abwechslungsgewicht',
    varietyWeightHelp: 'Wert zwischen 0 (nur Effizienz) und 1 (maximale Abwechslung). Standard: 0.30',
    saved: 'Fairness-Einstellungen gespeichert',
    saveFailed: 'Fehler beim Speichern',
    saveButton: 'Speichern',
    saving: 'Wird gespeichert…',
  },
  en: {
    title: 'Fairness, variety & round-robin',
    description: 'Controls how ODIN distributes work evenly and ensures variety. These settings influence the tie-breaker logic when candidates are equally qualified.',
    consecutiveLimitLabel: 'Max consecutive tickets of same category',
    consecutiveLimitHelp: '0 = unlimited. Once an employee hits this limit, a category refresh is forced.',
    distributionModeLabel: 'Distribution mode',
    distributionStrict: 'Strict egalitarian',
    distributionBalanced: 'Balanced (default)',
    distributionRelaxed: 'Relaxed (prefers fastest assignment)',
    tieBreakerLabel: 'Tie-breaker strategy',
    tieBreakerRandom: 'Random',
    tieBreakerRoundRobin: 'Round-robin',
    tieBreakerLeastRecent: 'Least recently assigned',
    memoryDaysLabel: 'Assignment memory (days)',
    memoryDaysHelp: 'ODIN considers past assignments in this window for fair distribution.',
    varietyWeightLabel: 'Variety weight',
    varietyWeightHelp: 'Value between 0 (efficiency only) and 1 (maximum variety). Default: 0.30',
    saved: 'Fairness settings saved',
    saveFailed: 'Failed to save',
    saveButton: 'Save',
    saving: 'Saving…',
  },
} as const;

function FairnessPanel() {
  const { language } = useLanguage();
  const copy = FAIRNESS_COPY[language as keyof typeof FAIRNESS_COPY] || FAIRNESS_COPY.en;
  const [settings, setSettings] = useState<FairnessSettings>(FAIRNESS_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/fairness-settings');
      if (res.data?.settings) {
        const raw = res.data.settings;
        setSettings({
          ...FAIRNESS_DEFAULTS,
          ...raw,
          variety_weight: parseFloat(raw.variety_weight) || FAIRNESS_DEFAULTS.variety_weight,
          consecutive_category_limit: parseInt(raw.consecutive_category_limit) || FAIRNESS_DEFAULTS.consecutive_category_limit,
          last_assignment_memory_days: parseInt(raw.last_assignment_memory_days) || FAIRNESS_DEFAULTS.last_assignment_memory_days,
        });
      }
    } catch { /* first use */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/admin/fairness-settings', settings);
      toast.success(copy.saved);
      setDirty(false);
    } catch {
      toast.error(copy.saveFailed);
    }
    setSaving(false);
  };

  const update = <K extends keyof FairnessSettings>(key: K, value: FairnessSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  if (loading) return <EnterpriseCard><LoadingSpinner /></EnterpriseCard>;

  return (
    <EnterpriseCard>
      <div className="mb-4 space-y-2">
        <div className="flex items-center gap-1.5">
          <Scale className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold">{copy.title}</h3>
        </div>
        <p className="text-sm text-gray-500">{copy.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Consecutive category limit */}
        <div>
          <label className="text-xs text-muted-foreground font-medium">{copy.consecutiveLimitLabel}</label>
          <p className="text-[10px] text-muted-foreground/60 mb-1">{copy.consecutiveLimitHelp}</p>
          <input type="number" min={0} max={50} value={settings.consecutive_category_limit}
            onChange={e => update('consecutive_category_limit', Math.max(0, Math.min(50, parseInt(e.target.value) || 0)))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground" />
        </div>

        {/* Distribution mode */}
        <div>
          <label className="text-xs text-muted-foreground font-medium">{copy.distributionModeLabel}</label>
          <select value={settings.fair_distribution_mode} onChange={e => update('fair_distribution_mode', e.target.value as any)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
            <option value="strict">{copy.distributionStrict}</option>
            <option value="balanced">{copy.distributionBalanced}</option>
            <option value="relaxed">{copy.distributionRelaxed}</option>
          </select>
        </div>

        {/* Tie-breaker */}
        <div>
          <label className="text-xs text-muted-foreground font-medium">{copy.tieBreakerLabel}</label>
          <select value={settings.tie_breaker_strategy} onChange={e => update('tie_breaker_strategy', e.target.value as any)}
            className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground">
            <option value="random">{copy.tieBreakerRandom}</option>
            <option value="round_robin">{copy.tieBreakerRoundRobin}</option>
            <option value="least_recent">{copy.tieBreakerLeastRecent}</option>
          </select>
        </div>

        {/* Memory window */}
        <div>
          <label className="text-xs text-muted-foreground font-medium">{copy.memoryDaysLabel}</label>
          <p className="text-[10px] text-muted-foreground/60 mb-1">{copy.memoryDaysHelp}</p>
          <input type="number" min={1} max={90} value={settings.last_assignment_memory_days}
            onChange={e => update('last_assignment_memory_days', Math.max(1, Math.min(90, parseInt(e.target.value) || 7)))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-border/30 bg-background/40 text-foreground" />
        </div>

        {/* Variety weight */}
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground font-medium">{copy.varietyWeightLabel}</label>
          <p className="text-[10px] text-muted-foreground/60 mb-1">{copy.varietyWeightHelp}</p>
          <div className="flex items-center gap-3">
            <input type="range" min={0} max={100} step={5}
              value={Math.round(settings.variety_weight * 100)}
              onChange={e => update('variety_weight', parseInt(e.target.value) / 100)}
              className="flex-1 accent-emerald-500" />
            <span className="text-sm font-mono w-12 text-right text-foreground">{settings.variety_weight.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="flex justify-end mt-4">
        <button onClick={save} disabled={saving || !dirty}
          className="flex items-center gap-1.5 text-sm px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition disabled:opacity-50 font-medium">
          <Save className="w-4 h-4" />
          {saving ? copy.saving : copy.saveButton}
        </button>
      </div>
    </EnterpriseCard>
  );
}
