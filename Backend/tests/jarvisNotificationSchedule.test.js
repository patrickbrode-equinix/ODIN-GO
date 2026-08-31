import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getCurrentNotificationOccurrenceKeys,
  getNotificationOccurrenceKey,
} from "../lib/jarvisNotificationSchedule.js";

describe("Jarvis notification occurrence schedule", () => {
  it("uses the Europe/Berlin calendar day", () => {
    const instant = new Date("2027-01-03T23:30:00.000Z");
    assert.equal(getNotificationOccurrenceKey("daily", instant), "daily:2027-01-04");
    assert.equal(getNotificationOccurrenceKey("weekly", instant), "weekly:2027-W01");
    assert.equal(getNotificationOccurrenceKey("monthly", instant), "monthly:2027-01");
  });

  it("uses the ISO week-year at year boundaries", () => {
    assert.equal(
      getNotificationOccurrenceKey("weekly", new Date("2027-01-01T12:00:00.000Z")),
      "weekly:2026-W53",
    );
  });

  it("returns stable keys for all repeating periods", () => {
    const instant = new Date("2026-08-20T10:00:00.000Z");
    assert.equal(getNotificationOccurrenceKey("once", instant), "once");
    assert.deepEqual(getCurrentNotificationOccurrenceKeys(instant), {
      daily: "daily:2026-08-20",
      weekly: "weekly:2026-W34",
      monthly: "monthly:2026-08",
    });
  });
});
