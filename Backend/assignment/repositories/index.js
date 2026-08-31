/* ================================================ */
/* Assignment Engine — Repositories                 */
/* ================================================ */

import pool from '../../db.js';

/* ---- assignment_runs ---- */

export const assignmentRunRepository = {
  async create({ mode, triggeredBy }) {
    const { rows } = await pool.query(
      `INSERT INTO assignment_runs (mode, status, triggered_by)
       VALUES ($1, 'running', $2)
       RETURNING *`,
      [mode, triggeredBy]
    );
    return rows[0];
  },

  async finish(id, { status, totalTickets, relevant, assigned, manualReview, noCandidate, notRelevant, blocked, errors, summary, failureReason, failureStep, errorCategory }) {
    const { rows } = await pool.query(
      `UPDATE assignment_runs
       SET status = $2, finished_at = NOW(),
           total_tickets = $3, relevant = $4, assigned = $5,
           manual_review = $6, no_candidate = $7, not_relevant = $8,
           blocked = $9, errors = $10, summary = $11,
           failure_reason = $12, failure_step = $13, error_category = $14
       WHERE id = $1
       RETURNING *`,
      [id, status, totalTickets, relevant, assigned, manualReview, noCandidate, notRelevant, blocked, errors, JSON.stringify(summary), failureReason || null, failureStep || null, errorCategory || null]
    );
    return rows[0];
  },

  async findById(id) {
    const { rows } = await pool.query(`SELECT * FROM assignment_runs WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findAll({ limit = 50, offset = 0, mode, status } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (mode) { conditions.push(`mode = $${idx++}`); params.push(mode); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM assignment_runs ${where} ORDER BY started_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows;
  },

  async count({ mode, status } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (mode) { conditions.push(`mode = $${idx++}`); params.push(mode); }
    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT count(*)::int AS count FROM assignment_runs ${where}`, params);
    return rows[0].count;
  },
};

/* ---- assignment_ticket_decisions ---- */

