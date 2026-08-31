/* ------------------------------------------------ */
/* COMMIT – TYPES                                  */
/* ------------------------------------------------ */

export interface CommitTicket {
  id: number;

  /* ------------------------------ */
  /* CORE FIELDS (EXCEL)            */
  /* ------------------------------ */
  systemName: string;
  salesOrder: string;
  activityNumber: string;
  activityType: string;
  activityStatus: string;
  owner: string;
  activitySubType: string;
  group: string;
  remainingRaw: string;
  commitDate: string;

  /* ------------------------------ */
  /* NEW FIELDS (EXCEL)             */
  /* ------------------------------ */
  expediteFlag?: string; // e.g. "Y", "Yes", "True", "1", "Expedite"
  migration?: string;    // e.g. "Y", "Yes", "True", "1", "Migration"
  serialNumber?: string; // "Serial #"
  maintenanceStart?: string; // "Maintenance Start Date/Time"
  product?: string;
  ibx?: string;
}

export interface EnrichedCommitTicket extends CommitTicket {
  /* ------------------------------ */
  /* DERIVED FIELDS (APP)           */
  /* ------------------------------ */
  commitHours: number | null;
  isComplianceRelevant: boolean;

  /* ------------------------------ */
  /* NORMALIZED FLAGS (APP)         */
  /* ------------------------------ */
  isExpedite: boolean;
  isMigration: boolean;
}

export type ActivityStatus =
  | "Open"
  | "In Progress"
  | "Scheduled"
  | "Completed"
  | "all";

export type FilterMode =
  | "all"
  | "next24"
  | "more24"
  | "missed"
  | "compliance";
