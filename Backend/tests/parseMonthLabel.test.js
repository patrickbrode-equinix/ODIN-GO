/**
 * backend/tests/parseMonthLabel.test.js
 *
 * Unit tests for the parseMonthLabel utility.
 * Run with: node --test tests/parseMonthLabel.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseMonthLabel, sortMonthLabels } from "../lib/monthParser.js";

describe("parseMonthLabel", () => {
  // ── Happy path: German full names ──────────────────────────────────────
  test("parses German full month names", () => {
    assert.deepEqual(parseMonthLabel("Januar 2026"),   { year: 2026, month: 1 });
    assert.deepEqual(parseMonthLabel("Februar 2026"),  { year: 2026, month: 2 });
    assert.deepEqual(parseMonthLabel("März 2026"),     { year: 2026, month: 3 });
    assert.deepEqual(parseMonthLabel("April 2026"),    { year: 2026, month: 4 });
    assert.deepEqual(parseMonthLabel("Mai 2026"),      { year: 2026, month: 5 });
    assert.deepEqual(parseMonthLabel("Juni 2026"),     { year: 2026, month: 6 });
    assert.deepEqual(parseMonthLabel("Juli 2026"),     { year: 2026, month: 7 });
    assert.deepEqual(parseMonthLabel("August 2026"),   { year: 2026, month: 8 });
    assert.deepEqual(parseMonthLabel("September 2026"),{ year: 2026, month: 9 });
    assert.deepEqual(parseMonthLabel("Oktober 2026"),  { year: 2026, month: 10 });
    assert.deepEqual(parseMonthLabel("November 2026"), { year: 2026, month: 11 });
    assert.deepEqual(parseMonthLabel("Dezember 2026"), { year: 2026, month: 12 });
  });

  // ── Happy path: German abbreviations ───────────────────────────────────
  test("parses German abbreviated month names", () => {
    assert.deepEqual(parseMonthLabel("Jan 2026"),  { year: 2026, month: 1 });
    assert.deepEqual(parseMonthLabel("Feb 2026"),  { year: 2026, month: 2 });
    assert.deepEqual(parseMonthLabel("Mrz 2026"),  { year: 2026, month: 3 });
    assert.deepEqual(parseMonthLabel("Mär 2026"),  { year: 2026, month: 3 }); // umlaut abbreviation (Excel)
    assert.deepEqual(parseMonthLabel("Apr 2026"),  { year: 2026, month: 4 });
    assert.deepEqual(parseMonthLabel("Jun 2026"),  { year: 2026, month: 6 });
    assert.deepEqual(parseMonthLabel("Jul 2026"),  { year: 2026, month: 7 });
    assert.deepEqual(parseMonthLabel("Aug 2026"),  { year: 2026, month: 8 });
    assert.deepEqual(parseMonthLabel("Sep 2026"),  { year: 2026, month: 9 });
    assert.deepEqual(parseMonthLabel("Okt 2026"),  { year: 2026, month: 10 });
    assert.deepEqual(parseMonthLabel("Nov 2026"),  { year: 2026, month: 11 });
    assert.deepEqual(parseMonthLabel("Dez 2026"),  { year: 2026, month: 12 });
  });

  // ── Happy path: English full names ─────────────────────────────────────
  test("parses English full month names", () => {
    assert.deepEqual(parseMonthLabel("January 2026"),   { year: 2026, month: 1 });
    assert.deepEqual(parseMonthLabel("February 2026"),  { year: 2026, month: 2 });
    assert.deepEqual(parseMonthLabel("March 2026"),     { year: 2026, month: 3 });
    assert.deepEqual(parseMonthLabel("May 2026"),       { year: 2026, month: 5 });
    assert.deepEqual(parseMonthLabel("October 2026"),   { year: 2026, month: 10 });
    assert.deepEqual(parseMonthLabel("December 2026"),  { year: 2026, month: 12 });
  });

  // ── Happy path: English abbreviations ──────────────────────────────────
  test("parses English abbreviated month names", () => {
    assert.deepEqual(parseMonthLabel("Jan 2025"), { year: 2025, month: 1 });
    assert.deepEqual(parseMonthLabel("Mar 2025"), { year: 2025, month: 3 });
    assert.deepEqual(parseMonthLabel("Oct 2025"), { year: 2025, month: 10 });
    assert.deepEqual(parseMonthLabel("Dec 2025"), { year: 2025, month: 12 });
  });

  // ── Mixed case ─────────────────────────────────────────────────────────
  test("is case-insensitive", () => {
    assert.deepEqual(parseMonthLabel("JANUAR 2026"),    { year: 2026, month: 1 });
    assert.deepEqual(parseMonthLabel("january 2025"),   { year: 2025, month: 1 });
    assert.deepEqual(parseMonthLabel("DECEMBER 2024"),  { year: 2024, month: 12 });
  });

  // ── Trailing punctuation ───────────────────────────────────────────────
  test("strips trailing punctuation from month name", () => {
    assert.deepEqual(parseMonthLabel("Jan. 2026"), { year: 2026, month: 1 });
    assert.deepEqual(parseMonthLabel("Feb, 2026"), { year: 2026, month: 2 });
  });

  // ── Extra whitespace ───────────────────────────────────────────────────
  test("handles extra whitespace", () => {
    assert.deepEqual(parseMonthLabel("  Januar   2026  "), { year: 2026, month: 1 });
  });

  // ── 2-digit years ──────────────────────────────────────────────────────
  test("expands 2-digit years to 4-digit", () => {
    assert.deepEqual(parseMonthLabel("Jan 26"), { year: 2026, month: 1 });
    assert.deepEqual(parseMonthLabel("Dez 99"), { year: 2099, month: 12 });
    assert.deepEqual(parseMonthLabel("Jan 00"), { year: 2000, month: 1 });
  });

  // ── Invalid inputs ─────────────────────────────────────────────────────
  test("returns null for invalid inputs", () => {
    assert.equal(parseMonthLabel(null),           null, "null");
    assert.equal(parseMonthLabel(undefined),      null, "undefined");
    assert.equal(parseMonthLabel(""),             null, "empty string");
    assert.equal(parseMonthLabel("2026"),         null, "year only");
    assert.equal(parseMonthLabel("Gibberish 2026"), null, "unknown month");
    assert.equal(parseMonthLabel("Januar"),       null, "no year");
    assert.equal(parseMonthLabel("Januar 1999"),  null, "year < 2000");
    assert.equal(parseMonthLabel("Januar 2101"),  null, "year > 2100");
  });
});

describe("sortMonthLabels", () => {
  test("sorts month labels chronologically", () => {
    const input = ["März 2026", "Januar 2026", "Dezember 2025", "Februar 2026"];
    const sorted = sortMonthLabels(input);
    assert.deepEqual(sorted, ["Dezember 2025", "Januar 2026", "Februar 2026", "März 2026"]);
  });

  test("appends unparseable labels at end", () => {
    const input = ["Januar 2026", "INVALID", "März 2026"];
    const sorted = sortMonthLabels(input);
    assert.equal(sorted[sorted.length - 1], "INVALID");
  });
});
