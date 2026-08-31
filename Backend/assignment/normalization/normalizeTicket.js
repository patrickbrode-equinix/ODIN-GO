/* ================================================ */
/* Assignment Engine — Ticket Normalization         */
/* ================================================ */

import { TYPE_ALIASES, STATUS_ALIASES, PRIORITY_ALIASES, HANDOVER_ALIASES } from '../config.js';
import { NormalizationError } from '../errors.js';

/* ---- Individual mappers ---- */

export function mapType(raw) {
  if (!raw) return { value: 'Unknown', warning: 'Missing ticket type' };
  const key = String(raw).toLowerCase().trim();
  const mapped = TYPE_ALIASES[key];
  if (mapped) return { value: mapped, warning: null };
  return { value: 'Unknown', warning: `Unknown ticket type: "${raw}"` };
}

export function mapStatus(raw) {
  if (!raw) return { value: 'unknown', warning: 'Missing ticket status' };
  const key = String(raw).toLowerCase().trim();
  const mapped = STATUS_ALIASES[key];
  if (mapped) return { value: mapped, warning: null };
  return { value: 'unknown', warning: `Unknown ticket status: "${raw}"` };
}

export function mapPriority(raw) {
  if (!raw) return { value: 'unknown', warning: 'Missing ticket priority' };
  const key = String(raw).toLowerCase().trim();
  const mapped = PRIORITY_ALIASES[key];
  if (mapped) return { value: mapped, warning: null };
  return { value: 'unknown', warning: `Unknown ticket priority: "${raw}"` };
}

export function mapSite(raw) {
  if (!raw) return { value: null, warning: 'Missing site information' };
  const trimmed = String(raw).trim();
  if (!trimmed) return { value: null, warning: 'Empty site information' };
  return { value: trimmed, warning: null };
}

export function mapDates(rawDueAt, rawCreatedAt) {
  const warnings = [];
  let dueAt = null;
  let createdAt = null;

  if (rawDueAt) {
    const d = new Date(rawDueAt);
    if (isNaN(d.getTime())) {
      warnings.push(`Invalid dueAt date: "${rawDueAt}"`);
    } else {
      dueAt = d.toISOString();
    }
  }
  if (rawCreatedAt) {
    const d = new Date(rawCreatedAt);
    if (isNaN(d.getTime())) {
      warnings.push(`Invalid createdAt date: "${rawCreatedAt}"`);
    } else {
      createdAt = d.toISOString();
    }
  }
  return { dueAt, createdAt, warnings };
}

