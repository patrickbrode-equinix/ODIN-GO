import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, CheckCircle2, ChevronRight, FileText, GitBranch, Inbox, Lightbulb, Mail, Paperclip, Plus, RefreshCw, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import {
  CocCase, CocChainMember, CocClassification, createCocCase, decideCocCase, downloadCocAttachment,
  getCocCase, getCocCases, getCocChain, getCocMailStatus, routeCocCase, sendCocMailTest, updateCocChain,
} from "../../api/coc";

type View = "create" | "mine" | "inbox" | "all" | "chain";
const classificationLabel: Record<CocClassification, string> = { problem: "Problem", idea: "Idee", improvement: "Verbesserung" };
const statusLabel: Record<string, string> = { awaiting_routing: "Wartet auf Zuordnung", pending: "In Prüfung", approved: "Genehmigt", rejected: "Abgelehnt" };

function errorText(error: any) {
  return error?.response?.data?.message || error?.message || "Die Aktion konnte nicht ausgeführt werden.";
}

function CaseCard({ item, selected, onClick }: { item: CocCase; selected: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`liquid-list-item w-full rounded-2xl p-4 text-left transition ${selected ? "ring-1 ring-cyan-300/70" : ""}`}>
    <div className="flex items-start justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-[.18em] text-cyan-300">{item.reference}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${item.status === "approved" ? "bg-emerald-400/15 text-emerald-300" : item.status === "rejected" ? "bg-rose-400/15 text-rose-300" : "bg-amber-400/15 text-amber-200"}`}>{statusLabel[item.status]}</span></div>
    <h3 className="mt-2 font-bold text-white">{item.title}</h3>
    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-400">{item.shortDescription}</p>
    <div className="mt-3 flex items-center justify-between text-[11px] text-slate-500"><span>{classificationLabel[item.classification]}</span><span>{new Date(item.createdAt).toLocaleDateString("de-DE")}</span></div>
  </button>;
}

export default function CocChainOfCommand() {
  const { user } = useAuth();
  const requestedCaseId = Number(new URLSearchParams(window.location.search).get("caseId")) || null;
  const [view, setView] = useState<View>(requestedCaseId ? "inbox" : "create");
  const [cases, setCases] = useState<CocCase[]>([]);
  const [selected, setSelected] = useState<CocCase | null>(null);
  const [chain, setChain] = useState<CocChainMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [decisionComment, setDecisionComment] = useState("");
  const [form, setForm] = useState({ classification: "idea" as CocClassification, title: "", shortDescription: "", description: "" });
  const [files, setFiles] = useState<File[]>([]);

  const scope = view === "inbox" ? "inbox" : view === "all" ? "all" : "mine";
  const loadCases = useCallback(async () => {
    if (view === "create" || view === "chain") return;
    setLoading(true); setError("");
    try {
      const rows = await getCocCases(scope);
      setCases(rows);
      const targetId = selected?.id || requestedCaseId;
      if (targetId) {
        const target = rows.find((row) => row.id === targetId) || null;
        setSelected(target);
        if (target) setSelected(await getCocCase(target.id));
      }
    }
    catch (caught) { setError(errorText(caught)); }
    finally { setLoading(false); }
  }, [scope, selected?.id, view]);

  useEffect(() => { loadCases(); }, [view]);
  useEffect(() => {
    if ((view !== "chain" && view !== "all") || !user.isAdmin) return;
    setLoading(true); getCocChain().then(setChain).catch((caught) => setError(errorText(caught))).finally(() => setLoading(false));
  }, [view, user.isAdmin]);

  const openCase = async (item: CocCase) => {
    setSelected(item); setError("");
    try { setSelected(await getCocCase(item.id)); } catch (caught) { setError(errorText(caught)); }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(""); setMessage("");
    try {
      const result = await createCocCase({ ...form, attachments: files });
      setMessage(`${result.reference}: ${result.message}`); setForm({ classification: "idea", title: "", shortDescription: "", description: "" }); setFiles([]);
      setView("mine");
    } catch (caught) { setError(errorText(caught)); }
    finally { setLoading(false); }
  };

  const decide = async (action: "forward" | "approve" | "reject") => {
    if (!selected) return;
    setLoading(true); setError("");
    try { await decideCocCase(selected.id, action, decisionComment); setDecisionComment(""); await loadCases(); setSelected(await getCocCase(selected.id)); setMessage("Entscheidung wurde protokolliert."); }
    catch (caught) { setError(errorText(caught)); }
    finally { setLoading(false); }
  };

  const tabs = useMemo(() => [
    ["create", "Einreichen", Plus], ["mine", "Meine Vorgänge", FileText], ["inbox", "Zur Prüfung", Inbox],
    ...(user.isAdmin ? [["all", "Alle Vorgänge", ShieldCheck], ["chain", "Kommandokette", GitBranch]] : []),
  ] as Array<[View, string, typeof Plus]>, [user.isAdmin]);

  return <div className="min-h-full bg-[#030711] p-4 text-slate-100 sm:p-6">
    <section className="liquid-hero relative overflow-hidden rounded-[30px] p-6 sm:p-8">
      <div className="relative z-10 flex flex-wrap items-end justify-between gap-5"><div><div className="liquid-eyebrow"><Sparkles className="h-4 w-4" /> OFFEN. NACHVOLLZIEHBAR. DIREKT.</div><h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">CoC <span className="text-cyan-300">Chain of Command</span></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">Probleme, Ideen und Verbesserungen ohne Bürokratie an die richtige Entscheidungsebene bringen.</p></div><div className="liquid-kpi rounded-2xl px-5 py-4"><div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Identität</div><div className="mt-1 font-bold text-cyan-200">{user.displayName}</div></div></div>
    </section>

    <nav className="mt-4 flex gap-2 overflow-x-auto pb-1">{tabs.map(([id, label, Icon]) => <button key={id} type="button" onClick={() => { setView(id); setSelected(null); setMessage(""); setError(""); }} className={`liquid-button flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold ${view === id ? "border-cyan-300/60 bg-cyan-400/15 text-cyan-100" : "text-slate-300"}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>
    {error && <div className="mt-4 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    {message && <div className="mt-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div>}

    {view === "create" && <form onSubmit={submit} className="liquid-panel mt-5 rounded-[28px] p-5 sm:p-7">
      <div className="grid gap-5 lg:grid-cols-[.7fr_1.3fr]"><div><div className="liquid-eyebrow"><Lightbulb className="h-4 w-4" /> NEUER VORGANG</div><h2 className="mt-3 text-2xl font-black">Was soll besser werden?</h2><p className="mt-2 text-sm leading-6 text-slate-400">Die Einreichung wird automatisch an die nächste Person deiner hinterlegten Kommandokette gesendet.</p></div>
      <div className="grid gap-4"><label className="grid gap-2 text-xs font-bold text-slate-300">Klassifizierung<select className="liquid-control rounded-xl px-3 py-3" value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value as CocClassification })}><option value="problem">Problem</option><option value="idea">Idee</option><option value="improvement">Verbesserung</option></select></label>
      <label className="grid gap-2 text-xs font-bold text-slate-300">Titel<input required maxLength={180} className="liquid-control rounded-xl px-3 py-3" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Prägnanter Titel" /></label>
      <label className="grid gap-2 text-xs font-bold text-slate-300">Kurzbeschreibung<textarea required maxLength={500} rows={2} className="liquid-control rounded-xl px-3 py-3" value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} placeholder="Worum geht es in wenigen Sätzen?" /></label>
      <label className="grid gap-2 text-xs font-bold text-slate-300">Ausführliche Beschreibung<textarea required maxLength={20000} rows={7} className="liquid-control rounded-xl px-3 py-3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Ausgangslage, Auswirkungen und gewünschtes Ergebnis" /></label>
      <label className="liquid-list-item flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-sm"><span className="flex items-center gap-2"><Paperclip className="h-4 w-4 text-cyan-300" /> Anhänge (max. 5 Dateien, je 10 MB)</span><input type="file" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} /><span className="text-xs text-slate-400">{files.length ? `${files.length} gewählt` : "Auswählen"}</span></label>
      {files.length > 0 && <div className="flex flex-wrap gap-2">{files.map((file) => <span key={`${file.name}-${file.size}`} className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300">{file.name}</span>)}</div>}
      <button disabled={loading} className="liquid-button rounded-xl border-cyan-300/40 bg-cyan-400/15 px-5 py-3 font-black text-cyan-100 disabled:opacity-50">{loading ? "Wird eingereicht ..." : "An Kommandokette übermitteln"}</button></div></div>
    </form>}

    {(view === "mine" || view === "inbox" || view === "all") && <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
      <aside className="liquid-panel rounded-[26px] p-3"><div className="flex items-center justify-between px-2 py-3"><h2 className="font-black">{view === "inbox" ? "Offene Prüfungen" : view === "all" ? "Alle Vorgänge" : "Meine Vorgänge"}</h2><button type="button" onClick={loadCases} className="rounded-lg p-2 text-slate-400 hover:bg-white/5"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button></div><div className="grid max-h-[66vh] gap-2 overflow-y-auto">{cases.map((item) => <CaseCard key={item.id} item={item} selected={selected?.id === item.id} onClick={() => openCase(item)} />)}{!cases.length && !loading && <p className="p-6 text-center text-sm text-slate-500">Keine Vorgänge vorhanden.</p>}</div></aside>
      <main className="liquid-panel min-h-[480px] rounded-[26px] p-5 sm:p-7">{!selected ? <div className="grid h-full place-items-center text-center"><div><GitBranch className="mx-auto h-10 w-10 text-cyan-300/50" /><h2 className="mt-3 font-bold">Vorgang auswählen</h2><p className="mt-1 text-sm text-slate-500">Details, Anhänge und vollständiger Entscheidungsverlauf erscheinen hier.</p></div></div> : <div>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-xs font-black uppercase tracking-[.2em] text-cyan-300">{selected.reference} · {classificationLabel[selected.classification]}</div><h2 className="mt-2 text-2xl font-black">{selected.title}</h2></div><span className="rounded-full bg-white/5 px-3 py-1.5 text-xs font-bold">{statusLabel[selected.status]}</span></div>
        <p className="mt-5 rounded-2xl bg-white/[.035] p-4 text-sm font-semibold leading-6 text-slate-300">{selected.shortDescription}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-slate-400">{selected.description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="liquid-kpi rounded-xl p-3"><span className="text-[10px] uppercase tracking-widest text-slate-500">Eingereicht von</span><div className="mt-1 text-sm font-bold">{selected.submitterName}</div></div><div className="liquid-kpi rounded-xl p-3"><span className="text-[10px] uppercase tracking-widest text-slate-500">Aktuelle Stufe</span><div className="mt-1 text-sm font-bold">{selected.currentLevel}</div></div><div className="liquid-kpi rounded-xl p-3"><span className="text-[10px] uppercase tracking-widest text-slate-500">Zuständig</span><div className="mt-1 text-sm font-bold">{selected.currentApproverName || "Noch nicht zugeordnet"}</div></div></div>
        {!!selected.attachments?.length && <div className="mt-6"><h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Anhänge</h3><div className="mt-2 flex flex-wrap gap-2">{selected.attachments.map((attachment) => <button type="button" key={attachment.id} onClick={() => downloadCocAttachment(attachment)} className="liquid-button flex items-center gap-2 rounded-xl px-3 py-2 text-xs"><Paperclip className="h-3.5 w-3.5" />{attachment.name}</button>)}</div></div>}
        {!!selected.events?.length && <div className="mt-7"><h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Entscheidungsverlauf</h3><div className="mt-3 grid gap-3">{selected.events.map((event) => <div key={event.id} className="flex gap-3"><div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-300 shadow-[0_0_12px_#67e8f9]" /><div><div className="text-sm font-bold">{event.actorName} · {event.action === "submitted" ? "eingereicht" : event.action === "forwarded" ? "weitergegeben" : event.action === "approved" ? "genehmigt" : event.action === "rejected" ? "abgelehnt" : "zugeordnet"}</div>{event.comment && <p className="mt-1 text-xs leading-5 text-slate-400">{event.comment}</p>}<div className="mt-1 text-[10px] text-slate-600">{new Date(event.createdAt).toLocaleString("de-DE")}{event.toApproverName ? ` · an ${event.toApproverName}` : ""}</div></div></div>)}</div></div>}
        {view === "inbox" && selected.status === "pending" && <div className="mt-7 rounded-2xl border border-cyan-300/15 bg-cyan-400/[.04] p-4"><label className="grid gap-2 text-xs font-bold text-slate-300">Kommentar und Begründung<textarea rows={3} value={decisionComment} onChange={(e) => setDecisionComment(e.target.value)} className="liquid-control rounded-xl px-3 py-3" placeholder="Bei Ablehnung oder Weitergabe erforderlich" /></label><div className="mt-3 flex flex-wrap gap-2"><button disabled={loading} onClick={() => decide("approve")} className="flex items-center gap-2 rounded-xl bg-emerald-500/15 px-4 py-2.5 text-sm font-bold text-emerald-200"><CheckCircle2 className="h-4 w-4" />Genehmigen</button><button disabled={loading} onClick={() => decide("forward")} className="flex items-center gap-2 rounded-xl bg-cyan-500/15 px-4 py-2.5 text-sm font-bold text-cyan-200"><ArrowUpRight className="h-4 w-4" />Weitergeben</button><button disabled={loading} onClick={() => decide("reject")} className="flex items-center gap-2 rounded-xl bg-rose-500/15 px-4 py-2.5 text-sm font-bold text-rose-200"><XCircle className="h-4 w-4" />Ablehnen</button></div></div>}
        {user.isAdmin && selected.status === "awaiting_routing" && <AdminRoute caseId={selected.id} chain={chain} onDone={async () => { await loadCases(); setSelected(await getCocCase(selected.id)); }} />}
      </div>}</main>
    </div>}

    {view === "chain" && user.isAdmin && <><MailSetupCard /><ChainEditor members={chain} setMembers={setChain} /></>}
  </div>;
}

function MailSetupCard() {
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getCocMailStatus>> | null>(null);
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  useEffect(() => { getCocMailStatus().then(setStatus).catch((caught) => setError(errorText(caught))); }, []);
  return <section className="liquid-panel mt-5 rounded-[28px] p-5 sm:p-7"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-3"><Mail className="h-6 w-6 text-cyan-300" /><div><h2 className="text-xl font-black">CoC E-Mail-Benachrichtigung</h2><p className="mt-1 text-sm text-slate-400">Entscheider erhalten einen Hinweis zum Vorgang. Die Freigabe erfolgt ausschließlich über Jarvis SSO.</p></div></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${status?.enabled ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-400/15 text-amber-200"}`}>{status?.enabled ? "AKTIV" : "NOCH NICHT KONFIGURIERT"}</span></div>
  {status && <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="liquid-kpi rounded-xl p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">Öffentliche Adresse</div><div className="mt-1 truncate text-sm font-bold">{status.publicUrl || "Fehlt"}</div></div><div className="liquid-kpi rounded-xl p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">SMTP</div><div className="mt-1 text-sm font-bold">{status.smtpHostConfigured && status.fromConfigured ? "Konfiguriert" : "Unvollständig"}</div></div><div className="liquid-kpi rounded-xl p-3"><div className="text-[10px] uppercase tracking-widest text-slate-500">Freigabe</div><div className="mt-1 text-sm font-bold">Jarvis SSO</div></div></div>}
  {!!status?.missing.length && <p className="mt-3 text-xs text-amber-200">Auf der VM fehlen: {status.missing.join(", ")}</p>}
  <div className="mt-4 flex flex-wrap gap-2"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Test-E-Mail-Adresse" className="liquid-control min-w-[240px] flex-1 rounded-xl px-3 py-2.5 text-sm" /><button type="button" disabled={sending || !email} onClick={async () => { setSending(true); setError(""); setMessage(""); try { const result = await sendCocMailTest(email); setMessage(result.message); } catch (caught) { setError(errorText(caught)); } finally { setSending(false); } }} className="liquid-button rounded-xl px-4 py-2.5 text-sm font-bold">{sending ? "Wird gesendet ..." : "Test-E-Mail senden"}</button></div>{message && <p className="mt-3 text-sm text-emerald-200">{message}</p>}{error && <p className="mt-3 text-sm text-rose-300">{error}</p>}</section>;
}

function AdminRoute({ caseId, chain, onDone }: { caseId: number; chain: CocChainMember[]; onDone: () => Promise<void> }) {
  const [approver, setApprover] = useState(""); const [error, setError] = useState("");
  return <div className="mt-6 rounded-2xl border border-amber-300/20 bg-amber-400/[.05] p-4"><h3 className="font-bold text-amber-200">Initiale Zuordnung erforderlich</h3><div className="mt-3 flex gap-2"><select className="liquid-control min-w-0 flex-1 rounded-xl px-3 py-2" value={approver} onChange={(e) => setApprover(e.target.value)}><option value="">Prüfer auswählen</option>{chain.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}</select><button type="button" onClick={async () => { try { await routeCocCase(caseId, Number(approver), "Kommandokette administrativ gestartet."); await onDone(); } catch (caught) { setError(errorText(caught)); } }} disabled={!approver} className="rounded-xl bg-amber-400/15 px-4 font-bold text-amber-100">Zuordnen</button></div>{error && <p className="mt-2 text-xs text-rose-300">{error}</p>}</div>;
}

function ChainEditor({ members, setMembers }: { members: CocChainMember[]; setMembers: (rows: CocChainMember[]) => void }) {
  const [saving, setSaving] = useState<number | null>(null); const [error, setError] = useState("");
  const updateLocal = (id: number, patch: Partial<CocChainMember>) => setMembers(members.map((member) => member.id === id ? { ...member, ...patch } : member));
  return <section className="liquid-panel mt-5 rounded-[28px] p-5 sm:p-7"><div className="flex items-center gap-3"><GitBranch className="h-6 w-6 text-cyan-300" /><div><h2 className="text-xl font-black">Kommandokette konfigurieren</h2><p className="text-sm text-slate-400">Lege für jede Person die direkt nächste Hierarchiestufe fest. Der Endpunkt besitzt keine weitere Weiterleitung.</p></div></div>{error && <p className="mt-4 text-sm text-rose-300">{error}</p>}<div className="mt-5 grid gap-2">{members.map((member) => <div key={member.id} className="liquid-list-item grid items-center gap-3 rounded-2xl p-3 md:grid-cols-[1fr_1fr_auto_auto]"><div><div className="font-bold">{member.name}</div><div className="text-xs text-slate-500">{member.email || "Keine E-Mail hinterlegt"}</div></div><select disabled={member.isFinalApprover} value={member.managerUserId || ""} onChange={(e) => updateLocal(member.id, { managerUserId: e.target.value ? Number(e.target.value) : undefined })} className="liquid-control min-w-0 rounded-xl px-3 py-2 text-sm"><option value="">Nächste Person auswählen</option>{members.filter((candidate) => candidate.id !== member.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select><label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold"><input type="checkbox" checked={member.isFinalApprover} onChange={(e) => updateLocal(member.id, { isFinalApprover: e.target.checked, managerUserId: e.target.checked ? undefined : member.managerUserId })} /> Endpunkt</label><button type="button" disabled={saving === member.id} onClick={async () => { setSaving(member.id); setError(""); try { await updateCocChain(member.id, member.managerUserId || null, member.isFinalApprover); } catch (caught) { setError(errorText(caught)); } finally { setSaving(null); } }} className="liquid-button flex items-center justify-center gap-1 rounded-xl px-3 py-2 text-xs font-bold">Speichern <ChevronRight className="h-3.5 w-3.5" /></button></div>)}</div></section>;
}
