/* ------------------------------------------------ */
/* ODIN ASSIGNMENT ENGINE – CONSTANTS               */
/* Deterministic, auditable, no magic values.       */
/* ------------------------------------------------ */

/**
 * All operational roles recognized by the engine.
 * Must stay in sync with Frontend dispatcher.types.ts
 */
export const ROLE_CODES = [
  "dispatcher",
  "crossconnect",
  "smarthands",
  "project",
  "deutsche_boerse",
  "kolo",
  "neustarter",
  "buddy",
  "leads",
  "large_order",
  "support",
];

/** Roles that must NEVER receive auto-assigned tickets */
export const NO_TICKET_ROLES = [
  "dispatcher",
  "project",
  "leads",
  "large_order",
];

/** Queue type canonical values */
export const QUEUE_TYPE = {
  SMART_HANDS: "SmartHands",
  TROUBLE_TICKETS: "TroubleTickets",
  CROSS_CONNECT: "CCInstalls",
};

/**
 * Priority tiers (lower number = higher priority).
 * Deterministic order per specification:
 *
 * 1. Trouble Ticket High
 * 2. Trouble Ticket Medium
 * 3. KPI-relevant tickets by remaining time (SH, CC)
 * 4. Scheduled Tickets
 * 5. Trouble Ticket Low
 * 6. Remaining SH + CC by remaining time
 */
export const PRIORITY_TIER = {
  TT_HIGH: 1,
  TT_MEDIUM: 2,
  KPI_REMAINING: 3,
  SCHEDULED: 4,
  TT_LOW: 5,
  REMAINING_SH_CC: 6,
};

/** Decision types for assignment_decisions */
export const DECISION_TYPE = {
  ASSIGNED: "assigned",
  SKIPPED_NO_CANDIDATES: "skipped_no_candidates",
  SKIPPED_MANUAL_EXCLUSION: "skipped_manual_exclusion",
  SKIPPED_STALE_DATA: "skipped_stale_data",
  SKIPPED_ROLE_CONFLICT: "skipped_role_conflict",
  ERROR: "error",
};

/** Handover types */
export const HANDOVER_TYPE = {
  WORKLOAD: "Workload",
  TERMINIERT: "Terminiert",
  OTHER_TEAMS: "Other Teams",
};

/** Default engine configuration (matches assignment_config seed) */
export const DEFAULT_CONFIG = {
  engine_mode: "shadow",
  stale_threshold_minutes: 10,
  max_tickets_per_person_sh: 3,
  similar_remaining_hours_threshold: 6, // ARBEITSDEFINITION – nicht final bestätigt
  enabled: false,
};
