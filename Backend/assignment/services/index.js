/* ================================================ */
/* Assignment Engine — Services                     */
/* ================================================ */

import { assignmentSettingsRepository, assignmentDecisionRepository, assignmentExclusionRepository } from '../repositories/index.js';
import { buildTicketExplanation } from '../logging/decisionLog.js';
import { SETTINGS_KEYS } from '../constants.js';
import { decisionMatchesTicketIdentifier } from '../lib/ticketIdentity.js';
import { syncLegacyEngineConfigFromAssignmentSettings } from '../../services/assignmentConfigStore.js';

/* ---- Settings Service ---- */

export const assignmentSettingsService = {
  /**
   * Get all settings as a flat map.
   */
  async getAll() {
    const { map, rows } = await assignmentSettingsRepository.getAll();
    return { settings: map, raw: rows };
  },

  /**
   * Get a single setting value.
   */
  async get(key) {
    const row = await assignmentSettingsRepository.get(key);
    return row ? row.value : null;
  },

  /**
   * Update settings. Only known keys allowed.
   */
  async update(updates, updatedBy) {
    const allowedKeys = Object.values(SETTINGS_KEYS);
    const filtered = {};
    const rejected = [];
    for (const [key, value] of Object.entries(updates)) {
      if (allowedKeys.includes(key)) {
        filtered[key] = value;
      } else {
        rejected.push(key);
      }
    }

    // Keep the live-mode gate in sync automatically so switching to live from the UI succeeds in one step.
    if (filtered[SETTINGS_KEYS.MODE] === 'live') {
      filtered[SETTINGS_KEYS.ENABLE_LIVE] = 'true';
    }

    const results = await assignmentSettingsRepository.setMany(filtered, updatedBy);
    await syncLegacyEngineConfigFromAssignmentSettings(filtered, updatedBy);
    return { updated: results, rejected };
  },

  /**
   * Get settings as a config object for the engine.
   */
  async getEngineConfig() {
    const { map } = await assignmentSettingsRepository.getAll();
    return {
      mode: map[SETTINGS_KEYS.MODE] || 'shadow',
      siteStrictness: map[SETTINGS_KEYS.SITE_STRICTNESS] || 'true',
      responsibilityStrictness: map[SETTINGS_KEYS.RESPONSIBILITY_STRICTNESS] || 'false',
      enableRotationTieBreaker: map[SETTINGS_KEYS.ENABLE_ROTATION] || 'true',
      fallbackTieBreaker: map[SETTINGS_KEYS.FALLBACK_TIE] || 'stable-id',
      planningWindowHours: map[SETTINGS_KEYS.PLANNING_WINDOW] || '72',
      currentShiftOnly: map[SETTINGS_KEYS.CURRENT_SHIFT_ONLY] || 'true',
      maxTicketsPerRun: map[SETTINGS_KEYS.MAX_TICKETS] || '500',
      stopOnCriticalError: map[SETTINGS_KEYS.STOP_ON_ERROR] || 'false',
      supportedTicketTypes: map[SETTINGS_KEYS.SUPPORTED_TYPES] || 'TroubleTicket,SmartHands,CrossConnect,Scheduled,Other',
      crawlerMaxAgeMinutes: map[SETTINGS_KEYS.CRAWLER_MAX_AGE] || '10',
      enableLiveMode: map[SETTINGS_KEYS.ENABLE_LIVE] || 'false',
      insufficientResources: map[SETTINGS_KEYS.INSUFFICIENT_RESOURCES] || 'false',
      cutoffMinutesBeforeShiftEnd: map[SETTINGS_KEYS.CUTOFF_MINUTES_BEFORE_SHIFT_END] || '45',
      maxSameSystemSmartHands: map[SETTINGS_KEYS.MAX_SAME_SYSTEM_SMART_HANDS] || '3',
      maxSameSystemCrossConnect: map[SETTINGS_KEYS.MAX_SAME_SYSTEM_CROSS_CONNECT] || '2',
    };
  },
};

/* ---- Exclusion List Service ---- */

export const assignmentExclusionService = {
  /**
   * Get the full exclusion list.
   */
  async getAll(activeOnly = true) {
    return assignmentExclusionRepository.findAll({ activeOnly });
  },

  /**
   * Get active system names only.
   */
  async getActiveNames() {
    return assignmentExclusionRepository.findActiveNames();
  },

  /**
   * Add a system name to the exclusion list.
   */
  async add({ systemName, reason, createdBy }) {
    if (!systemName || !systemName.trim()) {
      throw new Error('System name is required');
    }
    return assignmentExclusionRepository.create({
      systemName: systemName.trim(),
      reason: reason || null,
      createdBy,
    });
  },

  /**
   * Deactivate an exclusion list entry.
   */
  async deactivate(id) {
    return assignmentExclusionRepository.deactivate(id);
  },

  /**
   * Remove an exclusion list entry permanently.
   */
  async remove(id) {
    return assignmentExclusionRepository.remove(id);
  },
};

/* ---- Explanation Service ---- */

export const assignmentExplanationService = {
  /**
   * Get a full explanation for a ticket, optionally scoped to a run.
   */
  async getTicketExplanation(ticketId, runId = null) {
    let decisions;
    if (runId) {
      const decisionRows = await assignmentDecisionRepository.findByRunId(runId, { limit: 1000, offset: 0 });
      decisions = decisionRows.filter((decision) => decisionMatchesTicketIdentifier(decision, ticketId));
    } else {
      decisions = await assignmentDecisionRepository.findByTicketIdentity(ticketId);
    }

    if (decisions.length === 0) {
      return { found: false, explanation: null, message: `No decision found for ticket ${ticketId}` };
    }

    // Return the most recent decision
    const latest = decisions[0];
    const explanation = buildTicketExplanation(latest);

    return {
      found: true,
      decision: latest,
      explanation,
    };
  },

  /**
   * Build a human-readable summary from a decision row.
   */
  buildHumanReadableSummary(decision) {
    return buildTicketExplanation(decision);
  },
};

/* ---- Execution Service ---- */

export { runAssignmentCycle } from '../engine/runAssignmentCycle.js';
