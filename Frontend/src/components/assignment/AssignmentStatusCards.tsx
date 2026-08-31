/* ================================================ */
/* ODIN-Logik — Status Cards (Top Row)              */
/* ================================================ */

import type { AssignmentHealth, AssignmentRun } from '../../types/assignment';
import { Activity, CheckCircle, AlertTriangle, XCircle, Clock, Eye, AlertCircle } from 'lucide-react';
import { getLanguageLocale, useLanguage } from '../../context/LanguageContext';

interface Props {
  health: AssignmentHealth | null;
  lastRun: AssignmentRun | null;
}

const modeBadge: Record<string, { label: string; className: string }> = {
  shadow: { label: 'Shadow', className: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  live: { label: 'Live', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  'dry-run': { label: 'Dry-Run', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
};

const resultBadge: Record<string, { label: string; className: string }> = {
  running: { label: 'Läuft', className: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  completed: { label: 'Abgeschlossen', className: 'bg-green-500/20 text-green-400 border-green-500/30' },
  failed: { label: 'Fehlgeschlagen', className: 'bg-red-500/20 text-red-400 border-red-500/30' },
  cancelled: { label: 'Abgebrochen', className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

export function AssignmentStatusCards({ health, lastRun }: Props) {
  const { language } = useLanguage();
  const isGerman = language === 'de';
  const locale = getLanguageLocale(language);
  const mode = health?.mode || 'shadow';
  const mb = modeBadge[mode] || modeBadge.shadow;
  const rb = lastRun ? (resultBadge[lastRun.status] || resultBadge.completed) : null;

  const cards = [
    {
      label: isGerman ? 'Modus' : 'Mode',
      icon: Eye,
      value: (
        <span className={`text-xs font-black px-2 py-0.5 rounded border ${mb.className}`}>
          {mb.label}
        </span>
      ),
    },
    {
      label: isGerman ? 'Letzter Lauf' : 'Last run',
      icon: Clock,
      value: lastRun
        ? new Date(lastRun.started_at).toLocaleString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
        : '–',
    },
    {
      label: 'Status',
      icon: Activity,
      value: rb ? (
        <span className={`text-xs font-bold px-2 py-0.5 rounded border ${rb.className}`}>
          {rb.label}
        </span>
      ) : '–',
    },
    {
      label: isGerman ? 'Zugewiesen' : 'Assigned',
      icon: CheckCircle,
      value: lastRun?.assigned ?? '–',
      valueClass: 'text-green-400',
    },
    {
      label: isGerman ? 'Manuelle Prüfung' : 'Manual review',
      icon: AlertTriangle,
      value: lastRun?.manual_review ?? '–',
      valueClass: 'text-amber-400',
    },
    {
      label: isGerman ? 'Fehler' : 'Errors',
      icon: XCircle,
      value: lastRun?.errors ?? '–',
      valueClass: 'text-red-400',
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-lg border border-border/40 bg-card/60 backdrop-blur-sm p-4 flex flex-col gap-1"
          >
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <c.icon className="w-3.5 h-3.5" />
              {c.label}
            </div>
            <div className={`text-lg font-bold ${'valueClass' in c ? c.valueClass : ''}`}>
              {c.value}
            </div>
          </div>
        ))}
      </div>
      {/* Failure reason banner for last run */}
      {lastRun && (lastRun.status === 'failed' || lastRun.status === 'cancelled') && lastRun.failure_reason && (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-red-400 mb-0.5">{isGerman ? 'Letzter Lauf fehlgeschlagen' : 'Last run failed'}</div>
            <p className="text-sm text-red-300">{lastRun.failure_reason}</p>
            {lastRun.failure_step && (
              <p className="text-xs text-muted-foreground mt-1">{isGerman ? 'Fehlgeschlagener Schritt:' : 'Failed step:'} <span className="font-mono">{lastRun.failure_step}</span></p>
            )}
          </div>
          {lastRun.error_category && (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded border bg-red-500/20 text-red-300 border-red-500/30 uppercase tracking-wider">
              {lastRun.error_category === 'technical_error' ? (isGerman ? 'Technisch' : 'Technical') :
               lastRun.error_category === 'controlled_stop' ? (isGerman ? 'Kontrolliert' : 'Controlled') :
               lastRun.error_category === 'critical_error_stop' ? (isGerman ? 'Kritisch' : 'Critical') :
               lastRun.error_category}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
