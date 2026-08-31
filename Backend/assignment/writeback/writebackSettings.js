/* ================================================ */
/* Assignment Writeback — Settings                  */
/* Loads writeback feature flags from              */
/* assignment_settings (same table as engine).     */
/* ================================================ */

import pool from '../../db.js';

/* ---- Defaults (always safe / off) ---- */
const WRITEBACK_DEFAULTS = {
  'writeback.enabled':                          'false',
  'writeback.mode':                             'shadow_only',
  'writeback.killSwitch':                       'false',
  'writeback.allowOverwriteExistingAssignee':   'false',
  'writeback.allowAutoUnassign':                'false',
  'writeback.allowAutoReassign':                'false',
  'writeback.maxExecutionRetries':              '2',
  'writeback.requireFreshCrawlerData':          'true',
  'writeback.maxSnapshotAgeMinutes':            '5',
  'writeback.queueEnabled.smartHands':          'false',
  'writeback.queueEnabled.crossConnect':        'false',
  'writeback.queueEnabled.trouble':             'false',
  'writeback.queueEnabled.deinstall':           'false',
  'writeback.allowOtherTeamsAssignment':        'false',
  'writeback.requireManualApprovalForUnassign': 'true',
  'writeback.requireManualApprovalForReassign': 'true',
  'writeback.pilot.enabled':                    'false',
  'writeback.pilot.employeeSelector':           '',
};

export const WRITEBACK_SETTING_KEYS = Object.keys(WRITEBACK_DEFAULTS);

/**
 * Load all writeback settings from the database,
 * falling back to safe defaults for any missing key.
 */
export async function loadWritebackSettings() {
  const { rows } = await pool.query(
    `SELECT key, value FROM assignment_settings WHERE key LIKE 'writeback.%'`
  );

  const map = { ...WRITEBACK_DEFAULTS };
  for (const row of rows) {
    map[row.key] = row.value;
  }

  return {
    enabled:                          map['writeback.enabled'] === 'true',
    mode:                             map['writeback.mode'],
    killSwitch:                       map['writeback.killSwitch'] === 'true',
    allowOverwriteExistingAssignee:   map['writeback.allowOverwriteExistingAssignee'] === 'true',
    allowAutoUnassign:                map['writeback.allowAutoUnassign'] === 'true',
    allowAutoReassign:                map['writeback.allowAutoReassign'] === 'true',
    maxExecutionRetries:              parseInt(map['writeback.maxExecutionRetries'] || '2', 10),
    requireFreshCrawlerData:          map['writeback.requireFreshCrawlerData'] === 'true',
    maxSnapshotAgeMinutes:            parseInt(map['writeback.maxSnapshotAgeMinutes'] || '5', 10),
    queueEnabled: {
      smartHands:   map['writeback.queueEnabled.smartHands'] === 'true',
      crossConnect: map['writeback.queueEnabled.crossConnect'] === 'true',
      trouble:      map['writeback.queueEnabled.trouble'] === 'true',
      deinstall:    map['writeback.queueEnabled.deinstall'] === 'true',
    },
    allowOtherTeamsAssignment:        map['writeback.allowOtherTeamsAssignment'] === 'true',
    requireManualApprovalForUnassign: map['writeback.requireManualApprovalForUnassign'] === 'true',
    requireManualApprovalForReassign: map['writeback.requireManualApprovalForReassign'] === 'true',
    pilot: {
      enabled: map['writeback.pilot.enabled'] === 'true',
      employeeSelector: String(map['writeback.pilot.employeeSelector'] || '').trim(),
    },
    raw: map,
  };
}

function normalizePilotSelector(value) {
  return String(value ?? '').trim().toLowerCase();
}

/**
 * Limit writeback execution to a single pilot employee while rollout is being tested.
 */
export function checkWritebackPilotEmployee(settings, action, employee = null) {
  if (!settings?.pilot?.enabled) {
    return { allowed: true, reason: 'Writeback pilot mode disabled' };
  }

  const selector = normalizePilotSelector(settings.pilot.employeeSelector);
  if (!selector) {
    return {
      allowed: false,
      reason: 'Writeback pilot mode is enabled but no pilot employee is configured',
    };
  }

  const candidateValues = [
    action?.selected_employee_id,
    action?.selected_employee_name,
    action?.selected_employee_email,
    action?.selected_employee_jarvis_display_name,
    action?.selected_employee_jarvis_owner_code,
    employee?.id,
    employee?.name,
    employee?.email,
    employee?.jarvis_display_name,
    employee?.jarvis_owner_code,
    employee?.jarvis_initials,
  ].map(normalizePilotSelector).filter(Boolean);

  if (candidateValues.includes(selector)) {
    return { allowed: true, reason: `Writeback pilot matched ${settings.pilot.employeeSelector}` };
  }

  return {
    allowed: false,
    reason: `Writeback pilot mode allows only "${settings.pilot.employeeSelector}"`,
  };
}

/**
 * Check whether writeback is globally permitted right now.
 * Returns { allowed: bool, reason: string }.
 */
export function checkWritebackGlobalGuards(settings) {
  if (settings.killSwitch) {
    return { allowed: false, reason: 'writeback.killSwitch is active — all execution blocked' };
  }
  if (!settings.enabled) {
    return { allowed: false, reason: 'writeback.enabled is false — writeback is disabled' };
  }
  return { allowed: true, reason: 'Global guards passed' };
}

/**
 * Check whether writeback is permitted for a specific queue type.
 */
export function checkQueueWritebackEnabled(settings, queueType) {
  if (!queueType) return { allowed: false, reason: 'Queue type is unknown' };
  const normalized = String(queueType).toLowerCase();

  const queueMap = {
    smarthands: settings.queueEnabled.smartHands,
    smartHands: settings.queueEnabled.smartHands,
    crossconnect: settings.queueEnabled.crossConnect,
    crossConnect: settings.queueEnabled.crossConnect,
    ccinstalls: settings.queueEnabled.crossConnect,
    troubletickets: settings.queueEnabled.trouble,
    trouble: settings.queueEnabled.trouble,
    deinstall: settings.queueEnabled.deinstall,
  };

  const allowed = queueMap[normalized] ?? queueMap[queueType] ?? false;
  if (!allowed) {
    return { allowed: false, reason: `Queue writeback not enabled for queue type: ${queueType}` };
  }
  return { allowed: true, reason: `Queue writeback enabled for: ${queueType}` };
}
