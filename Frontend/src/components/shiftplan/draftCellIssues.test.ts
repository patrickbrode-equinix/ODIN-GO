import { describe, expect, it } from "vitest";
import { describeCellIssues, type DraftIssueContext } from "./draftCellIssues";
import { excelIncludeParam, excelExportParams, loadExcelInclude } from "../../api/planningPeriods";

const context = (schedule: Record<string, Record<number, string>>, overrides: Partial<DraftIssueContext> = {}): DraftIssueContext => ({
  schedule,
  typeByCode: { E1: "early", E2: "early", L1: "late", L2: "late", N: "night" },
  absences: [],
  month: "2027-03",
  lateToEarlyForbidden: true,
  nightToEarlyForbidden: true,
  maxConsecutiveWorkdays: 6,
  ...overrides,
});

describe("describeCellIssues", () => {
  it("is quiet for a normal cell", () => {
    expect(describeCellIssues(context({ Anna: { 3: "E1", 4: "E1" } }), "Anna", 3)).toEqual([]);
  });

  it("reports an early shift right after a late shift", () => {
    const issues = describeCellIssues(context({ Anna: { 3: "L1", 4: "E1" } }), "Anna", 4);
    expect(issues.some((text) => text.includes("Frühschicht direkt nach Spätschicht"))).toBe(true);
  });

  it("reports the late shift that is followed by an early shift", () => {
    const issues = describeCellIssues(context({ Anna: { 3: "L1", 4: "E1" } }), "Anna", 3);
    expect(issues.some((text) => text.includes("Folgetag Frühschicht"))).toBe(true);
  });

  it("does not report anything when the rule is switched off", () => {
    expect(describeCellIssues(context({ Anna: { 3: "L1", 4: "E1" } }, { lateToEarlyForbidden: false }), "Anna", 4)).toEqual([]);
  });

  it("reports an absence on the day", () => {
    const issues = describeCellIssues(context({ Anna: { 5: "E1" } }, { absences: [{ employee_name: "Anna", start_date: "2027-03-04", end_date: "2027-03-06", type: "VACATION" }] }), "Anna", 5);
    expect(issues.some((text) => text.includes("Abwesend"))).toBe(true);
  });

  it("reports too many working days in a row", () => {
    const row: Record<number, string> = {};
    for (let day = 1; day <= 9; day++) row[day] = "E1";
    const issues = describeCellIssues(context({ Anna: row }), "Anna", 5);
    expect(issues.some((text) => text.includes("9 Arbeitstage am Stück"))).toBe(true);
  });
});

describe("Excel export options", () => {
  it("builds the include parameter in a fixed order", () => {
    expect(excelIncludeParam({ hours: true, wishes: false, wishStatus: true })).toBe("hours,wishStatus");
    expect(excelIncludeParam({ hours: false, wishes: true, wishStatus: false })).toBe("wishes");
  });

  it("only sends the include list for the management variant", () => {
    expect(excelExportParams("team", { hours: true, wishes: true, wishStatus: true })).toEqual({ variant: "team" });
    expect(excelExportParams("management", { hours: true, wishes: false, wishStatus: true })).toEqual({ variant: "management", include: "hours,wishStatus" });
  });

  it("falls back to everything when nothing is stored", () => {
    expect(loadExcelInclude()).toEqual({ hours: true, wishes: true, wishStatus: true });
  });
});
