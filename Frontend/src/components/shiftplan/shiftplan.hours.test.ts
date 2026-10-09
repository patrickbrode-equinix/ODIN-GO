import { describe, expect, it } from "vitest";
import { computeShiftChangeHoursDelta, formatHoursDelta } from "./shiftplan.hours";

// August 2026: 2026-08-17 is a Monday, 2026-08-15 a Saturday.
const base = { year: 2026, monthIndex1: 8, daysInMonth: 31, holidays: {} as Record<string, string> };

describe("computeShiftChangeHoursDelta", () => {
  it("credits 8h (shift minus 1h break) for an empty weekday that becomes E1", () => {
    const [result] = computeShiftChangeHoursDelta({
      ...base,
      schedule: { Anna: {} },
      changes: [{ employeeName: "Anna", day: 17, newCode: "E1" }],
    });
    expect(result.delta).toBe(8);
    expect(result.newHours).toBe(8);
    expect(formatHoursDelta(result.delta)).toBe("+8,0 h");
  });

  it("is neutral when a worked shift becomes absence on a weekday", () => {
    const [result] = computeShiftChangeHoursDelta({
      ...base,
      schedule: { Anna: { 17: "E1" } },
      changes: [{ employeeName: "Anna", day: 17, newCode: "ABW" }],
    });
    expect(result.delta).toBe(0);
    expect(formatHoursDelta(result.delta)).toBe("±0 h");
  });

  it("credits seminar 8h on weekdays and nothing special for FS", () => {
    const [seminar] = computeShiftChangeHoursDelta({
      ...base,
      schedule: { Anna: { 17: "FS" } },
      changes: [{ employeeName: "Anna", day: 17, newCode: "SEMINAR" }],
    });
    expect(seminar.delta).toBe(8);
    const [fs] = computeShiftChangeHoursDelta({
      ...base,
      schedule: { Anna: { 17: "E1" } },
      changes: [{ employeeName: "Anna", day: 17, newCode: "FS" }],
    });
    expect(fs.delta).toBe(-8);
    expect(formatHoursDelta(fs.delta)).toBe("−8,0 h");
  });

  it("gives no absence credit on weekends", () => {
    const [result] = computeShiftChangeHoursDelta({
      ...base,
      schedule: { Anna: { 15: "E1SA" } },
      changes: [{ employeeName: "Anna", day: 15, newCode: "ABW" }],
    });
    // E1SA runs 06:30-15:30: 9 h presence minus the 1 h break.
    expect(result.delta).toBe(-8);
  });

  it("sums multi-day changes and reports target difference", () => {
    const [result] = computeShiftChangeHoursDelta({
      ...base,
      schedule: { Anna: {} },
      changes: [17, 18, 19].map((day) => ({ employeeName: "Anna", day, newCode: "N" })),
      sollHours: 100,
    });
    // N runs 21:15-06:45: 9.5 h presence minus the 1 h break = 8.5 h per night.
    expect(result.delta).toBe(25.5);
    expect(result.resultingDiff).toBe(-74.5);
  });

  it("returns both employees for a swap", () => {
    const results = computeShiftChangeHoursDelta({
      ...base,
      schedule: { Anna: { 17: "E1" }, Ben: { 17: "FS" } },
      changes: [
        { employeeName: "Anna", day: 17, newCode: "FS" },
        { employeeName: "Ben", day: 17, newCode: "E1" },
      ],
    });
    expect(results.map((r) => r.employeeName)).toEqual(["Anna", "Ben"]);
    expect(results.map((r) => r.delta)).toEqual([-8, 8]);
  });

  it("keeps holiday credit when a cell is cleared on a weekday holiday", () => {
    const [result] = computeShiftChangeHoursDelta({
      ...base,
      holidays: { "2026-08-17": "Feiertag" },
      schedule: { Anna: { 17: "E1" } },
      changes: [{ employeeName: "Anna", day: 17, newCode: null }],
    });
    expect(result.delta).toBe(0);
  });
});

describe("formatHoursDelta", () => {
  it("formats positive, negative and neutral values", () => {
    expect(formatHoursDelta(7.5)).toBe("+7,5 h");
    expect(formatHoursDelta(-0.5)).toBe("−0,5 h");
    expect(formatHoursDelta(0)).toBe("±0 h");
    expect(formatHoursDelta(0.04)).toBe("±0 h");
  });
});

describe("double-pay days (24.12. / 31.12.)", () => {
  it("pays hours from 12:00 twice and deducts the break only from 6h presence", async () => {
    const { getDoublePayDayHours } = await import("./shiftplan.hours");
    expect(getDoublePayDayHours("06:30-15:30")).toBe(11.5);
    expect(getDoublePayDayHours("13:00-22:00")).toBe(17);
    expect(getDoublePayDayHours("06:30-10:30")).toBe(4);
    expect(getDoublePayDayHours("21:15-06:45")).toBe(11.25);
  });

  it("applies the rule on 24.12. in the monthly total", () => {
    const [result] = computeShiftChangeHoursDelta({
      year: 2026,
      monthIndex1: 12,
      daysInMonth: 31,
      holidays: {},
      schedule: { Anna: {} },
      changes: [{ employeeName: "Anna", day: 24, newCode: "E1" }],
    });
    expect(result.newHours).toBe(11.5);
  });
});
