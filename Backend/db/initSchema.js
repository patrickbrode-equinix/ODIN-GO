/* ------------------------------------------------ */
/* GROUP / ACCESS HELPERS                           */
/* ------------------------------------------------ */
/**
 * Group-key helpers shared by adminUsers / adminGroups.
 * The schema itself is created exclusively by db/migrations/*.sql.
 *
 * Group/Department keys are canonical kebab-case (e.g. c-ops).
 */

import db from "../db.js";

/* ------------------------------------------------ */
/* CONSTANTS                                        */
/* ------------------------------------------------ */

/* FINAL: only these access levels */
export const ACCESS_LEVELS = ["none", "view", "write"];

/* ------------------------------------------------ */
/* KEY NORMALIZATION                                */
/* ------------------------------------------------ */
/**
 * Normalisiert Group/Department Keys auf kebab-case.
 */
export function normalizeGroupKey(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  return key || "other";
}


/* ------------------------------------------------ */
/* HELPERS                                          */
/* ------------------------------------------------ */

export async function getGroups() {
  const result = await db.query(
    `SELECT key, label, policy, updated_at AS "updatedAt"
     FROM groups ORDER BY key ASC`
  );
  return result.rows;
}

export async function getGroupPolicy(groupKey) {
  const key = normalizeGroupKey(groupKey);
  const result = await db.query(
    `SELECT policy FROM groups WHERE key = $1`,
    [key]
  );
  if (result.rowCount === 0) return null;

  /* 🔒 Immer nur gültige Level zurückgeben */
  const sanitized = {};
  for (const [k, v] of Object.entries(result.rows[0].policy || {})) {
    sanitized[k] = v === "view" || v === "write" ? v : "none";
  }

  return sanitized;
}

export async function groupExists(groupKey) {
  const key = normalizeGroupKey(groupKey);
  const result = await db.query(
    `SELECT 1 FROM groups WHERE key = $1`,
    [key]
  );
  return result.rowCount > 0;
}
