/* ================================================ */
/* ODIN Assignment Execution — Audit Log Drawer     */
/* Shows the full immutable audit trail for one     */
/* assignment action.                               */
/* ================================================ */

import { useEffect, useState } from 'react';
import {
  CheckCircle2, XCircle, AlertTriangle, Info, Clock,
  FileText, Image, ChevronDown, ChevronUp,
} from 'lucide-react';
import { AssignmentWritebackApi } from '../../../api/assignmentWriteback';
import type { AssignmentAuditLog } from '../../../types/assignmentWriteback';
import { useLanguage } from '../../../context/LanguageContext';

const COPY = {
  de: {
    title: 'Audit-Protokoll',
    loading: 'Lade Audit-Protokoll...',
    empty: 'Keine Audit-Einträge vorhanden.',
    screenshot: 'Screenshot',
    diagnostics: 'Diagnose-HTML',
    before: 'Vorher',
    after: 'Nachher',
    validation: 'Validierung',
    close: 'Schließen',
  },
  en: {
    title: 'Audit Log',
    loading: 'Loading audit log...',
    empty: 'No audit entries found.',
    screenshot: 'Screenshot',
    diagnostics: 'Diagnostic HTML',
    before: 'Before',
    after: 'After',
    validation: 'Validation',
    close: 'Close',
  },
} as const;

const EVENT_ICONS: Record<string, React.ReactNode> = {
  validation_passed: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  execution_success: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  shadow_validated: <CheckCircle2 className="w-4 h-4 text-sky-400" />,
  final_owner_verified: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  already_correctly_assigned: <CheckCircle2 className="w-4 h-4 text-green-400" />,
  validation_failed: <XCircle className="w-4 h-4 text-red-400" />,
  execution_failed: <XCircle className="w-4 h-4 text-red-400" />,
  final_owner_verification_failed: <XCircle className="w-4 h-4 text-red-400" />,
  manual_review_required: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  kill_switch_blocked: <AlertTriangle className="w-4 h-4 text-red-400" />,
  stale_data_blocked: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  freshness_check_failed: <AlertTriangle className="w-4 h-4 text-amber-400" />,
  duplicate_employee_blocked: <AlertTriangle className="w-4 h-4 text-amber-400" />,
};

function getEventIcon(eventType: string) {
  return EVENT_ICONS[eventType] ?? <Info className="w-4 h-4 text-zinc-400" />;
}

function formatEventType(et: string) {
  return et.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

interface ExpandableJsonProps {
  label: string;
  data: Record<string, unknown> | null;
}

function ExpandableJson({ label, data }: ExpandableJsonProps) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  return (
    <div className="mt-1">
      <button
        className="flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        onClick={() => setOpen(v => !v)}
      >
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {label}
      </button>
      {open && (
        <pre className="mt-1 text-xs bg-zinc-900/60 border border-zinc-700/40 rounded p-2 overflow-auto max-h-48 text-zinc-300 whitespace-pre-wrap">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

interface Props {
  actionId: number;
  onClose: () => void;
}

export function AssignmentAuditDrawer({ actionId, onClose }: Props) {
  const { language } = useLanguage();
  const t = COPY[language] ?? COPY.de;
  const [logs, setLogs] = useState<AssignmentAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    AssignmentWritebackApi.getAuditLog(actionId)
      .then(res => setLogs(res.logs ?? res.auditLogs ?? []))
      .catch(() => setLogs([]))
      .finally(() => setLoading(false));
  }, [actionId]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end bg-black/60 backdrop-blur-sm">
      <div className="h-full w-full max-w-2xl bg-[#0f1117] border-l border-zinc-700/50 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700/40">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-sky-400" />
            <span className="font-semibold text-white text-sm">{t.title}</span>
            <span className="text-xs text-zinc-400">#{actionId}</span>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white text-xs border border-zinc-600/40 px-3 py-1.5 rounded hover:bg-zinc-700/40 transition-colors"
          >
            {t.close}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {loading && (
            <div className="text-sm text-zinc-400 py-8 text-center">{t.loading}</div>
          )}
          {!loading && logs.length === 0 && (
            <div className="text-sm text-zinc-500 py-8 text-center">{t.empty}</div>
          )}
          {!loading && logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-zinc-700/30 bg-zinc-800/30 p-3"
            >
              <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">
                  {getEventIcon(log.event_type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium text-zinc-200">
                      {formatEventType(log.event_type)}
                    </span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(log.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  {log.message && (
                    <p className="mt-0.5 text-xs text-zinc-300 break-words">{log.message}</p>
                  )}
                  <ExpandableJson label={t.before} data={log.before_state_json} />
                  <ExpandableJson label={t.after} data={log.after_state_json} />
                  <ExpandableJson label={t.validation} data={log.validation_json} />
                  {(log.screenshot_path || log.diagnostic_html_path) && (
                    <div className="mt-1 flex gap-2 flex-wrap">
                      {log.screenshot_path && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-400 border border-amber-500/30 rounded px-1.5 py-0.5">
                          <Image className="w-3 h-3" /> {t.screenshot}
                        </span>
                      )}
                      {log.diagnostic_html_path && (
                        <span className="inline-flex items-center gap-1 text-xs text-orange-400 border border-orange-500/30 rounded px-1.5 py-0.5">
                          <FileText className="w-3 h-3" /> {t.diagnostics}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
