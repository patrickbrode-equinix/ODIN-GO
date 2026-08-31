/* ================================================ */
/* Assignment Engine — Ticket Capacity Rules        */
/* ================================================ */

import { getAssignmentRuntimeRules } from '../services/runtimeRules.js';

function asPositiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getTypeCount(workerCurrentTickets = [], ticketType) {
  return workerCurrentTickets.filter((entry) => entry?.type === ticketType).length;
}

function getNestedNumber(map, firstKey, secondKey) {
  if (!map || typeof map !== 'object') return null;
  const first = map[firstKey];
  if (!first || typeof first !== 'object') return null;
  return asPositiveNumber(first[secondKey]);
}

export function evaluateTicketCapacity(worker, ticket, workerCurrentTickets = [], runtimeRules = getAssignmentRuntimeRules()) {
  const currentTotal = workerCurrentTickets.length;
  const currentTypeTotal = getTypeCount(workerCurrentTickets, ticket?.type);
  const workerRole = String(worker?.role || 'normal').trim().toLowerCase();
  const ticketType = String(ticket?.type || '').trim();
  const matchedLimits = [];

  const globalCap = asPositiveNumber(runtimeRules?.maxTicketsPerWorker);
  if (globalCap) {
    matchedLimits.push({
      key: 'global',
      cap: globalCap,
      current: currentTotal,
      scope: 'global',
      label: `Globales Ticketlimit ${globalCap}`,
      reached: currentTotal >= globalCap,
    });
  }

  const roleCap = asPositiveNumber(runtimeRules?.maxTicketsPerRole?.[workerRole]);
  if (roleCap) {
    matchedLimits.push({
      key: 'role',
      cap: roleCap,
      current: currentTotal,
      scope: `role:${workerRole}`,
      label: `Rollenlimit ${workerRole} = ${roleCap}`,
      reached: currentTotal >= roleCap,
    });
  }

  const typeCap = asPositiveNumber(runtimeRules?.maxTicketsPerType?.[ticketType]);
  if (typeCap) {
    matchedLimits.push({
      key: 'type',
      cap: typeCap,
      current: currentTypeTotal,
      scope: `type:${ticketType}`,
      label: `Ticketklassenlimit ${ticketType} = ${typeCap}`,
      reached: currentTypeTotal >= typeCap,
    });
  }

  const roleTypeCap = getNestedNumber(runtimeRules?.maxTicketsPerRoleAndType, workerRole, ticketType);
  if (roleTypeCap) {
    matchedLimits.push({
      key: 'role-type',
      cap: roleTypeCap,
      current: currentTypeTotal,
      scope: `role:${workerRole}:type:${ticketType}`,
      label: `Rollen-/Klassenlimit ${workerRole} + ${ticketType} = ${roleTypeCap}`,
      reached: currentTypeTotal >= roleTypeCap,
    });
  }

  const blockingLimits = matchedLimits.filter((limit) => limit.reached);

  if (blockingLimits.length > 0) {
    return {
      eligible: false,
      rule: 'ticketCapacity',
      matchedLimits,
      blockingLimits,
      reason: blockingLimits
        .map((limit) => `${limit.label} erreicht (aktuell ${limit.current})`)
        .join('; '),
    };
  }

  return {
    eligible: true,
    rule: 'ticketCapacity',
    matchedLimits,
    blockingLimits: [],
    reason: matchedLimits.length > 0
      ? matchedLimits.map((limit) => `${limit.label}, aktuell ${limit.current}`).join('; ')
      : 'Kein Ticketlimit aktiv',
  };
}