export const assignmentDecisionRepository = {
  async create(decision) {
    const { rows } = await pool.query(
      `INSERT INTO assignment_ticket_decisions
       (run_id, ticket_id, external_id, ticket_type, ticket_status, ticket_priority, ticket_site,
        result, assigned_worker_id, assigned_worker_name, selection_reason, short_reason,
        rule_path, initial_candidates, excluded_candidates, remaining_candidates,
        normalization_warnings, normalized_ticket, raw_ticket, error_message, decision_trace)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [
        decision.runId,
        decision.ticketId,
        decision.externalId,
        decision.ticketType,
        decision.ticketStatus,
        decision.ticketPriority,
        decision.ticketSite,
        decision.result,
        decision.assignedWorkerId,
        decision.assignedWorkerName,
        decision.selectionReason,
        decision.shortReason,
        JSON.stringify(decision.rulePath),
        JSON.stringify(decision.initialCandidates),
        JSON.stringify(decision.excludedCandidates),
        JSON.stringify(decision.remainingCandidates),
        JSON.stringify(decision.normalizationWarnings),
        JSON.stringify(decision.normalizedTicket),
        JSON.stringify(decision.rawTicket),
        decision.errorMessage,
        JSON.stringify(decision.decisionTrace || null),
      ]
    );
    return rows[0];
  },

  async findByRunId(runId, { limit = 200, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_ticket_decisions WHERE run_id = $1 ORDER BY decided_at DESC LIMIT $2 OFFSET $3`,
      [runId, limit, offset]
    );
    return rows;
  },

  async findById(id) {
    const { rows } = await pool.query(`SELECT * FROM assignment_ticket_decisions WHERE id = $1`, [id]);
    return rows[0] || null;
  },

  async findByTicketId(ticketId, { limit = 20 } = {}) {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_ticket_decisions WHERE ticket_id = $1 ORDER BY decided_at DESC LIMIT $2`,
      [ticketId, limit]
    );
    return rows;
  },

  async findByTicketIdentity(ticketIdentifier, { limit = 20 } = {}) {
    const { rows } = await pool.query(
      `SELECT *
       FROM assignment_ticket_decisions
       WHERE ticket_id = $1 OR external_id = $1
       ORDER BY decided_at DESC
       LIMIT $2`,
      [ticketIdentifier, limit]
    );
    return rows;
  },

  async findAll({ limit = 100, offset = 0, result, runId } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (result) { conditions.push(`result = $${idx++}`); params.push(result); }
    if (runId) { conditions.push(`run_id = $${idx++}`); params.push(runId); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM assignment_ticket_decisions ${where} ORDER BY decided_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows;
  },
};

/* ---- assignment_settings ---- */

export const assignmentSettingsRepository = {
  async getAll() {
    const { rows } = await pool.query(`SELECT * FROM assignment_settings ORDER BY key`);
    const map = {};
    for (const r of rows) map[r.key] = r.value;
    return { rows, map };
  },

  async get(key) {
    const { rows } = await pool.query(`SELECT * FROM assignment_settings WHERE key = $1`, [key]);
    return rows[0] || null;
  },

  async set(key, value, updatedBy) {
    const { rows } = await pool.query(
      `INSERT INTO assignment_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2, NOW(), $3)
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW(), updated_by = $3
       RETURNING *`,
      [key, String(value), updatedBy]
    );
    return rows[0];
  },

  async setMany(entries, updatedBy) {
    const results = [];
    for (const [key, value] of Object.entries(entries)) {
      results.push(await this.set(key, value, updatedBy));
    }
    return results;
  },
};

/* ---- assignment_overrides ---- */

export const assignmentOverrideRepository = {
  async create({ ticketId, overrideType, targetWorkerId, reason, createdBy }) {
    const { rows } = await pool.query(
      `INSERT INTO assignment_overrides (ticket_id, override_type, target_worker_id, reason, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [ticketId, overrideType, targetWorkerId, reason, createdBy]
    );
    return rows[0];
  },

  async deactivate(id, deactivatedBy) {
    const { rows } = await pool.query(
      `UPDATE assignment_overrides SET active = false, deactivated_at = NOW(), deactivated_by = $2
       WHERE id = $1 RETURNING *`,
      [id, deactivatedBy]
    );
    return rows[0] || null;
  },

  async findActive(ticketId) {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_overrides WHERE ticket_id = $1 AND active = true ORDER BY created_at DESC`,
      [ticketId]
    );
    return rows;
  },

  async findAll({ limit = 100, offset = 0, active } = {}) {
    const conditions = [];
    const params = [];
    let idx = 1;
    if (active !== undefined) { conditions.push(`active = $${idx++}`); params.push(active); }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM assignment_overrides ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset]
    );
    return rows;
  },
};

/* ---- assignment_rotation_state ---- */

export const assignmentRotationRepository = {
  async getForSite(site = '_global') {
    const { rows } = await pool.query(
      `SELECT * FROM assignment_rotation_state WHERE site = $1`,
      [site]
    );
    return rows[0] || null;
  },

  async update(site = '_global', workerId) {
    const { rows } = await pool.query(
      `INSERT INTO assignment_rotation_state (site, last_assigned_worker_id, last_assigned_at, counter, updated_at)
       VALUES ($1, $2, NOW(), 1, NOW())
       ON CONFLICT (site) DO UPDATE
       SET last_assigned_worker_id = $2, last_assigned_at = NOW(), counter = assignment_rotation_state.counter + 1, updated_at = NOW()
       RETURNING *`,
      [site, workerId]
    );
    return rows[0];
  },
};

/* ---- assignment_exclusion_list ---- */

export const assignmentExclusionRepository = {
  async findAll({ activeOnly = true } = {}) {
    const where = activeOnly ? 'WHERE active = true' : '';
    const { rows } = await pool.query(
      `SELECT * FROM assignment_exclusion_list ${where} ORDER BY system_name`
    );
    return rows;
  },

  async findActiveNames() {
    const { rows } = await pool.query(
      `SELECT system_name FROM assignment_exclusion_list WHERE active = true ORDER BY system_name`
    );
    return rows.map(r => r.system_name);
  },

  async create({ systemName, reason, createdBy }) {
    const { rows } = await pool.query(
      `INSERT INTO assignment_exclusion_list (system_name, reason, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (system_name) DO UPDATE SET active = true, reason = $2, created_by = $3
       RETURNING *`,
      [systemName, reason, createdBy]
    );
    return rows[0];
  },

  async deactivate(id) {
    const { rows } = await pool.query(
      `UPDATE assignment_exclusion_list SET active = false WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },

  async remove(id) {
    const { rows } = await pool.query(
      `DELETE FROM assignment_exclusion_list WHERE id = $1 RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },
};
