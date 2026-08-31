/* ================================================ */
/* Assignment Run Report Compatibility Helpers      */
/* ================================================ */

export function mapLegacyDecisionTypeToResult(decisionType) {
  const normalized = String(decisionType || '').trim().toLowerCase();

  if (normalized === 'assigned') return 'assigned';
  if (normalized === 'error') return 'error';
  if (normalized === 'not_relevant') return 'not_relevant';

  return 'manual_review';
}

function normalizeLegacyCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];

  return candidates
    .filter((candidate) => candidate && typeof candidate === 'object')
    .map((candidate) => ({
      id: candidate.id ?? null,
      name: candidate.name ?? candidate.candidate ?? 'Unbekannt',
      role: Array.isArray(candidate.roles) ? candidate.roles.join('/') : candidate.role ?? null,
      shiftCode: candidate.shift ?? null,
    }));
}

function normalizeLegacyExclusions(exclusions) {
  if (!Array.isArray(exclusions)) return [];

  return exclusions
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      id: entry.id ?? null,
      name: entry.name ?? entry.candidate ?? 'Unbekannt',
      reason: entry.reason ?? 'Ausgeschlossen',
      rule: entry.rule ?? null,
      role: Array.isArray(entry.roles) ? entry.roles.join('/') : entry.role ?? null,
      shiftCode: entry.shift ?? null,
    }));
}

export function normalizeLegacyDecisionRow(decision) {
  const result = mapLegacyDecisionTypeToResult(decision.decision_type);

  return {
    id: decision.id,
    run_id: decision.run_id,
    ticket_id: decision.ticket_external_id,
    external_id: decision.ticket_external_id,
    ticket_type: decision.queue_type ?? null,
    ticket_status: null,
    ticket_priority: null,
    ticket_site: null,
    result,
    assigned_worker_id: null,
    assigned_worker_name: decision.assigned_to ?? null,
    selection_reason: decision.explanation || decision.deciding_rule || decision.priority_reason || null,
    short_reason: decision.deciding_rule || decision.priority_reason || null,
    rule_path: decision.deciding_rule ? [decision.deciding_rule] : [],
    initial_candidates: normalizeLegacyCandidates(decision.candidates_evaluated),
    excluded_candidates: normalizeLegacyExclusions(decision.exclusion_reasons),
    remaining_candidates: [],
    normalization_warnings: [],
    normalized_ticket: {
      externalId: decision.ticket_external_id,
      queue: decision.queue_type ?? null,
      systemName: decision.system_name ?? null,
      type: decision.queue_type ?? null,
    },
    raw_ticket: {
      external_id: decision.ticket_external_id,
      queue_type: decision.queue_type ?? null,
      system_name: decision.system_name ?? null,
    },
    error_message: result === 'error' ? (decision.explanation || decision.deciding_rule || null) : null,
    decided_at: decision.created_at,
    legacy_decision_type: decision.decision_type,
    legacy_source: true,
  };
}

export function summarizeDecisionResults(decisions) {
  const summary = {};

  for (const decision of decisions || []) {
    const key = String(decision?.result || '').trim();
    if (!key) continue;
    summary[key] = (summary[key] || 0) + 1;
  }

  return summary;
}