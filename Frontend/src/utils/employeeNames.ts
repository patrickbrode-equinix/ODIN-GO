type UserLike = Record<string, unknown> | null | undefined;

function compactSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmployeeName(value: unknown): string | null {
  const raw = compactSpaces(String(value || ""));
  if (!raw) return null;
  return raw;
}

export function toEmployeeDedupeKey(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toLegacyDisplayKey(value: unknown): string | null {
  const normalized = normalizeEmployeeName(value);
  if (!normalized) return null;
  return normalized
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUpn(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

export function normalizeEmployeeIdentity(employee: UserLike): {
  employeeKey: string | null;
  displayName: string | null;
  employeeId: string | null;
  entraObjectId: string | null;
  upn: string | null;
} {
  if (!employee || typeof employee !== "object") {
    const displayName = normalizeEmployeeName(employee);
    const fallback = toLegacyDisplayKey(displayName);
    return {
      employeeKey: fallback ? `legacy-name:${fallback}` : null,
      displayName,
      employeeId: null,
      entraObjectId: null,
      upn: null,
    };
  }

  const employeeId = String(employee["employeeId"] ?? employee["employee_id"] ?? "").trim() || null;
  const entraObjectId = String(
    employee["entraObjectId"]
    ?? employee["entra_object_id"]
    ?? employee["azureAdId"]
    ?? employee["azure_ad_user_id"]
    ?? employee["aadObjectId"]
    ?? ""
  ).trim() || null;
  const upn = normalizeUpn(
    employee["upn"]
    ?? employee["userPrincipalName"]
    ?? employee["email"]
    ?? employee["mail"]
    ?? employee["teamsEmail"]
  );
  const displayName = normalizeEmployeeName(
    employee["displayName"]
    ?? employee["display_name"]
    ?? employee["employeeName"]
    ?? employee["employee_name"]
    ?? employee["name"]
  );
  const fallback = toLegacyDisplayKey(displayName);
  const employeeKey = entraObjectId
    ? `entra:${entraObjectId.toLowerCase()}`
    : employeeId
      ? `employee:${employeeId.toLowerCase()}`
      : upn
        ? `upn:${upn}`
        : fallback
          ? `legacy-name:${fallback}`
          : null;

  return { employeeKey, displayName, employeeId, entraObjectId, upn };
}

export function getEmployeeKey(employee: UserLike): string | null {
  return normalizeEmployeeIdentity(employee).employeeKey;
}

function chooseCanonicalEmployeeName(names: string[]): string | null {
  const candidates = names
    .map((name) => normalizeEmployeeName(name))
    .filter((entry): entry is string => Boolean(entry));

  if (!candidates.length) return null;

  candidates.sort((left, right) => (
    right.length - left.length
    || left.localeCompare(right, "de")
  ));

  return candidates[0];
}

export function areEquivalentEmployeeNames(left: unknown, right: unknown): boolean {
  const leftKey = toLegacyDisplayKey(left);
  const rightKey = toLegacyDisplayKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function dedupeEmployeesByIdentity<T extends UserLike>(employees: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const employee of employees) {
    const key = getEmployeeKey(employee);
    if (!key || byKey.has(key)) continue;
    byKey.set(key, employee);
  }
  return Array.from(byKey.values());
}

function buildNameFromUser(user: Record<string, unknown>): string | null {
  const displayName = normalizeEmployeeName(user["display_name"]);
  if (displayName) return displayName;

  const displayNameAlt = normalizeEmployeeName(user["displayName"]);
  if (displayNameAlt) return displayNameAlt;

  const firstName = normalizeEmployeeName(user["first_name"] || user["firstName"]);
  const lastName = normalizeEmployeeName(user["last_name"] || user["lastName"]);
  const fullName = normalizeEmployeeName(`${firstName || ""} ${lastName || ""}`);
  if (fullName) return fullName;

  const username = normalizeEmployeeName(user["username"]);
  if (username) return username;

  return normalizeEmployeeName(user["email"]);
}

export function extractEmployeeNameFromUser(user: UserLike): string | null {
  if (!user || typeof user !== "object") return null;
  return buildNameFromUser(user);
}

export function dedupeEmployeeNames(names: Array<unknown>): string[] {
  const groups = new Map<string, string[]>();

  for (const name of names) {
    const normalized = normalizeEmployeeName(name);
    const key = toLegacyDisplayKey(normalized);
    if (!normalized || !key) continue;
    const group = groups.get(key) || [];
    group.push(normalized);
    groups.set(key, group);
  }

  return Array.from(groups.values())
    .map((group) => chooseCanonicalEmployeeName(group) || group[0])
    .sort((left, right) => left.localeCompare(right, "de"));
}
