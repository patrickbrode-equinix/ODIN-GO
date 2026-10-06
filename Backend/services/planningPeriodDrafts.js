import { randomUUID } from 'node:crypto';
import { getPlanningMonths, normalizeMetaText, MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH } from '../lib/planningPeriods.js';

export async function generatePeriodDrafts({ year, quarter = null, note, title, description, createdBy, ownerId, pool, generateMonth }) {
  const months = getPlanningMonths(year, quarter);
  const planningBatch = { id: randomUUID(), type: quarter === null ? 'year' : 'quarter', year, quarter };
  const periodLabel = quarter === null ? `Jahresplanung ${year}` : `Quartalsplanung Q${quarter} ${year}`;
  const normalizedTitle = normalizeMetaText(title, MAX_TITLE_LENGTH) ?? null;
  const normalizedDescription = normalizeMetaText(description, MAX_DESCRIPTION_LENGTH) ?? null;
  const generatedPlans = [];
  let carryState = null;
  for (const month of months) {
    const mon = Number(month.slice(5));
    const result = await generateMonth(year, mon, new Date(year, mon, 0).getDate(), createdBy, { carryState });
    carryState = result.carryState;
    generatedPlans.push({ month, result });
  }

  const results = [];
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const { month, result } of generatedPlans) {
      const version = await client.query('SELECT COALESCE(MAX(version), 0) + 1 as next_version FROM shiftplan_drafts WHERE month = $1', [month]);
      const nextVersion = version.rows[0].next_version;
      const { rows } = await client.query(
        `INSERT INTO shiftplan_drafts (month, version, status, shifts_json, explanations, conflicts, fairness, config_snapshot, note, created_by, created_by_user_id, title, description)
         VALUES ($1, $2, 'draft', $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12) RETURNING id, month, version, status, created_at`,
        [month, nextVersion, JSON.stringify(result.shifts), JSON.stringify(result.explanations), JSON.stringify(result.conflicts), JSON.stringify(result.fairness),
          JSON.stringify({ ...result.configSnapshot, planReport: result.planReport, planningBatch }), note || periodLabel, createdBy, ownerId,
          normalizedTitle, normalizedDescription]);
      results.push({ month, draftId: rows[0].id, version: nextVersion, shifts: result.shifts.length, conflicts: result.conflicts.length,
        employees: result.planReport.activeEmployees, wishesRespected: result.planReport.wishesRespected, wishesDenied: result.planReport.wishesDenied });
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { ok: true, year, quarter, groupId: planningBatch.id, title: normalizedTitle, description: normalizedDescription, generated: results, errors: [], total: results.length };
}
