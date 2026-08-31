/* ================================================ */
/* Assignment Engine — Manual Exclusion List        */
/* ================================================ */

/**
 * Check if a ticket's system name is on the manual exclusion list.
 *
 * Tickets with excluded system names:
 *   - are never automatically assigned
 *   - go to dispatcher manual review
 *
 * The exclusion list is configured via UI (assignment_exclusion_list table).
 *
 * @param {object} ticket  - Normalized ticket with .systemName
 * @param {string[]} exclusionList - Array of excluded system name strings
 * @returns {{ excluded: boolean, reason: string, matchedEntry?: string }}
 */
export function checkExclusionList(ticket, exclusionList = []) {
  if (!ticket.systemName) {
    return { excluded: false, reason: 'Ticket has no system name — exclusion list not applicable' };
  }

  if (exclusionList.length === 0) {
    return { excluded: false, reason: 'Exclusion list is empty' };
  }

  const normalized = ticket.systemName.toLowerCase().trim();
  const match = exclusionList.find(entry =>
    entry.toLowerCase().trim() === normalized
  );

  if (match) {
    return {
      excluded: true,
      reason: `System name "${ticket.systemName}" is on the manual exclusion list → manual review`,
      matchedEntry: match,
    };
  }

  return { excluded: false, reason: `System name "${ticket.systemName}" is not excluded` };
}
