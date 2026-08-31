/* ------------------------------------------------ */
/* SHIFTPLAN EXCEL IMPORTER – DUAL LAYOUT (A + B)   */
/* Layout A: Classic (Month in A1, days row 3)      */
/* Layout B: New (Insert here ↓ in B1, days in C1+) */
/* Monatslogik: SheetName → Primär, Header → Backup */
/* Jahreswechsel: Dezember → Januar sicher erkannt  */
/* ------------------------------------------------ */

import * as XLSX from "xlsx";

/* ------------------------------------------------ */
/* BEKANNTE SCHICHTCODES                           */
/* ------------------------------------------------ */

export const KNOWN_SHIFT_CODES: string[] = [
  "E1","E2","E1SA","E1WE","L1","L2","L1WE","L3","N","FS","ABW",
  "U","UR","URB","K","S","DBS","NA",
  "HE1","HE2","HL1","HL2",
];

/* Codes die technisch importiert werden, aber fachlich noch abgestimmt werden müssen */
export const PENDING_REVIEW_CODES: string[] = ["L3"];

/* Alias-Map: Varianten → kanonischer Code */
const SHIFT_ALIASES: Record<string, string> = {
  NACHT: "N",
  FREI: "FS",
  "N/A": "FS",
  NA: "FS",
  OFF: "FS",
};

/* ------------------------------------------------ */
/* MONATSNAMEN (DE + EN + Tippfehler)               */
/* ------------------------------------------------ */

const MONTHS_DE_EN: Record<string, number> = {
  januar: 1, jan: 1,
  februar: 2, feb: 2, feburary: 2,
  märz: 3, "mär": 3, maerz: 3, mrz: 3, mar: 3,
  april: 4, apr: 4,
  mai: 5,
  juni: 6, jun: 6,
  juli: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  oktober: 10, okt: 10,
  november: 11, nov: 11,
  dezember: 12, dez: 12,
  january: 1,
  february: 2,
  march: 3,
  may: 5,
  june: 6,
  july: 7,
  october: 10, oct: 10,
  december: 12, dec: 12,
};

const MONTH_NAMES_DE: Record<number, string> = {
  1: "Januar", 2: "Februar", 3: "März", 4: "April",
  5: "Mai", 6: "Juni", 7: "Juli", 8: "August",
  9: "September", 10: "Oktober", 11: "November", 12: "Dezember",
};

/* ------------------------------------------------ */
/* LOG / RESULT TYPES                               */
/* ------------------------------------------------ */

export interface ImportLogEntry {
  level: "info" | "warn" | "error";
  sheet?: string;
  message: string;
}

export interface ParsedEmployee {
  name: string;
  shifts: Record<number, string>;
}

export interface ParsedSheetMeta {
  id: string;
  label: string;
  year: number;
  month: number;
  daysInMonth: number;
  layout: "A" | "B";
}

export interface ParsedSheet {
  meta: ParsedSheetMeta;
  employees: ParsedEmployee[];
}

export interface ParseResult {
  sheets: Record<string, ParsedSheet>;
  ignoredSheets: string[];
  unknownCodes: string[];
  log: ImportLogEntry[];
  /** Legacy compat: same data as sheets */
  data: Record<string, ParsedSheet>;
  /** Legacy compat: same data as ignoredSheets with reasons */
  skippedSheets: { sheet: string; reason: string }[];
}

/* ------------------------------------------------ */
/* HELFER                                            */
/* ------------------------------------------------ */

function normalizeShiftCode(val: any, unknownSet: Set<string>, log: ImportLogEntry[], sheetName: string): string {
  if (val === null || val === undefined) return "";
  const raw = String(val).replace(/\s+/g, " ").trim();
  if (!raw) return "";
  const v = raw.toUpperCase();
  const leadToken = v.match(/^[A-Z0-9/]+/)?.[0] || "";

  // Alias-Auflösung
  if (SHIFT_ALIASES[v]) return SHIFT_ALIASES[v];
  if (leadToken && SHIFT_ALIASES[leadToken]) return SHIFT_ALIASES[leadToken];

  // ABW-Varianten (ABW, ABW-Krank, etc.)
  if (v.startsWith("ABW")) return "ABW";

  // Bekannter Code → direkt zurückgeben
  if (KNOWN_SHIFT_CODES.includes(v)) return v;
  if (leadToken && KNOWN_SHIFT_CODES.includes(leadToken)) return leadToken;

  // Unbekannter Code → loggen, aber als Rohwert importieren
  if (!unknownSet.has(v)) {
    unknownSet.add(v);
    log.push({ level: "warn", sheet: sheetName, message: `Unbekannter Schichtcode: "${v}" – wird als Rohwert importiert` });
  }
  return v;
}

