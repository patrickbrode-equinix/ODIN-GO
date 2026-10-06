import { useState, type ReactNode } from 'react';
import { ChevronDown, FileSpreadsheet, Pencil } from 'lucide-react';
import { useLanguage, getLanguageLocale } from '../../context/LanguageContext';
import { exportPlanningGroup, isEditableGroupId, updateGroupMetadata, type PlanningDraftGroup, type PlanningDraftSummary } from '../../api/planningPeriods';
import { Button } from '../ui/button';

interface Props<D extends PlanningDraftSummary> {
  groups: PlanningDraftGroup<D>[];
  activeId?: number;
  onOpen: (draft: D) => void;
  onExportMonth: (draft: D) => void;
  onError: (message: string) => void;
  renderMonth?: (draft: D) => ReactNode;
  /** Called after group title/description were saved so the parent can reload. */
  onMetadataSaved?: () => void | Promise<void>;
}

type Entry<D extends PlanningDraftSummary> =
  | { kind: 'draft'; key: string; time: number; draft: D }
  | { kind: 'group'; key: string; time: number; group: PlanningDraftGroup<D> };

const clamp2 = { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as const;

export function GroupedDraftList<D extends PlanningDraftSummary>({ groups, activeId, onOpen, onExportMonth, onError, renderMonth, onMetadataSaved }: Props<D>) {
  const { language, t } = useLanguage();
  const de = language === 'de';
  const locale = getLanguageLocale(language);
  const [exporting, setExporting] = useState<string | null>(null);
  const [openState, setOpenState] = useState<Record<string, boolean>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const monthLabel = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const time = (value: string) => { const parsed = new Date(value).getTime(); return Number.isFinite(parsed) ? parsed : 0; };

  async function exportGroup(id: string) {
    setExporting(id);
    try { await exportPlanningGroup(id); }
    catch { onError(de ? 'Der Planungsexport ist fehlgeschlagen.' : 'Unable to export the plan.'); }
    finally { setExporting(null); }
  }

  function startEdit(group: PlanningDraftGroup<D>, defaultTitle: string) {
    setEditingId(group.id);
    setEditTitle(group.title || defaultTitle);
    setEditDescription(group.description || '');
    setOpenState(current => ({ ...current, [group.id]: true }));
  }

  async function saveEdit(groupId: string) {
    setSavingId(groupId);
    try {
      await updateGroupMetadata(groupId, { title: editTitle.trim(), description: editDescription.trim() });
      setEditingId(null);
      await onMetadataSaved?.();
    } catch (requestError: any) {
      onError(requestError?.response?.data?.error || requestError?.response?.data?.message || (de ? 'Titel und Beschreibung konnten nicht gespeichert werden.' : 'Unable to save title and description.'));
    } finally { setSavingId(null); }
  }

  const statusChip = (status: string) => {
    const tone = status === 'activated' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : status === 'approved' ? 'border-green-500/30 bg-green-500/10 text-green-300'
      : status === 'in_review' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
      : status === 'failed' ? 'border-red-500/30 bg-red-500/10 text-red-300'
      : 'border-blue-500/30 bg-blue-500/10 text-blue-300';
    const label = t(`sc.status${status === 'in_review' ? 'InReview' : status === 'approved' ? 'Approved' : status === 'activated' ? 'Activated' : status === 'failed' ? 'Failed' : 'Draft'}` as any);
    return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>;
  };

  const renderDraft = (draft: D, standalone: boolean) => <div key={draft.id} className={`rounded-lg border ${activeId === draft.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-border/20 bg-background/40'}`}>
    <div className="flex items-center gap-2 p-2">
      <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onOpen(draft)}>
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
          <span>{monthLabel(draft.month)}</span>
          <span className="rounded border border-border/40 px-1.5 text-[10px] font-bold text-muted-foreground">v{draft.version}</span>
          {statusChip(draft.status)}
        </div>
        {standalone && draft.title && <p className="mt-1 text-sm font-bold text-foreground break-words">{draft.title}</p>}
        {standalone && draft.description && <p className="mt-1 text-xs text-muted-foreground break-words" style={clamp2}>{draft.description}</p>}
        <p className="mt-1 text-[10px] text-muted-foreground">
          {typeof draft.feedback_count === 'number' && `${draft.feedback_count} ${de ? 'Kommentare' : 'comments'}`}
          {typeof draft.approve_votes === 'number' && `${typeof draft.feedback_count === 'number' ? ' · ' : ''}✓ ${draft.approve_votes} · △ ${draft.needs_changes_votes || 0}`}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">{new Date(draft.created_at).toLocaleString(locale)}{draft.created_by ? ` · ${draft.created_by}` : ''}</p>
      </button>
      <Button type="button" size="icon" variant="ghost" aria-label={`${de ? 'Monat als Excel exportieren' : 'Export month'}: ${monthLabel(draft.month)}, v${draft.version}`} onClick={() => onExportMonth(draft)}><FileSpreadsheet className="h-4 w-4" /></Button>
    </div>
    {renderMonth?.(draft)}
  </div>;

  const entries: Entry<D>[] = [];
  for (const group of groups) {
    if (group.type === 'month') {
      for (const draft of group.drafts) entries.push({ kind: 'draft', key: `d${draft.id}`, time: time(draft.created_at), draft });
    } else if (group.drafts.length) {
      entries.push({ kind: 'group', key: `g${group.id}`, time: time(group.created_at), group });
    }
  }
  entries.sort((left, right) => right.time - left.time);

  return <div className="space-y-3">
    {entries.map(entry => {
      if (entry.kind === 'draft') return renderDraft(entry.draft, true);
      const { group } = entry;
      const defaultTitle = group.type === 'year' ? `${de ? 'Jahresplanung' : 'Year plan'} ${group.year}` : `${de ? 'Quartalsplanung' : 'Quarter plan'} Q${group.quarter} ${group.year}`;
      const title = group.title || defaultTitle;
      const monthCount = new Set(group.drafts.map(draft => draft.month)).size;
      const expected = group.type === 'year' ? 12 : 3;
      const containsActive = activeId !== undefined && group.drafts.some(draft => draft.id === activeId);
      const open = openState[group.id] ?? containsActive;
      const editable = isEditableGroupId(group.id);
      const members = [...group.drafts].sort((left, right) => left.month === right.month ? right.version - left.version : left.month.localeCompare(right.month));
      return <div key={entry.key} className="rounded-xl border border-border/30 bg-background/40">
        <div className="flex items-start gap-2 p-3">
          <button type="button" aria-expanded={open} className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left"
            onClick={() => setOpenState(current => ({ ...current, [group.id]: !open }))}>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-foreground break-words">{title}</h3>
              {group.description && <p className="mt-1 text-xs text-muted-foreground break-words" style={clamp2}>{group.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">{monthCount}/{expected} {de ? 'Monate' : 'months'} · {new Date(group.created_at).toLocaleString(locale)}</p>
            </div>
            <ChevronDown className={`mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
          {editable && <Button type="button" size="icon" variant="ghost" aria-label={de ? 'Titel und Beschreibung bearbeiten' : 'Edit title and description'} onClick={() => startEdit(group, defaultTitle)}><Pencil className="h-4 w-4" /></Button>}
          <Button type="button" size="icon" variant="ghost" aria-label={de ? 'Gesamte Planung als Excel' : 'Export entire plan'} disabled={exporting !== null} onClick={() => void exportGroup(group.id)}>
            <FileSpreadsheet className={`h-4 w-4 ${exporting === group.id ? 'animate-pulse' : ''}`} />
          </Button>
        </div>
        {open && <div className="space-y-2 border-t border-border/20 p-3">
          {editingId === group.id && <div className="space-y-2 rounded-lg border border-border/30 p-2">
            <input value={editTitle} maxLength={200} onChange={event => setEditTitle(event.target.value)} placeholder={de ? 'Titel' : 'Title'} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm" />
            <textarea value={editDescription} maxLength={2000} rows={3} onChange={event => setEditDescription(event.target.value)} placeholder={de ? 'Beschreibung' : 'Description'} className="w-full rounded-lg border border-border/40 bg-background px-3 py-2 text-sm" />
            <div className="flex justify-end gap-2">
              <Button type="button" size="sm" variant="outline" disabled={savingId === group.id} onClick={() => setEditingId(null)}>{de ? 'Abbrechen' : 'Cancel'}</Button>
              <Button type="button" size="sm" disabled={savingId === group.id} onClick={() => void saveEdit(group.id)}>{savingId === group.id ? (de ? 'Speichert…' : 'Saving…') : (de ? 'Speichern' : 'Save')}</Button>
            </div>
          </div>}
          {members.map(draft => renderDraft(draft, false))}
        </div>}
      </div>;
    })}
  </div>;
}