export function mapResponsibility(raw) {
  if (!raw) return { value: null, warning: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { value: null, warning: null };
  return { value: trimmed, warning: null };
}

export function mapTicketId(raw) {
  if (!raw && raw !== 0) return { id: null, warning: 'Missing ticket ID' };
  return { id: String(raw), warning: null };
}

/**
 * Map handover type from raw string.
 */
export function mapHandoverType(raw) {
  if (!raw) return { value: null, warning: null };
  const key = String(raw).toLowerCase().trim();
  const mapped = HANDOVER_ALIASES[key];
  if (mapped) return { value: mapped, warning: null };
  return { value: raw, warning: `Unknown handover type: "${raw}"` };
}

/**
 * Map scheduled start date.
 */
export function mapScheduledStart(raw) {
  if (!raw) return { value: null, warning: null };
  const d = new Date(raw);
  if (isNaN(d.getTime())) {
    return { value: null, warning: `Invalid scheduledStart date: "${raw}"` };
  }
  return { value: d.toISOString(), warning: null };
}

/**
 * Map system name from raw data.
 */
export function mapSystemName(raw) {
  if (!raw) return { value: null, warning: null };
  const trimmed = String(raw).trim();
  if (!trimmed) return { value: null, warning: null };
  return { value: trimmed, warning: null };
}

/* ---- Full normalizer ---- */

/**
 * Normalize a raw ticket object into the internal NormalizedTicket model.
 * Never throws — collects warnings instead.
 */
export function normalizeTicket(raw) {
  const warnings = [];

  // ID
  const idResult = mapTicketId(raw.id ?? raw.external_id ?? raw.ticket_id);
  if (idResult.warning) warnings.push(idResult.warning);

  // Type
  const typeResult = mapType(raw.type ?? raw.ticket_type ?? raw.queue_type ?? raw.subtype);
  if (typeResult.warning) warnings.push(typeResult.warning);

  // Status
  const statusResult = mapStatus(raw.status ?? raw.ticket_status);
  if (statusResult.warning) warnings.push(statusResult.warning);

  // Priority
  const priorityResult = mapPriority(raw.priority ?? raw.ticket_priority ?? raw.severity);
  if (priorityResult.warning) warnings.push(priorityResult.warning);

  // Site
  const siteResult = mapSite(raw.site ?? raw.location ?? raw.datacenter);
  if (siteResult.warning) warnings.push(siteResult.warning);

  // Dates
  const dateResult = mapDates(
    raw.due_at ?? raw.dueAt ?? raw.revised_commit_date ?? raw.commit_date ?? raw.sched_start,
    raw.created_at ?? raw.createdAt ?? raw.created ?? raw.first_seen_at
  );
  warnings.push(...dateResult.warnings);

  // Responsibility
  const respResult = mapResponsibility(raw.responsibility ?? raw.group_key ?? raw.queue);
  if (respResult.warning) warnings.push(respResult.warning);

  // Handover type (new)
  const handoverResult = mapHandoverType(raw.handover_type ?? raw.handoverType);
  if (handoverResult.warning) warnings.push(handoverResult.warning);

  // Scheduled start (new)
  const schedResult = mapScheduledStart(raw.sched_start ?? raw.scheduled_start ?? raw.scheduledStart);
  if (schedResult.warning) warnings.push(schedResult.warning);

  // System name (new)
  const sysResult = mapSystemName(raw.system_name ?? raw.systemName);
  if (sysResult.warning) warnings.push(sysResult.warning);

  return {
    id: idResult.id || String(raw.id ?? ''),
    externalId: raw.external_id ?? raw.externalId ?? null,
    type: typeResult.value,
    status: statusResult.value,
    priority: priorityResult.value,
    site: siteResult.value,
    queue: raw.queue ?? raw.queue_type ?? null,
    customer: raw.customer ?? raw.customer_name ?? raw.account_name ?? null,
    dueAt: dateResult.dueAt,
    createdAt: dateResult.createdAt,
    responsibility: respResult.value,
    manualHold: !!(raw.manual_hold ?? raw.manualHold ?? false),
    autoAssignable: raw.auto_assignable !== false && raw.autoAssignable !== false,
    // New fields
    handoverType: handoverResult.value,
    scheduledStart: schedResult.value,
    systemName: sysResult.value,
    remainingHours: raw.remaining_hours != null ? Number(raw.remaining_hours) : null,
    soNumber: raw.so_number ?? raw.soNumber ?? null,
    customerTroubleType: raw.customer_trouble_type ?? raw.customerTroubleType ?? null,
    // Raw values for audit
    rawType: raw.type ?? raw.ticket_type ?? raw.queue_type ?? raw.subtype ?? null,
    rawStatus: raw.status ?? raw.ticket_status ?? null,
    rawPriority: raw.priority ?? raw.ticket_priority ?? raw.severity ?? null,
    rawSite: raw.site ?? raw.location ?? raw.datacenter ?? null,
    normalizationWarnings: warnings,
    raw,
  };
}

/**
 * Validate a normalized ticket. Returns list of critical issues.
 * If issues exist -> manual_review.
 */
export function validateNormalizedTicket(ticket) {
  const issues = [];
  if (!ticket.id) issues.push('Ticket has no ID');
  if (ticket.type === 'Unknown' && !ticket.rawType) issues.push('Ticket type is unknown and raw type is missing');
  if (ticket.status === 'unknown' && !ticket.rawStatus) issues.push('Ticket status is unknown and raw status is missing');
  return issues;
}
