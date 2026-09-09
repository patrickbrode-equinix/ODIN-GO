import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowRight,
  ArrowRightLeft,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileText,
  History,
  RefreshCw,
  Save,
  Ticket,
  Trash2,
  UserRound,
} from "lucide-react";
import { api } from "../../api/api";
import { useAuth } from "../../context/AuthContext";
import { LANGUAGE_TO_LOCALE, useLanguage } from "../../context/LanguageContext";

type Direction = "early_to_late" | "late_to_night" | "night_to_early";
type Category = "general_information" | "incidents" | "cross_connect" | "trouble_ticket" | "smart_hand";

type ShiftHandoverEntry = {
  id: number;
  handoverAt: string;
  direction: Direction;
  category: Category;
  ticketNumber: string;
  customerName: string;
  notes: string;
  createdByName: string;
  createdAt: string;
};

const DIRECTION_LABELS: Record<"de" | "en", Record<Direction, string>> = {
  de: { early_to_late: "Früh → Spät", late_to_night: "Spät → Nacht", night_to_early: "Nacht → Früh" },
  en: { early_to_late: "Early → Late", late_to_night: "Late → Night", night_to_early: "Night → Early" },
};

const CATEGORY_LABELS: Record<"de" | "en", Record<Category, string>> = {
  de: { general_information: "Allgemeine Informationen", incidents: "Vorfälle", cross_connect: "Cross Connect", trouble_ticket: "Trouble Ticket", smart_hand: "Smart Hand" },
  en: { general_information: "General information", incidents: "Incidents", cross_connect: "Cross Connect", trouble_ticket: "Trouble ticket", smart_hand: "Smart Hands" },
};

const COPY = {
  de: {
    untitledDay: "Ohne gespeichertes Datum", loadFailed: "Die Schichtübergaben konnten nicht geladen werden.", saveSuccess: "Die Schichtübergabe wurde gespeichert und ist jetzt in der Historie sichtbar.", saveFailed: "Die Schichtübergabe konnte nicht gespeichert werden.", deleteConfirm: "Schichtübergabe vom {date} wirklich löschen?", deleteSuccess: "Die Schichtübergabe wurde gelöscht.", deleteFailed: "Die Schichtübergabe konnte nicht gelöscht werden.", title: "Schichtübergabe", subtitle: "Informationen und offene Arbeiten nachvollziehbar an die nächste Schicht übergeben.", newEntry: "Neue Übergabe erfassen", creatorHint: "Der Ersteller wird automatisch aus dem angemeldeten Jarvis-Profil übernommen.", dateTime: "Datum und Uhrzeit", direction: "Übergaberichtung", createdBy: "Erstellt von", profileMissing: "Jarvis-Profil nicht erkannt", category: "Kategorie der Übergabe", ticketNumber: "Ticketnummer", ticketPlaceholder: "z. B. 5-2630...", customer: "Kundenname", customerPlaceholder: "Name des Kunden", ticketNotes: "Notizen und aktueller Arbeitsstand", generalNotes: "Informationen und Beschreibung", ticketNotesPlaceholder: "Was wurde erledigt, was ist noch offen und was muss die nächste Schicht beachten?", generalNotesPlaceholder: "Informationen für die nächste Schicht eintragen...", saving: "Wird gespeichert...", save: "Schichtübergabe speichern", savedTitle: "Gespeicherte Schichtübergaben", savedSubtitle: "Nach dem Speichertag gruppiert, damit ältere Übergaben schnell auffindbar bleiben.", filter: "Historie nach Kategorie filtern", allCategories: "Alle Kategorien", refresh: "Historie aktualisieren", dayLabel: "Übergaben vom {date}", oneEntry: "Übergabe", manyEntries: "Übergaben", deleteTitle: "Schichtübergabe löschen", deleting: "Löscht...", delete: "Löschen", savedAt: "Gespeichert am", noEntries: "Noch keine Schichtübergaben in dieser Kategorie gespeichert.", loading: "Schichtübergaben werden geladen...",
  },
  en: {
    untitledDay: "No saved date", loadFailed: "Shift handovers could not be loaded.", saveSuccess: "The shift handover was saved and is now visible in the history.", saveFailed: "The shift handover could not be saved.", deleteConfirm: "Delete the shift handover from {date}?", deleteSuccess: "The shift handover was deleted.", deleteFailed: "The shift handover could not be deleted.", title: "Shift Handover", subtitle: "Hand over information and open work to the next shift with a complete audit trail.", newEntry: "Record new handover", creatorHint: "The creator is taken automatically from the signed-in Jarvis profile.", dateTime: "Date and time", direction: "Handover direction", createdBy: "Created by", profileMissing: "Jarvis profile not detected", category: "Handover category", ticketNumber: "Ticket number", ticketPlaceholder: "e.g. 5-2630...", customer: "Customer name", customerPlaceholder: "Customer name", ticketNotes: "Notes and current work status", generalNotes: "Information and description", ticketNotesPlaceholder: "What was completed, what remains open, and what should the next shift know?", generalNotesPlaceholder: "Enter information for the next shift...", saving: "Saving...", save: "Save shift handover", savedTitle: "Saved shift handovers", savedSubtitle: "Grouped by saved date so older handovers remain easy to find.", filter: "Filter history by category", allCategories: "All categories", refresh: "Refresh history", dayLabel: "Handovers from {date}", oneEntry: "handover", manyEntries: "handovers", deleteTitle: "Delete shift handover", deleting: "Deleting...", delete: "Delete", savedAt: "Saved on", noEntries: "No shift handovers have been saved in this category.", loading: "Loading shift handovers...",
  },
} as const;

