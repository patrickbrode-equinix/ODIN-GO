/* ================================================ */
/* Shift Verification Dashboard Component           */
/* Embeddable tab for Teams Communication Center    */
/* or standalone admin page.                        */
/* ================================================ */

import React, { useCallback, useEffect, useState } from "react";
import {
  VerificationApi,
  type VerificationSettings,
  type VerificationRecord,
  type VerificationAuditEntry,
} from "../../api/verification";
import {
  CheckCircle2,
  Clock,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Settings,
  Play,
  Loader2,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { getLanguageLocale, useLanguage, type LanguageCode } from "../../context/LanguageContext";

type ShiftVerificationCopy = {
  statusLabels: Record<string, string>;
  tabs: { status: string; settings: string; audit: string };
  errors: { load: string; save: string; override: string; overrideReasonPrompt: string };
  summary: { total: string; verified: string; pending: string; unavailable: string };
  actions: { triggerNow: string; featureDisabled: string };
  table: { employee: string; shift: string; status: string; sent: string; response: string; action: string };
  overrideMenu: {
    placeholder: string;
    verified: string;
    absent: string;
    sick: string;
    wrongShift: string;
    pending: string;
  };
  settings: {
    enabledLabel: string;
    enabledDescription: string;
    delayLabel: string;
    delayDescription: string;
    timeoutLabel: string;
    timeoutDescription: string;
    pendingBlocksAssignmentLabel: string;
    pendingBlocksAssignmentDescription: string;
    autoAbsentOnSickLabel: string;
    autoAbsentOnSickDescription: string;
    autoAbsentOnNoResponseLabel: string;
    autoAbsentOnNoResponseDescription: string;
  };
  auditTable: { time: string; employee: string; event: string; status: string; actor: string; details: string };
  empty: { records: string; audit: string };
  misc: {
    noValue: string;
    triggerResultPrefix: string;
    triggerResultSent: string;
    triggerResultSkipped: string;
    triggerResultFailed: string;
    triggerResultTimedOut: string;
  };
};

const SHIFT_VERIFICATION_COPY: Record<LanguageCode, ShiftVerificationCopy> = {
  de: {
    statusLabels: {
      verified: "Verifiziert",
      pending: "Ausstehend",
      sick: "Krank",
      absent: "Abwesend",
      wrong_shift: "Andere Schicht",
      no_response: "Keine Antwort",
      failed: "Zustellfehler",
    },
    tabs: { status: "Status", settings: "Einstellungen", audit: "Audit-Log" },
    errors: {
      load: "Fehler beim Laden",
      save: "Fehler beim Speichern",
      override: "Override fehlgeschlagen",
      overrideReasonPrompt: "Grund für die Statusänderung:",
    },
    summary: { total: "Gesamt", verified: "Verifiziert", pending: "Ausstehend", unavailable: "Nicht verfügbar" },
    actions: { triggerNow: "Verifizierung jetzt auslösen", featureDisabled: "Feature ist deaktiviert" },
    table: {
      employee: "Mitarbeiter",
      shift: "Schicht",
      status: "Status",
      sent: "Gesendet",
      response: "Antwort",
      action: "Aktion",
    },
    overrideMenu: {
      placeholder: "Override…",
      verified: "→ Verifiziert",
      absent: "→ Abwesend",
      sick: "→ Krank",
      wrongShift: "→ Andere Schicht",
      pending: "→ Ausstehend",
    },
    settings: {
      enabledLabel: "Verifizierung aktiviert",
      enabledDescription: "Mitarbeiter werden nach Schichtbeginn per Teams kontaktiert",
      delayLabel: "Verzögerung nach Schichtbeginn (Minuten)",
      delayDescription: "Wie viele Minuten nach dem offiziellen Schichtstart soll die Verifizierungsnachricht gesendet werden?",
      timeoutLabel: "Timeout (Minuten)",
      timeoutDescription: "Nach wie vielen Minuten ohne Antwort wird der Status auf 'no_response' gesetzt?",
      pendingBlocksAssignmentLabel: "Ausstehend blockiert Zuweisung",
      pendingBlocksAssignmentDescription: "Solange keine positive Verifizierung vorliegt, werden keine Tickets automatisch zugewiesen",
      autoAbsentOnSickLabel: "Automatische Abwesenheit bei Krankmeldung",
      autoAbsentOnSickDescription: "Wenn ein Mitarbeiter 'Krank' meldet, wird automatisch eine Abwesenheit erstellt",
      autoAbsentOnNoResponseLabel: "Automatische Abwesenheit bei Timeout",
      autoAbsentOnNoResponseDescription: "Bei fehlender Antwort nach Ablauf des Timeouts automatisch als abwesend markieren",
    },
    auditTable: { time: "Zeit", employee: "Mitarbeiter", event: "Event", status: "Status", actor: "Akteur", details: "Details" },
    empty: { records: "Keine Verifizierungseinträge für heute vorhanden", audit: "Keine Audit-Einträge vorhanden" },
    misc: {
      noValue: "—",
      triggerResultPrefix: "Fehler",
      triggerResultSent: "Gesendet",
      triggerResultSkipped: "Übersprungen",
      triggerResultFailed: "Fehler",
      triggerResultTimedOut: "Timeout",
    },
  },
  en: {
    statusLabels: {
      verified: "Verified",
      pending: "Pending",
      sick: "Sick",
      absent: "Absent",
      wrong_shift: "Wrong shift",
      no_response: "No response",
      failed: "Delivery failed",
    },
    tabs: { status: "Status", settings: "Settings", audit: "Audit log" },
    errors: {
      load: "Failed to load data",
      save: "Failed to save settings",
      override: "Failed to apply override",
      overrideReasonPrompt: "Reason for the status change:",
    },
    summary: { total: "Total", verified: "Verified", pending: "Pending", unavailable: "Unavailable" },
    actions: { triggerNow: "Trigger verification now", featureDisabled: "Feature is disabled" },
    table: {
      employee: "Employee",
      shift: "Shift",
      status: "Status",
      sent: "Sent",
      response: "Response",
      action: "Action",
    },
    overrideMenu: {
      placeholder: "Override…",
      verified: "→ Verified",
      absent: "→ Absent",
      sick: "→ Sick",
      wrongShift: "→ Wrong shift",
      pending: "→ Pending",
    },
    settings: {
      enabledLabel: "Verification enabled",
      enabledDescription: "Employees are contacted via Teams after the shift has started",
      delayLabel: "Delay after shift start (minutes)",
      delayDescription: "How many minutes after the official shift start should the verification message be sent?",
      timeoutLabel: "Timeout (minutes)",
      timeoutDescription: "After how many minutes without a response should the status be set to 'no_response'?",
      pendingBlocksAssignmentLabel: "Pending blocks assignment",
      pendingBlocksAssignmentDescription: "As long as no positive verification exists, no tickets are assigned automatically",
      autoAbsentOnSickLabel: "Automatic absence on sick response",
      autoAbsentOnSickDescription: "If an employee reports 'Sick', an absence entry is created automatically",
      autoAbsentOnNoResponseLabel: "Automatic absence on timeout",
      autoAbsentOnNoResponseDescription: "Automatically mark as absent when no response arrives before timeout",
    },
    auditTable: { time: "Time", employee: "Employee", event: "Event", status: "Status", actor: "Actor", details: "Details" },
    empty: { records: "No verification entries are available for today", audit: "No audit entries available" },
    misc: {
      noValue: "—",
      triggerResultPrefix: "Error",
      triggerResultSent: "Sent",
      triggerResultSkipped: "Skipped",
      triggerResultFailed: "Failed",
      triggerResultTimedOut: "Timed out",
    },
  },
};

/* ---- Status badge styles ---- */
const STATUS_STYLES: Record<string, { className: string; icon: React.ElementType }> = {
  verified: { className: "text-green-400 bg-green-500/15 border-green-500/30", icon: CheckCircle2 },
  pending: { className: "text-yellow-400 bg-yellow-500/15 border-yellow-500/30", icon: Clock },
  sick: { className: "text-red-400 bg-red-500/15 border-red-500/30", icon: XCircle },
  absent: { className: "text-red-400 bg-red-500/15 border-red-500/30", icon: XCircle },
  wrong_shift: { className: "text-orange-400 bg-orange-500/15 border-orange-500/30", icon: AlertTriangle },
  no_response: { className: "text-gray-400 bg-gray-500/15 border-gray-500/30", icon: AlertTriangle },
  failed: { className: "text-gray-400 bg-gray-500/15 border-gray-500/30", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const { language } = useLanguage();
  const copy = SHIFT_VERIFICATION_COPY[language] || SHIFT_VERIFICATION_COPY.en;
  const style = STATUS_STYLES[status] || { className: "text-muted-foreground bg-muted/20 border-muted/30", icon: Clock };
  const Icon = style.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${style.className}`}>
      <Icon className="w-3 h-3" />
      {copy.statusLabels[status] || status}
    </span>
  );
}

/* ---- Sub-tabs ---- */
type SubTab = "status" | "settings" | "audit";

function buildTriggerResult(copy: ShiftVerificationCopy, result: { triggered: number; skipped: number; failed: number; timedOut?: number | null }) {
  return `${copy.misc.triggerResultSent}: ${result.triggered} | ${copy.misc.triggerResultSkipped}: ${result.skipped} | ${copy.misc.triggerResultFailed}: ${result.failed} | ${copy.misc.triggerResultTimedOut}: ${result.timedOut ?? 0}`;
}

function formatAuditStatus(status: string | null | undefined, copy: ShiftVerificationCopy) {
  if (!status) return copy.misc.noValue;
  return copy.statusLabels[status] || status;
}

export function ShiftVerificationPanel() {
  const { language } = useLanguage();
  const locale = getLanguageLocale(language);
  const copy = SHIFT_VERIFICATION_COPY[language] || SHIFT_VERIFICATION_COPY.en;
  const [subTab, setSubTab] = useState<SubTab>("status");
  const [settings, setSettings] = useState<VerificationSettings | null>(null);
  const [records, setRecords] = useState<VerificationRecord[]>([]);
  const [audit, setAudit] = useState<VerificationAuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [todayData, settingsData] = await Promise.all([
        VerificationApi.getToday(),
        VerificationApi.getSettings(),
      ]);
      setRecords(todayData.records);
      setSettings(settingsData);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || copy.errors.load);
    } finally {
      setLoading(false);
    }
  }, [copy.errors.load]);

  const loadAudit = useCallback(async () => {
    try {
      const data = await VerificationApi.getAudit({ limit: 50 });
      setAudit(data.entries);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (subTab === "audit") loadAudit();
  }, [subTab, loadAudit]);

  const handleTrigger = async () => {
    setTriggerResult(null);
    try {
      const result = await VerificationApi.trigger();
      setTriggerResult(buildTriggerResult(copy, result));
      await refresh();
    } catch (err: any) {
      setTriggerResult(`${copy.misc.triggerResultPrefix}: ${err?.response?.data?.error || err?.message}`);
    }
  };

  const handleSettingsUpdate = async (updates: Partial<VerificationSettings>) => {
    try {
      const updated = await VerificationApi.updateSettings(updates);
      setSettings(updated);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || copy.errors.save);
    }
  };

  const handleOverride = async (record: VerificationRecord, newStatus: string) => {
    const reason = prompt(copy.errors.overrideReasonPrompt);
    if (reason === null) return;
    try {
      await VerificationApi.override({
        employeeName: record.employee_name,
        date: record.date,
        shiftCode: record.shift_code,
        status: newStatus,
        reason: reason || undefined,
      });
      await refresh();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || copy.errors.override);
    }
  };

  /* ---- Summary stats ---- */
  const stats = {
    total: records.length,
    verified: records.filter((r) => r.status === "verified").length,
    pending: records.filter((r) => r.status === "pending").length,
    unavailable: records.filter((r) => ["sick", "absent", "wrong_shift", "no_response", "failed"].includes(r.status)).length,
  };

  return (
    <div className="space-y-4">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-white/10 pb-2">
        {([
          { id: "status" as SubTab, label: copy.tabs.status, icon: ShieldCheck },
          { id: "settings" as SubTab, label: copy.tabs.settings, icon: Settings },
          { id: "audit" as SubTab, label: copy.tabs.audit, icon: FileText },
        ]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setSubTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t transition-colors ${
              subTab === id ? "bg-primary/15 text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button onClick={refresh} disabled={loading} className="text-muted-foreground hover:text-foreground p-1.5" aria-label={copy.tabs.status}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>

      {error && (
        <div className="text-red-400 bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-sm">{error}</div>
      )}

      {/* ---- STATUS TAB ---- */}
      {subTab === "status" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SummaryCard label={copy.summary.total} value={stats.total} className="text-foreground" />
            <SummaryCard label={copy.summary.verified} value={stats.verified} className="text-green-400" />
            <SummaryCard label={copy.summary.pending} value={stats.pending} className="text-yellow-400" />
            <SummaryCard label={copy.summary.unavailable} value={stats.unavailable} className="text-red-400" />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleTrigger}
              disabled={!settings?.enabled}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded hover:bg-primary/30 text-sm font-medium disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {copy.actions.triggerNow}
            </button>
            {!settings?.enabled && (
              <span className="text-xs text-muted-foreground">{copy.actions.featureDisabled}</span>
            )}
            {triggerResult && (
              <span className="text-xs text-muted-foreground">{triggerResult}</span>
            )}
          </div>

          {/* Records table */}
          {records.length > 0 ? (
            <div className="rounded border border-white/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">{copy.table.employee}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.table.shift}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.table.status}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.table.sent}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.table.response}</th>
                    <th className="text-right px-3 py-2 font-medium">{copy.table.action}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {records.map((r) => (
                    <tr key={r.id} className="hover:bg-muted/10">
                      <td className="px-3 py-2 font-medium">{r.employee_name}</td>
                      <td className="px-3 py-2 font-mono">{r.shift_code}</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {r.message_sent_at ? new Date(r.message_sent_at).toLocaleTimeString(locale, { timeZone: 'Europe/Berlin' }) : copy.misc.noValue}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground text-xs">
                        {r.responded_at ? new Date(r.responded_at).toLocaleTimeString(locale, { timeZone: 'Europe/Berlin' }) : copy.misc.noValue}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <select
                          value=""
                          onChange={(e) => { if (e.target.value) handleOverride(r, e.target.value); }}
                          className="text-xs bg-muted/20 border border-white/10 rounded px-1.5 py-0.5 text-muted-foreground"
                        >
                          <option value="">{copy.overrideMenu.placeholder}</option>
                          <option value="verified">{copy.overrideMenu.verified}</option>
                          <option value="absent">{copy.overrideMenu.absent}</option>
                          <option value="sick">{copy.overrideMenu.sick}</option>
                          <option value="wrong_shift">{copy.overrideMenu.wrongShift}</option>
                          <option value="pending">{copy.overrideMenu.pending}</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm text-center py-6 bg-muted/10 rounded border border-white/5">
              {copy.empty.records}
            </div>
          )}
        </div>
      )}

      {/* ---- SETTINGS TAB ---- */}
      {subTab === "settings" && settings && (
        <div className="space-y-4 max-w-lg">
          <SettingsToggle
            label={copy.settings.enabledLabel}
            description={copy.settings.enabledDescription}
            value={settings.enabled}
            onChange={(v) => handleSettingsUpdate({ enabled: v })}
          />
          <SettingsNumber
            label={copy.settings.delayLabel}
            description={copy.settings.delayDescription}
            value={settings.delayMinutes}
            onChange={(v) => handleSettingsUpdate({ delayMinutes: v })}
            min={0}
            max={60}
          />
          <SettingsNumber
            label={copy.settings.timeoutLabel}
            description={copy.settings.timeoutDescription}
            value={settings.timeoutMinutes}
            onChange={(v) => handleSettingsUpdate({ timeoutMinutes: v })}
            min={5}
            max={120}
          />
          <SettingsToggle
            label={copy.settings.pendingBlocksAssignmentLabel}
            description={copy.settings.pendingBlocksAssignmentDescription}
            value={settings.pendingBlocksAssignment}
            onChange={(v) => handleSettingsUpdate({ pendingBlocksAssignment: v })}
          />
          <SettingsToggle
            label={copy.settings.autoAbsentOnSickLabel}
            description={copy.settings.autoAbsentOnSickDescription}
            value={settings.autoAbsentOnSick}
            onChange={(v) => handleSettingsUpdate({ autoAbsentOnSick: v })}
          />
          <SettingsToggle
            label={copy.settings.autoAbsentOnNoResponseLabel}
            description={copy.settings.autoAbsentOnNoResponseDescription}
            value={settings.autoAbsentOnNoResponse}
            onChange={(v) => handleSettingsUpdate({ autoAbsentOnNoResponse: v })}
          />
        </div>
      )}

      {/* ---- AUDIT TAB ---- */}
      {subTab === "audit" && (
        <div className="space-y-2">
          {audit.length > 0 ? (
            <div className="rounded border border-white/10 overflow-hidden max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-muted-foreground sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">{copy.auditTable.time}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.auditTable.employee}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.auditTable.event}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.auditTable.status}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.auditTable.actor}</th>
                    <th className="text-left px-3 py-2 font-medium">{copy.auditTable.details}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {audit.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/10">
                      <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString(locale, { timeZone: 'Europe/Berlin' })}
                      </td>
                      <td className="px-3 py-1.5 font-medium">{a.employee_name}</td>
                      <td className="px-3 py-1.5 font-mono">{a.event_type}</td>
                      <td className="px-3 py-1.5">
                        {a.old_status && a.new_status
                          ? `${formatAuditStatus(a.old_status, copy)} → ${formatAuditStatus(a.new_status, copy)}`
                          : formatAuditStatus(a.new_status, copy)}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{a.actor}</td>
                      <td className="px-3 py-1.5 text-muted-foreground max-w-[200px] truncate">
                        {a.payload ? JSON.stringify(a.payload) : copy.misc.noValue}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm text-center py-6 bg-muted/10 rounded border border-white/5">
              {copy.empty.audit}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Helper Components ---- */

function SummaryCard({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="flex flex-col items-center justify-center p-3 rounded border border-white/10 bg-muted/10">
      <div className={`text-2xl font-black ${className}`}>{value}</div>
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
    </div>
  );
}

function SettingsToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded border border-white/10 bg-muted/10">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          value ? "bg-primary" : "bg-muted"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            value ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function SettingsNumber({
  label,
  description,
  value,
  onChange,
  min = 0,
  max = 999,
}: {
  label: string;
  description: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-start justify-between gap-4 p-3 rounded border border-white/10 bg-muted/10">
      <div>
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{description}</div>
      </div>
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (!isNaN(n) && n >= min && n <= max) onChange(n);
        }}
        min={min}
        max={max}
        className="w-20 text-center bg-background border border-white/20 rounded px-2 py-1 text-sm font-mono shrink-0"
      />
    </div>
  );
}
