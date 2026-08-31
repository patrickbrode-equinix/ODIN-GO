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
  UserRound,
} from "lucide-react";
import { api } from "../../api/api";
import { useAuth } from "../../context/AuthContext";

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

const DIRECTION_LABELS: Record<Direction, string> = {
  early_to_late: "Früh → Spät",
  late_to_night: "Spät → Nacht",
  night_to_early: "Nacht → Früh",
};

const CATEGORY_LABELS: Record<Category, string> = {
  general_information: "Generelle Informationen",
  incidents: "Incidents",
  cross_connect: "Cross Connect",
  trouble_ticket: "Trouble Ticket",
  smart_hand: "Smart Hand",
};

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

export default function ShiftHandover() {
  const { user } = useAuth();
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
      setError(requestError?.response?.data?.message || "Die Schichtübergaben konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const visibleEntries = useMemo(
    () => filter === "all" ? entries : entries.filter((entry) => entry.category === filter),
    [entries, filter],
  );

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
      setSuccess("Die Schichtübergabe wurde gespeichert und ist jetzt in der Historie sichtbar.");
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || "Die Schichtübergabe konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-full space-y-6 bg-slate-950 p-6 text-slate-100">
      <header className="rounded-xl border border-slate-700 bg-slate-900 p-6">
        <div className="flex items-center gap-3">
          <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-2.5"><ArrowRightLeft className="h-6 w-6 text-blue-300" /></div>
          <div>
            <h1 className="text-2xl font-bold">Schichtübergabe</h1>
            <p className="mt-1 text-sm text-slate-400">Informationen und offene Arbeiten nachvollziehbar an die nächste Schicht übergeben.</p>
          </div>
        </div>
      </header>

      {error ? <div role="alert" className="rounded-lg border border-red-500/50 bg-red-950/30 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {success ? <div role="status" className="rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-200">{success}</div> : null}

      <form onSubmit={submit} className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="mb-5 flex items-center gap-2 border-b border-slate-700 pb-4">
          <ClipboardCheck className="h-5 w-5 text-blue-300" />
          <div>
            <h2 className="font-semibold">Neue Übergabe erfassen</h2>
            <p className="text-xs text-slate-500">Der Ersteller wird automatisch aus dem angemeldeten Jarvis-Profil übernommen.</p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5" />Datum und Uhrzeit</span>
            <input required type="datetime-local" value={handoverAt} onChange={(event) => setHandoverAt(event.target.value)} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 [color-scheme:dark]" />
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5"><ArrowRight className="h-3.5 w-3.5" />Übergaberichtung</span>
            <select value={direction} onChange={(event) => setDirection(event.target.value as Direction)} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100">
              {Object.entries(DIRECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="space-y-1.5 text-xs font-semibold text-slate-300">
            <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />Erstellt von</span>
            <input readOnly value={user.displayName || "Jarvis-Profil nicht erkannt"} className="block w-full cursor-not-allowed rounded-lg border border-slate-700 bg-slate-800 px-3 py-2.5 text-sm text-slate-300" />
          </label>
        </div>

        <label className="mt-4 block space-y-1.5 text-xs font-semibold text-slate-300">
          Kategorie der Übergabe
          <select value={category} onChange={(event) => { setCategory(event.target.value as Category); setTicketNumber(""); setCustomerName(""); }} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100">
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>

        {isTicketCategory ? (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5"><Ticket className="h-3.5 w-3.5" />Ticketnummer</span>
              <input required value={ticketNumber} onChange={(event) => setTicketNumber(event.target.value)} placeholder="z. B. 5-2630..." maxLength={120} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-slate-300">
              <span className="flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Kundenname</span>
              <input required value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Name des Kunden" maxLength={240} className="block w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm text-slate-100" />
            </label>
          </div>
        ) : null}

        <label className="mt-4 block space-y-1.5 text-xs font-semibold text-slate-300">
          <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" />{isTicketCategory ? "Notizen und aktueller Arbeitsstand" : "Informationen und Beschreibung"}</span>
          <textarea required value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={8000} placeholder={isTicketCategory ? "Was wurde erledigt, was ist noch offen und was muss die nächste Schicht beachten?" : "Informationen für die nächste Schicht eintragen..."} className="min-h-32 w-full resize-y rounded-lg border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm leading-6 text-slate-100" />
        </label>

        <div className="mt-4 flex justify-end">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-wait disabled:opacity-60">
            <Save className="h-4 w-4" />{saving ? "Wird gespeichert..." : "Schichtübergabe speichern"}
          </button>
        </div>
      </form>

      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-4">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-300" />
            <div><h2 className="font-semibold">Gespeicherte Schichtübergaben</h2><p className="text-xs text-slate-500">Chronologische Historie aller erfassten Übergaben.</p></div>
          </div>
          <div className="flex items-center gap-2">
            <select aria-label="Historie nach Kategorie filtern" value={filter} onChange={(event) => setFilter(event.target.value as "all" | Category)} className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              <option value="all">Alle Kategorien</option>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" onClick={() => void loadEntries()} className="rounded-lg border border-slate-600 bg-slate-800 p-2 text-slate-300 hover:bg-slate-700" title="Historie aktualisieren"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {visibleEntries.map((entry) => (
            <article key={entry.id} className="rounded-lg border border-slate-700 bg-slate-950 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md border border-blue-500/30 bg-blue-500/10 px-2.5 py-1 text-xs font-bold text-blue-200">{DIRECTION_LABELS[entry.direction]}</span>
                  <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${categoryStyle(entry.category)}`}>{CATEGORY_LABELS[entry.category]}</span>
                </div>
                <time className="text-xs tabular-nums text-slate-400">{new Date(entry.handoverAt).toLocaleString("de-DE")}</time>
              </div>

              {TICKET_CATEGORIES.has(entry.category) ? (
                <div className="mt-3 grid gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm sm:grid-cols-2">
                  <div><span className="text-xs text-slate-500">Ticketnummer</span><div className="mt-0.5 font-semibold text-slate-100">{entry.ticketNumber}</div></div>
                  <div><span className="text-xs text-slate-500">Kunde</span><div className="mt-0.5 font-semibold text-slate-100">{entry.customerName}</div></div>
                </div>
              ) : null}

              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-300">{entry.notes}</p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
                <span className="flex items-center gap-1.5"><UserRound className="h-3.5 w-3.5" />Erstellt von {entry.createdByName}</span>
                <span>Gespeichert am {new Date(entry.createdAt).toLocaleString("de-DE")}</span>
              </div>
            </article>
          ))}
          {!loading && visibleEntries.length === 0 ? <div className="rounded-lg border border-dashed border-slate-700 px-4 py-8 text-center text-sm text-slate-500">Noch keine Schichtübergaben in dieser Kategorie gespeichert.</div> : null}
          {loading && entries.length === 0 ? <div className="py-8 text-center text-sm text-slate-500">Schichtübergaben werden geladen...</div> : null}
        </div>
      </section>
    </div>
  );
}
