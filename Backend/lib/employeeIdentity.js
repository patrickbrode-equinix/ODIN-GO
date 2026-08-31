import { normalizeName } from "./nameNorm.js";

function normalizeAsciiToken(value) {
  return normalizeName(value).replace(/[^a-z0-9]/g, "");
}

function normalizeStableId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export function normalizeUpn(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || null;
}

export function normalizeDisplayName(value) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized || null;
}

function normalizeLegacyDisplayKey(value) {
  const displayName = normalizeDisplayName(value);
  if (!displayName) return null;
  return normalizeName(displayName).replace(/\s+/g, " ");
}

export function buildEmployeeIdentityKey(identity = {}) {
  const entraObjectId = normalizeStableId(
    identity.entraObjectId
    ?? identity.entra_object_id
    ?? identity.azureAdId
    ?? identity.azure_ad_user_id
    ?? identity.aadObjectId
  );
  if (entraObjectId) return `entra:${entraObjectId.toLowerCase()}`;

  const employeeId = normalizeStableId(identity.employeeId ?? identity.employee_id);
  if (employeeId) return `employee:${employeeId.toLowerCase()}`;

  const upn = normalizeUpn(
    identity.upn
    ?? identity.userPrincipalName
    ?? identity.email
    ?? identity.mail
    ?? identity.teamsEmail
  );
  if (upn) return `upn:${upn}`;

  const fallbackDisplayName = normalizeLegacyDisplayKey(
    identity.displayName
    ?? identity.display_name
    ?? identity.employeeName
    ?? identity.employee_name
    ?? identity.name
  );
  return fallbackDisplayName ? `legacy-name:${fallbackDisplayName}` : null;
}

export function normalizeEmployeeIdentity(employee = {}) {
  const employeeName = employee.employeeName ?? employee.employee_name ?? employee.name;
  const emailFromName = isEmailLike(employeeName) ? employeeName : null;
  const displayName = normalizeDisplayName(
    employee.displayName
    ?? employee.display_name
    ?? employee.fullName
    ?? employee.full_name
    ?? employeeName
  );
  const identity = {
    entraObjectId: normalizeStableId(
      employee.entraObjectId
      ?? employee.entra_object_id
      ?? employee.azureAdId
      ?? employee.azure_ad_user_id
      ?? employee.aadObjectId
    ),
    employeeId: normalizeStableId(employee.employeeId ?? employee.employee_id),
    upn: normalizeUpn(
      employee.upn
      ?? employee.userPrincipalName
      ?? employee.email
      ?? employee.mail
      ?? employee.teamsEmail
      ?? emailFromName
    ),
    displayName,
    firstName: normalizeDisplayName(employee.firstName ?? employee.first_name),
    lastName: normalizeDisplayName(employee.lastName ?? employee.last_name),
    active: employee.active ?? employee.is_active ?? true,
  };
  return {
    ...identity,
    employeeKey: buildEmployeeIdentityKey(identity),
  };
}

export function mergeEmployeeIdentities(left = {}, right = {}) {
  const leftIdentity = normalizeEmployeeIdentity(left);
  const rightIdentity = normalizeEmployeeIdentity(right);
  const displayCandidates = [
    leftIdentity.displayName,
    rightIdentity.displayName,
    left.displayName,
    right.displayName,
    left.employeeName,
    right.employeeName,
  ].map(normalizeDisplayName).filter(Boolean);
  displayCandidates.sort((a, b) => b.length - a.length || a.localeCompare(b, "de"));

  const merged = {
    entraObjectId: leftIdentity.entraObjectId || rightIdentity.entraObjectId || null,
    employeeId: leftIdentity.employeeId || rightIdentity.employeeId || null,
    upn: leftIdentity.upn || rightIdentity.upn || null,
    displayName: displayCandidates[0] || null,
    firstName: leftIdentity.firstName || rightIdentity.firstName || null,
    lastName: leftIdentity.lastName || rightIdentity.lastName || null,
    active: leftIdentity.active !== false || rightIdentity.active !== false,
  };

  return {
    ...merged,
    employeeKey: buildEmployeeIdentityKey(merged),
  };
}

export function dedupeEmployeeIdentities(employees = []) {
  const byKey = new Map();
  for (const employee of Array.isArray(employees) ? employees : []) {
    const identity = normalizeEmployeeIdentity(employee);
    if (!identity.employeeKey) continue;
    const current = byKey.get(identity.employeeKey);
    byKey.set(identity.employeeKey, current ? mergeEmployeeIdentities(current, identity) : identity);
  }
  return Array.from(byKey.values());
}

