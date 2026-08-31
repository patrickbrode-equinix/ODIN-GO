/* ------------------------------------------------ */
/* HANDOVER – UTILS (PURE + ROBUST)                 */
/* ------------------------------------------------ */

/* ------------------------------------------------ */
/* DATE FORMATTERS (CACHED)                         */
/* ------------------------------------------------ */

const dateFormatter = new Intl.DateTimeFormat("de-DE");
const timeFormatter = new Intl.DateTimeFormat("de-DE", {
  hour: "2-digit",
  minute: "2-digit",
});

/* ------------------------------------------------ */
/* DATE HELPERS                                     */
/* ------------------------------------------------ */

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

export function formatCommitDate(commitAt?: string | null): string {
  if (!commitAt) return "-";

  const d = parseDate(commitAt);
  if (d) return dateFormatter.format(d);

  // Fallback: original value anzeigen
  return String(commitAt);
}

export function formatCommitTime(commitAt?: string | null): string {
  if (!commitAt) return "-";

  const d = parseDate(commitAt);
  if (d) return timeFormatter.format(d);

  // Fallback: keine Zeit ableitbar
  return "";
}

/* ------------------------------------------------ */
/* USER DISPLAY HELPERS (ZENTRAL)                   */
/* ------------------------------------------------ */
/*
  Aktuell kommt hier meist eine E-Mail rein.
  Später problemlos erweiterbar auf:
  - User-Objekte
  - Shiftplan
  - Dispatcher Console
*/

type UserLike =
  | string
  | {
      displayName?: string;
      name?: string;
      email?: string;
    }
  | null
  | undefined;

export function formatUserDisplay(value?: UserLike): string {
  if (!value) return "Unbekannt";

  // Objekt (future-proof)
  if (typeof value === "object") {
    return (
      value.displayName ||
      value.name ||
      value.email ||
      "Unbekannt"
    );
  }

  // String
  if (typeof value === "string") {
    if (!value.includes("@")) return value;

    // E-Mail → lokaler Teil
    const namePart = value.split("@")[0];
    return namePart || value;
  }

  return "Unbekannt";
}

/* ------------------------------------------------ */
/* PRIORITY HELPERS                                 */
/* ------------------------------------------------ */

export type Priority = "Critical" | "High" | "Medium" | "Low";

export function getPriorityColor(priority: Priority | string): string {
  switch (priority) {
    case "Critical":
      return "bg-red-600";
    case "High":
      return "bg-orange-500";
    case "Medium":
      return "bg-yellow-400 text-black";
    case "Low":
      return "bg-green-600";
    default:
      return "bg-gray-400";
  }
}

export function getPriorityIcon(priority: Priority | string): string {
  switch (priority) {
    case "Critical":
      return "🔥";
    case "High":
      return "⚠️";
    case "Medium":
      return "🟡";
    case "Low":
      return "🟢";
    default:
      return "";
  }
}
