/* ================================================ */
/* ODIN Assignment Execution Panel                  */
/* Tabbed view of all assignment actions, grouped   */
/* by execution status with refresh + reconcile.   */
/* ================================================ */

import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, GitMerge, AlertTriangle, Clock,
  CheckCircle2, XCircle, Eye, Inbox,
} from 'lucide-react';
import { AssignmentWritebackApi } from '../../../api/assignmentWriteback';
import type { AssignmentAction, ExecutionStatus } from '../../../types/assignmentWriteback';
import { useLanguage } from '../../../context/LanguageContext';
import { AssignmentActionCard } from './AssignmentActionCard';

/* ── Tab definitions ── */

type TabId =
  | 'pending'
  | 'shadow'
  | 'confirm'
  | 'applied'
  | 'unassign_required'
  | 'reassign_required'
  | 'manual_review'
  | 'failed'
  | 'other';

const TAB_STATUSES: Record<TabId, ExecutionStatus[]> = {
  pending:          ['pending', 'validation_failed', 'approved_for_execution'],
  shadow:           ['shadow_validated'],
  confirm:          ['waiting_for_manual_confirmation'],
  applied:          ['assigned_successfully', 'unassigned_successfully', 'reassigned_successfully', 'already_correctly_assigned'],
  unassign_required:['unassign_required', 'unassigning'],
  reassign_required:['reassign_required', 'reassigning'],
  manual_review:    ['manual_review_required', 'blocked_existing_owner', 'blocked_human_owner_conflict', 'failed_verification'],
  failed:           ['failed'],
  other:            ['skipped', 'cancelled', 'executing', 'no_op' as ExecutionStatus],
};

const COPY = {
  de: {
    title:            'Zuweisung Ausführung',
    subtitle:         'Kontrollierte Jarvis-Schreiboperationen mit Audit-Protokoll',
    tabPending:       'Ausstehend',
    tabShadow:        'Shadow geprüft',
    tabConfirm:       'Warte Bestätigung',
    tabApplied:       'Angewendet',
    tabUnassign:      'Abweisung nötig',
    tabReassign:      'Neuzuweisung nötig',
    tabManualReview:  'Manuelle Prüfung',
    tabFailed:        'Fehlgeschlagen',
    tabOther:         'Sonstige',
    empty:            'Keine Aktionen in dieser Kategorie.',
    refresh:          'Aktualisieren',
    reconcile:        'Abgleichen',
    reconcileInfo:    'Vergleicht Snapshot-Zustand mit aktuellem ODIN-Zustand.',
    reconcileResult:  'Abgleich-Ergebnis:',
    loading:          'Lade Aktionen...',
    error:            'Fehler beim Laden:',
    killSwitch:       'Kill-Switch aktiv — alle Schreiboperationen gesperrt.',
    shadowMode:       'Shadow-Modus: Aktionen werden geprüft, aber Jarvis wird nicht geändert.',
    modeLabel:        'Modus:',
    snapshotCount:    'Snapshots:',
    discrepancies:    'Abweichungen:',
  },
  en: {
    title:            'Assignment Execution',
    subtitle:         'Controlled Jarvis write-back with full audit trail',
    tabPending:       'Pending',
    tabShadow:        'Shadow Validated',
    tabConfirm:       'Awaiting Confirmation',
    tabApplied:       'Applied',
    tabUnassign:      'Unassign Required',
    tabReassign:      'Reassign Required',
    tabManualReview:  'Manual Review',
    tabFailed:        'Failed',
    tabOther:         'Other',
    empty:            'No actions in this category.',
    refresh:          'Refresh',
    reconcile:        'Reconcile',
    reconcileInfo:    'Compares snapshot state with current ODIN state.',
    reconcileResult:  'Reconcile result:',
    loading:          'Loading actions...',
    error:            'Error loading:',
    killSwitch:       'Kill switch active — all write operations are blocked.',
    shadowMode:       'Shadow mode: actions are validated but Jarvis is not modified.',
    modeLabel:        'Mode:',
    snapshotCount:    'Snapshots:',
    discrepancies:    'Discrepancies:',
  },
} as const;

interface TabConfig {
  id: TabId;
  labelKey: keyof typeof COPY.de;
  icon: React.ReactNode;
  alertStyle?: boolean;
}

