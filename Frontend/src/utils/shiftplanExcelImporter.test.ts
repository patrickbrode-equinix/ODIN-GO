/// <reference types="node" />
/* ------------------------------------------------ */
/* UNIT TESTS – Shiftplan Excel Importer            */
/* Run: npx vitest run src/utils/shiftplanExcelImporter.test.ts */
/* ------------------------------------------------ */

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parseShiftplanExcel, KNOWN_SHIFT_CODES, PENDING_REVIEW_CODES } from "./shiftplanExcelImporter";

/* ------------------------------------------------ */
/* HELPERS: create in-memory Excel workbooks         */
/* ------------------------------------------------ */

function makeWorkbook(sheets: Record<string, any[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

/* ------------------------------------------------ */
/* CONSTANTS                                         */
/* ------------------------------------------------ */

describe("KNOWN_SHIFT_CODES", () => {
  it("includes core shift codes", () => {
    for (const code of ["E1", "E2", "L1", "L2", "N", "FS", "ABW", "L3", "U", "K"]) {
      expect(KNOWN_SHIFT_CODES).toContain(code);
    }
  });

  it("includes L3, FS, ABW (new codes)", () => {
    expect(KNOWN_SHIFT_CODES).toContain("L3");
    expect(KNOWN_SHIFT_CODES).toContain("FS");
    expect(KNOWN_SHIFT_CODES).toContain("ABW");
  });
});

describe("PENDING_REVIEW_CODES", () => {
  it("L3 marked as pending review", () => {
    expect(PENDING_REVIEW_CODES).toContain("L3");
  });
});

/* ------------------------------------------------ */
/* LAYOUT A: Classic (Month in A1, days row 3,       */
/*           names in col A)                          */
/* ------------------------------------------------ */

describe("Layout A – Classic Format", () => {
  it("parses a minimal Layout A sheet", async () => {
    const data = [
      ["Januar 2025"],           // A1 = month
      [],                         // row 2 blank
      [null, 1, 2, 3],           // row 3: days
      ["Mustermann, Max", "E1", "L1", "N"],
      ["Schmidt, Anna", "E2", "FS", "U"],
    ];
    const buf = makeWorkbook({ "Januar 2025": data });
    const result = await parseShiftplanExcel(buf);

    expect(result.log.some(l => l.level === "error")).toBe(false);
    expect(result.ignoredSheets.length).toBe(0);

    const sheet = Object.values(result.sheets)[0];
    expect(sheet).toBeDefined();
    expect(sheet.meta.month).toBe(1);
    expect(sheet.meta.year).toBe(2025);
    expect(sheet.meta.layout).toBe("A");
    expect(sheet.employees.length).toBe(2);

    const max = sheet.employees.find(e => e.name.includes("Mustermann"));
    expect(max).toBeDefined();
    expect(max!.shifts[1]).toBe("E1");
    expect(max!.shifts[2]).toBe("L1");
    expect(max!.shifts[3]).toBe("N");
  });

  it("normalizes shift aliases", async () => {
    const data = [
      ["Februar 2025"],
      [],
      [null, 1, 2, 3, 4, 5],
      ["Böhm, Test", "NACHT", "FREI", "E1", "L1", "N"],
    ];
    const buf = makeWorkbook({ "Feb 2025": data });
    const result = await parseShiftplanExcel(buf);

    const sheet = Object.values(result.sheets)[0];
    expect(sheet).toBeDefined();
    const emp = sheet.employees[0];
    expect(emp.shifts[1]).toBe("N");   // NACHT → N
    expect(emp.shifts[2]).toBe("FS");  // FREI → FS
  });

  it("logs unknown shift codes as warnings", async () => {
    const data = [
      ["März 2025"],
      [],
      [null, 1, 2, 3, 4, 5],
      ["Test, User", "XYZ", "E1", "L1", "N", "E2"],
    ];
    const buf = makeWorkbook({ "März 2025": data });
    const result = await parseShiftplanExcel(buf);

    expect(result.unknownCodes).toContain("XYZ");
    expect(result.log.some(l => l.level === "warn" && l.message.includes("XYZ"))).toBe(true);

    // Unknown code still imported as raw value
    const sheet = Object.values(result.sheets)[0];
    expect(sheet.employees[0].shifts[1]).toBe("XYZ");
  });

  it("parses weekday day headers, serial month cells and time suffixes", async () => {
    const data = [
      [46113],
      ["IBX OPS FR2 - Hauptobjekt, IBX OPS FR2"],
      ["", "Mi 1", "Do 2", "Fr 3"],
      ["Albrecht, Patrick", "N\r\n21:15-06:45", "N/A", "E2 06:45-15:15"],
    ];
    const buf = makeWorkbook({ "Month 1": data });
    const result = await parseShiftplanExcel(buf);

    const sheet = Object.values(result.sheets)[0];
    expect(sheet).toBeDefined();
    expect(sheet.meta.layout).toBe("A");
    expect(sheet.meta.month).toBe(4);
    expect(sheet.meta.year).toBe(2026);
    expect(sheet.employees.length).toBe(1);
    expect(sheet.employees[0].shifts[1]).toBe("N");
    expect(sheet.employees[0].shifts[2]).toBe("FS");
    expect(sheet.employees[0].shifts[3]).toBe("E2");
  });
});

/* ------------------------------------------------ */
/* LAYOUT B: New Format ("Insert here ↓" in B1,     */
/*           days row 1 from C1, names in col B)     */
/* ------------------------------------------------ */

describe("Layout B – New Format", () => {
  it("parses a minimal Layout B sheet", async () => {
    const data = [
      [null, "Insert here ↓", 1, 2, 3],   // B1 = marker, C1+ = days
      [null, "Mustermann, Max", "E1", "L2", "N"],
      [null, "Schmidt, Anna", "L1", "E2", "FS"],
    ];
    const buf = makeWorkbook({ "Januar 2025": data });
    const result = await parseShiftplanExcel(buf);

    const sheet = Object.values(result.sheets)[0];
    expect(sheet).toBeDefined();
    expect(sheet.meta.layout).toBe("B");
    expect(sheet.employees.length).toBe(2);

    const max = sheet.employees.find(e => e.name.includes("Mustermann"));
    expect(max).toBeDefined();
    expect(max!.shifts[1]).toBe("E1");
    expect(max!.shifts[2]).toBe("L2");
    expect(max!.shifts[3]).toBe("N");
  });

  it("parses Layout B weekday headers", async () => {
    const data = [
      [null, "Insert here ↓", "Mi 1", "Do 2", "Fr 3"],
      [null, "Mustermann, Max", "E1", "L2", "N"],
    ];
    const buf = makeWorkbook({ "April 2026": data });
    const result = await parseShiftplanExcel(buf);

    const sheet = Object.values(result.sheets)[0];
    expect(sheet).toBeDefined();
    expect(sheet.meta.layout).toBe("B");
    expect(sheet.employees[0].shifts[1]).toBe("E1");
    expect(sheet.employees[0].shifts[2]).toBe("L2");
    expect(sheet.employees[0].shifts[3]).toBe("N");
  });
});

/* ------------------------------------------------ */
/* MONTH PARSING                                     */
/* ------------------------------------------------ */

describe("Month parsing edge cases", () => {
  it("handles English month names", async () => {
    const data = [
      ["January 2025"],
      [],
      [null, 1, 2, 3, 4, 5],
      ["Test, User", "E1", "L1", "N", "E2", "FS"],
    ];
    const buf = makeWorkbook({ "January 2025": data });
    const result = await parseShiftplanExcel(buf);
    const sheet = Object.values(result.sheets)[0];
    expect(sheet).toBeDefined();
    expect(sheet.meta.month).toBe(1);
  });

  it("handles typo 'Feburary'", async () => {
    const data = [
      ["Feburary 2025"],
      [],
      [null, 1, 2, 3, 4, 5],
      ["Test, User", "E1", "L1", "N", "E2", "FS"],
    ];
    const buf = makeWorkbook({ "Feburary 2025": data });
    const result = await parseShiftplanExcel(buf);
    const sheet = Object.values(result.sheets)[0];
    expect(sheet).toBeDefined();
    expect(sheet.meta.month).toBe(2);
  });
});

/* ------------------------------------------------ */
/* MULTIPLE SHEETS                                   */
/* ------------------------------------------------ */

describe("Multi-sheet workbook", () => {
  it("parses multiple month sheets", async () => {
    const jan = [
      ["Januar 2025"],
      [],
      [null, 1, 2, 3, 4, 5],
      ["Test, User", "E1", "L1", "N", "E2", "FS"],
    ];
    const feb = [
      ["Februar 2025"],
      [],
      [null, 1, 2, 3, 4, 5],
      ["Test, User", "L1", "E1", "N", "E2", "FS"],
    ];
    const buf = makeWorkbook({ "Januar 2025": jan, "Februar 2025": feb });
    const result = await parseShiftplanExcel(buf);

    expect(Object.keys(result.sheets).length).toBe(2);
    expect(result.log.some(l => l.level === "error")).toBe(false);
  });

  it("ignores sheets that cannot be parsed", async () => {
    const valid = [
      ["Januar 2025"],
      [],
      [null, 1, 2, 3, 4, 5],
      ["Test, User", "E1", "L1", "N", "E2", "FS"],
    ];
    const invalid = [
      ["Some random content"],
      ["no days, no names"],
    ];
    const buf = makeWorkbook({ "Januar 2025": valid, "Notizen": invalid });
    const result = await parseShiftplanExcel(buf);

    expect(Object.keys(result.sheets).length).toBe(1);
    expect(result.ignoredSheets).toContain("Notizen");
  });

  it("recognizes Aug/Sep/Oct exports with shifted or missing day headers", async () => {
    const august = [
      [null, "Insert here ↓"],
      [null, "IBX OPS FR2"],
      [null, "Tigoudar, Mohamed Amine", "E1", "E1", "FS", "L1"],
    ];
    const september = [
      [null, "Insert here ↓"],
      [null, null, 1, 2, 3, 4],
      [null, "Tigoudar, Mohamed", "E2", "E2", "FS", "N"],
    ];
    const october = [
      [null, "Insert here ↓"],
      [null, "IBX OPS FR2"],
      [null, "Tigoudar, Mohamed Amine", "L1", "L1", "FS", "E1"],
    ];

    const result = await parseShiftplanExcel(makeWorkbook({ Aug: august, Sep: september, Oct: october }));

    expect(Object.keys(result.sheets).sort()).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(result.ignoredSheets).toEqual([]);
    expect(result.sheets["2026-08"].meta.layout).toBe("B");
    expect(result.sheets["2026-09"].employees[0].name).toBe("Tigoudar, Mohamed Amine");
    expect(result.sheets["2026-10"].employees[0].shifts[1]).toBe("L1");
  });

  it("handles shifted marker columns, numeric month names and full-date headers", async () => {
    const data = [
      ["Dienstplan"],
      [],
      [null, null, "Insert here ↓"],
      [null, null, null, "01.09.2026", "02/09/2026", "03-09-26"],
      [null, null, "  Tigoudar,   Mohamed Amine\n", "E1", "L1", "N"],
    ];
    const result = await parseShiftplanExcel(makeWorkbook({ "09-26": data }));

    expect(Object.keys(result.sheets)).toEqual(["2026-09"]);
    expect(result.sheets["2026-09"].employees[0].name).toBe("Tigoudar, Mohamed Amine");
    expect(result.sheets["2026-09"].employees[0].shifts).toEqual({ 1: "E1", 2: "L1", 3: "N" });
  });

  it("reconciles comma, display-name and @ aliases only through one unique full name", async () => {
    const aug = [[null, "Insert here ↓", 1, 2, 3], [null, "Tigoudar, Mohamed Amine", "E1", "E1", "E1"]];
    const sep = [[null, "Insert here ↓", 1, 2, 3], [null, "Mohamed Amine Tigoudar", "L1", "L1", "L1"]];
    const oct = [
      [null, "Insert here ↓", 1, 2, 3],
      [null, "Mohamed@Tigoudar", "N", null, null],
      [null, "Amine@Tigoudar", null, "N", "N"],
    ];
    const result = await parseShiftplanExcel(makeWorkbook({ "Aug 2026": aug, "Sep 2026": sep, "Oct 2026": oct }));

    for (const sheet of Object.values(result.sheets)) {
      expect(sheet.employees.map((employee) => employee.name)).toEqual(["Tigoudar, Mohamed Amine"]);
    }
    expect(result.sheets["2026-10"].employees[0].shifts).toEqual({ 1: "N", 2: "N", 3: "N" });
  });

  it("keeps short and long same-surname names separate when both occur in one sheet", async () => {
    const data = [
      [null, "Insert here ↓", 1, 2, 3],
      [null, "Smith, John", "E1", "E1", "E1"],
      [null, "Smith, John Paul", "L1", "L1", "L1"],
    ];
    const result = await parseShiftplanExcel(makeWorkbook({ "October 2026": data }));
    expect(result.sheets["2026-10"].employees.map((employee) => employee.name)).toEqual([
      "Smith, John",
      "Smith, John Paul",
    ]);
  });

  it("does not merge ambiguous people who only share a surname", async () => {
    const data = [
      [null, "Insert here ↓", 1, 2, 3],
      [null, "Smith, John Paul", "E1", "E1", "E1"],
      [null, "Smith, John Peter", "L1", "L1", "L1"],
      [null, "Smith, John", "N", "N", "N"],
    ];
    const result = await parseShiftplanExcel(makeWorkbook({ "Sep 2026": data }));
    expect(result.sheets["2026-09"].employees.map((employee) => employee.name)).toEqual([
      "Smith, John Paul",
      "Smith, John Peter",
      "Smith, John",
    ]);
  });
});

describe("Real provided workbooks", () => {
  it.each([
    "../../../3 Months.xlsm",
    "../../../3 Months (1).xlsm",
  ])("parses %s without fatal importer errors", async (relativePath) => {
    const workbookUrl = new URL(relativePath, import.meta.url);
    if (!existsSync(workbookUrl)) return;
    const fileBuffer = readFileSync(workbookUrl);
    const result = await parseShiftplanExcel(toArrayBuffer(fileBuffer));

    expect(result.log.some((entry) => entry.level === "error")).toBe(false);
    expect(Object.keys(result.sheets).length).toBeGreaterThanOrEqual(3);
    expect(result.skippedSheets.some((entry) => entry.sheet === "Load")).toBe(true);

    const parsedMonths = Object.values(result.sheets).map((sheet) => `${sheet.meta.month}-${sheet.meta.year}`);
    expect(parsedMonths.length).toBeGreaterThanOrEqual(3);
    expect(parsedMonths.every((entry) => /\d{1,2}-20\d{2}/.test(entry))).toBe(true);
  });

  it.skipIf(!process.env.SHIFTPLAN_TEST_WORKBOOK)("parses the explicitly supplied regression workbook", async () => {
    const fileBuffer = readFileSync(process.env.SHIFTPLAN_TEST_WORKBOOK!);
    const result = await parseShiftplanExcel(toArrayBuffer(fileBuffer));

    expect(Object.keys(result.sheets).sort()).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(result.ignoredSheets).toEqual([]);
    expect(result.sheets["2026-08"].employees.length).toBe(45);
    expect(result.sheets["2026-09"].employees.length).toBe(45);
    expect(result.sheets["2026-10"].employees.length).toBe(45);
    expect(result.sheets["2026-09"].employees.some((employee) => employee.name === "Tigoudar, Mohamed Amine")).toBe(true);
    expect(result.sheets["2026-09"].employees.some((employee) => employee.name === "Tigoudar, Mohamed")).toBe(false);
    expect(result.sheets["2026-09"].employees.find((employee) => employee.name === "Selmani, Liridon")?.shifts).toEqual({});
    expect(result.sheets["2026-10"].employees.find((employee) => employee.name === "Selmani, Liridon")?.shifts).toEqual({});
    for (const expectedName of [
      "Gani, Romy Christian",
      "Lai, Kok Chun",
      "Pirzada, Sayed Samir Ahmad",
      "Tigoudar, Mohamed Amine",
    ]) {
      expect(result.sheets["2026-08"].employees.some((employee) => employee.name === expectedName)).toBe(true);
    }
    for (const sheet of Object.values(result.sheets)) {
      expect(new Set(sheet.employees.map((employee) => employee.name)).size).toBe(45);
    }
  });
});
