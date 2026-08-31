import type { AssignmentDecision, TicketExplanationStructured } from '../types/assignment';

type TicketShape = Partial<AssignmentDecision & TicketExplanationStructured> & {
  ticketId?: string | null;
  externalId?: string | null;
  displayTicketNumber?: string | null;
  normalized_ticket?: Record<string, unknown> | null;
  raw_ticket?: Record<string, unknown> | null;
  normalizedTicket?: Record<string, unknown> | null;
  rawTicket?: Record<string, unknown> | null;
};

function readString(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function readObjectValue(source: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!source || !(key in source)) return null;
  return readString(source[key]);
}

export function getAssignmentDisplayTicketNumber(source: TicketShape): string {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;

  return (
    readString(source.displayTicketNumber) ||
    readString(source.external_id) ||
    readString(source.externalId) ||
    readObjectValue(normalized, 'externalId') ||
    readObjectValue(raw, 'external_id') ||
    readObjectValue(raw, 'ticketNumber') ||
    readObjectValue(raw, 'ticket') ||
    readObjectValue(raw, 'Ticket') ||
    readObjectValue(raw, 'activity_no') ||
    readObjectValue(raw, 'ACTIVITY_NO') ||
    readObjectValue(raw, 'Activity #') ||
    readString(source.ticket_id) ||
    readString(source.ticketId) ||
    readObjectValue(normalized, 'id') ||
    readObjectValue(raw, 'id') ||
    'Unbekannt'
  );
}

export function getAssignmentInternalTicketId(source: TicketShape): string | null {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;

  return (
    readString(source.ticket_id) ||
    readString(source.ticketId) ||
    readObjectValue(normalized, 'id') ||
    readObjectValue(raw, 'id') ||
    null
  );
}

export function getAssignmentQueueOrigin(source: TicketShape): string | null {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;

  return (
    readString(source.queueOrigin) ||
    readObjectValue(normalized, 'queue') ||
    readObjectValue(raw, 'queue_type') ||
    readObjectValue(raw, 'queue') ||
    readObjectValue(raw, 'type') ||
    null
  );
}

export function getAssignmentSystemName(source: TicketShape): string | null {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;

  return (
    readObjectValue(normalized, 'systemName') ||
    readObjectValue(raw, 'system_name') ||
    readObjectValue(raw, 'systemName') ||
    null
  );
}

export function getAssignmentTicketCategory(source: TicketShape): string | null {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;

  return (
    readString(source.ticket_type) ||
    readObjectValue(normalized, 'type') ||
    readObjectValue(raw, 'queue_type') ||
    readObjectValue(raw, 'ticket_type') ||
    readObjectValue(raw, 'subtype') ||
    null
  );
}

export function getAssignmentActivity(source: TicketShape): string | null {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;

  return (
    readObjectValue(normalized, 'activity') ||
    readObjectValue(normalized, 'customerTroubleType') ||
    readObjectValue(raw, 'activity') ||
    readObjectValue(raw, 'Activity') ||
    readObjectValue(raw, 'Activity Type') ||
    readObjectValue(raw, 'Activity Sub Type') ||
    readObjectValue(raw, 'customer_trouble_type') ||
    readObjectValue(raw, 'subtype') ||
    null
  );
}

export function getAssignmentCurrentOwner(source: TicketShape): string | null {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;

  return (
    readObjectValue(normalized, 'owner') ||
    readObjectValue(raw, 'owner') ||
    readObjectValue(raw, 'Owner') ||
    readObjectValue(raw, 'current_owner') ||
    null
  );
}

export function getAssignmentRemainingHours(source: TicketShape): number | null {
  const normalized = source.normalizedTicket || source.normalized_ticket || null;
  const raw = source.rawTicket || source.raw_ticket || null;
  const parsed = Number(
    readObjectValue(normalized, 'remainingHours') ||
    readObjectValue(raw, 'remaining_hours')
  );

  return Number.isFinite(parsed) ? parsed : null;
}

export function formatAssignmentRemainingHours(hours: number | null): string | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return `${minutes} min`;
  }

  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes <= 0) return `${wholeHours} h`;
  return `${wholeHours} h ${minutes} min`;
}