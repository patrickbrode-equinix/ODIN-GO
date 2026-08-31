import { findBestMatch, normalizeName } from '../../lib/nameNorm.js';

export function normalizeOwnerKey(value) {
  return normalizeName(value).replace(/\s+/g, '').replace(/[0-9]+$/g, '');
}

function buildDerivedNameOwnerKeys(value) {
  const tokens = normalizeName(value).split(' ').filter(Boolean);
  if (tokens.length === 0) return [];

  const keys = new Set();
  const first = tokens[0];
  const second = tokens[1] || null;
  const last = tokens[tokens.length - 1];

  keys.add(tokens.join(''));
  keys.add([...tokens].reverse().join(''));

  if (first && last && first !== last) {
    keys.add(`${first}${last}`);
    keys.add(`${last}${first}`);
    keys.add(`${first.charAt(0)}${last}`);
    keys.add(`${last.charAt(0)}${first}`);
    keys.add(`${first}${last.charAt(0)}`);
    keys.add(`${last}${first.charAt(0)}`);
  }

  if (first && second) {
    keys.add(`${second.charAt(0)}${first}`);
    keys.add(`${first.charAt(0)}${second}`);
  }

  return [...keys].filter(Boolean);
}

export function buildWorkerOwnerKeys(worker = {}) {
  const keys = new Set();
  const rawValues = [
    worker.name,
    worker.plannedEmployeeName,
    worker.email,
    worker.jarvisDisplayName,
    worker.jarvisOwnerCode,
    worker.jarvisInitials,
  ];

  for (const value of rawValues) {
    const normalized = normalizeOwnerKey(value);
    if (normalized) keys.add(normalized);

    for (const derived of buildDerivedNameOwnerKeys(value)) {
      keys.add(derived);
    }
  }

  return [...keys];
}

export function readTicketOwnerCandidates(ticket) {
  return [
    ticket?.raw?.owner,
    ticket?.raw?.Owner,
    ticket?.raw?.current_owner,
    ticket?.raw?.currentOwner,
    ticket?.raw?.assigned_to,
    ticket?.raw?.assignedTo,
    ticket?.owner,
    ticket?.currentOwner,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function shouldUseFuzzyMatch(ownerValue) {
  const normalized = String(ownerValue || '').trim();
  if (!normalized) return false;
  if (/^[A-Z0-9]{2,10}$/i.test(normalized) && !/\s/.test(normalized)) {
    return false;
  }
  return true;
}

export function resolveOwnerAgainstWorkers(ticketOrOwnerCandidates, workers = [], { activeOnly = false } = {}) {
  const ownerCandidates = Array.isArray(ticketOrOwnerCandidates)
    ? ticketOrOwnerCandidates
    : readTicketOwnerCandidates(ticketOrOwnerCandidates);

  if (ownerCandidates.length === 0 || workers.length === 0) return null;

  const candidateWorkers = activeOnly
    ? workers.filter((worker) => worker.shiftActive !== false)
    : workers;

  if (candidateWorkers.length === 0) return null;

  const workerByKey = new Map();
  const workerAliases = [];
  const workerNames = candidateWorkers.map((worker) => worker.name).filter(Boolean);

  for (const worker of candidateWorkers) {
    for (const key of buildWorkerOwnerKeys(worker)) {
      if (!workerByKey.has(key)) {
        workerByKey.set(key, worker);
        workerAliases.push(key);
      }
    }
  }

  for (const ownerValue of ownerCandidates) {
    const ownerKey = normalizeOwnerKey(ownerValue);
    if (!ownerKey) continue;

    const direct = workerByKey.get(ownerKey);
    if (direct) return direct;

    const alias = shouldUseFuzzyMatch(ownerValue)
      ? findBestMatch(ownerKey, workerAliases, 0.84)?.name
      : null;
    if (alias && workerByKey.has(alias)) return workerByKey.get(alias);

    const fuzzy = shouldUseFuzzyMatch(ownerValue)
      ? findBestMatch(ownerValue, workerNames, 0.76)?.name
      : null;
    if (fuzzy) {
      const matchedWorker = candidateWorkers.find((worker) => worker.name === fuzzy);
      if (matchedWorker) return matchedWorker;
    }
  }

  return null;
}

export function resolveActiveExistingOwner(ticket, workers = []) {
  return resolveOwnerAgainstWorkers(ticket, workers, { activeOnly: true });
}