/* ------------------------------------------------ */
/* POLLS PANEL – Umfragen for Infos Modal           */
/* ------------------------------------------------ */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3, CalendarClock, Check, ChevronDown, ChevronUp,
  Clock, Loader2, Plus, Trash2, Vote, X,
} from "lucide-react";
import { api } from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage, type LanguageCode } from "../context/LanguageContext";

/* ─────────────── i18n ─────────────── */

const COPY: Record<LanguageCode, Record<string, string>> = {
  de: {
    title: "Umfragen",
    newPoll: "Neue Umfrage",
    pollTitle: "Titel",
    pollTitlePlaceholder: "Worum geht es?",
    description: "Beschreibung",
    descriptionPlaceholder: "Erkläre den Kontext oder Hintergrund der Umfrage…",
    options: "Antwortmöglichkeiten",
    optionPlaceholder: "Option",
    addOption: "Option hinzufügen",
    endsAt: "Abstimmung endet am",
    optional: "optional",
    create: "Erstellen",
    cancel: "Abbrechen",
    creating: "Erstelle…",
    noPolls: "Noch keine Umfragen vorhanden.",
    votes: "Stimmen",
    vote: "Stimme",
    yourVote: "Deine Stimme",
    changeVote: "Stimme ändern",
    votingClosed: "Abstimmung beendet",
    closePoll: "Abstimmung schließen",
    reopenPoll: "Abstimmung öffnen",
    archivePoll: "Archivieren",
    unarchivePoll: "Aus Archiv holen",
    archived: "Archiviert",
    activeTab: "Aktive & beendete",
    archivedTab: "Archivierte Umfragen",
    deletePoll: "Umfrage löschen",
    deleteConfirm: "Diese Umfrage und alle Stimmen unwiderruflich löschen?",
    by: "von",
    endsOn: "Endet am",
    ended: "Beendet am",
    noDeadline: "Kein Enddatum",
    total: "Gesamt",
    minOptions: "Mindestens 2 Optionen",
    titleRequired: "Titel ist erforderlich",
    remainingTime: "verbleibend",
    days: "Tage",
    hours: "Std.",
    expired: "abgelaufen",
  },
  en: {
    title: "Polls",
    newPoll: "New Poll",
    pollTitle: "Title",
    pollTitlePlaceholder: "What is this about?",
    description: "Description",
    descriptionPlaceholder: "Explain the context or background of this poll…",
    options: "Answer options",
    optionPlaceholder: "Option",
    addOption: "Add option",
    endsAt: "Voting ends on",
    optional: "optional",
    create: "Create",
    cancel: "Cancel",
    creating: "Creating…",
    noPolls: "No polls yet.",
    votes: "votes",
    vote: "vote",
    yourVote: "Your vote",
    changeVote: "Change vote",
    votingClosed: "Voting closed",
    closePoll: "Close voting",
    reopenPoll: "Reopen voting",
    archivePoll: "Archive",
    unarchivePoll: "Restore from archive",
    archived: "Archived",
    activeTab: "Active & closed",
    archivedTab: "Archived polls",
    deletePoll: "Delete poll",
    deleteConfirm: "Permanently delete this poll and all votes?",
    by: "by",
    endsOn: "Ends on",
    ended: "Ended on",
    noDeadline: "No deadline",
    total: "Total",
    minOptions: "At least 2 options required",
    titleRequired: "Title is required",
    remainingTime: "remaining",
    days: "days",
    hours: "hrs",
    expired: "expired",
  },
};

/* ─────────────── Types ─────────────── */

type Poll = {
  id: number;
  title: string;
  description: string;
  options: string[];
  ends_at: string | null;
  closed: boolean;
  archived: boolean;
  archived_at?: string | null;
  created_at: string;
  created_by: number;
  creator_name: string;
  creator_email: string;
  vote_count: number;
  eligible_voter_count: number;
};

type PollDetail = Poll & {
  votes: { option_index: number; count: number; voters: { userId: number; name: string; email: string }[] }[];
  myVote: number | null;
};

/* ─────────────── Helpers ─────────────── */

function isPollExpired(poll: Poll | PollDetail) {
  if (poll.closed) return true;
  if (poll.ends_at && new Date(poll.ends_at) < new Date()) return true;
  return false;
}

