import { describe, expect, it } from "vitest";
import {
  areEquivalentEmployeeNames,
  dedupeEmployeeNames,
  getEmployeeKey,
  normalizeEmployeeName,
} from "./employeeNames";

describe("employeeNames", () => {
  it("keeps internal login aliases as display values instead of splitting them", () => {
    expect(normalizeEmployeeName("Mohamed@Tigoudar")).toBe("Mohamed@Tigoudar");
  });

  it("does not deduplicate double-first-name variants by display-name tokens", () => {
    expect(dedupeEmployeeNames([
      "Mohamed Tigoudar",
      "Mohamed@Tigoudar",
      "Amine Mohamed Tigoudar",
      "Amine@Tigoudar",
    ])).toEqual([
      "Amine Mohamed Tigoudar",
      "Amine@Tigoudar",
      "Mohamed Tigoudar",
      "Mohamed@Tigoudar",
    ]);
  });

  it("uses exact legacy display-name equality only", () => {
    expect(areEquivalentEmployeeNames("Amine Mohamed Tigoudar", "Mohamed Tigoudar")).toBe(false);
    expect(areEquivalentEmployeeNames("Amine Tigoudar", "Mohamed Tigoudar")).toBe(false);
    expect(areEquivalentEmployeeNames("Anna Lena Müller", "Anna Lena Müller")).toBe(true);
  });

  it("builds stable employee keys from IDs and UPN before display names", () => {
    expect(getEmployeeKey({
      entraObjectId: "ENTRA-1",
      employeeId: "E-1",
      upn: "User@Example.COM",
      displayName: "Anna Lena Müller",
    })).toBe("entra:entra-1");
    expect(getEmployeeKey({
      employeeId: "E-1",
      upn: "User@Example.COM",
      displayName: "Anna Lena Müller",
    })).toBe("employee:e-1");
    expect(getEmployeeKey({
      upn: "User@Example.COM",
      displayName: "Anna Lena Müller",
    })).toBe("upn:user@example.com");
  });
});