function looksLikeName(val: any): boolean {
  if (typeof val !== "string") return false;
  const s = val.replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.length < 3) return false;
  if (/[0-9]/.test(s)) return false;
  if (KNOWN_SHIFT_CODES.includes(s.toUpperCase())) return false;
  if (s.toUpperCase() === "INSERT HERE ↓" || s.toUpperCase().startsWith("INSERT HERE")) return false;
  if (/^(mitarbeiter|employee|name|dienstplan|schichtplan|ibx ops|team|summe|gesamt|legende|notiz|hinweis)\b/i.test(s)) return false;
  if (!/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(s)) return false;
  if (s.includes(",") || s.includes(" ")) return true;
  return s.length >= 5;
}

function cleanEmployeeDisplayName(value: unknown): string {
  return String(value || "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s*@\s*/g, "@")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameToken(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEmployeeName(value: string): { lastName: string; givenNames: string[] } | null {
  const displayName = cleanEmployeeDisplayName(value);
  if (!displayName) return null;

  let lastName = "";
  let givenPart = "";
  if (displayName.includes(",")) {
    const [last, ...given] = displayName.split(",");
    lastName = last;
    givenPart = given.join(" ");
  } else if (/^[^@\s]+@[^@\s]+$/.test(displayName)) {
    const [given, last] = displayName.split("@");
    lastName = last;
    givenPart = given;
  } else {
    const parts = displayName.split(" ").filter(Boolean);
    if (parts.length < 2) return null;
    lastName = parts.pop() || "";
    givenPart = parts.join(" ");
  }

  const normalizedLastName = normalizeNameToken(lastName);
  const givenNames = normalizeNameToken(givenPart).split(" ").filter(Boolean);
  return normalizedLastName && givenNames.length > 0
    ? { lastName: normalizedLastName, givenNames: [...new Set(givenNames)] }
    : null;
}

function isTokenSubset(subset: string[], superset: string[]): boolean {
  const target = new Set(superset);
  return subset.every((token) => target.has(token));
}

function reconcileEmployeeNames(sheets: Record<string, ParsedSheet>, log: ImportLogEntry[]): void {
  const distinctNames = [...new Set(Object.values(sheets).flatMap((sheet) => sheet.employees.map((employee) => employee.name)))];
  const namesBySheet = Object.values(sheets).map((sheet) => new Set(sheet.employees.map((employee) => employee.name)));
  const parsedNames = distinctNames
    .map((name) => ({ name, parsed: parseEmployeeName(name) }))
    .filter((entry): entry is { name: string; parsed: { lastName: string; givenNames: string[] } } => Boolean(entry.parsed));
  const canonicalByName = new Map<string, string>();

  const exactIdentityGroups = new Map<string, typeof parsedNames>();
  for (const entry of parsedNames) {
    const identityKey = `${entry.parsed.lastName}|${[...entry.parsed.givenNames].sort().join("|")}`;
    const group = exactIdentityGroups.get(identityKey) || [];
    group.push(entry);
    exactIdentityGroups.set(identityKey, group);
  }
  for (const group of exactIdentityGroups.values()) {
    if (group.length < 2) continue;
    const canonical = [...group].sort((left, right) => {
      const leftFormatScore = (left.name.includes(",") ? 2 : 0) + (!left.name.includes("@") ? 1 : 0);
      const rightFormatScore = (right.name.includes(",") ? 2 : 0) + (!right.name.includes("@") ? 1 : 0);
      return rightFormatScore - leftFormatScore || right.name.length - left.name.length || left.name.localeCompare(right.name, "de");
    })[0].name;
    for (const entry of group) canonicalByName.set(entry.name, canonical);
  }

  for (const entry of parsedNames) {
    const candidates = parsedNames.filter((candidate) => (
      candidate.parsed.lastName === entry.parsed.lastName
      && candidate.parsed.givenNames.length > entry.parsed.givenNames.length
      && isTokenSubset(entry.parsed.givenNames, candidate.parsed.givenNames)
      && !namesBySheet.some((sheetNames) => sheetNames.has(entry.name) && sheetNames.has(candidate.name))
    ));
    const longestTokenCount = Math.max(0, ...candidates.map((candidate) => candidate.parsed.givenNames.length));
    const longestCanonicalNames = [...new Set(
      candidates
        .filter((candidate) => candidate.parsed.givenNames.length === longestTokenCount)
        .map((candidate) => canonicalByName.get(candidate.name) || candidate.name)
    )];
    if (longestCanonicalNames.length === 1) {
      canonicalByName.set(entry.name, longestCanonicalNames[0]);
    }
  }

  for (const sheet of Object.values(sheets)) {
    const merged = new Map<string, ParsedEmployee>();
    for (const employee of sheet.employees) {
      const canonicalName = cleanEmployeeDisplayName(canonicalByName.get(employee.name) || employee.name);
      if (canonicalName !== employee.name) {
        log.push({ level: "info", sheet: sheet.meta.label, message: `Mehrfachname vereinheitlicht: "${employee.name}" -> "${canonicalName}"` });
      }
      const existing = merged.get(canonicalName);
      if (existing) existing.shifts = { ...existing.shifts, ...employee.shifts };
      else merged.set(canonicalName, { ...employee, name: canonicalName, shifts: { ...employee.shifts } });
    }
    sheet.employees = [...merged.values()];
  }
}

function harmonizeEmployeeRoster(sheets: Record<string, ParsedSheet>, log: ImportLogEntry[]): void {
  const roster = [...new Set(
    Object.values(sheets).flatMap((sheet) => sheet.employees.map((employee) => employee.name))
  )].sort((left, right) => left.localeCompare(right, "de"));

  if (roster.length === 0 || Object.keys(sheets).length < 2) return;

  for (const sheet of Object.values(sheets)) {
    const employeesByName = new Map(sheet.employees.map((employee) => [employee.name, employee]));
    const missingNames = roster.filter((name) => !employeesByName.has(name));
    for (const name of missingNames) {
      employeesByName.set(name, { name, shifts: {} });
      log.push({
        level: "warn",
        sheet: sheet.meta.label,
        message: `Mitarbeiter "${name}" fehlt im Monatsblatt und wurde mit leerem Dienstplan ergänzt`,
      });
    }
    sheet.employees = roster.map((name) => employeesByName.get(name)!);
  }
}

function parseDayNumber(val: any): number | null {
  if (val === null || val === undefined) return null;

  if (val instanceof Date && !Number.isNaN(val.getTime())) return val.getDate();

  if (typeof val === "number") {
    return Number.isFinite(val) && val >= 1 && val <= 31 ? Math.floor(val) : null;
  }

  if (typeof val === "string") {
    const normalized = val.replace(/\s+/g, " ").trim();
    if (!normalized) return null;

    const fullDateMatch = normalized.match(/(?:^|\D)([0-3]?\d)[.\/-]([01]?\d)[.\/-](?:20)?\d{2}(?:\D|$)/);
    if (fullDateMatch) {
      const day = Number(fullDateMatch[1]);
      return day >= 1 && day <= 31 ? day : null;
    }

    const matches = normalized.match(/\b([1-9]|[12][0-9]|3[01])\b/g);
    if (!matches || matches.length === 0) return null;

    const n = Number(matches[matches.length - 1]);
    return Number.isFinite(n) && n >= 1 && n <= 31 ? n : null;
  }

  return null;
}

function parseExcelSerialDate(cell: number): { day: number; month: number; year: number } | null {
  const parsed = XLSX.SSF.parse_date_code(cell);
  if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;

  return {
    day: parsed.d,
    month: parsed.m,
    year: parsed.y,
  };
}

function parseHeaderDay(value: any, month: number, year: number): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.getMonth() + 1 === month && value.getFullYear() === year ? value.getDate() : null;
  }
  if (typeof value === "number" && value > 40000 && value < 80000) {
    const parsed = parseExcelSerialDate(value);
    return parsed && parsed.month === month && parsed.year === year ? parsed.day : null;
  }
  return parseDayNumber(value);
}