const TABS: TabConfig[] = [
  { id: 'pending',           labelKey: 'tabPending',      icon: <Clock className="w-3.5 h-3.5" /> },
  { id: 'shadow',            labelKey: 'tabShadow',       icon: <Eye className="w-3.5 h-3.5" /> },
  { id: 'confirm',           labelKey: 'tabConfirm',      icon: <AlertTriangle className="w-3.5 h-3.5" />, alertStyle: true },
  { id: 'applied',           labelKey: 'tabApplied',      icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  { id: 'unassign_required', labelKey: 'tabUnassign',     icon: <AlertTriangle className="w-3.5 h-3.5" />, alertStyle: true },
  { id: 'reassign_required', labelKey: 'tabReassign',     icon: <AlertTriangle className="w-3.5 h-3.5" />, alertStyle: true },
  { id: 'manual_review',     labelKey: 'tabManualReview', icon: <AlertTriangle className="w-3.5 h-3.5" />, alertStyle: true },
  { id: 'failed',            labelKey: 'tabFailed',       icon: <XCircle className="w-3.5 h-3.5" />, alertStyle: true },
  { id: 'other',             labelKey: 'tabOther',        icon: <Inbox className="w-3.5 h-3.5" /> },
];

function filterByTab(actions: AssignmentAction[], tab: TabId): AssignmentAction[] {
  const statuses = new Set<string>(TAB_STATUSES[tab]);
  return actions.filter(a => statuses.has(a.execution_status));
}

interface ReconcileState {
  loading: boolean;
  result: { snapshotCount: number; discrepancies: number } | null;
  error: string | null;
}

export function AssignmentExecutionPanel() {
  const { language } = useLanguage();
  const t = COPY[language] ?? COPY.de;
  const [activeTab, setActiveTab] = useState<TabId>('pending');
  const [actions, setActions] = useState<AssignmentAction[]>([]);
  const [settings, setSettings] = useState<{ mode: string; enabled: boolean; killSwitch: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reconcile, setReconcile] = useState<ReconcileState>({ loading: false, result: null, error: null });

  const loadActions = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await AssignmentWritebackApi.listActions({ limit: 500 });
      setActions(res.actions);
      setSettings(res.settings);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadActions(); }, [loadActions]);

  async function doReconcile() {
    setReconcile({ loading: true, result: null, error: null });
    try {
      const res = await AssignmentWritebackApi.reconcile();
      const discrepancies = res.items?.filter(i =>
        !['correctly_assigned', 'unassigned_no_action', 'assigned_no_action'].includes(i.state)
      ).length ?? 0;
      setReconcile({ loading: false, result: { snapshotCount: res.snapshotCount, discrepancies }, error: null });
    } catch (e: unknown) {
      setReconcile({ loading: false, result: null, error: e instanceof Error ? e.message : String(e) });
    }
  }

  const tabActions = filterByTab(actions, activeTab);
  const tabCounts = Object.fromEntries(
    TABS.map(tab => [tab.id, filterByTab(actions, tab.id).length])
  ) as Record<TabId, number>;

  return (
    <div className="flex flex-col gap-4">
      {/* Panel header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">{t.title}</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{t.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadActions}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-600/40 text-zinc-300 hover:bg-zinc-700/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {t.refresh}
          </button>
          <button
            onClick={doReconcile}
            disabled={reconcile.loading}
            title={t.reconcileInfo}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-sky-500/30 text-sky-300 hover:bg-sky-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <GitMerge className={`w-3.5 h-3.5 ${reconcile.loading ? 'animate-spin' : ''}`} />
            {t.reconcile}
          </button>
        </div>
      </div>

      {/* Kill switch / mode banners */}
      {settings?.killSwitch && (
        <div className="flex items-center gap-2 bg-red-900/30 border border-red-500/30 rounded-lg px-4 py-2">
          <XCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-xs text-red-300">{t.killSwitch}</span>
        </div>
      )}
      {settings && !settings.killSwitch && settings.mode === 'shadow_only' && (
        <div className="flex items-center gap-2 bg-sky-900/30 border border-sky-500/30 rounded-lg px-4 py-2">
          <Eye className="w-4 h-4 text-sky-400 shrink-0" />
          <span className="text-xs text-sky-300">
            {t.shadowMode}
            <span className="ml-2 text-sky-500">{t.modeLabel} shadow_only</span>
          </span>
        </div>
      )}

      {/* Reconcile result */}
      {reconcile.result && (
        <div className="text-xs text-zinc-300 bg-zinc-800/40 border border-zinc-700/30 rounded px-3 py-2 flex gap-4">
          <span>{t.reconcileResult}</span>
          <span>{t.snapshotCount} <strong>{reconcile.result.snapshotCount}</strong></span>
          <span className={reconcile.result.discrepancies > 0 ? 'text-amber-300' : 'text-green-300'}>
            {t.discrepancies} <strong>{reconcile.result.discrepancies}</strong>
          </span>
        </div>
      )}
      {reconcile.error && (
        <div className="text-xs text-red-300 bg-red-900/20 border border-red-500/20 rounded px-3 py-2">{reconcile.error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-0.5 flex-wrap border-b border-zinc-700/40 pb-0">
        {TABS.map(tab => {
          const count = tabCounts[tab.id];
          const isActive = activeTab === tab.id;
          const hasAlert = tab.alertStyle && count > 0;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                'flex items-center gap-1.5 px-3 py-2 text-xs rounded-t transition-colors border-b-2',
                isActive
                  ? 'border-sky-500 text-sky-300 bg-sky-500/10'
                  : hasAlert
                    ? 'border-transparent text-amber-400 hover:text-amber-300 hover:bg-zinc-700/30'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/30',
              ].join(' ')}
            >
              <span className={isActive ? 'text-sky-400' : hasAlert ? 'text-amber-400' : 'text-zinc-500'}>
                {tab.icon}
              </span>
              {t[tab.labelKey]}
              {count > 0 && (
                <span className={[
                  'text-xs rounded-full px-1.5 py-0 font-medium min-w-[18px] text-center',
                  hasAlert ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-600/40 text-zinc-300',
                ].join(' ')}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-zinc-400 py-8 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" /> {t.loading}
          </div>
        )}
        {!loading && error && (
          <div className="text-sm text-red-300 py-4 text-center">
            {t.error} {error}
          </div>
        )}
        {!loading && !error && tabActions.length === 0 && (
          <div className="text-sm text-zinc-500 py-8 text-center">{t.empty}</div>
        )}
        {!loading && !error && tabActions.map(action => (
          <AssignmentActionCard key={action.id} action={action} onRefresh={loadActions} />
        ))}
      </div>
    </div>
  );
}
