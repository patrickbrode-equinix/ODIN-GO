/* ---------------------------------------------------------------- */
/* ODIN ENGINE – Deterministic unit tests                           */
/* Run:  node Backend/engine/engine.test.js                         */
/* ---------------------------------------------------------------- */

import { scoreTicket, prioritizeTickets } from "./prioritize.js";
import { filterCandidates, rankCandidates } from "./filterCandidates.js";
import { ROLE_CODES, NO_TICKET_ROLES, PRIORITY_TIER, QUEUE_TYPE } from "./constants.js";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}`);
  }
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

/* ================================================================ */
/* 1. PRIORITY / SCORING                                            */
/* ================================================================ */
section("Priority: TT tickets ordered by severity");

(() => {
  const ttHigh = scoreTicket({ queue_type: "TroubleTickets", remaining_hours: 4, severity: "high" }, new Set());
  const ttMed  = scoreTicket({ queue_type: "TroubleTickets", remaining_hours: 4, severity: "medium" }, new Set());
  const ttLow  = scoreTicket({ queue_type: "TroubleTickets", remaining_hours: 4, severity: "low" }, new Set());

  assert(ttHigh.tier === PRIORITY_TIER.TT_HIGH, "TT high → tier 1");
  assert(ttMed.tier === PRIORITY_TIER.TT_MEDIUM, "TT medium → tier 2");
  assert(ttLow.tier === PRIORITY_TIER.TT_LOW, "TT low → tier 5");
  assert(ttHigh.tier < ttMed.tier, "TT High before TT Medium");
  assert(ttMed.tier < ttLow.tier, "TT Medium before TT Low");
})();

section("Priority: KPI SH/CC by remaining time");

(() => {
  const sh12h = scoreTicket({ queue_type: "SmartHands", remaining_hours: 12 }, new Set());
  const sh48h = scoreTicket({ queue_type: "SmartHands", remaining_hours: 48 }, new Set());
  const shNone = scoreTicket({ queue_type: "SmartHands" }, new Set());

  assert(sh12h.tier === PRIORITY_TIER.KPI_REMAINING, "SH with remaining_hours → KPI tier 3");
  assert(shNone.tier === PRIORITY_TIER.REMAINING_SH_CC, "SH without remaining → tier 6");
  assert(sh12h.subScore < sh48h.subScore, "12h remaining ranked before 48h");
})();

section("Priority: Scheduled tickets → tier 4");

(() => {
  const future = new Date(Date.now() + 86400000).toISOString();
  const sched = scoreTicket({
    queue_type: "SmartHands",
    remaining_hours: 100,
    sched_start: future,
  }, new Set());
  assert(sched.tier === PRIORITY_TIER.SCHEDULED, "Scheduled → tier 4");
})();

section("Priority: Manual exclusion → tier 999");

(() => {
  const exclusions = new Set(["EXCLUDED-SYS"]);
  const excluded = scoreTicket(
    { queue_type: "SmartHands", remaining_hours: 4, system_name: "EXCLUDED-SYS" },
    exclusions
  );
  assert(excluded.excluded === true, "Excluded flag set");
  assert(excluded.tier === 999, "Excluded → tier 999");
})();

section("Priority: prioritizeTickets sort order");

(() => {
  const tickets = [
    { id: 1, queue_type: "SmartHands", remaining_hours: 100 },
    { id: 2, queue_type: "TroubleTickets", remaining_hours: 4, severity: "high" },
    { id: 3, queue_type: "CCInstalls", remaining_hours: 8 },
    { id: 4, queue_type: "TroubleTickets", remaining_hours: 2, severity: "medium" },
  ];
  const sorted = prioritizeTickets(tickets, new Set());
  assert(sorted[0].ticket.id === 2, "First: TT high");
  assert(sorted[1].ticket.id === 4, "Second: TT medium");
  assert(sorted[2].ticket.id === 3, "Third: CC KPI (remaining_hours=8)");
  assert(sorted[3].ticket.id === 1, "Last: SH remaining_hours=100 (KPI tier 3, but higher subScore)");
})();

/* ================================================================ */
/* 2. FILTER CANDIDATES                                             */
/* ================================================================ */
section("FilterCandidates: ABW excluded");

(() => {
  const candidates = [
    { name: "Alpha", shift: "ABW", roles: ["smarthands"], assignedCount: 0, assignedSystemNames: [], currentQueueType: null },
    { name: "Bravo", shift: "E1", roles: ["smarthands"], assignedCount: 0, assignedSystemNames: [], currentQueueType: null },
  ];
  const result = filterCandidates({ queue_type: "SmartHands" }, candidates, { max_tickets_per_person_sh: 3 });
  assert(result.eligible.length === 1, "ABW candidate filtered out");
  assert(result.eligible[0].name === "Bravo", "Non-ABW candidate kept");
})();

section("FilterCandidates: NO_TICKET_ROLES excluded");

(() => {
  const candidates = [
    { name: "Dispatcher Dan", shift: "E1", roles: ["dispatcher"], assignedCount: 0, assignedSystemNames: [], currentQueueType: null },
    { name: "Project Pat", shift: "E1", roles: ["project"], assignedCount: 0, assignedSystemNames: [], currentQueueType: null },
    { name: "Worker Will", shift: "E1", roles: ["smarthands"], assignedCount: 0, assignedSystemNames: [], currentQueueType: null },
  ];
  const result = filterCandidates({ queue_type: "SmartHands" }, candidates, { max_tickets_per_person_sh: 3 });
  assert(result.eligible.length === 1, "Dispatcher and Project roles excluded");
  assert(result.eligible[0].name === "Worker Will", "Only smarthands kept");
})();

section("FilterCandidates: deutsche_boerse only gets TT or CC>24h");

(() => {
  const candidates = [
    { name: "DB Guy", shift: "E1", roles: ["deutsche_boerse"], assignedCount: 0, assignedSystemNames: [], currentQueueType: null },
  ];
  const shTicket = { queue_type: "SmartHands", remaining_hours: 10 };
  const ttTicket = { queue_type: "TroubleTickets", remaining_hours: 4, severity: "high" };
  const cc30h = { queue_type: "CCInstalls", remaining_hours: 30 };

  const r1 = filterCandidates(shTicket, candidates, { max_tickets_per_person_sh: 3 });
  assert(r1.eligible.length === 0, "DB excluded from SH tickets");

  const r2 = filterCandidates(ttTicket, candidates, { max_tickets_per_person_sh: 3 });
  assert(r2.eligible.length === 1, "DB allowed for TT tickets");

  const r3 = filterCandidates(cc30h, candidates, { max_tickets_per_person_sh: 3 });
  assert(r3.eligible.length === 1, "DB allowed for CC >24h");
})();

section("FilterCandidates: Sortenreinheit (sort purity)");

(() => {
  const shWorker = {
    name: "SH Only", shift: "E1", roles: ["smarthands"],
    currentQueueType: "SmartHands", assignedCount: 1, assignedSystemNames: ["X"],
  };
  const ccWorker = {
    name: "CC Only", shift: "E1", roles: ["crossconnect"],
    currentQueueType: "CCInstalls", assignedCount: 1, assignedSystemNames: ["Y"],
  };
  const clean = {
    name: "Fresh", shift: "E1", roles: ["smarthands"],
    currentQueueType: null, assignedCount: 0, assignedSystemNames: [],
  };

  const r1 = filterCandidates({ queue_type: "CCInstalls" }, [shWorker, clean], { max_tickets_per_person_sh: 3 });
  assert(!r1.eligible.find(c => c.name === "SH Only"), "SH worker excluded from CC");
  assert(r1.eligible.find(c => c.name === "Fresh"), "Fresh worker allowed for CC");

  const r2 = filterCandidates({ queue_type: "SmartHands" }, [ccWorker, clean], { max_tickets_per_person_sh: 3 });
  assert(!r2.eligible.find(c => c.name === "CC Only"), "CC worker excluded from SH");
})();

section("FilterCandidates: max_tickets_per_person_sh limit");

(() => {
  const overloaded = {
    name: "Busy Bob", shift: "E1", roles: ["smarthands"],
    currentQueueType: "SmartHands", assignedCount: 3, assignedSystemNames: [],
  };
  const result = filterCandidates({ queue_type: "SmartHands" }, [overloaded], { max_tickets_per_person_sh: 3 });
  assert(result.eligible.length === 0, "Person at SH limit excluded from further SH");
})();

section("FilterCandidates: crossconnect role only gets CC tickets");

(() => {
  const ccOnly = {
    name: "CC Specialist", shift: "E1", roles: ["crossconnect"],
    currentQueueType: null, assignedCount: 0, assignedSystemNames: [],
  };
  const shResult = filterCandidates({ queue_type: "SmartHands" }, [ccOnly], { max_tickets_per_person_sh: 3 });
  const ccResult = filterCandidates({ queue_type: "CCInstalls" }, [ccOnly], { max_tickets_per_person_sh: 3 });

  assert(shResult.eligible.length === 0, "CC specialist excluded from SH");
  assert(ccResult.eligible.length === 1, "CC specialist allowed for CC");
})();

/* ================================================================ */
/* 3. RANK CANDIDATES                                               */
/* ================================================================ */
section("RankCandidates: same system_name preferred");

(() => {
  const eligible = [
    { name: "Alice", assignedCount: 1, assignedSystemNames: ["OTHER"] },
    { name: "Bob", assignedCount: 1, assignedSystemNames: ["TARGET-SYS"] },
    { name: "Carol", assignedCount: 0, assignedSystemNames: [] },
  ];
  const ranked = rankCandidates({ system_name: "TARGET-SYS", queue_type: "SmartHands" }, eligible);
  assert(ranked[0].name === "Bob", "Bob (same system_name) ranked first");
})();

section("RankCandidates: fewer tickets preferred");

(() => {
  const eligible = [
    { name: "Busy", assignedCount: 2, assignedSystemNames: [] },
    { name: "Light", assignedCount: 0, assignedSystemNames: [] },
  ];
  const ranked = rankCandidates({ system_name: "UNRELATED", queue_type: "SmartHands" }, eligible);
  assert(ranked[0].name === "Light", "Lighter load ranked first");
})();

section("RankCandidates: alphabetical tiebreak");

(() => {
  const eligible = [
    { name: "Zach", assignedCount: 0, assignedSystemNames: [] },
    { name: "Anna", assignedCount: 0, assignedSystemNames: [] },
  ];
  const ranked = rankCandidates({ system_name: "X", queue_type: "SmartHands" }, eligible);
  assert(ranked[0].name === "Anna", "Anna before Zach alphabetically");
})();

/* ================================================================ */
/* SUMMARY                                                          */
/* ================================================================ */
console.log(`\n${"═".repeat(40)}`);
console.log(`RESULTS: ${passed} passed, ${failed} failed`);
console.log(`${"═".repeat(40)}`);

if (failed > 0) process.exit(1);
