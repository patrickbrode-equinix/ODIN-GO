/* ------------------------------------------------ */
/* DISPATCHER – TYPES                               */
/* ------------------------------------------------ */

export type ShiftCode = "F" | "S" | "N" | "ABW";

export type RoleCode =
  | "dispatcher"
  | "crossconnect"
  | "smarthands"
  | "project"
  | "deutsche_boerse"
  | "kolo"
  | "neustarter"
  | "buddy"
  | "leads"
  | "large_order"
  | "support";

/** Display labels for all operational roles */
export const ROLE_LABELS: Record<RoleCode, string> = {
  dispatcher: "Dispatcher",
  crossconnect: "Cross Connect",
  smarthands: "Smart Hands",
  project: "Projekt",
  deutsche_boerse: "Deutsche Börse",
  kolo: "Kolo",
  neustarter: "Neustarter",
  buddy: "Buddy",
  leads: "Leads",
  large_order: "Large Order",
  support: "Support",
};

/** Roles that receive NO auto-assigned tickets */
export const NO_TICKET_ROLES: RoleCode[] = [
  "dispatcher",
  "project",
  "leads",
  "large_order",
];

/** All available role codes */
export const ALL_ROLES: RoleCode[] = Object.keys(ROLE_LABELS) as RoleCode[];

export interface DispatcherEmployee {
  name: string;
  shift: ShiftCode;
  roles: RoleCode[];
}
