/**
 * backend/tests/dateParser.test.js
 *
 * Unit tests for dateParser.js helpers.
 * Verifies timezone-safe parsing for all formats the crawler sends.
 *
 * Critical invariant:
 *   parseAnyDateToIso(localDateString) must return a UTC ISO string whose
 *   local-time representation equals the original input time.
 *
 * Run: node --test tests/dateParser.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCommitDateToMs, parseAnyDateToIso, formatRemainingFromCommit } from "../lib/dateParser.js";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers                                                                     */
/* ─────────────────────────────────────────────────────────────────────────── */

/** Round a Date to whole seconds (removes sub-second noise). */
function roundS(ms) { return Math.round(ms / 1000) * 1000; }

/**
 * Expected UTC ms for a given LOCAL datetime on the machine running the test.
 * Uses the same new Date(y, m-1, d, h, mi, s) convention as dateParser.js.
 */
function localMs(y, mo, d, h = 0, mi = 0, s = 0) {
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

const TZ_OFFSET_H = -new Date(2026, 2, 6).getTimezoneOffset() / 60; // e.g. +1 for CET

/* ─────────────────────────────────────────────────────────────────────────── */
/*  parseCommitDateToMs                                                         */
/* ─────────────────────────────────────────────────────────────────────────── */
describe("parseCommitDateToMs", () => {

  test("returns null for null/empty input", () => {
    assert.strictEqual(parseCommitDateToMs(null), null);
    assert.strictEqual(parseCommitDateToMs(""), null);
    assert.strictEqual(parseCommitDateToMs("   "), null);
  });

  test("DE: '06.03.2026 14:00' → local 14:00", () => {
    const ms = parseCommitDateToMs("06.03.2026 14:00");
    assert.ok(ms !== null);
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 14, 0)));
  });

  test("DE: '06.03.2026' (date only, no time) → midnight local", () => {
    const ms = parseCommitDateToMs("06.03.2026");
    assert.ok(ms !== null);
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 0, 0)));
  });

  test("US: '3/6/2026, 2:00 PM' → local 14:00 (Jarvis EMEA format)", () => {
    const ms = parseCommitDateToMs("3/6/2026, 2:00 PM");
    assert.ok(ms !== null);
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 14, 0)));
  });

  test("US: '3/6/2026, 12:00 AM' → local 00:00 (midnight)", () => {
    const ms = parseCommitDateToMs("3/6/2026, 12:00 AM");
    assert.ok(ms !== null);
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 0, 0)));
  });

  test("US: '3/6/2026, 12:00 PM' → local 12:00 (noon)", () => {
    const ms = parseCommitDateToMs("3/6/2026, 12:00 PM");
    assert.ok(ms !== null);
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 12, 0)));
  });

  test("US date-only: '3/6/2026' → midnight local", () => {
    const ms = parseCommitDateToMs("3/6/2026");
    assert.ok(ms !== null);
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 0, 0)));
  });

  test("ISO local (no Z): '2026-03-06T14:00:00' → local 14:00", () => {
    const ms = parseCommitDateToMs("2026-03-06T14:00:00");
    assert.ok(ms !== null);
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 14, 0)));
  });

  test("ISO UTC (Z suffix): '2026-03-06T13:00:00.000Z' → UTC 13:00", () => {
    const ms = parseCommitDateToMs("2026-03-06T13:00:00.000Z");
    assert.ok(ms !== null);
    // UTC 13:00 = local 14:00 CET (+1) → same ms
    assert.strictEqual(roundS(ms), roundS(localMs(2026, 3, 6, 14, 0)));
  });

  test("returns null for nonsense input", () => {
    assert.strictEqual(parseCommitDateToMs("not-a-date"), null);
  });
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  parseAnyDateToIso – timezone roundtrip                                      */
/*                                                                              */
/*  KEY INVARIANT for timezone correctness:                                     */
/*    parseAnyDateToIso(input) must return an ISO string such that              */
/*    new Date(result).getTime() === expected LOCAL time in ms.                 */
/*  This ensures the DB stores the correct UTC face value, and after applying   */
/*  the TIMESTAMP type parser fix in db.js, reads back the same value.          */
/* ─────────────────────────────────────────────────────────────────────────── */
describe("parseAnyDateToIso – timezone invariant", () => {

  function assertRoundtrip(input, expectedLocalMs, label) {
    const iso = parseAnyDateToIso(input);
    assert.ok(iso !== null, `${label}: should not return null`);
    assert.ok(iso.endsWith("Z") || !iso.includes("+"), `${label}: should return a UTC ISO string (ends with Z)`);
    const parsed = new Date(iso).getTime();
    assert.strictEqual(
      roundS(parsed), roundS(expectedLocalMs),
      `${label}: roundtrip mismatch.\n  ISO: ${iso}\n  parsed UTC ms: ${parsed}\n  expected UTC ms: ${expectedLocalMs}`
    );
  }

  test("US '3/6/2026, 2:00 PM' → UTC ms for local 14:00", () => {
    assertRoundtrip("3/6/2026, 2:00 PM", localMs(2026, 3, 6, 14, 0), "US PM");
  });

  test("US '3/6/2026, 3:00 PM' → UTC ms for local 15:00", () => {
    assertRoundtrip("3/6/2026, 3:00 PM", localMs(2026, 3, 6, 15, 0), "US PM 15:00");
  });

  test("DE '06.03.2026 14:00' → UTC ms for local 14:00", () => {
    assertRoundtrip("06.03.2026 14:00", localMs(2026, 3, 6, 14, 0), "DE format");
  });

  test("ISO local '2026-03-06T14:00:00' → UTC ms for local 14:00", () => {
    assertRoundtrip("2026-03-06T14:00:00", localMs(2026, 3, 6, 14, 0), "ISO local");
  });

  test("ISO UTC '2026-03-06T13:00:00.000Z' → UTC ms for UTC 13:00 (local 14:00 CET)", () => {
    assertRoundtrip("2026-03-06T13:00:00.000Z", localMs(2026, 3, 6, 14, 0), "ISO Z");
  });

  test("returns null for empty/null input", () => {
    assert.strictEqual(parseAnyDateToIso(null), null);
    assert.strictEqual(parseAnyDateToIso(""), null);
  });
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Remaining time calculation matches expected                                 */
/*  Tests the concrete examples from the bug report.                            */
/* ─────────────────────────────────────────────────────────────────────────── */
describe("Remaining time precision – bug-report examples", () => {

  /**
   * Simulate getRemainingMs(ticket) logic (mirrors ticketColors.ts + slaCalc.js).
   * Uses a fixed "now" so tests are deterministic.
   */
  function getRemainingMsAt(isoDate, nowMs) {
    if (!isoDate) return null;
    const target = new Date(isoDate).getTime();
    if (!Number.isFinite(target)) return null;
    return target - nowMs;
  }

  // now = 06.03.2026 12:45:00 local CET
  const nowMs = localMs(2026, 3, 6, 12, 45, 0);

  test("commit 14:00 local → 75 min remaining at 12:45", () => {
    // Simulate what the API sends: parseAnyDateToIso of the raw crawler string
    const isoDate = parseAnyDateToIso("3/6/2026, 2:00 PM");
    const rem = getRemainingMsAt(isoDate, nowMs);
    assert.ok(rem !== null);
    const remMin = Math.round(rem / 60000);
    assert.strictEqual(remMin, 75, `Expected 75 min, got ${remMin} min`);
  });

  test("commit 15:00 local → 135 min remaining at 12:45", () => {
    const isoDate = parseAnyDateToIso("3/6/2026, 3:00 PM");
    const rem = getRemainingMsAt(isoDate, nowMs);
    assert.ok(rem !== null);
    const remMin = Math.round(rem / 60000);
    assert.strictEqual(remMin, 135, `Expected 135 min, got ${remMin} min`);
  });

  test("commit 12:30 local → -15 min at 12:45 (overdue)", () => {
    const isoDate = parseAnyDateToIso("3/6/2026, 12:30 PM");
    const rem = getRemainingMsAt(isoDate, nowMs);
    assert.ok(rem !== null);
    const remMin = Math.round(rem / 60000);
    assert.strictEqual(remMin, -15, `Expected -15 min, got ${remMin} min`);
  });

  test("DE format: commit '06.03.2026 14:00' → 75 min at 12:45", () => {
    const isoDate = parseAnyDateToIso("06.03.2026 14:00");
    const rem = getRemainingMsAt(isoDate, nowMs);
    assert.ok(rem !== null);
    const remMin = Math.round(rem / 60000);
    assert.strictEqual(remMin, 75, `Expected 75 min, got ${remMin} min`);
  });

  test("no ±1h offset for any format", () => {
    const inputs = [
      "3/6/2026, 2:00 PM",
      "06.03.2026 14:00",
      "2026-03-06T14:00:00",
      "2026-03-06T13:00:00.000Z", // UTC, represents 14:00 CET
    ];
    for (const input of inputs) {
      const iso = parseAnyDateToIso(input);
      const rem = getRemainingMsAt(iso, nowMs);
      const remMin = Math.round(rem / 60000);
      assert.strictEqual(
        remMin, 75,
        `Input "${input}" gave ${remMin} min remaining, expected 75 min (no ±1h offset)`
      );
    }
  });
});