/* ------------------------------------------------ */
/* LAYOUT-ERKENNUNG                                 */
/* ------------------------------------------------ */

function detectLayout(rows: any[][]): "A" | "B" {
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    for (let c = 0; c < Math.min(8, rows[r]?.length || 0); c++) {
      const marker = rows[r]?.[c];
      if (typeof marker === "string" && marker.toLowerCase().includes("insert here")) return "B";
    }
  }
  return "A";
}

/* ------------------------------------------------ */
/* MONAT/JAHR PARSING                               */
/* ------------------------------------------------ */

function parseMonthFromText(text: string): { month: number | null; year: number | null } {
  const lower = text.toLowerCase().trim();
  let month: number | null = null;
  let year: number | null = null;

  // Sort keys by length descending so longer matches take priority
  const sortedKeys = Object.keys(MONTHS_DE_EN).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      month = MONTHS_DE_EN[key];
      break;
    }
  }

  const yearMatch = lower.match(/20[0-9]{2}/);
  if (yearMatch) year = Number(yearMatch[0]);

  const monthYearMatch = lower.match(/(?:^|\D)(0?[1-9]|1[0-2])[.\/_-](20\d{2}|\d{2})(?:\D|$)/);
  const yearMonthMatch = lower.match(/(?:^|\D)(20\d{2}|\d{2})[.\/_-](0?[1-9]|1[0-2])(?:\D|$)/);
  if (!month && monthYearMatch) month = Number(monthYearMatch[1]);
  if (!month && yearMonthMatch) month = Number(yearMonthMatch[2]);
  if (!year && monthYearMatch) year = Number(monthYearMatch[2].length === 2 ? `20${monthYearMatch[2]}` : monthYearMatch[2]);
  if (!year && yearMonthMatch) year = Number(yearMonthMatch[1].length === 2 ? `20${yearMonthMatch[1]}` : yearMonthMatch[1]);

  if (!year) {
    const shortYears = [...lower.matchAll(/(?:^|\D)(\d{2})(?=\D|$)/g)]
      .map((match) => Number(match[1]))
      .filter((value) => value >= 20 && value <= 99);
    if (shortYears.length > 0) year = 2000 + shortYears[shortYears.length - 1];
  }

  return { month, year };
}

