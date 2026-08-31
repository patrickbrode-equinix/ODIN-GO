/* ------------------------------------------------ */
/* HANDOVER – TYPES (SINGLE SOURCE OF TRUTH)        */
/* ------------------------------------------------ */

/* ------------------------------------------------ */
/* ENUM-LIKE UNIONS                                 */
/* ------------------------------------------------ */

export type HandoverPriority = "Critical" | "High" | "Medium" | "Low";

export type HandoverStatus =
  | "Offen"
  | "Übernommen"
  | "In Bearbeitung"
  | "Erledigt";

export type HandoverType = "Workload" | "Terminiert" | "Other Teams" | "Task" | "Manual";

/* ------------------------------------------------ */
/* FILE TYPE                                        */
/* ------------------------------------------------ */

export interface HandoverFile {
  id: number;
  filename: string;
  url: string;
}

/* ------------------------------------------------ */
/* USER REFERENCE (FUTURE-PROOF)                    */
/* ------------------------------------------------ */
/**
 * Noch nicht aktiv genutzt.
 * Dient als Vorbereitung für:
 * - echte User
 * - Shiftplan
 * - Dispatcher Console
 */
export interface HandoverUserRef {
  id?: number;
  email?: string;
  displayName?: string;
}

/* ------------------------------------------------ */
/* MAIN ENTITY                                      */
/* ------------------------------------------------ */

export interface HandoverItem {
  /**
   * Backend-ID oder temporäre optimistic ID (< 0)
   */
  id: number;

  ticketNumber: string;
  customerName: string;

  priority: HandoverPriority;
  type: HandoverType;
  area: string;

  description: string;

  /**
   * ISO string (local or UTC) or null
   */
  commitAt: string | null;

  status: HandoverStatus;

  /**
   * Aktuell: string (E-Mail / Username)
   * Später: automatisch auf UserRef abbildbar
   */
  createdBy: string;
  createdAt: string;

  /**
   * Optional – je nach Status
   */
  takenBy?: string | null;

  /**
   * Optional vorbereitete User-Objekte
   * (noch nicht verwendet, kein Breaking Change)
   */
  createdByUser?: HandoverUserRef;
  takenByUser?: HandoverUserRef | null;

  files?: HandoverFile[];

  /* New strict fields */
  ticketType?: string;
  activity?: string;
  systemName?: string;
  remainingTime?: string;
  startDatetime?: string | null;
  targetTeam?: string;
  assigneeName?: string;
  dueDatetime?: string | null;
  recurrence?: string;
}
