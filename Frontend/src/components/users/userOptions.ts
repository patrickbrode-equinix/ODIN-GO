/* ------------------------------------------------ */
/* USER OPTIONS – SINGLE SOURCE OF TRUTH            */
/* ------------------------------------------------ */

/**
 * IBX / Standort-Auswahl
 * Wird z. B. im AddUserModal verwendet
 */
export const IBX_OPTIONS = [
  "FR2",
  "FR4",
  "FR5",
  "FR6",
  "FR7",
  "FR8",
  "FR9X",
  "FR11X",
  "FR13",
  "FR16X",
];

/**
 * Abteilungen (Anzeige / UI)
 * Rein visuell, z. B. für Dropdowns
 */
export const DEPARTMENT_OPTIONS = [
  "C-OPS",
  "F-OPS",
  "Other",
];

/**
 * Gruppen-Keys (Backend-relevant)
 * Müssen exakt zu den Group-Keys im Backend passen
 */
export const GROUP_OPTIONS = [
  "c-ops",
  "f-ops",
  "other",
];
