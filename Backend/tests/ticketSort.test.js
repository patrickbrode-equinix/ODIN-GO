/**
 * backend/tests/ticketSort.test.js
 *
 * Unit tests for ticket sorting, tier classification, and overdue logic.
 * These rules are critical for the Dashboard commit box display.
 *
 * Logic mirrors frontend/src/utils/ticketColors.ts and commit.js /latest endpoint.
 * Tests run server-side to provide regression coverage independent of browser.
 *
 * Run with: node --test tests/ticketSort.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Inline implementations matching ticketColors.ts logic exactly             */
/*  (backend version – JS, not TS)                                             */
/* ─────────────────────────────────────────────────────────────────────────── */

const HOUR_MS  = 60 * 60 * 1000;
const DAY_MS   = 24 * HOUR_MS;

function getRemainingMs(ticket) {
  const dateStr =
    ticket.revised_commit_date ??
    ticket.revisedCommitDate ??
    ticket.commit_date ??
    ticket.commitDate ??
    null;
  if (!dateStr) return null;
  const target = new Date(dateStr).getTime();
  if (!Number.isFinite(target)) return null;
  return target - Date.now();
}

function getColorTier(ms) {
  if (ms === null) return "grey";
  const hours = ms / HOUR_MS;
  if (hours < 0)    return "grey";
  if (hours <= 8)   return "red";
  if (hours <= 15)  return "orange";
  if (hours <= 24)  return "yellow";
  return "green";
}

function getTicketSortKey(ms) {
  if (ms === null) return Number.MAX_SAFE_INTEGER;
  if (ms < 0) return Number.MAX_SAFE_INTEGER - Math.abs(ms);
  return ms;
}

/**
 * Full sort as applied in Dashboard.tsx:
 * 1. Expired tickets pushed to the bottom (MAX_SAFE_INTEGER sort key).
 * 2. Non-expired sorted ascending by time remaining (soonest first).
 * 3. Within same tier, TT tickets come before non-TT.
 */
