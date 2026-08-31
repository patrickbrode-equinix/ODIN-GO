/* ================================================ */
/* ODIN-Logik — Decision Table                      */
/* ================================================ */

import { useAssignmentStore } from '../../store/assignmentStore';
import type { AssignmentDecision, DecisionResult } from '../../types/assignment';
import { Eye, CheckCircle2, XCircle, HelpCircle, Ban, AlertTriangle } from 'lucide-react';
import { InfoTooltip } from '../ui/InfoTooltip';
import {
  formatAssignmentRemainingHours,
  getAssignmentActivity,
  getAssignmentDisplayTicketNumber,
  getAssignmentInternalTicketId,
  getAssignmentRemainingHours,
  getAssignmentSystemName,
  getAssignmentTicketCategory,
} from '../../utils/assignmentTicketDisplay';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  decisions: AssignmentDecision[];
}

export function AssignmentDecisionTable({ decisions }: Props) {
  const { selectDecision } = useAssignmentStore();
  const { language } = useLanguage();
  const isGerman = language === 'de';

  const resultStyles: Record<DecisionResult, { label: string; className: string; icon: React.ReactNode; explanation: string }> = {
    assigned: {
      label: isGerman ? 'Zugewiesen' : 'Assigned',
      className: 'bg-green-500/20 text-green-400 border-green-500/30',
      icon: <CheckCircle2 className="w-3 h-3" />,
      explanation: isGerman ? 'Ticket wurde erfolgreich einem Mitarbeiter zugewiesen.' : 'The ticket was assigned to an employee successfully.',
    },
    manual_review: {
      label: isGerman ? 'Manuelle Prüfung' : 'Manual review',
      className: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      icon: <HelpCircle className="w-3 h-3" />,
      explanation: isGerman ? 'Kein automatisch geeigneter Kandidat gefunden. Der Dispatcher muss manuell entscheiden.' : 'No suitable candidate was found automatically. A dispatcher must decide manually.',
    },
    no_candidate: {
      label: isGerman ? 'Kein Kandidat' : 'No candidate',
      className: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      icon: <AlertTriangle className="w-3 h-3" />,
      explanation: isGerman ? 'Nach Anwendung aller Berechtigungsregeln blieb kein zulässiger Mitarbeiter übrig.' : 'No eligible employee remained after all eligibility rules were applied.',
    },
    not_relevant: {
      label: isGerman ? 'Nicht relevant' : 'Not relevant',
      className: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
      icon: <Ban className="w-3 h-3" />,
      explanation: isGerman ? 'Ticket hat die Relevanzprüfung nicht bestanden.' : 'The ticket did not pass the relevance check.',
    },
    blocked: {
      label: isGerman ? 'Gesperrt' : 'Blocked',
      className: 'bg-red-500/20 text-red-300 border-red-500/30',
      icon: <Ban className="w-3 h-3" />,
      explanation: isGerman ? 'Ticket wurde durch einen manuellen Override blockiert.' : 'The ticket was blocked by a manual override.',
    },
    error: {
      label: isGerman ? 'Fehler' : 'Error',
      className: 'bg-red-600/20 text-red-400 border-red-600/30',
      icon: <XCircle className="w-3 h-3" />,
      explanation: isGerman ? 'Ein technischer Fehler ist bei der Verarbeitung dieses Tickets aufgetreten.' : 'A technical error occurred while processing this ticket.',
    },
    crawler_stale: {
      label: isGerman ? 'Crawler veraltet' : 'Crawler stale',
      className: 'bg-yellow-600/20 text-yellow-400 border-yellow-600/30',
      icon: <AlertTriangle className="w-3 h-3" />,
      explanation: isGerman ? 'Die Crawler-Daten sind veraltet. Die Zuweisung wurde übersprungen.' : 'Crawler data is stale. Assignment was skipped.',
    },
  };

  if (decisions.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-8">
        {isGerman ? 'Keine Entscheidungen vorhanden.' : 'No decisions available.'}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/30 text-xs text-muted-foreground">
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Ticketnummer' : 'Ticket number'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Modus' : 'Mode'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'System' : 'System'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Aktivität' : 'Activity'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Kategorie' : 'Category'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Restzeit' : 'Remaining time'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Status' : 'Status'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Site' : 'Site'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Ergebnis' : 'Result'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Zugewiesen an' : 'Assigned to'}</th>
            <th className="text-left px-3 py-2 font-medium">{isGerman ? 'Begründung' : 'Reason'}</th>
            <th className="px-3 py-2 font-medium text-center">{isGerman ? 'Detail' : 'Details'}</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d) => {
            const rs = resultStyles[d.result] || resultStyles.error;
            const displayTicketNumber = getAssignmentDisplayTicketNumber(d);
            const internalTicketId = getAssignmentInternalTicketId(d);
            const systemName = getAssignmentSystemName(d);
            const ticketCategory = getAssignmentTicketCategory(d);
            const activity = getAssignmentActivity(d);
            const remainingLabel = formatAssignmentRemainingHours(getAssignmentRemainingHours(d));
            return (
              <tr
                key={d.id}
                className="border-b border-border/20 hover:bg-accent/30 transition"
              >
                <td className="px-3 py-2 text-xs">
                  <div className="font-mono">{displayTicketNumber}</div>
                  {internalTicketId && internalTicketId !== displayTicketNumber && (
                    <div className="text-[10px] text-muted-foreground">DB-ID: {internalTicketId}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  <span className="inline-flex rounded-full border border-border/30 bg-background/60 px-2 py-0.5 uppercase tracking-wider text-[10px]">
                    {d.run_mode || '–'}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{systemName || '–'}</td>
                <td className="px-3 py-2 text-xs max-w-[220px] truncate" title={activity || undefined}>{activity || '–'}</td>
                <td className="px-3 py-2 text-xs">{ticketCategory || '–'}</td>
                <td className="px-3 py-2 text-xs">{remainingLabel || '–'}</td>
                <td className="px-3 py-2 text-xs">{d.ticket_status || '–'}</td>
                <td className="px-3 py-2 text-xs">{d.ticket_site || '–'}</td>
                <td className="px-3 py-2">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded border ${rs.className}`}>
                    {rs.icon}
                    {rs.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-xs">{d.assigned_worker_name || '–'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-[250px]">
                  <div className="flex items-center gap-1">
                    <span className="truncate" title={d.short_reason || d.error_message || rs.explanation}>
                      {d.short_reason || d.error_message || rs.explanation}
                    </span>
                    {(d.selection_reason || d.error_message) && (
                      <span onClick={(e) => e.stopPropagation()}>
                        <InfoTooltip title={isGerman ? 'Begründung' : 'Reason'} side="left" width="w-96">
                          <p><strong>{isGerman ? 'Ergebnis:' : 'Result:'}</strong> {rs.label} - {rs.explanation}</p>
                          {d.run_mode && <p className="mt-1"><strong>{isGerman ? 'Modus:' : 'Mode:'}</strong> {d.run_mode}</p>}
                          {activity && <p className="mt-1"><strong>{isGerman ? 'Aktivität:' : 'Activity:'}</strong> {activity}</p>}
                          {remainingLabel && <p className="mt-1"><strong>{isGerman ? 'Restzeit:' : 'Remaining time:'}</strong> {remainingLabel}</p>}
                          {d.short_reason && <p className="mt-1"><strong>{isGerman ? 'Kurzgrund:' : 'Short reason:'}</strong> {d.short_reason}</p>}
                          {d.selection_reason && <p className="mt-1"><strong>{isGerman ? 'Auswahlgrund:' : 'Selection reason:'}</strong> {d.selection_reason}</p>}
                          {d.error_message && <p className="mt-1"><strong>{isGerman ? 'Fehlermeldung:' : 'Error message:'}</strong> {d.error_message}</p>}
                          {d.rule_path && d.rule_path.length > 0 && (
                            <p className="mt-1"><strong>{isGerman ? 'Regelpfad:' : 'Rule path:'}</strong> {d.rule_path.join(' → ')}</p>
                          )}
                        </InfoTooltip>
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => selectDecision(d.id)}
                    className="p-1 rounded hover:bg-accent/50 transition text-muted-foreground hover:text-foreground"
                    title={isGerman ? 'Detail anzeigen' : 'Show details'}
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
