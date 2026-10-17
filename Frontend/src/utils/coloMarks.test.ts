import { describe, expect, it } from "vitest";
import {
  buildColoMarkLookup,
  buildColoMarkLookupFromRoles,
  coloMarkKey,
  coloMarkTitle,
  getColoMark,
  isColoMarked,
} from "./coloMarks";

describe("coloMarks", () => {
  it("builds keys as employee|date", () => {
    expect(coloMarkKey("Anna Muster", "2026-08-03")).toBe("Anna Muster|2026-08-03");
    expect(coloMarkKey("Anna Muster", "2026-08-03T00:00:00.000Z")).toBe("Anna Muster|2026-08-03");
  });

  it("builds a lookup from draft colo assignments and ignores invalid entries", () => {
    const lookup = buildColoMarkLookup([
      { employee_name: "Anna Muster", date: "2026-08-03", role_key: "colo", comment: "Colo", manual: true },
      { employee_name: "Ben Beispiel", date: "2026-08-04", role_key: "colo", comment: "Auto" },
      { employee_name: "", date: "2026-08-05" },
      { employee_name: "Cara", date: "x" },
      null,
    ]);
    expect(lookup.size).toBe(2);
    expect(isColoMarked(lookup, "Anna Muster", "2026-08-03")).toBe(true);
    expect(isColoMarked(lookup, "Anna Muster", "2026-08-04")).toBe(false);
    expect(getColoMark(lookup, "Anna Muster", "2026-08-03")).toEqual({ comment: "Colo", manual: true });
    expect(getColoMark(lookup, "Ben Beispiel", "2026-08-04")).toEqual({ comment: "Auto", manual: false });
  });

  it("returns an empty lookup for non-array input", () => {
    expect(buildColoMarkLookup(undefined).size).toBe(0);
    expect(isColoMarked(undefined, "Anna Muster", "2026-08-03")).toBe(false);
  });

  it("builds a lookup from weekplan roles and keeps only colo", () => {
    const lookup = buildColoMarkLookupFromRoles({
      "Anna Muster|2026-08-03": { role_key: "colo", comment: "x" },
      "Anna Muster|2026-08-04": { role_key: "sh", comment: null },
    });
    expect(lookup.size).toBe(1);
    expect(isColoMarked(lookup, "Anna Muster", "2026-08-03")).toBe(true);
    expect(isColoMarked(lookup, "Anna Muster", "2026-08-04")).toBe(false);
  });

  it("builds a tooltip with comment and manual flag", () => {
    expect(coloMarkTitle({ comment: "Rack", manual: true }, false)).toBe("Colo assignment · Rack · manual");
    expect(coloMarkTitle({ comment: "", manual: false }, true)).toBe("Colo-Einsatz");
  });
});
