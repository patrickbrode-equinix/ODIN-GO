/* ================================================ */
/* Shift Verification Service                       */
/* Core business logic for employee self-check      */
/* via Microsoft Teams after shift start.           */
/* ================================================ */

import pool from "../db.js";
import { config } from "../config/index.js";

/* ------------------------------------------------ */
/* CONSTANTS                                        */
/* ------------------------------------------------ */

export const VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "sick",
  "wrong_shift",
  "absent",
  "no_response",
  "failed",
];

/** Status values that block automatic ticket assignment */
export const BLOCKING_STATUSES = new Set([
  "pending",
  "sick",
  "wrong_shift",
  "absent",
  "no_response",
  "failed",
]);

/** Status values that mark the employee as operationally unavailable */
export const UNAVAILABLE_STATUSES = new Set([
  "sick",
  "wrong_shift",
  "absent",
  "no_response",
]);

/* ------------------------------------------------ */
/* CONFIG HELPERS                                   */
/* ------------------------------------------------ */

export async function getVerificationSettings() {
  const { rows } = await pool.query(
    `SELECT key, value FROM assignment_config WHERE key LIKE 'verification.%'`
  );
  const settings = {};
  for (const row of rows) {
    const short = row.key.replace("verification.", "");
    let val = row.value;
    // JSONB values are pre-parsed by pg driver, but some are stored as strings
    if (typeof val === "string") {
      try { val = JSON.parse(val); } catch { /* keep as string */ }
    }
    settings[short] = val;
  }
  return {
    enabled: settings.enabled === true || settings.enabled === "true",
    delayMinutes: Number(settings.delayMinutes) || 5,
    timeoutMinutes: Number(settings.timeoutMinutes) || 30,
    pendingBlocksAssignment:
      settings.pendingBlocksAssignment === true || settings.pendingBlocksAssignment === "true",
    autoAbsentOnSick:
      settings.autoAbsentOnSick === true || settings.autoAbsentOnSick === "true",
    autoAbsentOnNoResponse:
      settings.autoAbsentOnNoResponse === true || settings.autoAbsentOnNoResponse === "true",
  };
}

export async function updateVerificationSetting(key, value) {
  const fullKey = key.startsWith("verification.") ? key : `verification.${key}`;
  const jsonValue = JSON.stringify(value);
  await pool.query(
    `INSERT INTO assignment_config (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = $2`,
    [fullKey, jsonValue]
  );
}

/* ------------------------------------------------ */
/* SHIFT WINDOW HELPERS (reuse backend constants)   */
/* ------------------------------------------------ */

const GERMAN_MONTHS = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

const SHIFT_WINDOWS = {
  E1: { startHour: 6, startMinute: 30 },
  E2: { startHour: 7, startMinute: 0 },
  L1: { startHour: 13, startMinute: 0 },
  L2: { startHour: 15, startMinute: 0 },
  N:  { startHour: 21, startMinute: 15 },
};

const NON_WORKING_SHIFTS = new Set(["ABW", "FS", "SEMINAR", "S", "DBS"]);

/**
 * Compute the send time for a verification message.
 * Returns a Date object = shift start + delayMinutes.
 */
export function computeSendTime(shiftCode, date, delayMinutes = 5) {
  const code = String(shiftCode || "").trim().toUpperCase();
  const window = SHIFT_WINDOWS[code];
  if (!window) return null;

  const sendAt = new Date(date);
  sendAt.setHours(window.startHour, window.startMinute, 0, 0);
  sendAt.setMinutes(sendAt.getMinutes() + delayMinutes);
  return sendAt;
}

/* ------------------------------------------------ */
/* QUERY HELPERS                                    */
/* ------------------------------------------------ */

/**
 * Get all planned employees for today that need verification.
 * Excludes non-working shifts (ABW, FS, etc.) and employees
 * who already have a verification record for today.
 */
export async function getEmployeesNeedingVerification(dateOverride = null) {
  const now = dateOverride || new Date();
  const day = now.getDate();
  const monthLabel = `${GERMAN_MONTHS[now.getMonth()]} ${now.getFullYear()}`;
  const dateStr = toDateString(now);

  const { rows } = await pool.query(
    `SELECT s.employee_name, s.shift_code
     FROM shifts s
     WHERE s.month = $1
       AND s.day = $2
       AND s.shift_code IS NOT NULL
       AND UPPER(TRIM(s.shift_code)) NOT IN ('ABW', 'FS', 'SEMINAR', 'S')
       AND NOT EXISTS (
         SELECT 1 FROM shift_verifications sv
         WHERE sv.employee_name = s.employee_name
           AND sv.date = $3
           AND sv.shift_code = UPPER(TRIM(s.shift_code))
       )
     ORDER BY s.employee_name`,
    [monthLabel, day, dateStr]
  );

  return rows.map((r) => ({
    employeeName: r.employee_name,
    shiftCode: String(r.shift_code).trim().toUpperCase(),
  }));
}

