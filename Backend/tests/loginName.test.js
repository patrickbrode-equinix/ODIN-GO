import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  buildLoginNameSuggestion,
  normalizeLoginNameForLookup,
  validateLoginName,
} from "../lib/loginName.js";

describe("loginName helpers", () => {
  test("builds normalized login names from first and last name", () => {
    assert.equal(buildLoginNameSuggestion("Jürgen", "Müller"), "Juergen@Mueller");
    assert.equal(buildLoginNameSuggestion("Ana Maria", "da Silva"), "AnaMaria@DaSilva");
    assert.equal(buildLoginNameSuggestion("Hans-Peter", "Schmidt"), "HansPeter@Schmidt");
  });

  test("accepts valid internal login names", () => {
    assert.equal(validateLoginName("Patrick@Brode").ok, true);
    assert.equal(validateLoginName("Juergen@Mueller").ok, true);
  });

  test("rejects classical email forms and invalid separators", () => {
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
      assert.equal(validateLoginName(value).ok, false, `${value} should be rejected`);
    }
  });

  test("normalizes lookup case-insensitively", () => {
    assert.equal(normalizeLoginNameForLookup(" Patrick@Brode "), "patrick@brode");
  });
});