/* ------------------------------------------------ */
/* SETTINGS AUDIT SERVICE                           */
/* Logs all configuration changes for audit trail   */
/* ------------------------------------------------ */

import db from "../db.js";

/**
 * Log a settings change to the audit table.
 * @param {string} domain    - e.g. 'teams', 'tv', 'assignment', 'feedback', 'app', 'feature_toggle'
 * @param {string} key       - the setting key
 * @param {*}      oldValue  - previous value (null for new)
 * @param {*}      newValue  - new value
 * @param {string} changedBy - actor name/email
 * @param {string} [note]    - optional change note
 */
export async function logSettingsChange(domain, key, oldValue, newValue, changedBy, note = null) {
  try {
    await db.query(
      `INSERT INTO settings_audit (domain, setting_key, old_value, new_value, changed_by, change_note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        domain,
        key,
        oldValue != null ? String(oldValue) : null,
        newValue != null ? String(newValue) : null,
        changedBy,
        note,
      ]
    );
  } catch (err) {
    // Audit logging should never break the main operation
    console.error("[AUDIT] Failed to log settings change:", err.message);
  }
}

/**
 * Query the settings audit log.
 */
export async function queryAuditLog({ domain, key, changedBy, start, end, limit = 100, offset = 0 }) {
  const conditions = [];
  const params = [];
  let idx = 1;

  if (domain) {
    conditions.push(`domain = $${idx++}`);
    params.push(domain);
  }
  if (key) {
    conditions.push(`setting_key ILIKE $${idx++}`);
    params.push(`%${key}%`);
  }
  if (changedBy) {
    conditions.push(`changed_by ILIKE $${idx++}`);
    params.push(`%${changedBy}%`);
  }
  if (start) {
    conditions.push(`created_at >= $${idx++}`);
    params.push(start);
  }
  if (end) {
    conditions.push(`created_at <= $${idx++}`);
    params.push(end);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(parseInt(limit), parseInt(offset));

  const { rows } = await db.query(
    `SELECT * FROM settings_audit ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
    params
  );

  return rows;
}
