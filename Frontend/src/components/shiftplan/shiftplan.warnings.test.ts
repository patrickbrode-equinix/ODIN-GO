import { describe, expect, it } from "vitest";
import { computeUnderstaffWarnings, type StaffingDefinitionLike } from "./shiftplan.warnings";

// 2026-08-17 is a Monday.
const MONDAY = new Date(2026, 7, 17, 12, 0, 0);
const MONDAY_KEY = "2026-08-17";

function scheduleFor(day: number, codes: string[]) {
  const schedule: Record<string, Record<number, string>> = {};
  codes.forEach((code, index) => {
    schedule[`Emp ${index}`] = { [day]: code };
  });
  return schedule as any;
}

const nightDefs: StaffingDefinitionLike[] = [
  { code: "N", shift_type: "night", max_staff: 5, applicable_days: [0, 1, 2, 3, 4, 5, 6], is_active: true },
];

function monday(schedule: any, definitions: StaffingDefinitionLike[], staffingRules?: any[]) {
  return computeUnderstaffWarnings(schedule, 2026, 8, 31, MONDAY, { definitions, staffingRules }).filter(
    (warning) => warning.dateKey === MONDAY_KEY && warning.shiftType === "night",
  );
}

describe("computeUnderstaffWarnings", () => {
  it("only reports staffing gaps for today and future dates", () => {
    const warnings = computeUnderstaffWarnings({}, 2026, 8, 31, new Date(2026, 7, 15, 12, 0, 0));

    expect(warnings.some((warning) => warning.dateKey === "2026-08-14")).toBe(false);
    expect(warnings.some((warning) => warning.dateKey === "2026-08-15")).toBe(true);
    expect(warnings.every((warning) => warning.dateKey >= "2026-08-15")).toBe(true);
  });

  it("night max 5: 4 present is a warning", () => {
    const result = monday(scheduleFor(17, ["N", "N", "N", "N"]), nightDefs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ severity: "warning", max: 5, actual: 4, missing: 1, label: "Unterbesetzung" });
  });

  it("night max 5: 3 present is critical", () => {
    const result = monday(scheduleFor(17, ["N", "N", "N"]), nightDefs);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ severity: "critical", missing: 2, label: "Kritische Unterbesetzung" });
  });

  it("night max 5: 5 present produces no warning", () => {
    expect(monday(scheduleFor(17, ["N", "N", "N", "N", "N"]), nightDefs)).toHaveLength(0);
  });

  it("does not double count N and NK definitions and counts both codes as night", () => {
    const defs: StaffingDefinitionLike[] = [
      ...nightDefs,
      { code: "NK", shift_type: "night", max_staff: 5, applicable_days: [], is_active: true },
    ];
    const result = monday(scheduleFor(17, ["N", "N", "N", "NK"]), defs);
    expect(result).toHaveLength(1);
    expect(result[0].max).toBe(5);
    expect(result[0].actual).toBe(4);
    expect(monday(scheduleFor(17, ["N", "N", "N", "NK", "NK"]), defs)).toHaveLength(0);
  });

  it("uses the largest night max when no N definition exists", () => {
    const defs: StaffingDefinitionLike[] = [
      { code: "NK", shift_type: "night", max_staff: 3, is_active: true },
      { code: "NX", shift_type: "night", max_staff: 4, is_active: true },
    ];
    const result = monday(scheduleFor(17, ["NK", "NK"]), defs);
    expect(result[0].max).toBe(4);
  });

  it("ignores definitions not applicable on that weekday (array and JSON string)", () => {
    const tuesdayOnly = [{ ...nightDefs[0], applicable_days: [2] }];
    expect(monday(scheduleFor(17, []), tuesdayOnly)).toHaveLength(0);
    const tuesdayOnlyString = [{ ...nightDefs[0], applicable_days: "[2]" }];
    expect(monday(scheduleFor(17, []), tuesdayOnlyString)).toHaveLength(0);
  });

  it("ignores inactive definitions", () => {
    expect(monday(scheduleFor(17, []), [{ ...nightDefs[0], is_active: false }])).toHaveLength(0);
  });

  it("caps max by staffing rule max_count", () => {
    const result = monday(scheduleFor(17, ["N", "N", "N"]), nightDefs, [{ shift_type: "night", min_count: 1, max_count: 3 }]);
    expect(result).toHaveLength(0);
    const capped = monday(scheduleFor(17, ["N", "N"]), nightDefs, [{ shift_type: "night", min_count: 1, max_count: 3 }]);
    expect(capped[0]).toMatchObject({ max: 3, severity: "warning" });
  });

  it("sums max_staff for early and late definitions", () => {
    const defs: StaffingDefinitionLike[] = [
      { code: "L1", shift_type: "late", max_staff: 2, is_active: true },
      { code: "L2", shift_type: "late", max_staff: 2, is_active: true },
    ];
    const warnings = computeUnderstaffWarnings(scheduleFor(17, ["L1", "L2", "L1"]), 2026, 8, 31, MONDAY, {
      definitions: defs,
    }).filter((warning) => warning.dateKey === MONDAY_KEY && warning.shiftType === "late");
    expect(warnings[0]).toMatchObject({ max: 4, actual: 3, severity: "warning" });
  });

  it("does not let half-day definitions (HE1) inflate the early maximum", () => {
    const defs: StaffingDefinitionLike[] = [
      { code: "E1", shift_type: "early", max_staff: 3, is_active: true },
      { code: "HE1", shift_type: "early", max_staff: 5, is_active: true },
    ];
    const warnings = computeUnderstaffWarnings(scheduleFor(17, ["E1", "E1"]), 2026, 8, 31, MONDAY, {
      definitions: defs,
    }).filter((warning) => warning.dateKey === MONDAY_KEY && warning.shiftType === "early");
    expect(warnings[0]).toMatchObject({ max: 3, actual: 2, severity: "warning" });
  });

  it("skips past days in config mode", () => {
    const warnings = computeUnderstaffWarnings({}, 2026, 8, 31, MONDAY, { definitions: nightDefs });
    expect(warnings.every((warning) => warning.dateKey >= MONDAY_KEY)).toBe(true);
  });

  it("falls back to the legacy minimums without config", () => {
    const warnings = computeUnderstaffWarnings(scheduleFor(17, ["N", "N", "N"]), 2026, 8, 31, MONDAY);
    const night = warnings.find((warning) => warning.dateKey === MONDAY_KEY && warning.kind === "night");
    expect(night).toMatchObject({ target: 4, actual: 3, severity: "warning", label: "Nachtschicht: 3/4" });
    const late = warnings.find((warning) => warning.dateKey === MONDAY_KEY && warning.kind === "late");
    expect(late).toMatchObject({ target: 3, actual: 0, severity: "critical" });
  });

  it("falls back when definitions are empty", () => {
    const warnings = computeUnderstaffWarnings({}, 2026, 8, 31, MONDAY, { definitions: [] });
    expect(warnings.find((warning) => warning.dateKey === MONDAY_KEY && warning.kind === "night")?.target).toBe(4);
  });
});
