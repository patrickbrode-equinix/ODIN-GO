/* ================================================ */
/* Assignment Writeback — Employee Mapper           */
/* Resolves ODIN employees to Jarvis identity.      */
/* Detects duplicates and missing fields.           */
/* ================================================ */

import pool from '../../db.js';

/**
 * Normalize a Jarvis display name string by removing "(Me)" suffix.
 * "Patrick Brode (Me)" → "Patrick Brode"
 */
export function normalizeJarvisDisplayName(raw) {
  if (!raw) return '';
  return raw.replace(/\s*\(Me\)\s*$/i, '').trim();
}

/**
 * Load a single ODIN employee with all Jarvis identity fields.
 * Returns null if not found.
 */
export async function loadEmployeeWithJarvisFields(employeeId) {
  const { rows } = await pool.query(
    `SELECT
       id,
       NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS name,
       first_name,
       last_name,
       email,
       assignment_role,
       shift_active,
       is_sick,
       absent,
       auto_assignable,
       assignment_eligible,
       jarvis_display_name,
       jarvis_display_name_aliases,
       jarvis_initials,
       jarvis_owner_code,
       queue_eligibility,
       blocked
     FROM users
     WHERE id = $1`,
    [employeeId]
  );
  return rows[0] || null;
}

/**
 * Validate that an employee has all required Jarvis identity fields.
 * Returns { valid: bool, errors: string[] }
 */
export function validateEmployeeJarvisMapping(employee) {
  const errors = [];

  if (!employee.jarvis_display_name) {
    errors.push('Employee has no jarvisDisplayName — cannot execute Jarvis assignment');
  }
  if (!employee.jarvis_owner_code) {
    errors.push('Employee has no jarvisOwnerCode — cannot verify final queue state');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Check for duplicate Jarvis identity fields across all employees.
 * If another employee shares the same jarvis_display_name, jarvis_initials, or jarvis_owner_code,
 * block execution and return the conflict details.
 */
export async function checkJarvisDuplicates(employeeId) {
  const employee = await loadEmployeeWithJarvisFields(employeeId);
  if (!employee) return { safe: false, reason: 'Employee not found', conflicts: [] };

  const conflicts = [];

  // Check duplicate owner code
  if (employee.jarvis_owner_code) {
    const { rows: ownerDups } = await pool.query(
      `SELECT id, NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS name, jarvis_owner_code FROM users
       WHERE jarvis_owner_code = $1 AND id != $2`,
      [employee.jarvis_owner_code, employeeId]
    );
    if (ownerDups.length > 0) {
      conflicts.push({
        field: 'jarvis_owner_code',
        value: employee.jarvis_owner_code,
        conflictsWith: ownerDups.map(r => ({ id: r.id, name: r.name })),
      });
    }
  }

  // Check duplicate display name (case-insensitive)
  if (employee.jarvis_display_name) {
    const { rows: nameDups } = await pool.query(
      `SELECT id, NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS name, jarvis_display_name FROM users
       WHERE LOWER(jarvis_display_name) = LOWER($1) AND id != $2`,
      [employee.jarvis_display_name, employeeId]
    );
    if (nameDups.length > 0) {
      conflicts.push({
        field: 'jarvis_display_name',
        value: employee.jarvis_display_name,
        conflictsWith: nameDups.map(r => ({ id: r.id, name: r.name })),
      });
    }
  }

  if (conflicts.length > 0) {
    return {
      safe: false,
      reason: `Duplicate Jarvis identity fields found: ${conflicts.map(c => `${c.field}=${c.value}`).join(', ')}`,
      conflicts,
    };
  }

  return { safe: true, reason: 'No duplicate Jarvis identity conflicts', conflicts: [] };
}

/**
 * Hard reasons that allow unassign/reassign.
 * Must be one of these to proceed in full_auto mode.
 */
export const HARD_UNASSIGN_REASONS = Object.freeze([
  'sick',
  'absent',
  'not_on_shift',
  'dispatcher_role',
  'lead_role',
  'project_role',
  'non_ticket_eligible_role',
  'explicitly_disabled',
  'not_eligible_for_queue',
]);

/**
 * Determine if an employee has a hard reason to be unassigned.
 * Returns { hasHardReason: bool, reason: string|null }
 */
export function resolveHardUnassignReason(employee, queueType = null) {
  if (!employee) return { hasHardReason: false, reason: null };

  if (employee.is_sick) return { hasHardReason: true, reason: 'sick' };
  if (employee.absent) return { hasHardReason: true, reason: 'absent' };
  if (!employee.shift_active) return { hasHardReason: true, reason: 'not_on_shift' };
  if (employee.blocked || !employee.auto_assignable || !employee.assignment_eligible) {
    return { hasHardReason: true, reason: 'explicitly_disabled' };
  }

  const role = String(employee.assignment_role || '').toLowerCase();
  if (role === 'dispatcher') return { hasHardReason: true, reason: 'dispatcher_role' };
  if (role === 'leads' || role === 'lead') return { hasHardReason: true, reason: 'lead_role' };
  if (role === 'project' || role === 'projekt') return { hasHardReason: true, reason: 'project_role' };

  // Check queue eligibility if specified
  if (queueType && employee.queue_eligibility) {
    const eligibility = typeof employee.queue_eligibility === 'string'
      ? JSON.parse(employee.queue_eligibility)
      : employee.queue_eligibility;
    const queueKey = String(queueType).toLowerCase();
    if (eligibility[queueKey] === false) {
      return { hasHardReason: true, reason: 'not_eligible_for_queue' };
    }
  }

  return { hasHardReason: false, reason: null };
}

/**
 * Resolve the current ODIN employee by their Jarvis owner code.
 * Returns null if not known to ODIN.
 */
export async function resolveEmployeeByOwnerCode(ownerCode) {
  if (!ownerCode) return null;
  const { rows } = await pool.query(
    `SELECT id, NULLIF(trim(concat_ws(' ', first_name, last_name)), '') AS name, first_name, last_name,
            email, assignment_role, shift_active, is_sick, absent,
            auto_assignable, assignment_eligible, jarvis_display_name,
            jarvis_initials, jarvis_owner_code, blocked
     FROM users WHERE LOWER(jarvis_owner_code) = LOWER($1)`,
    [ownerCode]
  );
  return rows[0] || null;
}
