import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, ChevronDown, FlaskConical, Plus, Power, PowerOff, Radio, Trash2, Users } from "lucide-react";
import { api } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGE_TO_LOCALE, useLanguage } from "../../context/LanguageContext";

type Recipient = {
  id: number;
  displayName: string;
  email?: string | null;
};

type Notification = {
  id: number;
  title: string;
  body: string;
  recurrence: "once" | "daily" | "weekly" | "monthly";
  active: boolean;
  created_at: string;
  created_by: string | null;
  notification_kind: "notification" | "instruction";
  recipients?: Recipient[];
};

const RECURRENCE_LABELS: Record<"de" | "en", Record<Notification["recurrence"], string>> = {
  de: { once: "Einmalig", daily: "Täglich", weekly: "Wöchentlich", monthly: "Monatlich" },
  en: { once: "Once", daily: "Daily", weekly: "Weekly", monthly: "Monthly" },
};

const COPY = {
  de: { heading: "Benachrichtigungen", loadFailed: "Benachrichtigungen konnten nicht geladen werden.", createFailed: "Die Benachrichtigung konnte nicht erstellt werden.", updateFailed: "Der Status konnte nicht geändert werden.", deleteConfirm: "Benachrichtigung \"{title}\" wirklich löschen?", deleteFailed: "Die Benachrichtigung konnte nicht gelöscht werden.", testExtensionRequired: "Das Test-Popup ist nur verfügbar, wenn ODIN GO innerhalb von Jarvis geöffnet und die Erweiterung verbunden ist.", testJarvisRequired: "Das Test-Popup ist nur verfügbar, wenn ODIN GO innerhalb von Jarvis geöffnet ist.", testTitle: "ODIN GO Test", testBody: "Die Popup-Zustellung funktioniert in diesem Jarvis-Fenster.", currentUser: "Aktueller Benutzer", subtitle: "Benachrichtigungen erscheinen beim Öffnen von Jarvis mittig als Popup.", connected: "Jarvis verbunden", outsideJarvis: "Außerhalb von Jarvis", testPopup: "Test-Popup", popupsEnabled: "Meine Popups aktiviert", popupsDisabled: "Meine Popups deaktiviert", notification: "Benachrichtigung", instruction: "Anweisung", title: "Titel", recurrence: "Wiederholung", recipients: "Empfänger", allEmployees: "Alle Mitarbeitenden", personSelected: "1 Person ausgewählt", peopleSelected: "{count} Personen ausgewählt", selected: "Ausgewählt", noEmployees: "Keine Mitarbeitenden verfügbar.", recipientsHint: "Ohne Auswahl wird die Meldung an alle Mitarbeitenden gesendet.", publishing: "Wird veröffentlicht...", publish: "Veröffentlichen", active: "Aktiv", inactive: "Deaktiviert", createdBy: "Erstellt von", unknown: "Unbekannt", deactivate: "Deaktivieren", activate: "Aktivieren", delete: "Löschen", empty: "Noch keine Benachrichtigungen angelegt." },
  en: { heading: "Notifications", loadFailed: "Notifications could not be loaded.", createFailed: "The notification could not be created.", updateFailed: "The status could not be updated.", deleteConfirm: "Delete notification \"{title}\"?", deleteFailed: "The notification could not be deleted.", testExtensionRequired: "The test popup is only available when ODIN GO is opened inside Jarvis and the extension is connected.", testJarvisRequired: "The test popup is only available when ODIN GO is opened inside Jarvis.", testTitle: "ODIN GO Test", testBody: "Popup delivery is working in this Jarvis window.", currentUser: "Current user", subtitle: "Notifications appear as a centred popup when Jarvis is opened.", connected: "Connected to Jarvis", outsideJarvis: "Outside Jarvis", testPopup: "Test popup", popupsEnabled: "My popups enabled", popupsDisabled: "My popups disabled", notification: "Notification", instruction: "Instruction", title: "Title", recurrence: "Recurrence", recipients: "Recipients", allEmployees: "All employees", personSelected: "1 person selected", peopleSelected: "{count} people selected", selected: "Selected", noEmployees: "No employees available.", recipientsHint: "Without a selection, the message is sent to all employees.", publishing: "Publishing...", publish: "Publish", active: "Active", inactive: "Inactive", createdBy: "Created by", unknown: "Unknown", deactivate: "Deactivate", activate: "Activate", delete: "Delete", empty: "No notifications have been created yet." },
} as const;