function canManage(poll: Poll | PollDetail, user: { id: number; isRoot?: boolean; isAdmin?: boolean } | null) {
  if (!user) return false;
  return poll.created_by === user.id || user.isRoot === true || user.isAdmin === true;
}

function formatDeadline(endsAt: string, lang: LanguageCode) {
  const d = new Date(endsAt);
  return d.toLocaleDateString(lang === "de" ? "de-DE" : "en-US", {
    timeZone: "Europe/Berlin",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function getRemainingLabel(endsAt: string, c: Record<string, string>) {
  const diff = new Date(endsAt).getTime() - Date.now();
  if (diff <= 0) return c.expired;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days} ${c.days} ${c.remainingTime}`;
  return `${hours} ${c.hours} ${c.remainingTime}`;
}

/* ─────────────── Create Poll Form ─────────────── */

function CreatePollForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { language } = useLanguage();
  const c = COPY[language];
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async () => {
    setError("");
    if (!title.trim()) { setError(c.titleRequired); return; }
    const cleanOptions = options.map(o => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) { setError(c.minOptions); return; }
    setSaving(true);
    try {
      await api.post("/polls", {
        title: title.trim(),
        description: description.trim(),
        options: cleanOptions,
        ends_at: endsAt || null,
      });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.error || "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="theme-glass-panel rounded-2xl p-5 space-y-4">
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Plus className="h-4 w-4 text-emerald-400" /> {c.newPoll}
      </h3>

      {/* Title */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.pollTitle}</label>
        <input
          className="mt-1 w-full rounded-lg border border-border bg-background/85 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          placeholder={c.pollTitlePlaceholder}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={500}
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.description}</label>
        <textarea
          className="mt-1 min-h-[80px] w-full resize-y rounded-lg border border-border bg-background/85 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          placeholder={c.descriptionPlaceholder}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Options */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{c.options}</label>
        <div className="mt-1 space-y-2">
          {options.map((opt, i) => (
            <div key={i} className="flex gap-2">
              <input
                className="flex-1 rounded-lg border border-border bg-background/85 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-sky-500/50 focus:outline-none"
                placeholder={`${c.optionPlaceholder} ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const next = [...options];
                  next[i] = e.target.value;
                  setOptions(next);
                }}
                maxLength={200}
              />
              {options.length > 2 && (
                <button
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                  className="p-2 text-slate-500 hover:text-red-400 transition"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        {options.length < 10 && (
          <button
            onClick={() => setOptions([...options, ""])}
            className="mt-2 text-xs text-sky-400 hover:text-sky-300 font-medium"
          >
            + {c.addOption}
          </button>
        )}
      </div>

      {/* End date */}
      <div>
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {c.endsAt} <span className="normal-case text-slate-600 dark:text-slate-400">({c.optional})</span>
        </label>
        <input
          type="datetime-local"
          className="mt-1 w-full rounded-lg border border-border bg-background/85 px-3 py-2 text-sm text-foreground focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30 dark:[color-scheme:dark]"
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border/90 hover:text-foreground"
        >
          {c.cancel}
        </button>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50 transition flex items-center gap-1.5"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {saving ? c.creating : c.create}
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Poll Card ─────────────── */

function PollCard({ poll, onUpdate }: { poll: Poll; onUpdate: () => void }) {
  const { language } = useLanguage();
  const c = COPY[language];
  const { user } = useAuth();
  const [detail, setDetail] = useState<PollDetail | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [voting, setVoting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const expired = isPollExpired(poll);
  const manage = canManage(poll, user);

  const loadDetail = useCallback(async () => {
    try {
      const { data } = await api.get(`/polls/${poll.id}`);
      setDetail(data);
    } catch { /* ignore */ }
  }, [poll.id]);

  useEffect(() => {
    if (expanded) loadDetail();
  }, [expanded, loadDetail]);

  const castVote = async (optionIndex: number) => {
    setVoting(true);
    try {
      await api.post(`/polls/${poll.id}/vote`, { option_index: optionIndex });
      await loadDetail();
      onUpdate();
    } catch { /* ignore */ }
    setVoting(false);
  };

  const toggleClosed = async () => {
    try {
      await api.patch(`/polls/${poll.id}`, { closed: !poll.closed });
      onUpdate();
    } catch { /* ignore */ }
  };

  const toggleArchived = async () => {
    try {
      await api.patch(`/polls/${poll.id}`, { archived: !poll.archived });
      onUpdate();
    } catch { /* ignore */ }
  };

  const deletePoll = async () => {
    try {
      await api.delete(`/polls/${poll.id}`);
      onUpdate();
    } catch { /* ignore */ }
  };

  const options: string[] = typeof poll.options === "string" ? JSON.parse(poll.options) : poll.options;
  const totalVotes = detail ? detail.votes.reduce((s, v) => s + v.count, 0) : poll.vote_count;

  return (
    <div className={`rounded-xl border transition-all ${expired ? "border-border/50 bg-background/55" : "border-border bg-background/80 hover:border-[#00d8ff]/25"}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-start gap-3 w-full text-left px-4 py-3"
      >
        <Vote className={`mt-0.5 h-4 w-4 shrink-0 ${expired ? "text-slate-600 dark:text-slate-500" : "text-emerald-400"}`} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-snug text-foreground">{poll.title}</div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span>{c.by} {poll.creator_name}</span>
            <span className="flex items-center gap-1">
              <BarChart3 className="h-3 w-3" />
              <span className="font-semibold tabular-nums">{totalVotes}/{poll.eligible_voter_count ?? 0}</span> {c.votes}
            </span>
            {poll.ends_at && (
              <span className={`flex items-center gap-1 ${expired ? "text-red-400/70" : "text-amber-400/70"}`}>
                <Clock className="h-3 w-3" />
                {expired
                  ? `${c.ended} ${formatDeadline(poll.ends_at, language)}`
                  : getRemainingLabel(poll.ends_at, c)
                }
              </span>
            )}
            {poll.closed && (
              <span className="text-red-400/70 font-semibold">{c.votingClosed}</span>
            )}
            {poll.archived && (
              <span className="text-slate-400 font-semibold">{c.archived}</span>
            )}
          </div>
        </div>
        {expanded ? <ChevronUp className="mt-1 h-4 w-4 text-muted-foreground" /> : <ChevronDown className="mt-1 h-4 w-4 text-muted-foreground" />}
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="space-y-3 border-t border-border/50 px-4 pb-4 pt-3">
          {/* Description */}
          {poll.description && (
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{poll.description}</p>
          )}

          {/* Deadline info */}
          {poll.ends_at && !poll.closed && !expired && (
            <div className="flex items-center gap-1.5 text-[11px] text-amber-400/80 bg-amber-500/5 rounded-lg px-3 py-1.5 border border-amber-500/10">
              <CalendarClock className="h-3 w-3" />
              {c.endsOn} {formatDeadline(poll.ends_at, language)}
            </div>
          )}

          {/* Options / Voting */}
          {detail ? (
            <div className="space-y-1.5">
              {options.map((opt, i) => {
                const voteData = detail.votes.find(v => v.option_index === i);
                const count = voteData?.count || 0;
                const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                const isMyVote = detail.myVote === i;
                const canVote = !expired && !voting;

                return (
                  <button
                    key={i}
                    disabled={!canVote}
                    onClick={() => canVote && castVote(i)}
                    className={`relative w-full text-left rounded-lg border px-3 py-2 text-sm transition-all overflow-hidden ${
                      isMyVote
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : canVote
                          ? "cursor-pointer border-border/70 bg-background/60 hover:border-sky-500/30 hover:bg-sky-500/5"
                          : "border-border/40 bg-background/40"
                    }`}
                  >
                    {/* Progress bar */}
                    <div
                      className={`absolute inset-y-0 left-0 transition-all ${isMyVote ? "bg-emerald-500/15" : "bg-white/[0.03]"}`}
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {isMyVote && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                        <span className={`truncate ${isMyVote ? "font-medium text-emerald-700 dark:text-emerald-200" : "text-foreground"}`}>{opt}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs">
                        <span className="text-muted-foreground">{count}</span>
                        <span className={`w-10 text-right font-semibold ${isMyVote ? "text-emerald-500" : "text-muted-foreground"}`}>{pct}%</span>
                      </div>
                    </div>
                  </button>
                );
              })}
              <div className="text-right text-[11px] text-slate-600 dark:text-slate-400">
                {c.total}: <span className="font-semibold tabular-nums">{totalVotes}/{poll.eligible_voter_count ?? 0}</span> {c.votes}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          )}

          {/* Admin actions */}
          {manage && (
            <div className="flex items-center gap-2 border-t border-border/50 pt-2">
              <button
                onClick={toggleClosed}
                className="rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-border hover:text-foreground"
              >
                {poll.closed ? c.reopenPoll : c.closePoll}
              </button>
              <button
                onClick={toggleArchived}
                className="rounded border border-border/60 px-2 py-1 text-[11px] text-muted-foreground transition hover:border-border hover:text-foreground"
              >
                {poll.archived ? c.unarchivePoll : c.archivePoll}
              </button>
              {!confirmDelete ? (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-[11px] text-red-400/70 hover:text-red-400 transition px-2 py-1 rounded border border-red-500/10 hover:border-red-500/30 flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" /> {c.deletePoll}
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-red-400">{c.deleteConfirm}</span>
                  <button
                    onClick={deletePoll}
                    className="text-[10px] text-red-400 font-bold hover:text-red-300 px-2 py-0.5 rounded border border-red-500/30"
                  >
                    {c.deletePoll}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    {c.cancel}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─────────────── Main Panel ─────────────── */

export function PollsPanel() {
  const { language } = useLanguage();
  const c = COPY[language];
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [view, setView] = useState<"active" | "archived">("active");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/polls");
      setPolls(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const activePolls = useMemo(() => polls.filter(p => !p.archived && !isPollExpired(p)), [polls]);
  const pastPolls = useMemo(() => polls.filter(p => !p.archived && isPollExpired(p)), [polls]);
  const archivedPolls = useMemo(() => polls.filter(p => p.archived), [polls]);

  return (
    <div className="w-full min-h-full space-y-5 px-4 py-5 sm:px-6 lg:px-8 xl:px-10">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Vote className="h-5 w-5 text-emerald-400" />
          {c.title}
        </h2>
        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-600/30 transition"
          >
            <Plus className="h-3 w-3" />
            {c.newPoll}
          </button>
        )}
      </div>

      <div className="flex w-full sm:w-fit items-center gap-1 rounded-lg border border-border/60 bg-background/50 p-1">
        <button type="button" onClick={() => setView("active")} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === "active" ? "bg-sky-600/20 text-sky-300" : "text-muted-foreground hover:text-foreground"}`}>{c.activeTab}</button>
        <button type="button" onClick={() => setView("archived")} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${view === "archived" ? "bg-slate-600/30 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{c.archivedTab} ({archivedPolls.length})</button>
      </div>

      {/* Create Form */}
      {showCreate && (
        <CreatePollForm
          onCreated={() => { setShowCreate(false); load(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      )}

      {/* Active polls */}
      {!loading && view === "active" && activePolls.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {activePolls.map(p => (
            <PollCard key={p.id} poll={p} onUpdate={load} />
          ))}
        </div>
      )}

      {/* Past polls */}
      {!loading && view === "active" && pastPolls.length > 0 && (
        <div className="space-y-2 pt-2">
          <div className="text-[11px] uppercase tracking-[0.15em] text-slate-600 font-semibold">
            {c.votingClosed}
          </div>
          {pastPolls.map(p => (
            <PollCard key={p.id} poll={p} onUpdate={load} />
          ))}
        </div>
      )}

      {!loading && view === "archived" && archivedPolls.length > 0 && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {archivedPolls.map(p => <PollCard key={p.id} poll={p} onUpdate={load} />)}
        </div>
      )}

      {/* Empty */}
      {!loading && ((view === "active" && activePolls.length === 0 && pastPolls.length === 0) || (view === "archived" && archivedPolls.length === 0)) && !showCreate && (
        <div className="text-sm text-slate-500 text-center py-12">
          {c.noPolls}
        </div>
      )}
    </div>
  );
}
