export type AssignmentTraceGlossaryLanguage = 'de' | 'en';

export type AssignmentTraceGlossaryKey =
  | 'grouping-score'
  | 'queue-purity'
  | 'workload'
  | 'colleague-proximity'
  | 'worker-id'
  | 'priority-tier'
  | 'ticket-priority'
  | 'remaining-time'
  | 'scheduled-start'
  | 'created-at'
  | 'stable-ticket-id'
  | 'rank-in-run'
  | 'remaining-pool'
  | 'current-shift-only'
  | 'planning-window'
  | 'rotation-tie-breaker'
  | 'tie-breaker'
  | 'verification';

interface AssignmentTraceGlossaryDefinition {
  label: Record<AssignmentTraceGlossaryLanguage, string>;
  description: Record<AssignmentTraceGlossaryLanguage, string>;
  interpretation?: Record<AssignmentTraceGlossaryLanguage, string>;
}

export interface AssignmentTraceGlossaryEntry {
  key: AssignmentTraceGlossaryKey;
  label: string;
  description: string;
  interpretation?: string;
}

const GLOSSARY: Record<AssignmentTraceGlossaryKey, AssignmentTraceGlossaryDefinition> = {
  'grouping-score': {
    label: { de: 'Grouping Score', en: 'Grouping score' },
    description: {
      de: 'Misst, ob der Mitarbeiter bereits Tickets desselben Systems bearbeitet. Ein höherer Wert bevorzugt bewusstes Bündeln auf einer Person, solange keine harte Regel verletzt wird.',
      en: 'Measures whether the employee already works tickets for the same system. A higher value intentionally prefers keeping similar system work together as long as no hard rule is violated.',
    },
    interpretation: {
      de: 'Höher ist besser. Der Wert ist kein Pflichtkriterium, sondern ein frühes Ranking-Signal.',
      en: 'Higher is better. The value is not a hard rule; it is an early ranking signal.',
    },
  },
  'queue-purity': {
    label: { de: 'Queue Purity', en: 'Queue purity' },
    description: {
      de: 'Zeigt, ob die aktuelle Ticketmischung eines Mitarbeiters fachlich sauber bleibt. Rein bedeutet: die neue Queue passt zur bestehenden Last; gemischt bedeutet: inkompatible Ticketklassen würden vermischt.',
      en: 'Shows whether the employee’s current ticket mix stays operationally clean. Pure means the new queue fits the existing load; mixed means incompatible ticket classes would be combined.',
    },
    interpretation: {
      de: 'Rein wird bevorzugt. Wenn nur gemischte Kandidaten übrig sind, bleibt Queue Purity aber ein weiches Ranking-Signal und kein eigener Hard-Block.',
      en: 'Pure is preferred. If only mixed candidates remain, queue purity stays a soft ranking signal rather than a standalone hard block.',
    },
  },
  workload: {
    label: { de: 'Offene Last', en: 'Open load' },
    description: {
      de: 'Anzahl der aktuell offenen bzw. bereits zugeordneten Tickets für diese Person zum Entscheidungszeitpunkt.',
      en: 'Number of currently open or already assigned tickets for this person at decision time.',
    },
    interpretation: {
      de: 'Niedriger ist besser, wenn stärkere Kriterien wie Schicht, Rollen und Grouping gleich sind.',
      en: 'Lower is better once stronger criteria such as shift, role, and grouping are equal.',
    },
  },
  'colleague-proximity': {
    label: { de: 'Kollegen-Nähe', en: 'Colleague proximity' },
    description: {
      de: 'Weiches Signal aus Wunschkollegen- bzw. Buddy-Beziehungen. Es erhöht leicht die Chance, wenn passende Kollegen bereits im Einsatz sind.',
      en: 'Soft signal derived from preferred-colleague or buddy relationships. It slightly increases preference if matching colleagues are already active.',
    },
    interpretation: {
      de: 'Nur später Tie-Breaker. Dieses Signal überschreibt nie harte Regeln.',
      en: 'Only a late tie-breaker. This signal never overrides hard rules.',
    },
  },
  'worker-id': {
    label: { de: 'Worker-Nummer', en: 'Worker ID' },
    description: {
      de: 'Interne ODIN-Mitarbeiternummer. Sie dient zur Auditierung, Wiedererkennung in Logs und als stabile Schlussregel, wenn die finale Tie-Breaker-Policy auf Worker-ID endet.',
      en: 'Internal ODIN employee identifier. It is used for audit references, log correlation, and as the stable closing rule when the final tie-breaker policy ends on worker ID.',
    },
    interpretation: {
      de: 'Die Worker-Nummer ist kein Score und kein Skill-Wert. Sie wird erst ganz am Ende relevant, wenn stärkere Kriterien keinen Unterschied mehr machen und keine Rotation oder Zufallsstrategie greift.',
      en: 'The worker ID is not a score and not a skill value. It matters only at the very end when stronger criteria can no longer separate candidates and no rotation or random fallback takes over.',
    },
  },
  'priority-tier': {
    label: { de: 'Prioritätsstufe', en: 'Priority tier' },
    description: {
      de: 'Globale Einordnung des Tickets im Regelwerk. Niedrigere Tier-Nummern werden früher verarbeitet als höhere.',
      en: 'Global ticket bucket in the rule set. Lower tier numbers are processed before higher ones.',
    },
    interpretation: {
      de: 'Das ist der stärkste Priorisierungshebel auf Ticketebene.',
      en: 'This is the strongest prioritization signal at ticket level.',
    },
  },
  'ticket-priority': {
    label: { de: 'Ticket-Priorität', en: 'Ticket priority' },
    description: {
      de: 'Interne Priorität innerhalb derselben Prioritätsstufe, zum Beispiel critical vor high.',
      en: 'Internal priority within the same priority tier, for example critical before high.',
    },
  },
  'remaining-time': {
    label: { de: 'Restzeit', en: 'Remaining time' },
    description: {
      de: 'Verbleibende Zeit bis Commit oder Due Date. Weniger Restzeit zieht das Ticket nach vorne.',
      en: 'Time left until commit or due date. Less remaining time moves the ticket forward.',
    },
  },
  'scheduled-start': {
    label: { de: 'Geplanter Start', en: 'Scheduled start' },
    description: {
      de: 'Geplante Startzeit eines termingebundenen Tickets. Frühere Starts werden bei Gleichstand früher behandelt.',
      en: 'Planned start time of a scheduled ticket. Earlier starts are handled first when stronger factors are tied.',
    },
  },
  'created-at': {
    label: { de: 'Erstellt am', en: 'Created at' },
    description: {
      de: 'Fallback-Reihenfolge über das Alter des Tickets. Ältere Tickets gewinnen, wenn die wichtigeren Kriterien gleich sind.',
      en: 'Fallback ordering by ticket age. Older tickets win when stronger criteria are tied.',
    },
  },
  'stable-ticket-id': {
    label: { de: 'Stabile Ticket-ID', en: 'Stable ticket ID' },
    description: {
      de: 'Letzte deterministische Rückfallregel. Wenn alle anderen Faktoren gleich sind, entscheidet die stabile Ticket-ID.',
      en: 'Final deterministic fallback rule. If all other factors are equal, the stable ticket ID decides.',
    },
    interpretation: {
      de: 'Sichert Reproduzierbarkeit: gleicher Input führt zu gleicher Reihenfolge.',
      en: 'Ensures reproducibility: the same input produces the same order.',
    },
  },
  'rank-in-run': {
    label: { de: 'Reihenfolge im Lauf', en: 'Rank in run' },
    description: {
      de: 'Position des Tickets in der tatsächlichen Verarbeitungsreihenfolge dieses Runs.',
      en: 'Position of the ticket in the actual processing order of this run.',
    },
  },
  'remaining-pool': {
    label: { de: 'Aktiver Restpool', en: 'Remaining pool' },
    description: {
      de: 'Wie viele Tickets in diesem Moment noch im priorisierten Pool lagen, als das Ticket ausgewählt wurde.',
      en: 'How many tickets were still left in the prioritized pool at the moment this ticket was chosen.',
    },
  },
  'current-shift-only': {
    label: { de: 'Nur aktuelle Schicht', en: 'Current shift only' },
    description: {
      de: 'Wenn aktiv, dürfen ausschließlich Mitarbeiter aus der aktuell relevanten aktiven Schicht in die finale Auswahl gelangen. Zukunftsschichten sind hart ausgeschlossen.',
      en: 'When enabled, only employees from the currently relevant active shift may reach the final selection. Future shifts are hard excluded.',
    },
  },
  'planning-window': {
    label: { de: 'Planungsfenster', en: 'Planning window' },
    description: {
      de: 'Wenn Nur aktuelle Schicht deaktiviert ist, steuert dieses Fenster, wie weit geplante zukünftige Tickets in die Relevanz hineinreichen dürfen.',
      en: 'When current-shift-only is disabled, this window controls how far future planned tickets may enter relevance.',
    },
  },
  'rotation-tie-breaker': {
    label: { de: 'Rotation-Tie-Breaker', en: 'Rotation tie-breaker' },
    description: {
      de: 'Steuert, ob bei absolutem Gleichstand eine Fairness-Rotation greifen soll, bevor der finale deterministische Fallback entscheidet.',
      en: 'Controls whether a fairness-based rotation should break absolute ties before the final deterministic fallback decides.',
    },
    interpretation: {
      de: 'Aktiv bedeutet: Gleichstände können bewusst verteilt werden. Inaktiv bedeutet: ODIN fällt direkt auf die dokumentierte Schlussregel zurück.',
      en: 'Enabled means ties may be distributed deliberately. Disabled means ODIN falls back directly to the documented final rule.',
    },
  },
  'tie-breaker': {
    label: { de: 'Tie-Breaker', en: 'Tie breaker' },
    description: {
      de: 'Bezeichnet die Auswahlstufe, die die Entscheidung tatsächlich aufgelöst hat. Im Run kann das System-Gruppierung, Queue Purity, Lastverteilung, Kollegen-Nähe oder der konfigurierte Schlussschritt wie Round-Robin, Zufall oder Worker-Nummer sein. Die konfigurierte Policy wird zusätzlich als Snapshot gezeigt.',
      en: 'Describes the selection stage that actually resolved the decision. During a run this can be system grouping, queue purity, workload balancing, colleague proximity, or the configured closing step such as round-robin, random, or worker ID. The configured policy is also shown as a snapshot.',
    },
    interpretation: {
      de: 'Die Badge kann entweder die aktuell gezogene Stufe des Runs oder die konfigurierte Schlussstrategie wie stable-id oder random zeigen.',
      en: 'The badge can show either the stage that won during the run or the configured final strategy such as stable-id or random.',
    },
  },
  verification: {
    label: { de: 'Verifikation', en: 'Verification' },
    description: {
      de: 'Steuert, ob fehlende oder problematische Schichtverifikation Kandidaten blockiert oder nur als Information behandelt wird.',
      en: 'Controls whether missing or problematic shift verification blocks candidates or is treated as informational only.',
    },
  },
};