export default function JarvisNotifications() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];
  const locale = LANGUAGE_TO_LOCALE[language];
  const recurrenceLabels = RECURRENCE_LABELS[language];
  const [items, setItems] = useState<Notification[]>([]);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipientIds, setSelectedRecipientIds] = useState<number[]>([]);
  const [recipientMenuOpen, setRecipientMenuOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [recurrence, setRecurrence] = useState<Notification["recurrence"]>("once");
  const [notificationKind, setNotificationKind] = useState<Notification["notification_kind"]>("notification");
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [error, setError] = useState("");
  const [extensionConnected, setExtensionConnected] = useState(false);

  const loadWorkspace = useCallback(async () => {
    const { data } = await api.get("/jarvis-notifications/bootstrap");
    setItems(Array.isArray(data?.notifications) ? data.notifications : []);
    setRecipients(Array.isArray(data?.recipients) ? data.recipients : []);
    setEnabled(data?.enabled !== false);
  }, []);

  useEffect(() => {
    void loadWorkspace().catch((requestError: any) => {
      setError(copy.loadFailed);
    });
  }, [copy.loadFailed, loadWorkspace]);

  const postToExtension = useCallback((type: string, payload: Record<string, unknown> = {}) => {
    if (window.parent === window) return false;
    window.parent.postMessage({ type, ...payload }, "*");
    return true;
  }, []);

  useEffect(() => {
    const requestId = `notification-ping-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let timeout = 0;
    const onMessage = (event: MessageEvent) => {
      if (event.source !== window.parent || event.data?.type !== "ODIN_GO_EXTENSION_PONG" || event.data?.requestId !== requestId) return;
      window.clearTimeout(timeout);
      setExtensionConnected(true);
    };
    window.addEventListener("message", onMessage);
    postToExtension("ODIN_GO_EXTENSION_PING", { requestId });
    timeout = window.setTimeout(() => setExtensionConnected(false), 1_500);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
    };
  }, [postToExtension]);

  const selectedRecipients = useMemo(
    () => recipients.filter((recipient) => selectedRecipientIds.includes(recipient.id)),
    [recipients, selectedRecipientIds],
  );

  const recipientButtonLabel = selectedRecipientIds.length === 0
    ? copy.allEmployees
    : selectedRecipientIds.length === 1
      ? selectedRecipients[0]?.displayName || copy.personSelected
      : copy.peopleSelected.replace("{count}", String(selectedRecipientIds.length));

  const togglePersonalNotifications = async () => {
    const next = !enabled;
    setEnabled(next);
    try {
      await api.put("/jarvis-notifications/preferences", { enabled: next });
      postToExtension("ODIN_GO_NOTIFICATIONS_CHANGED");
    } catch {
      setEnabled(!next);
    }
  };

  const toggleRecipient = (id: number) => {
    setSelectedRecipientIds((current) => {
      if (current.length === 0) return [id];
      return current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id];
    });
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/jarvis-notifications", {
        title,
        body,
        recurrence,
        notificationKind,
        recipientUserIds: selectedRecipientIds,
      });
      const created = data?.notification as Notification | undefined;
      if (created) {
        setItems((current) => [{ ...created, recipients: [...selectedRecipients] }, ...current]);
      }
      setTitle("");
      setBody("");
      setRecurrence("once");
      setNotificationKind("notification");
      setSelectedRecipientIds([]);
      setRecipientMenuOpen(false);
      postToExtension("ODIN_GO_NOTIFICATIONS_CHANGED");
    } catch (requestError: any) {
      setError(copy.createFailed);
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (item: Notification) => {
    setActionId(item.id);
    setError("");
    try {
      const { data } = await api.patch(`/jarvis-notifications/${item.id}`, { active: !item.active });
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, ...data.notification, recipients: entry.recipients }
        : entry));
      postToExtension("ODIN_GO_NOTIFICATIONS_CHANGED");
    } catch (requestError: any) {
      setError(copy.updateFailed);
    } finally {
      setActionId(null);
    }
  };

  const remove = async (item: Notification) => {
    if (!window.confirm(copy.deleteConfirm.replace("{title}", item.title))) return;
    setActionId(item.id);
    setError("");
    try {
      await api.delete(`/jarvis-notifications/${item.id}`);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      postToExtension("ODIN_GO_NOTIFICATIONS_CHANGED");
    } catch (requestError: any) {
      setError(copy.deleteFailed);
    } finally {
      setActionId(null);
    }
  };

  const showTestPopup = () => {
    setError("");
    if (!extensionConnected) {
      setError(copy.testExtensionRequired);
      return;
    }
    const sent = postToExtension("ODIN_GO_NOTIFICATION_PREVIEW", {
      notification: {
        id: -Date.now(),
        title: title.trim() || copy.testTitle,
        body: body.trim() || copy.testBody,
        notification_kind: notificationKind,
        recurrence,
        created_by: user.displayName || copy.currentUser,
        created_at: new Date().toISOString(),
        preview: true,
      },
    });
    if (!sent) setError(copy.testJarvisRequired);
  };

  return (
    <div className="min-h-full space-y-6 bg-slate-950 p-6 text-slate-100">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-bold">{copy.heading}</h1>
            <p className="mt-1 text-sm text-slate-400">{copy.subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold ${extensionConnected ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : "border-slate-700 bg-slate-950 text-slate-400"}`}>
            <Radio className="h-3.5 w-3.5" />{extensionConnected ? copy.connected : copy.outsideJarvis}
          </span>
          <button type="button" onClick={showTestPopup} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-700">
            <FlaskConical className="h-4 w-4" /> {copy.testPopup}
          </button>
          <button type="button" onClick={() => void togglePersonalNotifications()} className={`rounded-lg border px-4 py-2 text-sm font-semibold ${enabled ? "border-blue-500 bg-blue-600 text-white" : "border-slate-600 bg-slate-800 text-slate-300"}`}>
            {enabled ? copy.popupsEnabled : copy.popupsDisabled}
          </button>
        </div>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm text-red-200">{error}</div> : null}

      <form onSubmit={create} className={`space-y-3 rounded-xl border p-5 ${notificationKind === "instruction" ? "border-red-500/70 bg-red-950/15 shadow-[0_0_24px_rgba(239,68,68,0.14)]" : "border-slate-700 bg-slate-900"}`}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => setNotificationKind("notification")} className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${notificationKind === "notification" ? "border-blue-500 bg-blue-600 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>{copy.notification}</button>
          <button type="button" onClick={() => setNotificationKind("instruction")} className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold ${notificationKind === "instruction" ? "border-red-500 bg-red-600 text-white" : "border-slate-700 bg-slate-950 text-slate-300"}`}>{copy.instruction}</button>
        </div>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.title} className="w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2" />
        <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={notificationKind === "instruction" ? copy.instruction : copy.notification} className="min-h-24 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2" />

        <div className="grid gap-3 lg:grid-cols-[220px_minmax(260px,1fr)_auto] lg:items-start">
          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            {copy.recurrence}
            <select value={recurrence} onChange={(event) => setRecurrence(event.target.value as Notification["recurrence"])} className="block w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-sm text-slate-100">
              {Object.entries(recurrenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <div className="relative space-y-1.5">
            <div className="text-xs font-semibold text-slate-300">{copy.recipients}</div>
            <button type="button" onClick={() => setRecipientMenuOpen((open) => !open)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-left text-sm text-slate-100">
              <span className="flex min-w-0 items-center gap-2"><Users className="h-4 w-4 shrink-0 text-blue-400" /><span className="truncate">{recipientButtonLabel}</span></span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition ${recipientMenuOpen ? "rotate-180" : ""}`} />
            </button>
            {recipientMenuOpen ? (
              <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-600 bg-slate-950 p-2 shadow-2xl">
                <button type="button" onClick={() => setSelectedRecipientIds([])} className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${selectedRecipientIds.length === 0 ? "bg-blue-600 text-white" : "text-slate-200 hover:bg-slate-800"}`}>
                  <span>{copy.allEmployees}</span><span className="text-xs">{selectedRecipientIds.length === 0 ? copy.selected : ""}</span>
                </button>
                <div className="my-1 h-px bg-slate-700" />
                {recipients.map((recipient) => {
                  const checked = selectedRecipientIds.includes(recipient.id);
                  return (
                    <label key={recipient.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 hover:bg-slate-800">
                      <input type="checkbox" checked={checked} onChange={() => toggleRecipient(recipient.id)} className="mt-0.5 h-4 w-4 accent-blue-500" />
                      <span className="min-w-0"><span className="block truncate text-sm text-slate-100">{recipient.displayName}</span>{recipient.email ? <span className="block truncate text-[10px] text-slate-500">{recipient.email}</span> : null}</span>
                    </label>
                  );
                })}
                {!recipients.length ? <p className="px-3 py-2 text-sm text-slate-500">{copy.noEmployees}</p> : null}
              </div>
            ) : null}
            <p className="text-[11px] text-slate-500">{copy.recipientsHint}</p>
          </div>

          <button disabled={saving} className={`mt-5 inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-50 ${notificationKind === "instruction" ? "bg-red-600 hover:bg-red-500" : "bg-blue-600 hover:bg-blue-500"}`}>
            <Plus className="h-4 w-4" /> {saving ? copy.publishing : copy.publish}
          </button>
        </div>
      </form>

      <div className="space-y-3">
        {items.map((item) => {
          const targetLabel = item.recipients?.length
            ? item.recipients.map((recipient) => recipient.displayName).join(", ")
            : copy.allEmployees;
          return (
            <article key={item.id} className={`flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-start lg:justify-between ${!item.active ? "border-slate-800 bg-slate-950 opacity-65" : item.notification_kind === "instruction" ? "border-red-500/70 bg-red-950/15 shadow-[0_0_22px_rgba(239,68,68,0.14)]" : "border-slate-700 bg-slate-900"}`}>
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${item.notification_kind === "instruction" ? "bg-red-500/20 text-red-300" : "bg-blue-500/20 text-blue-300"}`}>{item.notification_kind === "instruction" ? copy.instruction : copy.notification}</span>
                  <span className="text-xs text-slate-400">{recurrenceLabels[item.recurrence]}</span>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${item.active ? "bg-emerald-500/15 text-emerald-300" : "bg-slate-700 text-slate-300"}`}>{item.active ? copy.active : copy.inactive}</span>
                </div>
                <h2 className="font-semibold">{item.title}</h2>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{item.body}</p>
                <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400"><Users className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span>{copy.recipients}: {targetLabel}</span></p>
                <p className="mt-1 text-xs text-slate-500">{copy.createdBy} {item.created_by || copy.unknown} · {new Date(item.created_at).toLocaleString(locale)}</p>
              </div>
              {user.isAdmin ? (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button disabled={actionId === item.id} onClick={() => void toggle(item)} className="inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-50">
                    {item.active ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}{item.active ? copy.deactivate : copy.activate}
                  </button>
                  <button disabled={actionId === item.id} onClick={() => void remove(item)} className="inline-flex items-center gap-2 rounded-lg border border-red-500/40 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-900/60 disabled:opacity-50">
                    <Trash2 className="h-4 w-4" /> {copy.delete}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {!items.length && <p className="text-sm text-slate-500">{copy.empty}</p>}
      </div>
    </div>
  );
}