function parseYearFromFileName(fileName: string): number | null {
  const stem = String(fileName || "").replace(/\.[^.]+$/, "");
  const matches = [...stem.matchAll(/(?:^|\D)(20\d{2}|\d{2})(?=\D|$)/g)];
  const raw = matches.at(-1)?.[1];
  if (!raw) return null;
  const year = Number(raw.length === 2 ? `20${raw}` : raw);
  return year >= 2000 && year <= 2099 ? year : null;
}

/* ------------------------------------------------ */
/* LAYOUT A PARSER                                  */
/* ------------------------------------------------ */

function parseLayoutA(
  rows: any[][],
  sheetName: string,
  month: number,
  year: number,
  unknownCodes: Set<string>,
  log: ImportLogEntry[]
): ParsedSheet | null {
  // Kopfzeile mit Tageszahlen finden (scanne erste 20 Zeilen)
  let dayRowIndex = -1;
  let dayCols: { colIndex: number; day: number }[] = [];

  for (let r = 0; r < Math.min(20, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    const temp: { colIndex: number; day: number }[] = [];
    for (let c = 0; c < row.length; c++) {
      const d = parseHeaderDay(row[c], month, year);
      if (d !== null) temp.push({ colIndex: c, day: d });
    }
    if (temp.length >= 3) {
      dayRowIndex = r;
      dayCols = temp;
      break;
    }
  }

  if (dayRowIndex === -1) return null;

  // Namensspalte per Scoring finden
  let nameCol = -1;
  let bestScore = 0;
  const maxCols = Math.max(...rows.map(r => r?.length ?? 0), 0);

  for (let c = 0; c < maxCols; c++) {
    let score = 0;
    for (let r = dayRowIndex + 1; r < rows.length; r++) {
      if (looksLikeName(rows[r]?.[c])) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      nameCol = c;
    }
  }

  if (nameCol === -1) return null;

  // Daten auslesen
  const employees: ParsedEmployee[] = [];
  const usedDays = new Set<number>();

  for (let r = dayRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const rawName = row[nameCol];
    if (!looksLikeName(rawName)) continue;

    const shifts: Record<number, string> = {};
    for (const { colIndex, day } of dayCols) {
      const code = normalizeShiftCode(row[colIndex], unknownCodes, log, sheetName);
      if (!code) continue;
      shifts[day] = code;
      usedDays.add(day);
    }

    if (Object.keys(shifts).length > 0) {
      employees.push({ name: cleanEmployeeDisplayName(rawName), shifts });
    }
  }

  if (employees.length === 0) return null;

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthId = `${year}-${String(month).padStart(2, "0")}`;
  const label = `${MONTH_NAMES_DE[month] || "Unbekannt"} ${year}`;

  return {
    meta: { id: monthId, label, year, month, daysInMonth, layout: "A" },
    employees,
  };
}

/* ------------------------------------------------ */
/* LAYOUT B PARSER                                  */
/* ------------------------------------------------ */

function parseLayoutB(
  rows: any[][],
  sheetName: string,
  month: number,
  year: number,
  unknownCodes: Set<string>,
  log: ImportLogEntry[]
): ParsedSheet | null {
  let markerRowIndex = -1;
  let nameCol = 1;
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    for (let c = 0; c < Math.min(8, rows[r]?.length || 0); c++) {
      const value = rows[r]?.[c];
      if (typeof value === "string" && value.toLowerCase().includes("insert here")) {
        markerRowIndex = r;
        nameCol = c;
        break;
      }
    }
    if (markerRowIndex >= 0) break;
  }
  const firstDayCol = nameCol + 1;

  const dayCols: { colIndex: number; day: number }[] = [];
  let headerRowIndex = -1;

  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const found: { colIndex: number; day: number }[] = [];
    for (let c = firstDayCol; c < (rows[r]?.length || 0); c++) {
      const day = parseHeaderDay(rows[r][c], month, year);
      if (day !== null) found.push({ colIndex: c, day });
    }
    if (found.length >= 3) {
      headerRowIndex = r;
      dayCols.push(...found);
      break;
    }
  }

  if (dayCols.length < 3) {
    const calendarDays = new Date(year, month, 0).getDate();
    const widestDataRow = Math.max(...rows.slice(1).map((row) => row?.length || 0), 0);
    const inferredDays = Math.min(calendarDays, Math.max(widestDataRow - firstDayCol, 0));
    for (let day = 1; day <= inferredDays; day++) dayCols.push({ colIndex: firstDayCol + day - 1, day });
  }

  if (dayCols.length < 3) return null;

  // Namen ab Zeile 2 in Spalte B (Index 1)
  const employees: ParsedEmployee[] = [];
  const usedDays = new Set<number>();

  for (let r = Math.max(headerRowIndex + 1, markerRowIndex + 1, 1); r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const rawName = row[nameCol];
    if (!looksLikeName(rawName)) continue;

    const shifts: Record<number, string> = {};
    for (const { colIndex, day } of dayCols) {
      const code = normalizeShiftCode(row[colIndex], unknownCodes, log, sheetName);
      if (!code) continue;
      shifts[day] = code;
      usedDays.add(day);
    }

    if (Object.keys(shifts).length > 0) {
      employees.push({ name: cleanEmployeeDisplayName(rawName), shifts });
    }
  }

  if (employees.length === 0) return null;

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthId = `${year}-${String(month).padStart(2, "0")}`;
  const label = `${MONTH_NAMES_DE[month] || "Unbekannt"} ${year}`;

  return {
    meta: { id: monthId, label, year, month, daysInMonth, layout: "B" },
    employees,
  };
}

