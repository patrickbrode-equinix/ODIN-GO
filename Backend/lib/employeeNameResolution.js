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

  for (const alias of [...aliases]) for (const folded of foldNameVariants(alias)) aliases.add(folded);

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

/**
 * Spelling variants without umlauts / accents, so "Wießmann", "Wiessmann" and
 * "Wiessmann" (and "Drüssler" / "Druessler" / "Drussler") end up under one key.
 */
function foldNameVariants(value) {
  const lower = String(value || '').toLowerCase();
  const expanded = lower
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss');
  const stripped = lower
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
  const plain = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return [...new Set([plain(expanded), plain(stripped)])].filter((variant) => variant !== lower);
}

/** Like resolveEmployeeName, but returns null when the name matches nobody in the lookup. */
export function findEmployeeName(raw, lookup) {
  if (!lookup || lookup.size === 0) return null;
  for (const key of buildEmployeeAliasKeys(raw)) {
    const resolved = lookup.get(key);
    if (resolved) return resolved;
  }
  return null;
}

/**
 * Maps a stored absence (vacation wish ...) to the spelling used in the plan. Tries the stored
 * name first, then every name the linked user account is known by (provisioned name,
 * "First Last", "Last, First"), so a differently spelled absence is not silently lost.
 * Returns null when nothing matches.
 */
export function resolveAbsenceEmployeeName(absence, lookup, userNameCandidatesById = new Map()) {
  const direct = findEmployeeName(absence?.employee_name, lookup);
  if (direct) return direct;
  const candidates = userNameCandidatesById.get(Number(absence?.employee_id)) || [];
  for (const candidate of candidates) {
    const resolved = findEmployeeName(candidate, lookup);
    if (resolved) return resolved;
  }
  return null;
}