function normalizeLanguage(language: string): AssignmentTraceGlossaryLanguage {
  return language === 'de' ? 'de' : 'en';
}

function formatTieBreakerValue(value: unknown, language: AssignmentTraceGlossaryLanguage) {
  const normalized = String(value || '').trim().toLowerCase();

  switch (normalized) {
    case 'stable-id':
      return language === 'de' ? 'Stable ID (niedrigste Worker-Nummer)' : 'Stable ID (lowest worker ID)';
    case 'random':
      return language === 'de' ? 'Zufallsauswahl' : 'Random pick';
    case 'worker-id':
      return language === 'de' ? 'Worker-Nummer (niedrigste Nummer gewinnt)' : 'Worker ID (lowest ID wins)';
    case 'system-grouping':
      return language === 'de' ? 'System-Gruppierung' : 'System grouping';
    case 'queue-purity':
      return language === 'de' ? 'Queue Purity / Sortenreinheit' : 'Queue purity';
    case 'workload':
      return language === 'de' ? 'Lastverteilung / geringste Auslastung' : 'Workload balancing / lowest workload';
    case 'colleague-preference':
      return language === 'de' ? 'Kollegen-Nähe' : 'Colleague preference';
    case 'round-robin':
    case 'round_robin':
      return language === 'de' ? 'Round-Robin' : 'Round-robin';
    case 'least_recent':
      return language === 'de' ? 'Am längsten ohne Zuweisung' : 'Least recently assigned';
    default:
      return String(value);
  }
}

