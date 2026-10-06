export function getPlanningMonths(year, quarter = null) {
  if (!Number.isInteger(year) || year < 2027 || year > 2040) throw new Error('Planungen sind nur für 2027–2040 möglich');
  if (quarter !== null && (!Number.isInteger(quarter) || quarter < 1 || quarter > 4)) throw new Error('Quartal muss zwischen 1 und 4 liegen');
  const start = quarter === null ? 1 : (quarter - 1) * 3 + 1;
  return Array.from({ length: quarter === null ? 12 : 3 }, (_, index) => `${year}-${String(start + index).padStart(2, '0')}`);
}

export function groupPlanningDrafts(drafts) {
  const groups = new Map();
  for (const draft of drafts) {
    const batch = draft.planning_batch || draft.config_snapshot?.planningBatch;
    const year = Number(draft.month.slice(0, 4));
    // Earlier year runs stored a standard note and share the transaction's
    // created_at timestamp. Keep those runs separate from later versions.
    const legacyYear = !batch && draft.note === `Jahresplanung ${year}`;
    const type = batch?.type === 'quarter' || batch?.type === 'year' ? batch.type : legacyYear ? 'year' : 'month';
    const id = batch?.id || (legacyYear ? `legacy-year:${year}:${new Date(draft.created_at).toISOString()}` : `month:${draft.month}`);
    if (!groups.has(id)) groups.set(id, { id, type, year, quarter: type === 'quarter' ? batch.quarter : null, created_at: draft.created_at, drafts: [] });
    const group = groups.get(id);
    group.drafts.push(draft);
    if (new Date(draft.created_at) > new Date(group.created_at)) group.created_at = draft.created_at;
  }
  return [...groups.values()].map(group => ({
    ...group,
    drafts: group.drafts.sort((left, right) => left.month.localeCompare(right.month) || right.version - left.version),
  })).sort((left, right) => new Date(right.created_at) - new Date(left.created_at));
}
