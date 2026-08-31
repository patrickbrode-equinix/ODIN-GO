import { InfoTooltip } from '../ui/InfoTooltip';
import {
  getAssignmentTraceGlossaryEntries,
  getAssignmentTraceGlossaryEntry,
  type AssignmentTraceGlossaryKey,
  type AssignmentTraceGlossaryLanguage,
} from '../../utils/assignmentTraceGlossary';

export function AssignmentMetricBadge({
  label,
  glossaryKey,
  language,
  className,
  tooltipWidth = 'w-96',
}: {
  label: string;
  glossaryKey?: AssignmentTraceGlossaryKey | null;
  language: AssignmentTraceGlossaryLanguage;
  className: string;
  tooltipWidth?: string;
}) {
  const entry = getAssignmentTraceGlossaryEntry(glossaryKey || null, language);

  return (
    <span className={className}>
      {label}
      {entry ? (
        <InfoTooltip title={entry.label} side="top" width={tooltipWidth} className="ml-1 align-middle text-current/70 hover:text-current">
          <p>{entry.description}</p>
          {entry.interpretation ? <p>{entry.interpretation}</p> : null}
        </InfoTooltip>
      ) : null}
    </span>
  );
}

export function AssignmentGlossaryPanel({
  keys,
  language,
}: {
  keys: Array<AssignmentTraceGlossaryKey | null | undefined>;
  language: AssignmentTraceGlossaryLanguage;
}) {
  const entries = getAssignmentTraceGlossaryEntries(keys, language);
  if (entries.length === 0) return null;

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {entries.map((entry) => (
        <div key={entry.key} className="rounded-2xl border border-border/25 bg-background/30 px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-foreground/90">{entry.label}</div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">{entry.description}</p>
          {entry.interpretation ? <p className="mt-2 text-[11px] leading-5 text-foreground/75">{entry.interpretation}</p> : null}
        </div>
      ))}
    </div>
  );
}