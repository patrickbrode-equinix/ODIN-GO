/* ================================================ */
/* Assignment Engine — Ticket Identity Helpers      */
/* ================================================ */

function normalizeKey(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function parseInternalTicketId(value) {
  const normalized = normalizeKey(value);
  if (!normalized || !/^\d+$/.test(normalized)) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function resolveTicketIdentity(source = {}) {
  const normalizedTicket = source.normalizedTicket || source.normalized_ticket || {};
  const rawTicket = source.rawTicket || source.raw_ticket || source.raw || {};

  const internalId = parseInternalTicketId(
    source.id
      ?? source.ticketId
      ?? source.ticket_id
      ?? normalizedTicket.id
      ?? rawTicket.id
  );

  const externalId = normalizeKey(
    source.externalId
      ?? source.external_id
      ?? normalizedTicket.externalId
      ?? rawTicket.external_id
      ?? rawTicket.externalId
  );

  const queueType = normalizeKey(
    source.queue
      ?? source.queueType
      ?? source.ticketType
      ?? source.ticket_type
      ?? normalizedTicket.queue
      ?? normalizedTicket.type
      ?? rawTicket.queue_type
      ?? rawTicket.type
  );

  return {
    internalId,
    externalId,
    queueType,
  };
}

export function decisionMatchesTicketIdentifier(decision, identifier) {
  const normalizedIdentifier = normalizeKey(identifier);
  if (!normalizedIdentifier) return false;

  const identity = resolveTicketIdentity(decision);
  if (identity.externalId && identity.externalId === normalizedIdentifier) {
    return true;
  }

  const requestedInternalId = parseInternalTicketId(normalizedIdentifier);
  return requestedInternalId !== null && identity.internalId === requestedInternalId;
}