/* ------------------------------------------------ */
/* HAUPTFUNKTION                                    */
/* ------------------------------------------------ */

export async function parseShiftplanExcel(file: File | Blob | ArrayBuffer): Promise<ParseResult> {
  const sourceFileName = typeof File !== "undefined" && file instanceof File ? file.name : "";
  const sourceYear = parseYearFromFileName(sourceFileName);
  const buffer =
    file instanceof ArrayBuffer
      ? file
      : file instanceof Blob
      ? await file.arrayBuffer()
      : await (file as File).arrayBuffer();

  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheets: Record<string, ParsedSheet> = {};
  const ignoredSheets: string[] = [];
  const skippedSheets: { sheet: string; reason: string }[] = [];
  const unknownCodesSet = new Set<string>();
  const log: ImportLogEntry[] = [];

  let lastYearForReference: number | null = null;

  log.push({ level: "info", message: `Workbook geladen: ${workbook.SheetNames.length} Sheet(s) – [${workbook.SheetNames.join(", ")}]` });

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      log.push({ level: "info", sheet: sheetName, message: "Sheet ist leer – übersprungen" });
      ignoredSheets.push(sheetName);
      skippedSheets.push({ sheet: sheetName, reason: "Sheet ist leer" });
      continue;
    }

    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    if (rows.length < 2) {
      log.push({ level: "info", sheet: sheetName, message: "Zu wenige Zeilen – übersprungen" });
      ignoredSheets.push(sheetName);
      skippedSheets.push({ sheet: sheetName, reason: "Zu wenige Zeilen" });
      continue;
    }

    /* 1) Layout erkennen */
    const layout = detectLayout(rows);

    /* 2) Monat + Jahr bestimmen */
    let { month, year } = parseMonthFromText(sheetName);

    // Backup: Header-Zeilen scannen
    if (!month || !year) {
      for (let r = 0; r < Math.min(5, rows.length); r++) {
        for (const cell of rows[r] || []) {
          if (typeof cell === "string") {
            const info = parseMonthFromText(cell);
            if (!month && info.month) month = info.month;
            if (!year && info.year) year = info.year;
          }
          if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
            if (!month) month = cell.getMonth() + 1;
            if (!year) year = cell.getFullYear();
          }
          // Excel-Datumswerte (serial numbers) prüfen
          if (typeof cell === "number" && cell > 40000 && cell < 60000) {
            const dateInfo = parseExcelSerialDate(cell);
            if (dateInfo) {
              if (!month) month = dateInfo.month;
              if (!year) year = dateInfo.year;
            }
          }
        }
      }
    }

    if (!month) {
      log.push({ level: "info", sheet: sheetName, message: "Monat konnte nicht erkannt werden – übersprungen" });
      ignoredSheets.push(sheetName);
      skippedSheets.push({ sheet: sheetName, reason: "Monat konnte nicht erkannt werden" });
      continue;
    }

    // Jahreswechsel-Logik
    if (!year) {
      if (month === 1 && lastYearForReference) {
        year = lastYearForReference + 1;
      } else {
        year = sourceYear || new Date().getFullYear();
      }
    }
    lastYearForReference = year;

    /* 3) Layout-spezifisches Parsing */
    let parsed: ParsedSheet | null = null;

    if (layout === "B") {
      parsed = parseLayoutB(rows, sheetName, month, year, unknownCodesSet, log);
      // Fallback auf Layout A falls B keinen Output liefert
      if (!parsed) {
        log.push({ level: "info", sheet: sheetName, message: "Layout B erkannt aber kein Output – Fallback auf Layout A" });
        parsed = parseLayoutA(rows, sheetName, month, year, unknownCodesSet, log);
      }
    } else {
      parsed = parseLayoutA(rows, sheetName, month, year, unknownCodesSet, log);
    }

    if (!parsed) {
      const reason = "Keine Mitarbeiterdaten gefunden";
      log.push({ level: "info", sheet: sheetName, message: `${reason} – übersprungen` });
      ignoredSheets.push(sheetName);
      skippedSheets.push({ sheet: sheetName, reason });
      continue;
    }

    log.push({
      level: "info",
      sheet: sheetName,
      message: `Layout ${parsed.meta.layout} erkannt – ${parsed.employees.length} Mitarbeiter, ${Object.values(parsed.employees.reduce((a, e) => { for (const d of Object.keys(e.shifts)) a[d] = true; return a; }, {} as Record<string, boolean>)).length} Tage, Monat: ${parsed.meta.label}`,
    });

    const existingMonth = sheets[parsed.meta.id];
    if (existingMonth) {
      existingMonth.employees.push(...parsed.employees);
      log.push({ level: "warn", sheet: sheetName, message: `Weiteres Blatt für ${parsed.meta.label} erkannt und zusammengeführt` });
    } else {
      sheets[parsed.meta.id] = parsed;
    }
  }

  reconcileEmployeeNames(sheets, log);
  harmonizeEmployeeRoster(sheets, log);

  const unknownCodes = Array.from(unknownCodesSet);

  log.push({
    level: "info",
    message: `Import abgeschlossen: ${Object.keys(sheets).length} Monate, ${ignoredSheets.length} ignorierte Sheets${unknownCodes.length > 0 ? `, ${unknownCodes.length} unbekannte Codes: [${unknownCodes.join(", ")}]` : ""}`,
  });

  return {
    sheets,
    ignoredSheets,
    unknownCodes,
    log,
    // Legacy compat
    data: sheets,
    skippedSheets,
  };
}
