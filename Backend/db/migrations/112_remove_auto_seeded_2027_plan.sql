-- Older versions filled every empty 2027 month with an "E2" baseline (Mon-Fri, all employees) as soon as the
-- shift plan was opened, so the live plan showed values before any draft was activated. The baseline is gone.
-- Months that still hold exactly the seeded rows (same row count as logged, all E2) are emptied again;
-- months that were edited or replaced by an activated draft are left untouched.
DELETE FROM shifts s
 USING (
   SELECT entity_id AS month, MAX((payload->>'createdCount')::int) AS created_count
     FROM activity_log
    WHERE action_type = 'shiftplan_baseline_create'
      AND payload ? 'createdCount'
    GROUP BY entity_id
 ) seeded
 WHERE s.month = seeded.month
   AND s.month LIKE '% 2027'
   AND (SELECT COUNT(*) FROM shifts c WHERE c.month = seeded.month) = seeded.created_count
   AND NOT EXISTS (SELECT 1 FROM shifts x WHERE x.month = seeded.month AND x.shift_code <> 'E2');
