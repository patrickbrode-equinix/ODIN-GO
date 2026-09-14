import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, ClipboardList, Pencil, Plus, Save, Ticket, Trash2, UserRound, X } from "lucide-react";
import { api } from "../../api/api";
import { LANGUAGE_TO_LOCALE, useLanguage } from "../../context/LanguageContext";

type Team = "frost" | "tfm" | "other";
type Status = "open" | "closed";
type Entry = { id: number; team: Team; ticketNumber: string; customerName: string; notes: string; status: Status; createdByName: string; createdAt: string; updatedByName?: string; updatedAt?: string | null };

const LABELS = {
  de: { title: "Fremdteam-Übergaben", subtitle: "Tickets für FROST, TFM und andere Teams zentral dokumentieren und nachverfolgen.", create: "Neuen Eintrag erfassen", team: "Zielteam", ticket: "Ticketnummer", customer: "Kundenname", notes: "Beschreibung und aktueller Stand", status: "Status", open: "Offen", closed: "Geschlossen", save: "Speichern", update: "Änderungen speichern", cancel: "Abbrechen", all: "Alle Teams", allStatus: "Alle Status", noEntries: "Keine passenden Fremdteam-Übergaben vorhanden.", created: "Erstellt von", updated: "Aktualisiert", edit: "Bearbeiten", remove: "Löschen", deleteConfirm: "Diesen Fremdteam-Eintrag wirklich löschen?", loadFailed: "Fremdteam-Übergaben konnten nicht geladen werden.", saveFailed: "Der Eintrag konnte nicht gespeichert werden." },
  en: { title: "Other Team Handovers", subtitle: "Document and track tickets for FROST, TFM, and other teams centrally.", create: "Record new entry", team: "Target team", ticket: "Ticket number", customer: "Customer name", notes: "Description and current status", status: "Status", open: "Open", closed: "Closed", save: "Save", update: "Save changes", cancel: "Cancel", all: "All teams", allStatus: "All statuses", noEntries: "No matching other-team handovers found.", created: "Created by", updated: "Updated", edit: "Edit", remove: "Delete", deleteConfirm: "Delete this other-team entry?", loadFailed: "Other-team handovers could not be loaded.", saveFailed: "The entry could not be saved." },
} as const;

const TEAM_LABELS: Record<"de" | "en", Record<Team, string>> = { de: { frost: "FROST", tfm: "TFM", other: "Andere" }, en: { frost: "FROST", tfm: "TFM", other: "Other" } };
const teamStyle: Record<Team, string> = { frost: "border-cyan-400/35 bg-cyan-400/10 text-cyan-100", tfm: "border-amber-400/35 bg-amber-400/10 text-amber-100", other: "border-violet-400/35 bg-violet-400/10 text-violet-100" };