function toDisplayToken(value) {
  const normalized = normalizeAsciiToken(value);
  if (!normalized) return "";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function splitEmailLocalPart(localPart) {
  const base = String(localPart || "").trim().split("+")[0];
  if (!base) return null;

  const parts = base
    .replace(/[_-]+/g, ".")
    .split(".")
    .flatMap((segment) => String(segment || "")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .split(/\s+/)
      .filter(Boolean)
    )
    .map(toDisplayToken)
    .filter(Boolean);

  if (parts.length < 2) return null;

  const firstName = parts.slice(0, -1).join(" ");
  const lastName = parts[parts.length - 1];
  const firstToken = parts[0] || "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (!firstToken || !lastName || !displayName) return null;

  return {
    firstName,
    firstToken,
    lastName,
    displayName,
  };
}

export function isEmailLike(value) {
  return /^[^@\s]+@[^@\s]+(?:\.[^@\s]+)+$/.test(String(value || "").trim());
}

function splitInternalLoginName(value) {
  const match = String(value || "").trim().match(/^([^@\s]+)@([^@\s.]+)$/);
  if (!match) return null;

  const firstParts = match[1]
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map(toDisplayToken)
    .filter(Boolean);
  const lastParts = match[2]
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .map(toDisplayToken)
    .filter(Boolean);

  const firstName = firstParts.join(" ");
  const lastName = lastParts.join(" ");
  const firstToken = firstParts[0] || "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (!firstToken || !lastName || !displayName) return null;

  return {
    originalName: value,
    firstName,
    firstToken,
    lastName,
    displayName,
  };
}

export function splitEmployeeName(name) {
  if (!name || typeof name !== "string") return null;

  let cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;

  const internalLoginName = splitInternalLoginName(cleaned);
  if (internalLoginName) return internalLoginName;

  if (isEmailLike(cleaned)) {
    const [localPart] = cleaned.split("@");
    const fromEmail = splitEmailLocalPart(localPart);
    if (!fromEmail) return null;

    return {
      originalName: cleaned,
      firstName: fromEmail.firstName,
      firstToken: fromEmail.firstToken,
      lastName: fromEmail.lastName,
      displayName: fromEmail.displayName,
    };
  }

  let firstName = "";
  let lastName = "";

  if (cleaned.includes(",")) {
    const parts = cleaned.split(",").map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    lastName = parts[0];
    firstName = parts.slice(1).join(" ");
  } else {
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length < 2) return null;
    firstName = parts.slice(0, -1).join(" ");
    lastName = parts[parts.length - 1];
  }

  const firstToken = firstName.split(/\s+/).filter(Boolean)[0] || "";
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim();

  if (!firstToken || !lastName || !displayName) return null;

  return {
    originalName: cleaned,
    firstName,
    firstToken,
    lastName,
    displayName,
  };
}

export function buildNameKeyFromParts(firstName, lastName) {
  const normalizedFirst = normalizeName(firstName || "").split(/\s+/).filter(Boolean).join(" ");
  const normalizedLast = normalizeName(lastName || "");
  if (!normalizedFirst || !normalizedLast) return null;
  return `${normalizedFirst}|${normalizedLast}`;
}

export function buildShortNameKeyFromParts(firstName, lastName) {
  const firstToken = String(firstName || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  return buildNameKeyFromParts(firstToken, lastName);
}

export function areEquivalentEmployeeNames(leftName, rightName) {
  const leftKey = normalizeLegacyDisplayKey(leftName);
  const rightKey = normalizeLegacyDisplayKey(rightName);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function chooseCanonicalEmployeeName(names = []) {
  const candidates = names
    .map((name) => {
      const displayName = normalizeDisplayName(name);
      if (!displayName) return null;
      return {
        name: displayName,
        length: displayName.length,
      };
    })
    .filter(Boolean);

  if (candidates.length === 0) return null;

  candidates.sort((left, right) => (
    right.length - left.length
    || left.name.localeCompare(right.name, "de")
  ));

  return candidates[0].name;
}

export function buildUsernameBase(firstName, lastName) {
  const firstToken = String(firstName || "").trim().split(/\s+/).filter(Boolean)[0] || "";
  const firstInitial = normalizeAsciiToken(firstToken).charAt(0);
  const normalizedLast = normalizeAsciiToken(lastName);
  if (!firstInitial || !normalizedLast) return null;
  return `${firstInitial}${normalizedLast}`;
}

export function generateEmailFromName(name, domain = "eu.equinix.com") {
  const parts = splitEmployeeName(name);
  if (!parts) return null;

  const normalizedFirst = normalizeAsciiToken(parts.firstToken);
  const normalizedLast = normalizeAsciiToken(parts.lastName);
  if (!normalizedFirst || !normalizedLast) return null;

  return `${normalizedFirst}.${normalizedLast}@${domain}`;
}
