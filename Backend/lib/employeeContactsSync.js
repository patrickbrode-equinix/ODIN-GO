/* ------------------------------------------------ */
/* EMPLOYEE CONTACTS – AUTO-SYNC                    */
/* Keeps employee_contacts in step with the shifts. */
/* Existing (manually maintained) entries are never */
/* overwritten.                                     */
/* ------------------------------------------------ */

import db from "../db.js";
import { generateEmailFromName } from "./employeeIdentity.js";

export { generateEmailFromName };

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
