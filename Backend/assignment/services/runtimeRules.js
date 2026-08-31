/* ================================================ */
/* Assignment Engine — Runtime Rules Loader         */
/* ================================================ */

import pool from '../../db.js';
import {
  EXCLUDED_ROLES,
  MAX_SH_PER_WORKER_PER_SYSTEM,
  PRIORITY_TIERS,
  SIMILAR_TIME_THRESHOLD_MS,
} from '../constants.js';

const DEFAULT_PRIORITY_TIERS = [
  { tier: PRIORITY_TIERS.TT_HIGH, types: ['TroubleTicket'], priorities: ['high', 'critical'] },
  { tier: PRIORITY_TIERS.TT_MEDIUM, types: ['TroubleTicket'], priorities: ['medium'] },
  { tier: PRIORITY_TIERS.KPI_QUEUE, types: ['SmartHands', 'CrossConnect'] },
  { tier: PRIORITY_TIERS.SCHEDULED, types: ['Scheduled'] },
  { tier: PRIORITY_TIERS.TT_LOW, types: ['TroubleTicket'], priorities: ['low', 'unknown'] },
  { tier: PRIORITY_TIERS.OTHER, types: ['Other'] },
];

const DEFAULT_RUNTIME_RULES = {
  excludedRoles: [...EXCLUDED_ROLES],
  dispatcherRule: {
    enabled: true,
    onlyOtherTeamsHandovers: true,
  },
  deutscheBoerse: {
    enabled: true,
    allowTroubleTickets: true,
    allowCrossConnectIfRemainingHoursGt: 24,
    deny: ['SmartHands', 'Scheduled', 'Other'],
  },
  crossConnectOnly: {
    enabled: true,
    allow: ['CrossConnect'],
    allowMixedTypes: [],
    allowTroubleTicketWhenResourcesTight: true,
    minRemainingHoursForTroubleTicket: 24,
    sameSystemOnly: false,
    samePriorityOnly: false,
  },
  maxShPerSystem: MAX_SH_PER_WORKER_PER_SYSTEM,
  similarTimeThresholdMs: SIMILAR_TIME_THRESHOLD_MS,
  priorityTiers: DEFAULT_PRIORITY_TIERS,
  loadBalancing: {
    enabled: true,
    mode: 'least_workload',
  },
  maxTicketsPerWorker: 0,
  maxTicketsPerType: {},
  maxTicketsPerRole: {},
  maxTicketsPerRoleAndType: {},
};

let runtimeRules = DEFAULT_RUNTIME_RULES;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asPositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function getConfigValue(config, ...keys) {
  for (const key of keys) {
    if (config && Object.prototype.hasOwnProperty.call(config, key)) {
      return config[key];
    }
  }
  return undefined;
}

function normalizeLowerCaseNumberMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [String(key || '').trim().toLowerCase(), asPositiveNumber(entryValue, null)])
      .filter(([, entryValue]) => entryValue != null)
  );
}

function normalizeCaseSensitiveNumberMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, entryValue]) => [String(key || '').trim(), asPositiveNumber(entryValue, null)])
      .filter(([key, entryValue]) => key && entryValue != null)
  );
}

function normalizeRoleTypeCapMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  return Object.fromEntries(
    Object.entries(value)
      .map(([roleKey, perType]) => {
        const normalizedRoleKey = String(roleKey || '').trim().toLowerCase();
        const normalizedPerType = normalizeCaseSensitiveNumberMap(perType);
        return [normalizedRoleKey, normalizedPerType];
      })
      .filter(([roleKey, perType]) => roleKey && Object.keys(perType).length > 0)
  );
}

function normalizePriorityTiers(value) {
  const tiers = asArray(value)
    .map((entry) => ({
      tier: asPositiveNumber(entry?.tier, null),
      types: asArray(entry?.types).map((item) => String(item || '').trim()).filter(Boolean),
      priorities: asArray(entry?.priorities).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean),
    }))
    .filter((entry) => Number.isFinite(entry.tier) && entry.types.length > 0)
    .sort((a, b) => a.tier - b.tier);

  return tiers.length > 0 ? tiers : DEFAULT_PRIORITY_TIERS;
}