function readRawMetricText(input: string | { key?: string | null; label?: string | null } | null | undefined): string {
  if (!input) return '';
  if (typeof input === 'string') return input.trim();
  return [input.key, input.label].filter(Boolean).join(' ').trim();
}

export function getAssignmentTraceGlossaryEntry(
  key: AssignmentTraceGlossaryKey | null | undefined,
  language: string,
): AssignmentTraceGlossaryEntry | null {
  if (!key) return null;

  const safeLanguage = normalizeLanguage(language);
  const definition = GLOSSARY[key];
  if (!definition) return null;

  return {
    key,
    label: definition.label[safeLanguage],
    description: definition.description[safeLanguage],
    interpretation: definition.interpretation?.[safeLanguage],
  };
}

export function getAssignmentTraceGlossaryEntries(
  keys: Array<AssignmentTraceGlossaryKey | null | undefined>,
  language: string,
): AssignmentTraceGlossaryEntry[] {
  const seen = new Set<string>();
  const entries: AssignmentTraceGlossaryEntry[] = [];

  for (const key of keys) {
    if (!key || seen.has(key)) continue;
    const entry = getAssignmentTraceGlossaryEntry(key, language);
    if (!entry) continue;
    seen.add(key);
    entries.push(entry);
  }

  return entries;
}