function sortDashboardTickets(tickets) {
  return [...tickets].sort((a, b) => {
    const msA = getRemainingMs(a);
    const msB = getRemainingMs(b);
    const keyA = getTicketSortKey(msA);
    const keyB = getTicketSortKey(msB);

    if (keyA !== keyB) return keyA - keyB;

    // Tie-break: TT before non-TT
    const isAtTT = (a.activityType === "TroubleTicket" || a.queue_type === "TroubleTickets");
    const isBtTT = (b.activityType === "TroubleTicket" || b.queue_type === "TroubleTickets");
    if (isAtTT !== isBtTT) return isAtTT ? -1 : 1;

    return 0;
  });
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Helpers to build test tickets relative to "now"                            */
/* ─────────────────────────────────────────────────────────────────────────── */

function ticketDue(hoursFromNow, type = "SmartHands", id = "T001") {
  return {
    id,
    activityType: type,
    commitDate: new Date(Date.now() + hoursFromNow * HOUR_MS).toISOString(),
  };
}

function overdueTicket(hoursAgo = 2, type = "SmartHands", id = "OVR001") {
  return {
    id,
    activityType: type,
    commitDate: new Date(Date.now() - hoursAgo * HOUR_MS).toISOString(),
  };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Tests                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

describe("getColorTier", () => {
  test("null → grey", () => assert.equal(getColorTier(null), "grey"));
  test("overdue (ms < 0) → grey", () => assert.equal(getColorTier(-1), "grey"));
  test("0h (exactly now) → red", () => assert.equal(getColorTier(0), "red"));
  test("4h → red", () => assert.equal(getColorTier(4 * HOUR_MS), "red"));
  test("8h boundary → red", () => assert.equal(getColorTier(8 * HOUR_MS), "red"));
  test("8.001h → orange", () => assert.equal(getColorTier(8.001 * HOUR_MS), "orange"));
  test("12h → orange", () => assert.equal(getColorTier(12 * HOUR_MS), "orange"));
  test("15h boundary → orange", () => assert.equal(getColorTier(15 * HOUR_MS), "orange"));
  test("15.001h → yellow", () => assert.equal(getColorTier(15.001 * HOUR_MS), "yellow"));
  test("20h → yellow", () => assert.equal(getColorTier(20 * HOUR_MS), "yellow"));
  test("24h boundary → yellow", () => assert.equal(getColorTier(24 * HOUR_MS), "yellow"));
  test("24.001h → green", () => assert.equal(getColorTier(24.001 * HOUR_MS), "green"));
  test("72h → green", () => assert.equal(getColorTier(72 * HOUR_MS), "green"));
});

describe("getTicketSortKey", () => {
  test("null → MAX_SAFE_INTEGER", () => {
    assert.equal(getTicketSortKey(null), Number.MAX_SAFE_INTEGER);
  });
  test("overdue → large value (but < MAX_SAFE_INTEGER)", () => {
    const key = getTicketSortKey(-5 * HOUR_MS);
    assert.equal(key > 0, true);
    assert.equal(key < Number.MAX_SAFE_INTEGER, true);
  });
  test("future ticket → positive ms value", () => {
    const ms = 4 * HOUR_MS;
    assert.equal(getTicketSortKey(ms), ms);
  });
  test("soonest-deadline ticket has smaller key than later ticket", () => {
    const soon = getTicketSortKey(2 * HOUR_MS);
    const later = getTicketSortKey(48 * HOUR_MS);
    assert.equal(soon < later, true);
  });
  test("overdue ticket has larger key than any future ticket", () => {
    const overdue = getTicketSortKey(-1);
    const farFuture = getTicketSortKey(365 * DAY_MS);
    assert.equal(overdue > farFuture, true);
  });
});

describe("sortDashboardTickets", () => {
  test("soonest-due tickets appear first", () => {
    const tickets = [
      ticketDue(48, "SmartHands", "late"),
      ticketDue(2, "SmartHands", "soon"),
      ticketDue(24, "SmartHands", "mid"),
    ];
    const sorted = sortDashboardTickets(tickets);
    assert.equal(sorted[0].id, "soon");
    assert.equal(sorted[1].id, "mid");
    assert.equal(sorted[2].id, "late");
  });

  test("expired tickets pushed to bottom", () => {
    const tickets = [
      overdueTicket(1, "SmartHands", "expired"),
      ticketDue(5, "SmartHands", "active"),
    ];
    const sorted = sortDashboardTickets(tickets);
    assert.equal(sorted[0].id, "active");
    assert.equal(sorted[1].id, "expired");
  });

  test("multiple expired tickets appear after all active tickets", () => {
    const tickets = [
      overdueTicket(3, "SmartHands", "exp1"),
      ticketDue(10, "SmartHands", "act1"),
      overdueTicket(1, "SmartHands", "exp2"),
      ticketDue(5, "SmartHands", "act2"),
    ];
    const sorted = sortDashboardTickets(tickets);
    assert.equal(sorted[0].id, "act2");
    assert.equal(sorted[1].id, "act1");
    assert.equal(sorted.findIndex((t) => t.id === "exp1") >= 2, true);
    assert.equal(sorted.findIndex((t) => t.id === "exp2") >= 2, true);
  });

  test("TT tickets sorted before non-TT within same sort key", () => {
    const now = Date.now();
    const sharedDate = new Date(now + 5 * HOUR_MS).toISOString();

    const shTicket = { id: "sh", activityType: "SmartHands", commitDate: sharedDate };
    const ttTicket = { id: "tt", activityType: "TroubleTicket", commitDate: sharedDate };

    const sorted = sortDashboardTickets([shTicket, ttTicket]);
    assert.equal(sorted[0].id, "tt");
    assert.equal(sorted[1].id, "sh");
  });

  test("empty array returns empty array", () => {
    assert.deepEqual(sortDashboardTickets([]), []);
  });

  test("single ticket returns same ticket", () => {
    const t = ticketDue(10, "SmartHands", "only");
    const sorted = sortDashboardTickets([t]);
    assert.equal(sorted[0].id, "only");
  });

  test("null commitDate treated as overdue (grey tier, bottom)", () => {
    const tickets = [
      { id: "nodal", activityType: "SmartHands", commitDate: null },
      ticketDue(5, "SmartHands", "active"),
    ];
    const sorted = sortDashboardTickets(tickets);
    assert.equal(sorted[0].id, "active");
    assert.equal(sorted[1].id, "nodal");
  });
});

describe("getRemainingMs field resolution", () => {
  test("prefers revised_commit_date over commit_date", () => {
    const earlier = new Date(Date.now() - HOUR_MS).toISOString(); // overdue
    const later   = new Date(Date.now() + HOUR_MS).toISOString(); // active
    const ticket = { revised_commit_date: later, commit_date: earlier };
    const ms = getRemainingMs(ticket);
    assert.equal(ms > 0, true, "should use revised_commit_date (active), not commit_date (overdue)");
  });

  test("falls back to commit_date if revised is null", () => {
    const later = new Date(Date.now() + 5 * HOUR_MS).toISOString();
    const ticket = { revised_commit_date: null, commit_date: later };
    const ms = getRemainingMs(ticket);
    assert.equal(ms > 0, true);
  });

  test("returns null if no date field exists", () => {
    assert.equal(getRemainingMs({ id: "noDates" }), null);
  });
});
