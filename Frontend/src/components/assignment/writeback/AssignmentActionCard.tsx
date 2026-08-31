/* ================================================ */
/* ODIN Assignment Execution — Action Card          */
/* One card per assignment action, with all detail  */
/* fields and contextual action buttons.            */
/* ================================================ */

import { useState } from 'react';
import {
  CheckCircle2, XCircle, Play, Ban, Eye, AlertTriangle,
  ChevronDown, ChevronUp, User, Hash, Monitor, Inbox,
  Clock, RefreshCw,
} from 'lucide-react';
import type { AssignmentAction } from '../../../types/assignmentWriteback';
import { AssignmentWritebackApi } from '../../../api/assignmentWriteback';
import { useLanguage } from '../../../context/LanguageContext';
import { AssignmentAuditDrawer } from './AssignmentAuditDrawer';
import {
  ExecutionStatusBadge,
  ActionTypeBadge,
  WritebackModeBadge,
} from './AssignmentStatusBadges';

const COPY = {
  de: {
    activityNr:       'Aktivität',
    soNr:             'Auftragsnr.',
    queue:            'Queue',
    subType:          'Sub-Typ',
    system:           'System',
    currentOwner:     'Aktueller Jarvis-Owner',
    selectedEmployee: 'ODIN-Auswahl',
    jarvisName:       'Jarvis-Name',
    ownerCode:        'Owner-Code',
    actionType:       'Aktion',
    mode:             'Modus',
    executionStatus:  'Status',
    validationStatus: 'Validierung',
    created:          'Erstellt',
    lastAttempt:      'Letzter Versuch',
    failureReason:    'Fehlergrund',
    hardReason:       'Grund (hart)',
    retryCount:       'Versuche',
    btnValidate:      'Prüfen',
    btnApprove:       'Freigeben',
    btnExecute:       'Ausführen',
    btnCancel:        'Abbrechen',
    btnAudit:         'Protokoll',
    confirmExecute:   'Ausführung wirklich starten? Diese Aktion ändert den Jarvis-Owner.',
    confirmCancel:    'Aktion wirklich abbrechen?',
    shadowBanner:     'Shadow-Modus aktiv: ODIN würde diese Zuweisung vornehmen, Jarvis wird jedoch nicht geändert.',
    manualReviewNote: 'Manuelle Prüfung erforderlich',
    noEmployee:       '(nicht gewählt)',
    unknown:          '–',
    expand:           'Details',
    collapse:         'Einklappen',
  },
  en: {
    activityNr:       'Activity',
    soNr:             'Sales Order',
    queue:            'Queue',
    subType:          'Sub Type',
    system:           'System',
    currentOwner:     'Current Jarvis Owner',
    selectedEmployee: 'ODIN Selection',
    jarvisName:       'Jarvis Name',
    ownerCode:        'Owner Code',
    actionType:       'Action',
    mode:             'Mode',
    executionStatus:  'Status',
    validationStatus: 'Validation',
    created:          'Created',
    lastAttempt:      'Last Attempt',
    failureReason:    'Failure Reason',
    hardReason:       'Hard Reason',
    retryCount:       'Attempts',
    btnValidate:      'Validate',
    btnApprove:       'Approve',
    btnExecute:       'Execute',
    btnCancel:        'Cancel',
    btnAudit:         'Audit Log',
    confirmExecute:   'Really execute? This will change the Jarvis owner.',
    confirmCancel:    'Really cancel this action?',
    shadowBanner:     'Shadow mode active: ODIN would apply this assignment, but Jarvis will not be changed.',
    manualReviewNote: 'Manual review required',
    noEmployee:       '(none selected)',
    unknown:          '–',
    expand:           'Details',
    collapse:         'Collapse',
  },
} as const;

interface Props {
  action: AssignmentAction;
  onRefresh: () => void;
}

