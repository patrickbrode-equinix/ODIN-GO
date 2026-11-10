/* ================================================ */
/* /api/payroll – personal payroll ("Abrechnung")   */
/*                                                  */
/*  - profile: ENCRYPTED in the browser, stored as  */
/*    ciphertext only. Every route works on the     */
/*    logged-in user's own row; there is no way to  */
/*    read another person's profile (not even as    */
/*    admin), and the server could not decrypt it.  */
/*  - month-hours: the own shifts and supplement    */
/*    hours of a month (plan data, no salary data). */
/* ================================================ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { normalizeName } from "../lib/nameNorm.js";
import { formatShiftMonthLabel } from "../lib/shiftplanMonth.js";
import { parseMonthLabel } from "../lib/monthParser.js";
import { buildEmployeeMonthHours } from "../lib/payrollHours.js";

const router = express.Router();
router.use(requireAuth);
router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  // Personal data: only for a real, logged-in person (the shared admin session has no payroll).
  const id = Number(req.user?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(403).json({ code: "PAYROLL_NEEDS_PERSONAL_LOGIN", message: "Die Abrechnung ist nur mit dem persönlichen Jarvis-Login verfügbar." });
  }
  next();
});

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const MAX_CIPHERTEXT_LENGTH = 60_000;

router.get("/profile", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT salt, iv, ciphertext, kdf, kdf_iterations, version, updated_at FROM payroll_profiles WHERE user_id = $1`,
      [req.user.id],
    );
    if (!rows[0]) return res.json({ exists: false });
    const row = rows[0];
    res.json({
      exists: true,
      profile: { salt: row.salt, iv: row.iv, ciphertext: row.ciphertext, kdf: row.kdf, kdfIterations: row.kdf_iterations, version: row.version },
      updatedAt: row.updated_at,
    });
  } catch (error) {
    console.error("PAYROLL PROFILE LOAD ERROR:", error);
    res.status(500).json({ error: "Profile could not be loaded" });
  }
});

router.put("/profile", async (req, res) => {
  const { salt, iv, ciphertext, kdfIterations } = req.body || {};
  const valid = [salt, iv, ciphertext].every((value) => typeof value === "string" && value.length > 0 && BASE64.test(value))
    && ciphertext.length <= MAX_CIPHERTEXT_LENGTH
    && salt.length <= 128 && iv.length <= 64
    && Number.isInteger(kdfIterations) && kdfIterations >= 100_000 && kdfIterations <= 5_000_000;
  if (!valid) return res.status(400).json({ error: "INVALID_ENCRYPTED_PROFILE", message: "Das verschlüsselte Profil ist ungültig." });
  try {
    await db.query(
      `INSERT INTO payroll_profiles (user_id, salt, iv, ciphertext, kdf, kdf_iterations, version)
       VALUES ($1, $2, $3, $4, 'PBKDF2-SHA256', $5, 1)
       ON CONFLICT (user_id) DO UPDATE
         SET salt = EXCLUDED.salt, iv = EXCLUDED.iv, ciphertext = EXCLUDED.ciphertext,
             kdf_iterations = EXCLUDED.kdf_iterations, updated_at = NOW()`,
      [req.user.id, salt, iv, ciphertext, kdfIterations],
    );
    res.json({ success: true });
  } catch (error) {
    console.error("PAYROLL PROFILE SAVE ERROR:", error);
    res.status(500).json({ error: "Profile could not be saved" });
  }
});

router.delete("/profile", async (req, res) => {
  try {
    await db.query(`DELETE FROM payroll_profiles WHERE user_id = $1`, [req.user.id]);
    res.json({ success: true });
  } catch (error) {
    console.error("PAYROLL PROFILE DELETE ERROR:", error);
    res.status(500).json({ error: "Profile could not be deleted" });
  }
});

/** The plan name(s) of the logged-in person (exact normalized match, never guessed). */
async function ownPlanNameKeys(userId) {
  const { rows } = await db.query(
    `SELECT first_name, last_name, provisioned_employee_name FROM users WHERE id = $1`,
    [userId],
  );
  const user = rows[0];
  if (!user) return new Set();
  const first = String(user.first_name || "").trim();
  const last = String(user.last_name || "").trim();
  return new Set([user.provisioned_employee_name, `${first} ${last}`, `${last} ${first}`, `${last}, ${first}`]
    .map((value) => normalizeName(String(value || "")))
    .filter(Boolean));
}

router.get("/month-hours", async (req, res) => {
  const year = Number.parseInt(String(req.query.year ?? ""), 10);
  const month = Number.parseInt(String(req.query.month ?? ""), 10);
  if (!Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isInteger(month) || month < 1 || month > 12) {
    return res.status(400).json({ error: "year and month are required" });
  }
  try {
    const keys = await ownPlanNameKeys(req.user.id);
    const label = formatShiftMonthLabel(year, month);
    const monthId = `${year}-${String(month).padStart(2, "0")}`;
    const [shiftRows, definitionRows] = await Promise.all([
      db.query(`SELECT employee_name, day, shift_code FROM shifts WHERE month = $1 OR month = $2`, [label, monthId]),
      db.query(`SELECT code, duration_hours, start_time, end_time, start_day_offset, end_day_offset FROM shift_definitions`),
    ]);
    const own = shiftRows.rows.filter((row) => keys.has(normalizeName(String(row.employee_name || ""))));
    const state = String(req.query.state || "HE").toUpperCase() === "BY" ? "BY" : "HE";
    const hours = buildEmployeeMonthHours({ year, month, shifts: own, definitions: definitionRows.rows, state });
    res.json({ year, month, matched: own.length > 0, planned: shiftRows.rows.length > 0, ...hours });
  } catch (error) {
    console.error("PAYROLL MONTH HOURS ERROR:", error);
    res.status(500).json({ error: "Hours could not be loaded" });
  }
});

/** Months for which the logged-in person has planned shifts (newest first): the months the payroll can show. */
router.get("/months", async (req, res) => {
  try {
    const keys = await ownPlanNameKeys(req.user.id);
    const { rows } = await db.query(`SELECT DISTINCT month, employee_name FROM shifts`);
    const seen = new Set();
    for (const row of rows) {
      if (!keys.has(normalizeName(String(row.employee_name || "")))) continue;
      const text = String(row.month || "");
      const id = /^(d{4})-(d{2})$/.exec(text);
      const parsed = id ? { year: Number(id[1]), month: Number(id[2]) } : parseMonthLabel(text);
      if (parsed?.year && parsed?.month) seen.add(`${parsed.year}-${String(parsed.month).padStart(2, "0")}`);
    }
    res.json({ months: [...seen].sort().reverse() });
  } catch (error) {
    console.error("PAYROLL MONTHS ERROR:", error);
    res.status(500).json({ error: "Months could not be loaded" });
  }
});

export default router;
