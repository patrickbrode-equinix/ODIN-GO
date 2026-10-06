import express from "express";
import { query } from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { aggregateYearlyHours, buildShiftHoursLookup } from "../lib/shiftHours.js";

const router = express.Router();
router.use(requireAuth); // All /api/stats/* routes require a valid session

/* ------------------------------------------------ */
/* SHIFT HOURS: YEARLY TARGETS + EMPLOYEE PROGRESS  */
/* ------------------------------------------------ */
router.get("/shift-hours", async (req, res) => {
    try {
        const requestedYear = Number.parseInt(String(req.query.year || ""), 10);
        const year = Number.isInteger(requestedYear) ? requestedYear : new Date().getFullYear();

        const [shiftDefinitionsRes, shiftsRes, absencesRes, configRes] = await Promise.all([
            query(`SELECT code, duration_hours FROM shift_definitions`),
            query(`SELECT month, employee_name, day, shift_code FROM shifts WHERE employee_name IS NOT NULL AND btrim(employee_name) <> ''`),
            query(
                `SELECT employee_name, start_date, end_date, type
                 FROM absences
                 WHERE start_date <= $1::date AND end_date >= $2::date`,
                [`${year}-12-31`, `${year}-01-01`]
            ),
            query(`SELECT monthly_target_hours, annual_target_hours FROM shift_planning_config WHERE id = 1`),
        ]);

        const configRow = configRes.rows[0] || {};
        const summary = aggregateYearlyHours({
            year,
            shifts: shiftsRes.rows,
            absences: absencesRes.rows,
            shiftHoursLookup: buildShiftHoursLookup(shiftDefinitionsRes.rows),
            monthlyTargetHours: configRow.monthly_target_hours,
            annualTargetHours: configRow.annual_target_hours,
        });

        const employeesOnTarget = summary.employees.filter((entry) => entry.actual_hours >= entry.annual_target_hours).length;
        const employeesBelowTarget = summary.employees.length - employeesOnTarget;

        res.json({
            ok: true,
            ...summary,
            employees_on_target: employeesOnTarget,
            employees_below_target: employeesBelowTarget,
        });
    } catch (err) {
        console.error("Stats Shift Hours Error:", err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

export default router;

