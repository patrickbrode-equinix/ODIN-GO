import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { requirePageAccess } from '../middleware/requirePageAccess.js';
import { isDateKey, vacationSummary } from '../lib/vacationDays.js';
import { recomputeConflictsInternal } from './absences.js';

const vacationColumns = "id, employee_name, employee_id, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, type, note";

export function createVacationRouter(db, { authenticate = requireAuth, recomputeConflicts = recomputeConflictsInternal } = {}) {
  const router = express.Router({ mergeParams: true });
  router.use(authenticate);
  router.use(requirePageAccess('user_management', 'view'));
  router.use(async (req, res, next) => {
    const id = Number(req.params.userId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid user ID' });
    try {
      const { rows } = await db.query(
        `SELECT id, COALESCE(NULLIF(trim(provisioned_employee_name), ''), NULLIF(trim(concat_ws(' ', first_name, last_name)), ''), username) AS employee_name FROM users WHERE id = $1`, [id]);
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });
      req.vacationEmployee = rows[0];
      next();
    } catch (error) { next(error); }
  });

  router.get('/', requirePageAccess('user_management', 'view'), async (req, res, next) => {
    const year = Number(req.query.year);
    if (!Number.isInteger(year) || year < 1900 || year > 9998) return res.status(400).json({ error: 'Invalid year' });
    try {
      const employee = req.vacationEmployee;
      const { rows } = await db.query(
        `SELECT ${vacationColumns} FROM absences WHERE type = 'VACATION'
         AND (employee_id = $1 OR (employee_id IS NULL AND employee_name = $2))
         AND start_date <= $4 AND end_date >= $3 ORDER BY start_date, id`,
        [employee.id, employee.employee_name, `${year}-01-01`, `${year}-12-31`]);
      res.json({ entries: rows, ...vacationSummary(rows, year) });
    } catch (error) { next(error); }
  });

  router.post('/', requirePageAccess('user_management', 'write'), async (req, res, next) => {
    const { start_date, end_date, note = '' } = req.body || {};
    if (!isDateKey(start_date) || !isDateKey(end_date) || end_date < start_date || start_date < '1900-01-01' || end_date > '9998-12-31' || typeof note !== 'string' || note.length > 2000) {
      return res.status(400).json({ error: 'Invalid vacation dates or note' });
    }
    try {
      const employee = req.vacationEmployee;
      const { rows } = await db.query(
        `INSERT INTO absences (employee_name, employee_id, start_date, end_date, type, note)
         VALUES ($1, $2, $3, $4, 'VACATION', $5) RETURNING ${vacationColumns}`,
        [employee.employee_name, employee.id, start_date, end_date, note.trim()]);
      await recomputeConflicts(employee.employee_name, start_date, end_date);
      res.status(201).json(rows[0]);
    } catch (error) { next(error); }
  });

  router.delete('/:absenceId', requirePageAccess('user_management', 'write'), async (req, res, next) => {
    const absenceId = Number(req.params.absenceId);
    if (!Number.isInteger(absenceId) || absenceId <= 0) return res.status(400).json({ error: 'Invalid absence ID' });
    try {
      const employee = req.vacationEmployee;
      const { rows } = await db.query(
        `DELETE FROM absences WHERE id = $1 AND type = 'VACATION'
         AND (employee_id = $2 OR (employee_id IS NULL AND employee_name = $3)) RETURNING ${vacationColumns}`,
        [absenceId, employee.id, employee.employee_name]);
      if (!rows.length) return res.status(404).json({ error: 'Vacation not found' });
      await recomputeConflicts(rows[0].employee_name, rows[0].start_date, rows[0].end_date);
      res.json({ success: true });
    } catch (error) { next(error); }
  });
  return router;
}