const TICKET_CATEGORIES = new Set<Category>(["cross_connect", "trouble_ticket", "smart_hand"]);

function nowForInput() {
  const date = new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function categoryStyle(category: Category) {
  if (category === "incidents") return "border-red-500/35 bg-red-500/10 text-red-200";
  if (category === "cross_connect") return "border-cyan-500/35 bg-cyan-500/10 text-cyan-200";
  if (category === "trouble_ticket") return "border-amber-500/35 bg-amber-500/10 text-amber-200";
  if (category === "smart_hand") return "border-violet-500/35 bg-violet-500/10 text-violet-200";
  return "border-slate-600 bg-slate-800 text-slate-200";
}

function creationDay(entry: ShiftHandoverEntry) {
  const date = new Date(entry.createdAt);
  return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleDateString("sv-SE");
}

function formatCreationDay(day: string, locale: string, untitledDay: string) {
  if (day === "unknown") return untitledDay;
  return new Date(`${day}T12:00:00`).toLocaleDateString(locale, {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function ShiftHandover() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language];
  const locale = LANGUAGE_TO_LOCALE[language];
  const directions = DIRECTION_LABELS[language];
  const categories = CATEGORY_LABELS[language];
  const [handoverAt, setHandoverAt] = useState(nowForInput);
  const [direction, setDirection] = useState<Direction>("early_to_late");
  const [category, setCategory] = useState<Category>("general_information");
  const [ticketNumber, setTicketNumber] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [notes, setNotes] = useState("");
  const [entries, setEntries] = useState<ShiftHandoverEntry[]>([]);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const isTicketCategory = TICKET_CATEGORIES.has(category);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/shift-handovers");
      setEntries(Array.isArray(data?.handovers) ? data.handovers : []);
    } catch (requestError: any) {
      setError(copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const visibleEntries = useMemo(
    () => filter === "all" ? entries : entries.filter((entry) => entry.category === filter),
    [entries, filter],
  );

  const entriesByCreationDay = useMemo(() => {
    const groups = new Map<string, ShiftHandoverEntry[]>();
    visibleEntries.forEach((entry) => {
      const day = creationDay(entry);
      groups.set(day, [...(groups.get(day) || []), entry]);
    });
    return [...groups.entries()].sort(([left], [right]) => right.localeCompare(left));
  }, [visibleEntries]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const { data } = await api.post("/shift-handovers", {
        handoverAt: new Date(handoverAt).toISOString(),
        direction,
        category,
        ticketNumber,
        customerName,
        notes,
      });
      if (data?.handover) setEntries((current) => [data.handover, ...current]);
      setHandoverAt(nowForInput());
      setTicketNumber("");
      setCustomerName("");
      setNotes("");
      setSuccess(copy.saveSuccess);
    } catch (requestError: any) {
      setError(copy.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const deleteEntry = async (entry: ShiftHandoverEntry) => {
    if (!window.confirm(copy.deleteConfirm.replace("{date}", new Date(entry.createdAt).toLocaleString(locale)))) return;

    setDeletingId(entry.id);
    setError("");
    setSuccess("");
    try {
      await api.delete(`/shift-handovers/${entry.id}`);
      setEntries((current) => current.filter((currentEntry) => currentEntry.id !== entry.id));
      setSuccess(copy.deleteSuccess);
    } catch (requestError: any) {
      setError(copy.deleteFailed);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="min-h-full space-y-6 bg-slate-950 p-6 text-slate-100">
      <header className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2.5"><ArrowRightLeft className="h-6 w-6 text-blue-300" /></div>
          <div>
            <h1 className="text-2xl font-bold">{copy.title}</h1>
            <p className="mt-1 text-sm text-slate-400">{copy.subtitle}</p>
          </div>
        </div>
      </header>

      {error ? <div role="alert" className="rounded-lg border border-red-500/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {success ? <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <form onSubmit={submit} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="mb-5 flex items-center gap-2 border-b border-slate-700 pb-4">
          <ClipboardCheck className="h-5 w-5 text-blue-300" />
          <div>
            <h2 className="font-semibold">{copy.newEntry}</h2>
            <p className="text-xs text-slate-500">{copy.creatorHint}</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />{copy.dateTime}</span>
            <input required type="datetime-local" value={handoverAt} onChange={(event) => setHandoverAt(event.target.value)} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 [color-scheme:dark]" />
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3.5 w-3.5" />{copy.direction}</span>
            <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100">
              {Object.entries(directions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{copy.createdBy}</span>
            <input readOnly value={user.displayName || copy.profileMissing} className="block w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-300" />
          </label>
        </div>

        <label className="mt-4 block space-y-1.5 text-xs font-semibold text-slate-300">
          {copy.category}
          <select value={category} onChange={(event) => { setCategory(event.target.value as Category); setTicketNumber(""); setCustomerName(""); }} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100">
            {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        {isTicketCategory ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" />{copy.ticketNumber}</span>
              <input required value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder={copy.ticketPlaceholder} maxLength={120} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{copy.customer}</span>
              <input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder={copy.customerPlaceholder} maxLength={240} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" />
            </label>
          </div>
        ) : null}

        <label className="mt-4 block space-y-1.5 text-xs font-semibold text-slate-300">
          <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{isTicketCategory ? copy.ticketNotes : copy.generalNotes}</span>
          <textarea required value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={8000} placeholder={isTicketCategory ? copy.ticketNotesPlaceholder : copy.generalNotesPlaceholder} className="min-h-32 w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm leading-6 text-slate-100" />
        </label>

        <div className="mt-4 flex justify-end">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">
            <Save className="h-4 w-4" />{saving ? copy.saving : copy.save}
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-300" />
            <div><h2 className="font-semibold">{copy.savedTitle}</h2><p className="text-xs text-slate-500">{copy.savedSubtitle}</p></div>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label={copy.filter} value={filter} onChange={(event) => setFilter(event.target.value as "all" | Category)} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="all">{copy.allCategories}</option>
              {Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" onClick={() => void loadEntries()} className="rounded-lg border border-slate-600 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700" title={copy.refresh}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>

        <div className="mt-4 space-y-6">
          {entriesByCreationDay.map(([day, dayEntries]) => (
            <section key={day} aria-label={copy.dayLabel.replace("{date}", formatCreationDay(day, locale, copy.untitledDay))}>
              <div className="mb-3 flex items-center justify-between gap-3 border-b border-slate-700 pb-2">
                <h3 className="text-sm font-semibold text-slate-200">{formatCreationDay(day, locale, copy.untitledDay)}</h3>
                <span className="rounded-full border border-slate-600 bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-slate-300">{dayEntries.length} {dayEntries.length === 1 ? copy.oneEntry : copy.manyEntries}</span>
              </div>
              <div className="space-y-3">
                {dayEntries.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-slate-700 bg-slate-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-200">{directions[entry.direction]}</span>
                  <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${categoryStyle(entry.category)}`}>{categories[entry.category]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <time className="text-xs tabular-nums text-slate-400">{new Date(entry.handoverAt).toLocaleString(locale)}</time>
                  <button type="button" onClick={() => void deleteEntry(entry)} disabled={deletingId === entry.id} className="inline-flex items-center gap-1.5 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/20 disabled:cursor-wait disabled:opacity-60" title={copy.deleteTitle}>
                    <Trash2 className="h-3.5 w-3.5" />{deletingId === entry.id ? copy.deleting : copy.delete}
                  </button>
                </div>
              </div>

              {TICKET_CATEGORIES.has(entry.category) ? (
                <div className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm sm:grid-cols-2">
                  <div><span className="text-xs text-slate-500">{copy.ticketNumber}</span><div className="mt-0.5 font-semibold text-slate-100">{entry.ticketNumber}</div></div>
                  <div><span className="text-xs text-slate-500">{copy.customer}</span><div className="mt-0.5 font-semibold text-slate-100">{entry.customerName}</div></div>
                </div>
              ) : null}

              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{entry.notes}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />{copy.createdBy} {entry.createdByName}</span>
                <span>{copy.savedAt} {new Date(entry.createdAt).toLocaleString(locale)}</span>
              </div>
            </article>
                ))}
              </div>
            </section>
          ))}
          {!loading && visibleEntries.length === 0 ? <div className="rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">{copy.noEntries}</div> : null}
          {loading && entries.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">{copy.loading}</div> : null}
        </div>
      </section>
    </div>
  );
}
