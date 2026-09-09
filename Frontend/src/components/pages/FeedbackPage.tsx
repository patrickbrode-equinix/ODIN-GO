import { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, Bug, CheckCircle2, ClipboardList, Lightbulb, Loader2, MessageSquare, Paperclip, Send, UserRound, X } from 'lucide-react';
import { api } from '../../api/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage, getLanguageLocale } from '../../context/LanguageContext';
import { EnterpriseCard, EnterpriseFeatureHero, EnterpriseHeader, EnterprisePageShell } from '../layout/EnterpriseLayout';

type FeedbackType = 'Bug' | 'Verbesserung';
type FeedbackStatus = 'open' | 'in_progress' | 'done';

type FeedbackEntry = {
  id: number;
  type: FeedbackType;
  title: string;
  description: string;
  senderName: string | null;
  senderEmail: string | null;
  status: FeedbackStatus;
  adminComment?: string | null;
  statusUpdatedBy?: string | null;
  statusUpdatedAt?: string | null;
  archivedAt?: string | null;
  createdAt: string;
};

const COPY = {
  de: {
    title: 'Feedback', subtitle: 'Bugs und Verbesserungsvorschläge strukturiert erfassen und nachverfolgen.',
    create: 'Neues Feedback', type: 'Art', bug: 'Bug', improvement: 'Verbesserung',
    subject: 'Titel', subjectPlaceholder: 'Kurze Zusammenfassung', description: 'Beschreibung', descriptionPlaceholder: 'Was ist passiert oder was sollte verbessert werden?',
    attachment: 'Screenshot anhängen', attachmentHint: 'PNG, JPEG, GIF oder WebP, maximal 10 MB', chooseScreenshot: 'Screenshot auswählen', removeScreenshot: 'Screenshot entfernen',
    submit: 'Feedback speichern', sending: 'Wird gespeichert…', active: 'Aktiv', archive: 'Archiv',
    empty: 'Noch keine Einträge vorhanden.', created: 'Erstellt von', statusOpen: 'Open', statusProgress: 'In Progress', statusResolved: 'Resolved',
    comment: 'Kommentar von Patrick Brode', commentPlaceholder: 'Statusänderung begründen oder Ergebnis dokumentieren…',
    saveProgress: 'In Progress setzen', saveResolved: 'Resolved setzen', archiving: 'Wird archiviert…', archiveEntry: 'Archivieren',
    updated: 'Aktualisiert von', loadFailed: 'Feedback konnte nicht geladen werden.', saveFailed: 'Feedback konnte nicht gespeichert werden.', statusFailed: 'Status konnte nicht gespeichert werden.',
    ownEntries: 'Du siehst deine eigenen Einträge. Patrick Brode sieht alle Einträge und steuert den Workflow.',
  },
  en: {
    title: 'Feedback', subtitle: 'Capture and track bugs and improvement ideas in one place.',
    create: 'New feedback', type: 'Type', bug: 'Bug', improvement: 'Improvement',
    subject: 'Title', subjectPlaceholder: 'Short summary', description: 'Description', descriptionPlaceholder: 'What happened or what should be improved?',
    attachment: 'Attach screenshot', attachmentHint: 'PNG, JPEG, GIF, or WebP, maximum 10 MB', chooseScreenshot: 'Choose screenshot', removeScreenshot: 'Remove screenshot',
    submit: 'Save feedback', sending: 'Saving…', active: 'Active', archive: 'Archive',
    empty: 'No entries yet.', created: 'Created by', statusOpen: 'Open', statusProgress: 'In Progress', statusResolved: 'Resolved',
    comment: 'Comment by Patrick Brode', commentPlaceholder: 'Explain the status change or document the outcome…',
    saveProgress: 'Set In Progress', saveResolved: 'Set Resolved', archiving: 'Archiving…', archiveEntry: 'Archive',
    updated: 'Updated by', loadFailed: 'Feedback could not be loaded.', saveFailed: 'Feedback could not be saved.', statusFailed: 'Status could not be saved.',
    ownEntries: 'You see your own entries. Patrick Brode sees all entries and controls the workflow.',
  },
} as const;

