/** Shared helpers for identifying members of the admin-managed Colo pool. */
export function normalizeColoName(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase("de-DE")
    .replace(/,/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export function isColoEmployee(employeeName: unknown, pool: readonly unknown[]): boolean {
  const key = normalizeColoName(employeeName);
  return Boolean(key) && pool.some((entry) => normalizeColoName(entry) === key);
}

export function parseColoPool(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}