function buildRuntimeRules(rows = []) {
  const next = {
    ...DEFAULT_RUNTIME_RULES,
    dispatcherRule: { ...DEFAULT_RUNTIME_RULES.dispatcherRule },
    deutscheBoerse: { ...DEFAULT_RUNTIME_RULES.deutscheBoerse },
    crossConnectOnly: { ...DEFAULT_RUNTIME_RULES.crossConnectOnly },
    loadBalancing: { ...DEFAULT_RUNTIME_RULES.loadBalancing },
    priorityTiers: [...DEFAULT_RUNTIME_RULES.priorityTiers],
  };

  for (const row of rows) {
    const config = row?.config_json && typeof row.config_json === 'object' ? row.config_json : {};
    const enabled = row?.enabled !== false;

    switch (row?.rule_key) {
      case 'excluded_roles':
        next.excludedRoles = enabled
          ? asArray(config.roles).map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
          : [];
        break;
      case 'dispatcher_rule':
        next.dispatcherRule = {
          enabled,
          onlyOtherTeamsHandovers: config.only_other_teams_handovers !== false,
        };
        break;
      case 'deutsche_boerse':
        next.deutscheBoerse = {
          enabled,
          allowTroubleTickets: config.allow_tt !== false,
          allowCrossConnectIfRemainingHoursGt: config.allow_cc_if_remaining_gt_24h === false
            ? 0
            : 24,
          deny: asArray(config.deny).map((item) => String(item || '').trim()).filter(Boolean),
        };
        break;
      case 'cross_connect_only':
        next.crossConnectOnly = {
          enabled,
          allow: asArray(config.allow).map((item) => String(item || '').trim()).filter(Boolean),
          allowMixedTypes: asArray(getConfigValue(config, 'allow_mixed_types', 'allowMixedTypes')).map((item) => String(item || '').trim()).filter(Boolean),
          allowTroubleTicketWhenResourcesTight: getConfigValue(config, 'allow_tt_when_insufficient_resources', 'allowTroubleTicketWhenResourcesTight') !== false,
          minRemainingHoursForTroubleTicket: asPositiveNumber(
            getConfigValue(config, 'min_remaining_hours_for_tt', 'minRemainingHoursForTroubleTicket'),
            DEFAULT_RUNTIME_RULES.crossConnectOnly.minRemainingHoursForTroubleTicket,
          ),
          sameSystemOnly: getConfigValue(config, 'allow_same_system_only', 'sameSystemOnly') === true,
          samePriorityOnly: getConfigValue(config, 'same_priority_only', 'samePriorityOnly') === true,
        };
        break;
      case 'max_sh_per_system':
        next.maxShPerSystem = enabled ? asPositiveNumber(config.max, DEFAULT_RUNTIME_RULES.maxShPerSystem) : Number.MAX_SAFE_INTEGER;
        break;
      case 'similar_time_threshold':
        next.similarTimeThresholdMs = enabled
          ? asPositiveNumber(config.threshold_hours, DEFAULT_RUNTIME_RULES.similarTimeThresholdMs / 3600000) * 3600000
          : Number.MAX_SAFE_INTEGER;
        break;
      case 'priority_tiers':
        next.priorityTiers = enabled ? normalizePriorityTiers(config.tiers) : DEFAULT_PRIORITY_TIERS;
        break;
      case 'load_balancing':
        next.loadBalancing = {
          enabled,
          mode: String(config.mode || 'least_workload').trim() || 'least_workload',
        };
        break;
      case 'max_tickets_per_worker':
        next.maxTicketsPerWorker = enabled ? asPositiveNumber(config.max, 0) : 0;
        next.maxTicketsPerType = enabled ? normalizeCaseSensitiveNumberMap(getConfigValue(config, 'per_type', 'maxTicketsPerType')) : {};
        next.maxTicketsPerRole = enabled ? normalizeLowerCaseNumberMap(getConfigValue(config, 'per_role', 'maxTicketsPerRole')) : {};
        next.maxTicketsPerRoleAndType = enabled ? normalizeRoleTypeCapMap(getConfigValue(config, 'per_role_type', 'maxTicketsPerRoleAndType')) : {};
        break;
      default:
        break;
    }
  }

  return next;
}

export function getAssignmentRuntimeRules() {
  return runtimeRules;
}

export async function refreshAssignmentRuntimeRules({ client = pool } = {}) {
  try {
    const { rows } = await client.query(
      `SELECT rule_key, config_json, enabled
       FROM assignment_rules
       ORDER BY sort_order ASC, id ASC`
    );
    runtimeRules = buildRuntimeRules(rows);
  } catch (err) {
    console.warn('[ASSIGNMENT] Failed to refresh runtime rules, using defaults:', err.message);
    runtimeRules = DEFAULT_RUNTIME_RULES;
  }

  return runtimeRules;
}