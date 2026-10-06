import { useState, type ReactNode } from 'react';
import { ChevronDown, FileSpreadsheet } from 'lucide-react';
import { useLanguage, getLanguageLocale } from '../../context/LanguageContext';
import { exportPlanningGroup, type PlanningDraftGroup, type PlanningDraftSummary } from '../../api/planningPeriods';
import { Button } from '../ui/button';

interface Props<D extends PlanningDraftSummary> {
  groups: PlanningDraftGroup<D>[];
  activeId?: number;
  onOpen: (draft: D) => void;
  onExportMonth: (draft: D) => void;
  onError: (message: string) => void;
  renderMonth?: (draft: D) => ReactNode;
}

export function GroupedDraftList<D extends PlanningDraftSummary>({ groups, activeId, onOpen, onExportMonth, onError, renderMonth }: Props<D>) {
  const { language, t } = useLanguage();
  const de = language === 'de';
  const locale = getLanguageLocale(language);
  const [exporting, setExporting] = useState<string | null>(null);
  const monthLabel = (month: string) => new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  async function exportGroup(id: string) {
    setExporting(id);
    try { await exportPlanningGroup(id); }
    catch { onError(de ? 'Der Planungsexport ist fehlgeschlagen.' : 'Unable to export the plan.'); }
    finally { setExporting(null); }
  }

  return <div className="space-y-3">
    {groups.map(group => {
      const title = group.type === 'year' ? `${de ? 'Jahresplanung' : 'Year plan'} ${group.year}`
        : group.type === 'quarter' ? `${de ? 'Quartalsplanung' : 'Quarter plan'} Q${group.quarter} ${group.year}`
        : monthLabel(group.drafts[0].month);
      const monthCount = new Set(group.drafts.map(draft => draft.month)).size;
      const expected = group.type === 'year' ? 12 : group.type === 'quarter' ? 3 : 1;
      return <details key={group.id} className="group rounded-xl border border-border/30 bg-background/40">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-left [&::-webkit-details-marker]:hidden">
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-foreground">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{group.type === 'month'
              ? `${group.drafts.length} ${de ? 'Versionen' : 'versions'}`
              : `${monthCount}/${expected} ${de ? 'Monate' : 'months'}`} · {new Date(group.created_at).toLocaleString(locale)}</p>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-border/20 p-3">
          {group.type !== 'month' && <Button type="button" size="sm" variant="outline" className="w-full" disabled={exporting !== null} onClick={() => void exportGroup(group.id)}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />{exporting === group.id ? (de ? 'Excel wird erstellt…' : 'Exporting…') : (de ? 'Gesamte Planung als Excel' : 'Export entire plan')}
          </Button>}
          {group.drafts.map(draft => <div key={draft.id} className={`rounded-lg border ${activeId === draft.id ? 'border-blue-500/50 bg-blue-500/10' : 'border-border/20'}`}>
            <div className="flex items-center gap-2 p-2">
              <button type="button" className="flex-1 min-w-0 text-left" onClick={() => onOpen(draft)}>
                <div className="text-sm font-semibold text-foreground">{monthLabel(draft.month)} <span className="text-xs text-muted-foreground">v{draft.version}</span></div>
                {draft.title && <p className="text-xs text-muted-foreground">{draft.title}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{t(`sc.status${draft.status === 'in_review' ? 'InReview' : draft.status === 'approved' ? 'Approved' : draft.status === 'activated' ? 'Activated' : draft.status === 'failed' ? 'Failed' : 'Draft'}` as any)}
                  {typeof draft.feedback_count === 'number' && ` · ${draft.feedback_count} ${de ? 'Kommentare' : 'comments'}`}</p>
                {draft.note && <p className="mt-1 text-xs text-muted-foreground break-words">{draft.note}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">{new Date(draft.created_at).toLocaleString(locale)}{draft.created_by ? ` · ${draft.created_by}` : ''}</p>
                {typeof draft.approve_votes === 'number' && <p className="mt-1 text-[10px] text-muted-foreground">✓ {draft.approve_votes} · △ {draft.needs_changes_votes || 0}</p>}
              </button>
              <Button type="button" size="icon" variant="ghost" aria-label={`${de ? 'Monat als Excel exportieren' : 'Export month'}: ${monthLabel(draft.month)}, v${draft.version}`} onClick={() => onExportMonth(draft)}><FileSpreadsheet className="h-4 w-4" /></Button>
            </div>
            {renderMonth?.(draft)}
          </div>)}
        </div>
      </details>;
    })}
  </div>;
}
