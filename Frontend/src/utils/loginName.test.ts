import { describe, expect, it } from "vitest";
import { buildLoginNameSuggestion, validateLoginName } from "./loginName";

describe("loginName utilities", () => {
  it("builds normalized login names", () => {
    expect(buildLoginNameSuggestion("Jürgen", "Müller")).toBe("Juergen@Mueller");
    expect(buildLoginNameSuggestion("Ana Maria", "da Silva")).toBe("AnaMaria@DaSilva");
    expect(buildLoginNameSuggestion("Hans-Peter", "Schmidt")).toBe("HansPeter@Schmidt");
  });

  it("accepts valid user IDs", () => {
    expect(validateLoginName("Patrick@Brode").ok).toBe(true);
    expect(validateLoginName("Juergen@Mueller").ok).toBe(true);
  });

  it("rejects classical email addresses and malformed values", () => {
    for (const value of [
      "patrick.brode@firma.de",
      "patrick@gmail.com",
      "Patrick Brode",
      "Patrick.Brode",
      "Patrick_Brode",
      "Patrick@",
      "@Brode",
      "Patrick@@Brode",
      "Patrick@Brode.de",
      "Patrick@Brode.com",
    ]) {
      expect(validateLoginName(value).ok).toBe(false);
    }
  });
});