/**
 * Create a pending verification record.
 * Uses ON CONFLICT to prevent duplicates (idempotent).
 */
export async function createVerification(employeeName, date, shiftCode, initiatedBy = "system") {
  const dateStr = toDateString(date);
  const code = String(shiftCode).trim().toUpperCase();

  const { rows } = await pool.query(
    `INSERT INTO shift_verifications (employee_name, date, shift_code, status, initiated_by)
     VALUES ($1, $2, $3, 'pending', $4)
     ON CONFLICT (employee_name, date, shift_code) DO NOTHING
     RETURNING *`,
    [employeeName, dateStr, code, initiatedBy]
  );

  if (rows.length > 0) {
    await logAudit(rows[0].id, employeeName, dateStr, code, "created", null, "pending", null, initiatedBy);
  }

  return rows[0] || null;
}

/**
 * Mark that the Teams message was sent.
 */
export async function markMessageSent(verificationId) {
  await pool.query(
    `UPDATE shift_verifications SET message_sent_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [verificationId]
  );
  const { rows } = await pool.query(`SELECT * FROM shift_verifications WHERE id = $1`, [verificationId]);
  if (rows[0]) {
    await logAudit(rows[0].id, rows[0].employee_name, rows[0].date, rows[0].shift_code, "message_sent", "pending", "pending", null, "system");
  }
}

/**
 * Record a delivery failure.
 */
export async function markDeliveryFailed(verificationId, errorMessage) {
  await pool.query(
    `UPDATE shift_verifications
     SET status = 'failed', delivery_error = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'pending'`,
    [verificationId, String(errorMessage).slice(0, 2000)]
  );
  const { rows } = await pool.query(`SELECT * FROM shift_verifications WHERE id = $1`, [verificationId]);
  if (rows[0]) {
    await logAudit(rows[0].id, rows[0].employee_name, rows[0].date, rows[0].shift_code,
      "delivery_failed", "pending", "failed", { error: errorMessage }, "system");
  }
}

/**
 * Process an employee response to the verification question.
 * Handles idempotency: only processes if current status is 'pending'.
 *
 * @param {string} employeeName
 * @param {string} date  (YYYY-MM-DD)
 * @param {string} shiftCode
 * @param {string} response  'yes' | 'sick' | 'wrong_shift'
 * @returns {{ success: boolean, status: string, message: string }}
 */
export async function processVerificationResponse(employeeName, date, shiftCode, response) {
  const dateStr = typeof date === "string" ? date : toDateString(date);
  const code = String(shiftCode).trim().toUpperCase();

  // Fetch current record
  const { rows: current } = await pool.query(
    `SELECT * FROM shift_verifications
     WHERE employee_name = $1 AND date = $2 AND shift_code = $3`,
    [employeeName, dateStr, code]
  );

  if (!current.length) {
    return { success: false, status: "not_found", message: "No verification record found" };
  }

  const record = current[0];

  // Idempotency: if already in a terminal state, return current status
  if (record.status !== "pending") {
    return {
      success: true,
      status: record.status,
      message: `Already processed: ${record.status}`,
      alreadyProcessed: true,
    };
  }

  let newStatus;
  switch (String(response).toLowerCase()) {
    case "yes":
      newStatus = "verified";
      break;
    case "sick":
      newStatus = "sick";
      break;
    case "wrong_shift":
    case "other_shift":
      newStatus = "wrong_shift";
      break;
    default:
      return { success: false, status: "invalid_response", message: `Unknown response: ${response}` };
  }

  await pool.query(
    `UPDATE shift_verifications
     SET status = $4, responded_at = NOW(), response_raw = $5, updated_at = NOW()
     WHERE employee_name = $1 AND date = $2 AND shift_code = $3`,
    [employeeName, dateStr, code, newStatus, String(response).slice(0, 80)]
  );

  await logAudit(record.id, employeeName, dateStr, code, "response_received",
    "pending", newStatus, { response }, employeeName);

  // Side effects for sick: mark absent in the operative model
  const settings = await getVerificationSettings();
  if (newStatus === "sick" && settings.autoAbsentOnSick) {
    await markOperativeAbsence(employeeName, dateStr, code, "sick");
  }

  return { success: true, status: newStatus, message: `Status updated to ${newStatus}` };
}

/**
 * Handle timeout: employees who didn't respond within the timeout window.
 */
export async function processTimeouts(now = new Date()) {
  const settings = await getVerificationSettings();
  const timeoutMs = settings.timeoutMinutes * 60 * 1000;

  const { rows } = await pool.query(
    `UPDATE shift_verifications
     SET status = 'no_response', updated_at = NOW()
     WHERE status = 'pending'
       AND message_sent_at IS NOT NULL
       AND message_sent_at < NOW() - INTERVAL '1 minute' * $1
     RETURNING *`,
    [settings.timeoutMinutes]
  );

  for (const row of rows) {
    await logAudit(row.id, row.employee_name, row.date, row.shift_code,
      "timeout", "pending", "no_response", { timeoutMinutes: settings.timeoutMinutes }, "system");

    if (settings.autoAbsentOnNoResponse) {
      await markOperativeAbsence(row.employee_name, row.date, row.shift_code, "no_response");
    }
  }

  return rows.length;
}

/**
 * Admin/manual override of verification status.
 */
export async function overrideVerificationStatus(employeeName, date, shiftCode, newStatus, overrideBy, reason) {
  if (!VERIFICATION_STATUSES.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  const dateStr = typeof date === "string" ? date : toDateString(date);
  const code = String(shiftCode).trim().toUpperCase();

  const { rows: current } = await pool.query(
    `SELECT * FROM shift_verifications WHERE employee_name = $1 AND date = $2 AND shift_code = $3`,
    [employeeName, dateStr, code]
  );

  const oldStatus = current[0]?.status || null;

  const { rows } = await pool.query(
    `INSERT INTO shift_verifications (employee_name, date, shift_code, status, override_by, override_reason, responded_at, initiated_by)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'manual')
     ON CONFLICT (employee_name, date, shift_code)
     DO UPDATE SET status = $4, override_by = $5, override_reason = $6, updated_at = NOW()
     RETURNING *`,
    [employeeName, dateStr, code, newStatus, overrideBy, reason]
  );

  if (rows[0]) {
    await logAudit(rows[0].id, employeeName, dateStr, code,
      "manual_override", oldStatus, newStatus, { reason }, overrideBy);
  }

  return rows[0];
}

/* ------------------------------------------------ */
/* QUERY: VERIFICATION STATUS FOR TODAY             */
/* ------------------------------------------------ */

/**
 * Get all verification records for a given date.
 * Includes employees who have no record yet (they need one to be created).
 */
export async function getVerificationsForDate(date = new Date()) {
  const dateStr = toDateString(date);

  const { rows } = await pool.query(
    `SELECT * FROM shift_verifications WHERE date = $1 ORDER BY employee_name, shift_code`,
    [dateStr]
  );

  return rows;
}

/**
 * Get verification status for a specific employee on a specific date.
 */
export async function getEmployeeVerification(employeeName, date = new Date()) {
  const dateStr = toDateString(date);

  const { rows } = await pool.query(
    `SELECT * FROM shift_verifications WHERE employee_name = $1 AND date = $2`,
    [employeeName, dateStr]
  );

  return rows[0] || null;
}

/**
 * Check if an employee is verified and available for ticket assignment.
 * Returns { eligible, status, reason }
 */
export async function checkVerificationEligibility(employeeName, date = new Date()) {
  const settings = await getVerificationSettings();

  // If feature is disabled, everyone is eligible
  if (!settings.enabled) {
    return { eligible: true, status: "feature_disabled", reason: "Verification feature is disabled" };
  }

  const record = await getEmployeeVerification(employeeName, date);

  if (!record) {
    // No record exists yet (before verification window or not triggered)
    // Treat same as pending if pendingBlocksAssignment is true
    if (settings.pendingBlocksAssignment) {
      return {
        eligible: false,
        status: "no_record",
        reason: `${employeeName} has no verification record for today — treated as pending`,
      };
    }
    return { eligible: true, status: "no_record", reason: "No verification record; assignment allowed by config" };
  }

  if (record.status === "verified") {
    return { eligible: true, status: "verified", reason: `${employeeName} is verified and available` };
  }

  if (record.status === "pending" && !settings.pendingBlocksAssignment) {
    return { eligible: true, status: "pending", reason: `${employeeName} is pending but assignment allowed by config` };
  }

  // All other statuses block assignment
  return {
    eligible: false,
    status: record.status,
    reason: `${employeeName} verification status is '${record.status}' — not eligible for assignment`,
  };
}

/* ------------------------------------------------ */
/* QUERY: TV / DASHBOARD ENRICHMENT                 */
/* ------------------------------------------------ */

/**
 * Get a map of employee_name → verification status for today.
 * Used by TV and Dashboard endpoints to attach badges.
 */
export async function getVerificationStatusMap(date = new Date()) {
  const dateStr = toDateString(date);

  const { rows } = await pool.query(
    `SELECT employee_name, shift_code, status, message_sent_at, responded_at
     FROM shift_verifications
     WHERE date = $1`,
    [dateStr]
  );

  const map = new Map();
  for (const row of rows) {
    map.set(row.employee_name, {
      status: row.status,
      shiftCode: row.shift_code,
      messageSentAt: row.message_sent_at,
      respondedAt: row.responded_at,
    });
  }

  return map;
}

/* ------------------------------------------------ */
/* ORCHESTRATION: TRIGGER VERIFICATIONS             */
/* ------------------------------------------------ */

/**
 * Main orchestration function called by a scheduler or cron job.
 * Evaluates which employees need verification messages NOW and
 * triggers the Teams notification flow for each.
 *
 * @param {Function} sendTeamsVerification  - Callback to send Teams message
 *   Signature: (employeeName, shiftCode, date) => Promise<{ success, error? }>
 * @param {Date} now  - Current time (injectable for testing)
 * @returns {{ triggered: number, skipped: number, failed: number, errors: string[] }}
 */
export async function triggerPendingVerifications(sendTeamsVerification, now = new Date()) {
  const settings = await getVerificationSettings();
  if (!settings.enabled) {
    return { triggered: 0, skipped: 0, failed: 0, errors: [], reason: "disabled" };
  }

  const employees = await getEmployeesNeedingVerification(now);
  let triggered = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  for (const emp of employees) {
    const sendTime = computeSendTime(emp.shiftCode, now, settings.delayMinutes);
    if (!sendTime || now < sendTime) {
      skipped++;
      continue;
    }

    // Create the verification record (idempotent)
    const record = await createVerification(emp.employeeName, now, emp.shiftCode, "system");
    if (!record) {
      skipped++; // Already exists
      continue;
    }

    try {
      const result = await sendTeamsVerification(emp.employeeName, emp.shiftCode, toDateString(now));
      if (result.success) {
        await markMessageSent(record.id);
        triggered++;
      } else {
        await markDeliveryFailed(record.id, result.error || "Unknown delivery error");
        failed++;
        errors.push(`${emp.employeeName}: ${result.error}`);
      }
    } catch (err) {
      await markDeliveryFailed(record.id, String(err.message || err));
      failed++;
      errors.push(`${emp.employeeName}: ${err.message}`);
    }
  }

  // Also process timeouts
  const timedOut = await processTimeouts(now);

  return { triggered, skipped, failed, timedOut, errors };
}

/* ------------------------------------------------ */
/* AUDIT LOG                                        */
/* ------------------------------------------------ */

async function logAudit(verificationId, employeeName, date, shiftCode, eventType, oldStatus, newStatus, payload, actor) {
  try {
    await pool.query(
      `INSERT INTO shift_verification_audit
       (verification_id, employee_name, date, shift_code, event_type, old_status, new_status, payload, actor)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        verificationId,
        employeeName,
        typeof date === "string" ? date : toDateString(date),
        shiftCode,
        eventType,
        oldStatus,
        newStatus,
        payload ? JSON.stringify(payload) : null,
        actor || "system",
      ]
    );
  } catch (err) {
    console.error("[VERIFICATION AUDIT] Failed to log audit entry:", err.message);
  }
}

/* ------------------------------------------------ */
/* OPERATIVE ABSENCE MARKING                        */
/* ------------------------------------------------ */

/**
 * Mark an employee as operatively absent.
 * Creates an absence record if auto-absence is configured.
 */
async function markOperativeAbsence(employeeName, dateStr, shiftCode, reason) {
  try {
    // Insert into the existing absences table
    await pool.query(
      `INSERT INTO absences (employee_name, start_date, end_date, type, note, created_at)
       VALUES ($1, $2, $2, $3, $4, NOW())
       ON CONFLICT DO NOTHING`,
      [
        employeeName,
        dateStr,
        reason === "sick" ? "Krank" : "Abwesend",
        `Automatisch erstellt durch Schichtverifizierung (${reason})`,
      ]
    );

    await logAudit(null, employeeName, dateStr, shiftCode,
      "operative_absence_created", null, null, { reason, absenceType: reason }, "system");
  } catch (err) {
    console.error(`[VERIFICATION] Failed to mark operative absence for ${employeeName}:`, err.message);
  }
}

/* ------------------------------------------------ */
/* UTIL                                             */
/* ------------------------------------------------ */

function toDateString(d) {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = d instanceof Date ? d : new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
