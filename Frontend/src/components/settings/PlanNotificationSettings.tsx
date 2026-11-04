/* Admin settings: notifications about shift plan changes and sick absences (existing notification system). */

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { api } from "../../api/api";

interface Recipient { id: number; displayName: string; email?: string | null }

interface Props {
  enabled: boolean;
  adminIds: number[];
  isGerman: boolean;
  onChange: (next: { enabled: boolean; adminIds: number[] }) => void;
}

export function PlanNotificationSettings({ enabled, adminIds, isGerman, onChange }: Props) {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    let cancelled = false;
    api.get("/jarvis-notifications/recipients")
      .then((response) => { if (!cancelled) setRecipients(Array.isArray(response.data?.recipients) ? response.data.recipients : []); })
      .catch(() => { if (!cancelled) setRecipients([]); });
    return () => { cancelled = true; };
  }, []);

  const toggleAdmin = (id: number) => onChange({ enabled, adminIds: adminIds.includes(id) ? adminIds.filter((entry) => entry !== id) : [...adminIds, id] });
  const shown = recipients.filter((recipient) => recipient.displayName.toLocaleLowerCase("de").includes(filter.trim().toLocaleLowerCase("de")));

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/55 px-4 py-3 text-sm text-slate-200">
      <label className="flex items-start gap-3">
        <input type="checkbox" checked={enabled} onChange={(event) => onChange({ enabled: event.target.checked, adminIds })} className="mt-1 rounded border-white/20 bg-slate-950" />
        <span>
          <span className="flex items-center gap-2 font-medium"><Bell className="h-4 w-4 text-indigo-300" />{isGerman ? "Mitteilungen bei Dienstplan-Änderungen und Krankmeldungen" : "Notifications for plan changes and sick leave"}</span>
          <span className="mt-1 block text-xs text-slate-400">
            {isGerman
              ? "Wird im Dienstplan etwas geändert (Schicht gesetzt, getauscht, Plan übernommen), bekommt die betroffene Person eine Notification, die Admins eine Zusammenfassung. Wird jemand krank bzw. als abwesend (krank) geplant, erhalten die Admins eine Anweisung. Die Notifications erscheinen im eigenen ODIN-GO-Fenster."
              : "When the plan changes (shift set, swapped, plan activated) the person concerned gets a notification and the admins a summary. Sick leave goes to the admins as an instruction. Notifications open in the ODIN GO window."}
          </span>
        </span>
      </label>
      <div className={`mt-3 pl-7 ${enabled ? "" : "pointer-events-none opacity-50"}`}>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-slate-300">
          <span className="font-semibold">{isGerman ? "Admin-Empfänger" : "Admin recipients"}</span>
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={isGerman ? "Person suchen …" : "Search person …"} className="h-8 w-52 rounded-lg border border-white/10 bg-slate-950/70 px-2 text-sm text-slate-100" />
          <span className="text-slate-500">{adminIds.length === 0 ? (isGerman ? "Ohne Auswahl erhält der Planverantwortliche (Patrick Brode) die Meldungen." : "Without a selection the plan owner (Patrick Brode) receives them.") : `${adminIds.length} ${isGerman ? "ausgewählt" : "selected"}`}</span>
        </div>
        <div className="grid max-h-44 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((recipient) => (
            <label key={recipient.id} className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs hover:bg-white/5">
              <input type="checkbox" checked={adminIds.includes(recipient.id)} onChange={() => toggleAdmin(recipient.id)} className="rounded border-white/20 bg-slate-950" />
              <span className="truncate">{recipient.displayName}</span>
            </label>
          ))}
          {shown.length === 0 ? <span className="text-xs text-slate-500">{isGerman ? "Keine Personen gefunden." : "No people found."}</span> : null}
        </div>
      </div>
    </div>
  );
}
