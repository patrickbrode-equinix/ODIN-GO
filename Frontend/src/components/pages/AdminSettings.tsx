/* ------------------------------------------------ */
/* ADMIN SETTINGS PAGE                              */
/* Shiftplan, Wellbeing, Security, Audit            */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState, type ElementType, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { EnterprisePageShell, EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader } from "../layout/EnterpriseLayout";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";
import { fetchSettingsAudit, type SettingsAuditEntry } from "../../api/settingsAudit";
import { fetchShiftHistory, type ShiftChangeLog } from "../../api/history";
import { api } from "../../api/api";
import { ShiftPlanningSettingsPanel } from "./ShiftAdminSettings";
import WellbeingStatistics from "./WellbeingStatistics";
import AccessDenied from "./AccessDenied";
import {
  Loader2, History, CalendarClock, KeyRound, HeartPulse,
} from "lucide-react";

type TabId = "shiftplan" | "wellbeing" | "audit" | "security";

const TAB_SPECS: { id: TabId; icon: ElementType; accent: string }[] = [
  { id: "shiftplan", icon: CalendarClock, accent: "from-sky-500/25 via-cyan-500/10 to-transparent" },
  { id: "wellbeing", icon: HeartPulse, accent: "from-violet-500/25 via-fuchsia-500/10 to-transparent" },
  { id: "security", icon: KeyRound, accent: "from-slate-500/25 via-zinc-500/10 to-transparent" },
  { id: "audit", icon: History, accent: "from-zinc-500/25 via-slate-500/10 to-transparent" },
];

function getTabs(t: (key: any) => string, language: string) {
  const isGerman = language === "de";
  return TAB_SPECS.map((tab) => {
    switch (tab.id) {
      case "shiftplan":
        return { ...tab, label: t('admin.tabShiftplan'), description: t('admin.tabShiftplanDesc') };
      case "wellbeing":
        return { ...tab, label: "Wellbeing", description: isGerman ? "Belastung und Erholung im Team" : "Team workload and recovery" };
      case "audit":
        return { ...tab, label: t('admin.tabAudit'), description: t('admin.tabAuditDesc') };
      case "security":
        return { ...tab, label: isGerman ? 'Sicherheit' : 'Security', description: isGerman ? 'Admin-Passwort ändern' : 'Change admin password' };
      default:
        return { ...tab, label: (tab as { id: string }).id, description: (tab as { id: string }).id };
    }
  });
}

const TAB_ACCESS: Record<TabId, Array<{ pageKey: string; min?: "view" | "write" }>> = {
  shiftplan: [{ pageKey: "shiftplan_control", min: "view" }],
  wellbeing: [{ pageKey: "admin_settings", min: "view" }],
  audit: [{ pageKey: "admin_settings", min: "view" }, { pageKey: "protokoll", min: "view" }],
  security: [{ pageKey: "admin_settings", min: "view" }],
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
      TAB_ACCESS[tab.id].some((requirement) => canAccess(requirement.pageKey, requirement.min || "view"))
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
      }, { replace: true });
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
      {activeTab === "wellbeing" && <WellbeingStatistics embedded />}
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
/* AUDIT TAB                                         */
/* ================================================ */

function AuditTab() {
  const { language } = useLanguage();
  const isGerman = language === "de";
  const [entries, setEntries] = useState<SettingsAuditEntry[]>([]);
  const [shiftChanges, setShiftChanges] = useState<ShiftChangeLog[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [settingsEntries, scheduleEntries] = await Promise.all([
        fetchSettingsAudit({ limit: 100 }),
        fetchShiftHistory({ limit: 100 }),
      ]);
      setEntries(settingsEntries);
      setShiftChanges(scheduleEntries.filter((entry) => entry.source === "MANUAL_SHIFT_CHANGE"));
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

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

      <EnterpriseCard className="border-sky-500/20 bg-[radial-gradient(circle_at_top_right,#0c4a6e22_0%,#020617_65%)]">
        <div className="mb-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-sky-300/75">
            {isGerman ? "Dienstplan" : "Schedule"}
          </div>
          <div className="mt-2 text-lg font-semibold text-slate-100">
            {isGerman ? "Manuelle Schichtänderungen" : "Manual shift changes"}
          </div>
          <div className="mt-1 text-sm text-slate-400">
            {isGerman
              ? "Direkt im Dienstplan bestätigte Änderungen inklusive vorheriger und neuer Schicht."
              : "Changes confirmed directly in the schedule, including previous and new shift."}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.22em] text-slate-400">
                <th className="px-3 py-2">{isGerman ? "Zeitpunkt" : "Time"}</th>
                <th className="px-3 py-2">{isGerman ? "Person" : "Person"}</th>
                <th className="px-3 py-2">{isGerman ? "Mitarbeiter" : "Employee"}</th>
                <th className="px-3 py-2">{isGerman ? "Datum" : "Date"}</th>
                <th className="px-3 py-2">{isGerman ? "Änderung" : "Change"}</th>
              </tr>
            </thead>
            <tbody>
              {shiftChanges.map((entry) => (
                <tr key={`shift-${entry.id}`} className="border-b border-white/5 text-slate-200 hover:bg-white/5">
                  <td className="whitespace-nowrap px-3 py-3 text-xs text-slate-400">{new Date(entry.created_at).toLocaleString(isGerman ? "de-DE" : "en-GB", { timeZone: "Europe/Berlin" })}</td>
                  <td className="px-3 py-3 text-xs">{entry.changed_by || "—"}</td>
                  <td className="px-3 py-3 text-xs font-medium">{entry.employee_name}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-xs">{new Date(entry.date).toLocaleDateString(isGerman ? "de-DE" : "en-GB")}</td>
                  <td className="px-3 py-3 text-xs"><span className="font-semibold text-rose-300">{entry.old_value || "—"}</span> <span className="text-slate-500">→</span> <span className="font-semibold text-emerald-300">{entry.new_value || "—"}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shiftChanges.length === 0 ? <div className="py-8 text-center text-sm text-slate-400">{isGerman ? "Noch keine manuellen Schichtänderungen protokolliert." : "No manual shift changes have been logged yet."}</div> : null}
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