export default function TeamHandovers() {
  const { language } = useLanguage();
  const copy = LABELS[language];
  const locale = LANGUAGE_TO_LOCALE[language];
  const teams = TEAM_LABELS[language];
  const [entries, setEntries] = useState<Entry[]>([]);
  const [team, setTeam] = useState<Team>("frost");
  const [ticketNumber, setTicketNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<Status>("open");
  const [filterTeam, setFilterTeam] = useState<"all" | Team>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | Status>("open");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try { const { data } = await api.get("/team-handovers"); setEntries(Array.isArray(data?.handovers) ? data.handovers : []); }
    catch { setError(copy.loadFailed); }
  }, [copy.loadFailed]);
  useEffect(() => { void load(); }, [load]);

  const visibleEntries = useMemo(() => entries.filter((entry) => (filterTeam === "all" || entry.team === filterTeam) && (filterStatus === "all" || entry.status === filterStatus)), [entries, filterStatus, filterTeam]);
  const reset = () => { setEditingId(null); setTeam("frost"); setTicketNumber(""); setCustomerName(""); setNotes(""); setStatus("open"); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    const payload = { team, ticketNumber, customerName, notes, status };
    try {
      const { data } = editingId ? await api.put(`/team-handovers/${editingId}`, payload) : await api.post("/team-handovers", payload);
      setEntries((current) => editingId ? current.map((entry) => entry.id === editingId ? data.handover : entry) : [data.handover, ...current]);
      setMessage(editingId ? copy.update : copy.save); reset();
    } catch (caught: any) { setError(caught?.response?.data?.message || copy.saveFailed); }
    finally { setSaving(false); }
  };
  const edit = (entry: Entry) => { setEditingId(entry.id); setTeam(entry.team); setTicketNumber(entry.ticketNumber); setCustomerName(entry.customerName); setNotes(entry.notes); setStatus(entry.status); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const remove = async (entry: Entry) => { if (!window.confirm(copy.deleteConfirm)) return; try { await api.delete(`/team-handovers/${entry.id}`); setEntries((current) => current.filter((item) => item.id !== entry.id)); } catch { setError(copy.saveFailed); } };

  return <div className="min-h-full space-y-6 bg-slate-950 p-6 text-slate-100">
    <header className="rounded-2xl border border-cyan-400/25 bg-gradient-to-r from-slate-900 to-cyan-950/25 p-6"><div className="flex items-center gap-3"><div className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3"><ClipboardList className="h-6 w-6 text-cyan-200" /></div><div><h1 className="text-2xl font-bold">{copy.title}</h1><p className="mt-1 text-sm text-slate-400">{copy.subtitle}</p></div></div></header>
    {error ? <div className="rounded-xl border border-red-400/40 bg-red-950/30 px-4 py-3 text-sm text-red-100">{error}</div> : null}{message ? <div className="rounded-xl border border-emerald-400/35 bg-emerald-950/25 px-4 py-3 text-sm text-emerald-100">{message}</div> : null}
    <form onSubmit={submit} className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="mb-5 flex items-center gap-2"><Plus className="h-5 w-5 text-cyan-300" /><h2 className="font-semibold">{editingId ? copy.update : copy.create}</h2></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-semibold text-slate-300">{copy.team}<select value={team} onChange={(event) => setTeam(event.target.value as Team)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm">{Object.entries(teams).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-xs font-semibold text-slate-300">{copy.ticket}<input required value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-300">{copy.customer}<input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm" /></label><label className="text-xs font-semibold text-slate-300">{copy.status}<select value={status} onChange={(event) => setStatus(event.target.value as Status)} className="mt-1 block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm"><option value="open">{copy.open}</option><option value="closed">{copy.closed}</option></select></label></div><label className="mt-4 block text-xs font-semibold text-slate-300">{copy.notes}<textarea required value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 min-h-28 w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm leading-6" /></label><div className="mt-4 flex justify-end gap-2">{editingId ? <button type="button" onClick={reset} className="rounded-lg border border-slate-600 px-4 py-2 text-sm"><X className="mr-1 inline h-4 w-4" />{copy.cancel}</button> : null}<button disabled={saving} className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 disabled:opacity-60"><Save className="mr-1 inline h-4 w-4" />{saving ? "…" : editingId ? copy.update : copy.save}</button></div></form>
    <section className="rounded-2xl border border-slate-700 bg-slate-900 p-5"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4"><h2 className="font-semibold">{copy.title}</h2><div className="flex gap-2"><select value={filterTeam} onChange={(event) => setFilterTeam(event.target.value as "all" | Team)} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs"><option value="all">{copy.all}</option>{Object.entries(teams).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as "all" | Status)} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs"><option value="all">{copy.allStatus}</option><option value="open">{copy.open}</option><option value="closed">{copy.closed}</option></select></div></div><div className="mt-4 grid gap-3 xl:grid-cols-2">{visibleEntries.map((entry) => <article key={entry.id} className={`rounded-xl border p-4 ${entry.status === "closed" ? "border-slate-700 bg-slate-950/50 opacity-75" : teamStyle[entry.team]}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-md border px-2 py-1 text-xs font-bold ${teamStyle[entry.team]}`}>{teams[entry.team]}</span><span className={`rounded-md px-2 py-1 text-xs font-semibold ${entry.status === "open" ? "bg-amber-400/15 text-amber-200" : "bg-emerald-400/15 text-emerald-200"}`}>{entry.status === "open" ? copy.open : copy.closed}</span></div><div className="flex gap-2"><button type="button" onClick={() => edit(entry)} className="rounded-md border border-slate-600 p-1.5 text-slate-200"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => void remove(entry)} className="rounded-md border border-red-400/35 p-1.5 text-red-200"><Trash2 className="h-3.5 w-3.5" /></button></div></div><div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm"><div><span className="text-xs text-slate-500"><Ticket className="mr-1 inline h-3 w-3" />{copy.ticket}</span><div className="font-semibold">{entry.ticketNumber}</div></div><div><span className="text-xs text-slate-500"><Building2 className="mr-1 inline h-3 w-3" />{copy.customer}</span><div className="font-semibold">{entry.customerName}</div></div></div><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{entry.notes}</p><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-800 pt-3 text-[11px] text-slate-500"><span><UserRound className="mr-1 inline h-3.5 w-3.5" />{copy.created}: {entry.createdByName}</span><span>{new Date(entry.createdAt).toLocaleString(locale)}</span>{entry.updatedAt ? <span><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />{copy.updated}: {new Date(entry.updatedAt).toLocaleString(locale)}{entry.updatedByName ? ` · ${entry.updatedByName}` : ""}</span> : null}</div></article>)}{visibleEntries.length === 0 ? <div className="col-span-full rounded-xl border border-dashed border-slate-700 px-4 py-10 text-center text-sm text-slate-500">{copy.noEntries}</div> : null}</div></section>
  </div>;
}
