/* ================================================ */
/* ODIN Assignment Execution — Action Status Badge  */
/* ================================================ */

import type { ExecutionStatus, ActionType, WritebackMode } from '../../../types/assignmentWriteback';

/* ── Execution Status ── */

interface StatusBadgeProps {
  status: ExecutionStatus;
  isGerman?: boolean;
}

const STATUS_LABELS: Record<ExecutionStatus, { de: string; en: string; cls: string }> = {
  pending:                        { de: 'Ausstehend',          en: 'Pending',               cls: 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30' },
  shadow_validated:               { de: 'Shadow-geprüft',      en: 'Shadow Validated',      cls: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  validation_failed:              { de: 'Validierung fehlgesch.', en: 'Validation Failed',   cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  waiting_for_manual_confirmation:{ de: 'Warte auf Freigabe',  en: 'Awaiting Confirmation', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  approved_for_execution:         { de: 'Freigegeben',         en: 'Approved',              cls: 'bg-green-500/20 text-green-300 border-green-500/30' },
  executing:                      { de: 'Wird ausgeführt',     en: 'Executing',             cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30 animate-pulse' },
  already_correctly_assigned:     { de: 'Bereits korrekt',     en: 'Already Correct',       cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  assigned_successfully:          { de: 'Zugewiesen ✓',        en: 'Assigned ✓',            cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  unassign_required:              { de: 'Abzuweisung nötig',   en: 'Unassign Required',     cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  unassigning:                    { de: 'Abweisen läuft',      en: 'Unassigning',           cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30 animate-pulse' },
  unassigned_successfully:        { de: 'Abgewiesen ✓',        en: 'Unassigned ✓',          cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  reassign_required:              { de: 'Neuzuweisung nötig',  en: 'Reassign Required',     cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  reassigning:                    { de: 'Neuzuweisung läuft',  en: 'Reassigning',           cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30 animate-pulse' },
  reassigned_successfully:        { de: 'Neu zugewiesen ✓',    en: 'Reassigned ✓',          cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  blocked_existing_owner:         { de: 'Bestehender Owner',   en: 'Existing Owner',        cls: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' },
  blocked_human_owner_conflict:   { de: 'Human-Konflikt',      en: 'Human Conflict',        cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  manual_review_required:         { de: 'Manuelle Prüfung',    en: 'Manual Review',         cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40' },
  failed_verification:            { de: 'Verif. fehlgesch.',   en: 'Verification Failed',   cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  failed:                         { de: 'Fehlgeschlagen',      en: 'Failed',                cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
  skipped:                        { de: 'Übersprungen',        en: 'Skipped',               cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
  cancelled:                      { de: 'Abgebrochen',         en: 'Cancelled',             cls: 'bg-zinc-500/20 text-zinc-500 border-zinc-500/30' },
};

export function ExecutionStatusBadge({ status, isGerman = true }: StatusBadgeProps) {
  const s = STATUS_LABELS[status] ?? { de: status, en: status, cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${s.cls}`}>
      {isGerman ? s.de : s.en}
    </span>
  );
}

/* ── Action Type Badge ── */

const ACTION_LABELS: Record<ActionType, { de: string; en: string; cls: string }> = {
  assign:   { de: 'Zuweisen',   en: 'Assign',   cls: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  unassign: { de: 'Abweisen',   en: 'Unassign', cls: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  reassign: { de: 'Neu zuweisen', en: 'Reassign', cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  no_op:    { de: 'Keine Aktion', en: 'No-op',  cls: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30' },
};

export function ActionTypeBadge({ type, isGerman = true }: { type: ActionType; isGerman?: boolean }) {
  const a = ACTION_LABELS[type] ?? { de: type, en: type, cls: 'bg-zinc-500/20 text-zinc-400' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${a.cls}`}>
      {isGerman ? a.de : a.en}
    </span>
  );
}

/* ── Mode Badge ── */

const MODE_LABELS: Record<WritebackMode, { de: string; en: string; cls: string }> = {
  shadow_only:    { de: 'Shadow-only',    en: 'Shadow only',     cls: 'bg-sky-500/20 text-sky-300 border-sky-500/30' },
  manual_confirm: { de: 'Manuelle Bestät.', en: 'Manual confirm', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  assisted_auto:  { de: 'Assisted Auto',  en: 'Assisted auto',   cls: 'bg-purple-500/20 text-purple-300 border-purple-500/30' },
  full_auto:      { de: 'Full Auto',      en: 'Full auto',       cls: 'bg-red-500/20 text-red-300 border-red-500/30' },
};

export function WritebackModeBadge({ mode, isGerman = true }: { mode: WritebackMode; isGerman?: boolean }) {
  const m = MODE_LABELS[mode] ?? { de: mode, en: mode, cls: 'bg-zinc-500/20 text-zinc-400' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${m.cls}`}>
      {isGerman ? m.de : m.en}
    </span>
  );
}
