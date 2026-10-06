/* ================================================ */
/* Employee name normalisation / alias resolution   */
/* (shared by generator and understaffing           */
/* suggestions)                                     */
/* ================================================ */

/**
 * Normalize an employee name: trim, collapse whitespace.
 * Filters out entries that look like email addresses.
 */
export function normalizeEmployeeName(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) return null;
  return trimmed;
}

export function buildEmployeeAliasKeys(raw) {
  const normalized = normalizeEmployeeName(raw);
  if (!normalized) return [];

  const aliases = new Set([normalized.toLowerCase()]);
  let firstName = '';
  let lastName = '';

  if (normalized.includes(',')) {
    const parts = normalized.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      lastName = parts[0];
      firstName = parts.slice(1).join(' ');
    }
  } else {
    const parts = normalized.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      firstName = parts.slice(0, -1).join(' ');
      lastName = parts[parts.length - 1];
    }
  }

  if (firstName && lastName) {
    const firstToken = firstName.split(/\s+/).filter(Boolean)[0] || firstName;
    const variants = [
      `${firstName} ${lastName}`,
      `${lastName}, ${firstName}`,
      `${lastName} ${firstName}`,
      `${firstToken} ${lastName}`,
      `${lastName}, ${firstToken}`,
      `${lastName} ${firstToken}`,
    ];

    for (const variant of variants) aliases.add(variant.toLowerCase());
  }

  return [...aliases];
}

export function buildEmployeeNameLookup(employeeNames) {
  const lookup = new Map();

  for (const employeeName of employeeNames) {
    for (const key of buildEmployeeAliasKeys(employeeName)) {
      if (!lookup.has(key)) lookup.set(key, employeeName);
    }
  }

  return lookup;
}

export function resolveEmployeeName(raw, lookup) {
  if (!lookup || lookup.size === 0) return normalizeEmployeeName(raw);

  for (const key of buildEmployeeAliasKeys(raw)) {
    const resolved = lookup.get(key);
    if (resolved) return resolved;
  }

  return normalizeEmployeeName(raw);
}
