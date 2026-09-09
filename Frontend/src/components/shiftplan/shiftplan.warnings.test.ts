import { describe, expect, it } from "vitest";
import { computeUnderstaffWarnings } from "./shiftplan.warnings";

describe("computeUnderstaffWarnings", () => {
  it("only reports staffing gaps for today and future dates", () => {
    const warnings = computeUnderstaffWarnings({}, 2026, 8, 31, new Date(2026, 7, 15, 12, 0, 0));

    expect(warnings.some((warning) => warning.dateKey === "2026-08-14")).toBe(false);
    expect(warnings.some((warning) => warning.dateKey === "2026-08-15")).toBe(true);
    expect(warnings.every((warning) => warning.dateKey >= "2026-08-15")).toBe(true);
  });
});