export function resolveAssignmentTraceGlossaryKey(
  input: string | { key?: string | null; label?: string | null } | null | undefined,
): AssignmentTraceGlossaryKey | null {
  const raw = readRawMetricText(input).toLowerCase();
  if (!raw) return null;

  if (raw.includes('grouping score') || raw.includes('system grouping')) return 'grouping-score';
  if (raw.includes('queue purity')) return 'queue-purity';
  if (raw.includes('current workload') || raw.includes('open load') || raw.startsWith('load')) return 'workload';
  if (raw.includes('colleague proximity')) return 'colleague-proximity';
  if (raw.includes('rotation tie breaker')) return 'rotation-tie-breaker';
  if (raw.includes('worker id') || raw.includes('worker number') || raw.includes('worker-id') || raw.includes('mitarbeiter-id')) return 'worker-id';
  if (raw.includes('priority tier')) return 'priority-tier';
  if (raw.includes('ticket priority')) return 'ticket-priority';
  if (raw.includes('remaining time')) return 'remaining-time';
  if (raw.includes('scheduled start')) return 'scheduled-start';
  if (raw.includes('created at')) return 'created-at';
  if (raw.includes('stable fallback') || raw.includes('stable ticket id') || raw.includes('ticket id')) return 'stable-ticket-id';
  if (raw.includes('current shift only')) return 'current-shift-only';
  if (raw.includes('planning window')) return 'planning-window';
  if (raw.includes('tie-breaker') || raw.includes('tie breaker')) return 'tie-breaker';
  if (raw.includes('verification')) return 'verification';
  if (raw.includes('rank in run') || raw.includes('prioritization rank') || raw.includes('reihenfolge im lauf')) return 'rank-in-run';
  if (raw.includes('remaining pool') || raw.includes('restpool')) return 'remaining-pool';

  return null;
}

function formatBooleanValue(value: boolean, language: AssignmentTraceGlossaryLanguage) {
  return value ? (language === 'de' ? 'Ja' : 'Yes') : (language === 'de' ? 'Nein' : 'No');
}

function formatMetricValue(
  key: AssignmentTraceGlossaryKey | null,
  value: unknown,
  language: AssignmentTraceGlossaryLanguage,
) {
  if (value == null) return '';

  if (key === 'queue-purity') {
    if (typeof value === 'boolean') {
      return value
        ? (language === 'de' ? 'rein' : 'clean')
        : (language === 'de' ? 'gemischt' : 'mixed');
    }

    const normalized = String(value).toLowerCase();
    if (normalized.includes('preserved') || normalized.includes('clean') || normalized.includes('pure')) {
      return language === 'de' ? 'rein' : 'clean';
    }
    if (normalized.includes('neutral')) {
      return language === 'de' ? 'neutral' : 'neutral';
    }
    if (normalized.includes('mixed')) {
      return language === 'de' ? 'gemischt' : 'mixed';
    }
  }

  if (key === 'current-shift-only' || key === 'verification' || key === 'rotation-tie-breaker') {
    if (typeof value === 'boolean') return formatBooleanValue(value, language);
  }

  if (key === 'planning-window') {
    return `${String(value)} h`;
  }

  if (key === 'tie-breaker') {
    return formatTieBreakerValue(value, language);
  }

  return String(value);
}

export function formatAssignmentMetricLabel(
  key: AssignmentTraceGlossaryKey | null,
  value: unknown,
  language: string,
) {
  const safeLanguage = normalizeLanguage(language);
  const entry = getAssignmentTraceGlossaryEntry(key, safeLanguage);
  const label = entry?.label || (key ? String(key) : 'Metric');

  if (value == null || value === '') return label;
  return `${label}: ${formatMetricValue(key, value, safeLanguage)}`;
}