export function AssignmentActionCard({ action: initial, onRefresh }: Props) {
  const { language } = useLanguage();
  const t = COPY[language] ?? COPY.de;
  const isGerman = language === 'de';
  const [action, setAction] = useState<AssignmentAction>(initial);
  const [expanded, setExpanded] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isShadow = action.execution_mode === 'shadow_only';
  const isManualReview = action.execution_status === 'manual_review_required';
  const canValidate = ['pending', 'validation_failed'].includes(action.execution_status);
  const canApprove = action.execution_status === 'waiting_for_manual_confirmation';
  const canExecute = ['approved_for_execution', 'shadow_validated'].includes(action.execution_status);
  const canCancel = !['cancelled', 'assigned_successfully', 'unassigned_successfully', 'reassigned_successfully', 'already_correctly_assigned'].includes(action.execution_status);

  async function doValidate() {
    setLoading('validate'); setError(null);
    try {
      await AssignmentWritebackApi.validate(action.id);
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(null); }
  }

  async function doApprove() {
    setLoading('approve'); setError(null);
    try {
      await AssignmentWritebackApi.approve(action.id);
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(null); }
  }

  async function doExecute() {
    if (!window.confirm(t.confirmExecute)) return;
    setLoading('execute'); setError(null);
    try {
      const res = await AssignmentWritebackApi.execute(action.id);
      setAction(prev => ({ ...prev, execution_status: res.status as AssignmentAction['execution_status'] }));
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(null); }
  }

  async function doCancel() {
    if (!window.confirm(t.confirmCancel)) return;
    setLoading('cancel'); setError(null);
    try {
      await AssignmentWritebackApi.cancel(action.id);
      onRefresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setLoading(null); }
  }

  const fmt = (v: string | null | undefined) => v ?? t.unknown;
  const fmtTime = (v: string | null | undefined) =>
    v ? new Date(v).toLocaleString(isGerman ? 'de-DE' : 'en-GB') : t.unknown;

  return (
    <>
      <div className="rounded-xl border border-zinc-700/40 bg-zinc-800/30 hover:bg-zinc-800/50 transition-colors">
        {/* Shadow mode banner */}
        {isShadow && (
          <div className="flex items-start gap-2 bg-sky-900/30 border-b border-sky-500/30 rounded-t-xl px-4 py-2">
            <AlertTriangle className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <span className="text-xs text-sky-300">{t.shadowBanner}</span>
          </div>
        )}
        {/* Manual review banner */}
        {isManualReview && (
          <div className="flex items-start gap-2 bg-amber-900/20 border-b border-amber-500/30 rounded-t-xl px-4 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span className="text-xs text-amber-300">
              {t.manualReviewNote}
              {action.hard_reassign_reason && ` — ${action.hard_reassign_reason}`}
              {action.failure_reason && ` — ${action.failure_reason}`}
            </span>
          </div>
        )}

        <div className="px-4 py-3">
          {/* Row 1: IDs + badges */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="font-mono text-sm font-semibold text-white flex items-center gap-1">
              <Hash className="w-3.5 h-3.5 text-zinc-400" />
              {action.activity_number}
            </span>
            {action.sales_order_number && (
              <span className="text-xs text-zinc-400">SO: {action.sales_order_number}</span>
            )}
            <ActionTypeBadge type={action.action_type} isGerman={isGerman} />
            <ExecutionStatusBadge status={action.execution_status} isGerman={isGerman} />
            <WritebackModeBadge mode={action.execution_mode} isGerman={isGerman} />
          </div>

          {/* Row 2: key fields grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1 text-xs mb-3">
            {action.queue_type && (
              <div className="flex items-center gap-1 text-zinc-300">
                <Inbox className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-zinc-500">{t.queue}:</span>
                <span className="truncate">{action.queue_type}</span>
              </div>
            )}
            {action.sub_type && (
              <div className="flex items-center gap-1 text-zinc-300">
                <span className="text-zinc-500">{t.subType}:</span>
                <span className="truncate">{action.sub_type}</span>
              </div>
            )}
            {action.system_name && (
              <div className="flex items-center gap-1 text-zinc-300">
                <Monitor className="w-3 h-3 text-zinc-500 shrink-0" />
                <span className="text-zinc-500">{t.system}:</span>
                <span className="truncate">{action.system_name}</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-zinc-300">
              <User className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="text-zinc-500">{t.currentOwner}:</span>
              <span className="font-mono truncate">{fmt(action.current_jarvis_owner_code)}</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-300">
              <User className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="text-zinc-500">{t.selectedEmployee}:</span>
              <span className="truncate">{fmt(action.selected_employee_name)}</span>
            </div>
            {action.selected_employee_jarvis_owner_code && (
              <div className="flex items-center gap-1 text-zinc-300">
                <span className="text-zinc-500">{t.ownerCode}:</span>
                <span className="font-mono">{action.selected_employee_jarvis_owner_code}</span>
              </div>
            )}
          </div>

          {/* Validation errors */}
          {action.validation_status === 'failed' && action.validation_errors_json && action.validation_errors_json.length > 0 && (
            <div className="mb-2 rounded bg-red-900/20 border border-red-500/30 px-3 py-2">
              <ul className="text-xs text-red-300 space-y-0.5 list-disc list-inside">
                {action.validation_errors_json.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}

          {/* Failure reason */}
          {action.failure_reason && !isManualReview && (
            <div className="mb-2 rounded bg-red-900/20 border border-red-500/20 px-3 py-1.5 text-xs text-red-300">
              {t.failureReason}: {action.failure_reason}
            </div>
          )}

          {/* Error from local operation */}
          {error && (
            <div className="mb-2 rounded bg-red-900/20 border border-red-500/30 px-3 py-1.5 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Expandable detail */}
          {expanded && (
            <div className="mt-2 mb-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs text-zinc-400 border-t border-zinc-700/40 pt-3">
              <div><span className="text-zinc-500">{t.created}: </span>{fmtTime(action.created_at)}</div>
              <div><span className="text-zinc-500">{t.lastAttempt}: </span>{fmtTime(action.executed_at ?? action.failed_at)}</div>
              <div><span className="text-zinc-500">{t.retryCount}: </span>{action.retry_count}</div>
              {action.hard_reassign_reason && (
                <div className="col-span-full"><span className="text-zinc-500">{t.hardReason}: </span>{action.hard_reassign_reason}</div>
              )}
              {action.last_error && (
                <div className="col-span-full"><span className="text-zinc-500">Last error: </span>{action.last_error}</div>
              )}
              {action.approved_by && (
                <div><span className="text-zinc-500">Approved by: </span>{action.approved_by}</div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {canValidate && (
              <button
                disabled={loading !== null}
                onClick={doValidate}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-sky-500/40 text-sky-300 hover:bg-sky-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {loading === 'validate' ? <RefreshCw className="w-3 h-3 animate-spin" /> : t.btnValidate}
              </button>
            )}
            {canApprove && (
              <button
                disabled={loading !== null}
                onClick={doApprove}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-green-500/40 text-green-300 hover:bg-green-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {loading === 'approve' ? <RefreshCw className="w-3 h-3 animate-spin" /> : t.btnApprove}
              </button>
            )}
            {canExecute && !isShadow && (
              <button
                disabled={loading !== null}
                onClick={doExecute}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                {loading === 'execute' ? <RefreshCw className="w-3 h-3 animate-spin" /> : t.btnExecute}
              </button>
            )}
            {canCancel && (
              <button
                disabled={loading !== null}
                onClick={doCancel}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
                {loading === 'cancel' ? <RefreshCw className="w-3 h-3 animate-spin" /> : t.btnCancel}
              </button>
            )}
            <button
              onClick={() => setShowAudit(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-zinc-600/40 text-zinc-300 hover:bg-zinc-700/30 transition-colors"
            >
              <Eye className="w-3.5 h-3.5" />
              {t.btnAudit}
            </button>
            <button
              onClick={() => setExpanded(v => !v)}
              className="ml-auto flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              {expanded ? t.collapse : t.expand}
            </button>
          </div>
        </div>
      </div>

      {showAudit && (
        <AssignmentAuditDrawer actionId={action.id} onClose={() => setShowAudit(false)} />
      )}
    </>
  );
}
