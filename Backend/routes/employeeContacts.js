/* ------------------------------------------------ */
/* EMPLOYEE CONTACTS – CRUD + AUTO-SYNC             */
/* E-Mail-Pflege für Teams-Bot und Benachrichtigungen */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { generateEmailFromName } from "../lib/employeeIdentity.js";

const router = express.Router();

/* ------------------------------------------------ */
/* E-MAIL AUS NAME GENERIEREN                       */
/* ------------------------------------------------ */
export { generateEmailFromName };

/* ------------------------------------------------ */
/* SYNC – Mitarbeiter aus shifts in contacts         */
/* Manuelle E-Mails dürfen NICHT überschrieben werden */
/* ------------------------------------------------ */

export async function syncEmployeeContacts() {
  try {
    const { rows: employees } = await db.query(
      `SELECT DISTINCT employee_name FROM shifts WHERE employee_name IS NOT NULL AND employee_name != ''`
    );

    let created = 0;
    let skipped = 0;

    for (const { employee_name } of employees) {
      const existing = await db.query(
        `SELECT id FROM employee_contacts WHERE employee_name = $1`,
        [employee_name]
      );

      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      const email = generateEmailFromName(employee_name);
      await db.query(
        `INSERT INTO employee_contacts (employee_name, email, email_source, is_active)
         VALUES ($1, $2, 'generated', TRUE)
         ON CONFLICT (employee_name) DO NOTHING`,
        [employee_name, email]
      );
      created++;
    }

    console.log(`[EMPLOYEE_CONTACTS] Sync complete: ${created} created, ${skipped} already exist`);
    return { created, skipped, total: employees.length };
  } catch (err) {
    console.error("[EMPLOYEE_CONTACTS] Sync error:", err);
    throw err;
  }
}

/* ------------------------------------------------ */
/* GET /api/employee-contacts                        */
/* ------------------------------------------------ */

router.get(
  "/",
  requireAuth,
  requirePageAccess("shiftplan", "view"),
  async (req, res) => {
    try {
      const { rows } = await db.query(
        `SELECT id, employee_name, email, email_source, is_active, created_at, updated_at
         FROM employee_contacts
         ORDER BY employee_name`
      );
      res.json(rows);
    } catch (err) {
      console.error("EMPLOYEE_CONTACTS LIST ERROR:", err);
      res.status(500).json({ error: "Failed to load employee contacts" });
    }
  }
);

/* ------------------------------------------------ */
/* PUT /api/employee-contacts/:id                    */
/* Manuelle E-Mail-Korrektur                        */
/* ------------------------------------------------ */

router.put(
  "/:id",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { email } = req.body;

      if (!email || typeof email !== "string" || !email.includes("@")) {
        return res.status(400).json({ error: "Ungültige E-Mail-Adresse" });
      }

      const sanitizedEmail = email.trim().toLowerCase();

      const result = await db.query(
        `UPDATE employee_contacts
         SET email = $1, email_source = 'manual', updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [sanitizedEmail, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: "Kontakt nicht gefunden" });
      }

      res.json(result.rows[0]);
    } catch (err) {
      console.error("EMPLOYEE_CONTACTS UPDATE ERROR:", err);
      res.status(500).json({ error: "Update failed" });
    }
  }
);

/* ------------------------------------------------ */
/* POST /api/employee-contacts/sync                  */
/* Manuelle Trigger-Sync                            */
/* ------------------------------------------------ */

router.post(
  "/sync",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    try {
      const result = await syncEmployeeContacts();
      res.json({ success: true, ...result });
    } catch (err) {
      console.error("EMPLOYEE_CONTACTS SYNC ERROR:", err);
      res.status(500).json({ error: "Sync failed" });
    }
  }
);

/* ------------------------------------------------ */
/* PUT /api/employee-contacts/:id/reset              */
/* E-Mail auf generierten Wert zurücksetzen          */
/* ------------------------------------------------ */

router.put(
  "/:id/reset",
  requireAuth,
  requirePageAccess("shiftplan", "write"),
  async (req, res) => {
    try {
      const { id } = req.params;

      const contactRes = await db.query(
        `SELECT employee_name FROM employee_contacts WHERE id = $1`,
        [id]
      );

      if (contactRes.rows.length === 0) {
        return res.status(404).json({ error: "Kontakt nicht gefunden" });
      }

      const email = generateEmailFromName(contactRes.rows[0].employee_name);

      const result = await db.query(
        `UPDATE employee_contacts
         SET email = $1, email_source = 'generated', updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [email, id]
      );

      res.json(result.rows[0]);
    } catch (err) {
      console.error("EMPLOYEE_CONTACTS RESET ERROR:", err);
      res.status(500).json({ error: "Reset failed" });
    }
  }
);

export default router;