export function formatAssignmentPrioritizationFactor(
  factor: { key?: string | null; label?: string | null; value?: unknown },
  language: string,
) {
  const glossaryKey = resolveAssignmentTraceGlossaryKey(factor);
  if (glossaryKey) {
    return formatAssignmentMetricLabel(glossaryKey, factor.value, language);
  }

  const label = factor.label || factor.key || 'Factor';
  return factor.value == null ? label : `${label}: ${String(factor.value)}`;
}

export function formatAssignmentRankingFactorText(factor: string, language: string) {
  const safeLanguage = normalizeLanguage(language);

  const groupingMatch = factor.match(/system grouping score\s+(\d+)/i);
  if (groupingMatch) {
    return formatAssignmentMetricLabel('grouping-score', groupingMatch[1], safeLanguage);
  }

  const workloadMatch = factor.match(/current workload\s+(\d+)/i);
  if (workloadMatch) {
    return formatAssignmentMetricLabel('workload', workloadMatch[1], safeLanguage);
  }

  const colleagueMatch = factor.match(/colleague proximity\s+(\d+)/i);
  if (colleagueMatch) {
    return formatAssignmentMetricLabel('colleague-proximity', colleagueMatch[1], safeLanguage);
  }

  const workerIdMatch = factor.match(/worker id[:\s]+(\d+)/i);
  if (workerIdMatch) {
    return formatAssignmentMetricLabel('worker-id', workerIdMatch[1], safeLanguage);
  }

  if (/queue purity preserved/i.test(factor)) {
    return formatAssignmentMetricLabel('queue-purity', 'preserved', safeLanguage);
  }

  if (/queue purity neutral/i.test(factor)) {
    return formatAssignmentMetricLabel('queue-purity', 'neutral', safeLanguage);
  }

  if (/selection blocked by system grouping policy/i.test(factor)) {
    return safeLanguage === 'de'
      ? 'System-Bündelung blockiert die Auswahl'
      : 'System grouping blocks the selection';
  }

  return factor;
}

export function collectAssignmentTraceGlossaryKeys(payload: {
  configSnapshot?: {
    currentShiftOnly?: boolean | null;
    planningWindowHours?: number | null;
    enableRotationTieBreaker?: boolean | null;
    fallbackTieBreaker?: string | null;
    verificationEnabled?: boolean | null;
  } | null;
  ticketSelection?: {
    prioritizationRank?: number | null;
    totalRemainingTickets?: number | null;
    prioritizationFactors?: Array<{ key?: string | null; label?: string | null }> | null;
  } | null;
  finalDecision?: {
    assignedWorkerId?: number | null;
    tieBreaker?: string | null;
  } | null;
  candidateRanking?: Array<{
    employeeId?: number | null;
    groupingScore?: number | null;
    queuePure?: boolean | null;
    workload?: number | null;
    colleagueScore?: number | null;
    rankingFactors?: string[] | null;
  }> | null;
}) {
  const keys = new Set<AssignmentTraceGlossaryKey>();

  if (payload.ticketSelection?.prioritizationRank != null) keys.add('rank-in-run');
  if (payload.ticketSelection?.totalRemainingTickets != null) keys.add('remaining-pool');
  for (const factor of payload.ticketSelection?.prioritizationFactors || []) {
    const resolved = resolveAssignmentTraceGlossaryKey(factor);
    if (resolved) keys.add(resolved);
  }

  if (payload.configSnapshot?.currentShiftOnly != null) keys.add('current-shift-only');
  if (payload.configSnapshot?.planningWindowHours != null) keys.add('planning-window');
  if (payload.configSnapshot?.enableRotationTieBreaker != null) keys.add('rotation-tie-breaker');
  if (payload.configSnapshot?.fallbackTieBreaker) keys.add('tie-breaker');
  if (payload.configSnapshot?.verificationEnabled != null) keys.add('verification');
  if (payload.finalDecision?.assignedWorkerId != null) keys.add('worker-id');
  if (payload.finalDecision?.tieBreaker) keys.add('tie-breaker');

  for (const candidate of payload.candidateRanking || []) {
    if (candidate.employeeId != null) keys.add('worker-id');
    if (candidate.groupingScore != null) keys.add('grouping-score');
    if (candidate.queuePure != null) keys.add('queue-purity');
    if (candidate.workload != null) keys.add('workload');
    if ((candidate.colleagueScore || 0) > 0) keys.add('colleague-proximity');

    for (const factor of candidate.rankingFactors || []) {
      const resolved = resolveAssignmentTraceGlossaryKey(factor);
      if (resolved) keys.add(resolved);
    }
  }

  return Array.from(keys);
}