function isPatrickBrode(user: { displayName?: string | null; email?: string | null } | null | undefined) {
  const displayName = String(user?.displayName || '').trim().toLocaleLowerCase('de-DE');
  const email = String(user?.email || '').trim().toLocaleLowerCase('de-DE');
  return displayName === 'patrick brode' || email === 'patrick.brode@eu.equinix.com' || email === 'patrick.brode@equinix.com';
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language as keyof typeof COPY] || COPY.en;
  const locale = getLanguageLocale(language);
  const canManage = isPatrickBrode(user);
  const [type, setType] = useState<FeedbackType>('Bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [entries, setEntries] = useState<FeedbackEntry[]>([]);
  const [archived, setArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [comments, setComments] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const screenshotInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/feedback/entries', { params: { archived } });
      setEntries(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('LOAD FEEDBACK ERROR:', error);
      setMessage({ text: copy.loadFailed, error: true });
    } finally {
      setLoading(false);
    }
  }, [archived, copy.loadFailed]);

  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    setMessage(null);
    try {
      const body = new FormData();
      body.append('type', type);
      body.append('title', title.trim());
      body.append('description', description.trim());
      body.append('route', window.location.pathname);
      if (screenshot) body.append('screenshot', screenshot);
      await api.post('/feedback', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      setTitle('');
      setDescription('');
      setScreenshot(null);
      if (screenshotInputRef.current) screenshotInputRef.current.value = '';
      setMessage({ text: language === 'de' ? 'Feedback wurde gespeichert.' : 'Feedback was saved.' });
      if (!archived) await load();
    } catch (error) {
      console.error('CREATE FEEDBACK ERROR:', error);
      setMessage({ text: copy.saveFailed, error: true });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (entry: FeedbackEntry, status: FeedbackStatus) => {
    const comment = String(comments[entry.id] || '').trim();
    if (!comment) {
      setMessage({ text: language === 'de' ? 'Bitte zuerst einen Kommentar eintragen.' : 'Please add a comment first.', error: true });
      return;
    }
    setUpdatingId(entry.id);
    try {
      await api.patch(`/feedback/entries/${entry.id}/status`, { status, comment });
      await load();
    } catch (error) {
      console.error('UPDATE FEEDBACK STATUS ERROR:', error);
      setMessage({ text: copy.statusFailed, error: true });
    } finally {
      setUpdatingId(null);
    }
  };

  const archiveEntry = async (entry: FeedbackEntry) => {
    setUpdatingId(entry.id);
    try {
      await api.patch(`/feedback/entries/${entry.id}/archive`);
      await load();
    } catch (error) {
      console.error('ARCHIVE FEEDBACK ERROR:', error);
      setMessage({ text: copy.statusFailed, error: true });
    } finally {
      setUpdatingId(null);
    }
  };

  const statusLabel = (status: FeedbackStatus) => status === 'in_progress' ? copy.statusProgress : status === 'done' ? copy.statusResolved : copy.statusOpen;
  const statusClass = (status: FeedbackStatus) => status === 'done' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-200' : status === 'in_progress' ? 'border-amber-400/30 bg-amber-500/10 text-amber-100' : 'border-sky-400/30 bg-sky-500/10 text-sky-100';

  return (
    <EnterprisePageShell className="space-y-5">
      <EnterpriseFeatureHero eyebrow={language === 'de' ? 'Produktfeedback' : 'Product feedback'} title={copy.title} description={copy.subtitle} />

      {message && <div className={`rounded-xl border px-4 py-3 text-sm ${message.error ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>{message.text}</div>}

      <EnterpriseCard>
        <EnterpriseHeader title={copy.create} icon={<ClipboardList className="h-5 w-5 text-sky-400" />} />
        <div className="mt-4 grid gap-4 lg:grid-cols-[280px_1fr]">
          <div>
            <div className="mb-2 text-sm font-medium text-foreground">{copy.type}</div>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setType('Bug')} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${type === 'Bug' ? 'border-red-400/45 bg-red-500/15 text-red-200' : 'border-border/50 bg-background/50 text-muted-foreground'}`}><Bug className="mx-auto mb-1 h-4 w-4" />{copy.bug}</button>
              <button type="button" onClick={() => setType('Verbesserung')} className={`rounded-xl border px-3 py-3 text-sm font-semibold ${type === 'Verbesserung' ? 'border-amber-400/45 bg-amber-500/15 text-amber-100' : 'border-border/50 bg-background/50 text-muted-foreground'}`}><Lightbulb className="mx-auto mb-1 h-4 w-4" />{copy.improvement}</button>
            </div>
          </div>
          <div className="space-y-3">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={copy.subjectPlaceholder} className="w-full rounded-xl border border-border/60 bg-background/65 px-3 py-2.5 text-sm text-foreground outline-none focus:border-sky-500/60" aria-label={copy.subject} />
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder={copy.descriptionPlaceholder} className="min-h-28 w-full rounded-xl border border-border/60 bg-background/65 px-3 py-2.5 text-sm text-foreground outline-none focus:border-sky-500/60" aria-label={copy.description} />
            <div>
              <div className="mb-1.5 text-sm font-medium text-foreground">{copy.attachment}</div>
              {screenshot ? (
                <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2 text-sm text-foreground">
                  <Paperclip className="h-4 w-4 shrink-0 text-sky-400" />
                  <span className="min-w-0 flex-1 truncate">{screenshot.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{Math.ceil(screenshot.size / 1024)} KB</span>
                  <button type="button" onClick={() => { setScreenshot(null); if (screenshotInputRef.current) screenshotInputRef.current.value = ''; }} className="rounded-md p-1 text-muted-foreground hover:bg-red-500/10 hover:text-red-300" title={copy.removeScreenshot} aria-label={copy.removeScreenshot}><X className="h-4 w-4" /></button>
                </div>
              ) : (
                <button type="button" onClick={() => screenshotInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-background/40 px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-sky-500/50 hover:bg-sky-500/5 hover:text-sky-200"><Paperclip className="h-4 w-4" />{copy.chooseScreenshot}</button>
              )}
              <input ref={screenshotInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) setScreenshot(file); }} />
              <p className="mt-1.5 text-xs text-muted-foreground">{copy.attachmentHint}</p>
            </div>
            <div className="flex justify-end"><button type="button" onClick={() => void submit()} disabled={saving || !title.trim() || !description.trim()} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"><Send className="h-4 w-4" />{saving ? copy.sending : copy.submit}</button></div>
          </div>
        </div>
      </EnterpriseCard>

      <EnterpriseCard>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><EnterpriseHeader title={archived ? copy.archive : copy.active} icon={archived ? <Archive className="h-5 w-5 text-slate-400" /> : <MessageSquare className="h-5 w-5 text-sky-400" />} /><p className="mt-1 text-xs text-muted-foreground">{canManage ? (language === 'de' ? 'Du siehst alle Feedback-Einträge.' : 'You can see all feedback entries.') : copy.ownEntries}</p></div>
          <div className="flex rounded-lg border border-border/50 p-1"><button type="button" onClick={() => setArchived(false)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${!archived ? 'bg-sky-600 text-white' : 'text-muted-foreground'}`}>{copy.active}</button><button type="button" onClick={() => setArchived(true)} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${archived ? 'bg-slate-700 text-white' : 'text-muted-foreground'}`}>{copy.archive}</button></div>
        </div>
        {loading ? <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-sky-400" /></div> : entries.length === 0 ? <div className="rounded-xl border border-dashed border-border/50 py-12 text-center text-sm text-muted-foreground">{copy.empty}</div> : <div className="space-y-3">{entries.map((entry) => (
          <article key={entry.id} className={`rounded-2xl border p-4 ${entry.type === 'Bug' ? 'border-red-500/20 bg-red-500/[0.035]' : 'border-amber-500/20 bg-amber-500/[0.035]'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-2 flex flex-wrap gap-2"><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${entry.type === 'Bug' ? 'border-red-400/30 bg-red-500/10 text-red-200' : 'border-amber-400/30 bg-amber-500/10 text-amber-100'}`}>{entry.type}</span><span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${statusClass(entry.status)}`}>{statusLabel(entry.status)}</span></div><h2 className="text-base font-semibold text-foreground">{entry.title}</h2></div><div className="text-right text-xs text-muted-foreground"><div className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" />{copy.created}: {entry.senderName || entry.senderEmail || '-'}</div><div className="mt-1">{new Date(entry.createdAt).toLocaleString(locale)}</div></div></div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{entry.description}</p>
            {entry.adminComment && <div className="mt-3 rounded-xl border border-sky-400/20 bg-sky-500/5 px-3 py-2 text-sm text-sky-100"><div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-sky-300">{copy.updated} {entry.statusUpdatedBy || 'Patrick Brode'}</div>{entry.adminComment}</div>}
            {canManage && !archived && <div className="mt-4 border-t border-border/45 pt-4"><textarea value={comments[entry.id] || ''} onChange={(event) => setComments((current) => ({ ...current, [entry.id]: event.target.value }))} placeholder={copy.commentPlaceholder} className="min-h-20 w-full rounded-xl border border-border/60 bg-background/65 px-3 py-2 text-sm text-foreground outline-none focus:border-sky-500/60" /><div className="mt-2 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void changeStatus(entry, 'in_progress')} disabled={updatingId === entry.id} className="rounded-lg border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100 disabled:opacity-50">{copy.saveProgress}</button><button type="button" onClick={() => void changeStatus(entry, 'done')} disabled={updatingId === entry.id} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-50"><CheckCircle2 className="h-3.5 w-3.5" />{copy.saveResolved}</button><button type="button" onClick={() => void archiveEntry(entry)} disabled={updatingId === entry.id} className="inline-flex items-center gap-1 rounded-lg border border-slate-500/45 bg-slate-500/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-50"><Archive className="h-3.5 w-3.5" />{updatingId === entry.id ? copy.archiving : copy.archiveEntry}</button></div></div>}
          </article>
        ))}</div>}
      </EnterpriseCard>
    </EnterprisePageShell>
  );
}
