# DB Migration Notes

ODIN uses a simple numbered SQL migration system located in
`backend/db/migrations/`.  On every backend start-up, `runMigrations()`
automatically applies any pending files in order.

---

## How It Works

1. The runner creates a `schema_migrations` table on first run (if absent).
2. It scans `backend/db/migrations/` for files matching `NNN_*.sql`
   (e.g. `001_core_tables.sql`, `008_misc.sql`).
3. Files already recorded in `schema_migrations` are skipped.
4. New files are applied in numeric order inside individual transactions.
5. On success a row is inserted into `schema_migrations`; on failure the
   transaction is rolled back and the process exits with an error.

---

## Adding a New Migration

1. Create a file `backend/db/migrations/NNN_description.sql` where
   `NNN` is the **next sequential number** (zero-padded to 3 digits).

   ```
   # current highest = 008
   backend/db/migrations/009_my_new_feature.sql
   ```

2. Write idempotent DDL using `IF NOT EXISTS` / `IF EXISTS` guards:

   ```sql
   -- 009_my_new_feature.sql
   ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number TEXT;

   CREATE TABLE IF NOT EXISTS notifications (
     id          SERIAL PRIMARY KEY,
     user_id     INTEGER REFERENCES users(id),
     message     TEXT NOT NULL,
     sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
   );
   ```

3. **Do not reuse numbers.** Each `NNN` must be globally unique across all
   migration files, even deleted/retired ones.

4. Restart the backend (`podman compose restart backend`) — the migration
   runs automatically.

---

## Existing Migrations

| File | Contents |
|------|----------|
| `001_core_tables.sql` | `set_updated_at` trigger, `groups`, `users`, `user_settings` |
| `002_queue.sql` | `queue_items`, `expired_tickets`, `crawler_runs`, `crawler_run_deltas` |
| `003_schedules.sql` | `shifts`, `year_plan_2027` |
| `004_handover.sql` | `handover`, `handover_files`, `ticket_handovers` |
| `005_commit.sql` | `commit_imports`, `commit_subtypes`, `commit_saved_filters` |
| `006_wellbeing.sql` | `wellbeing_config`, `wellbeing_metrics`, `shift_rules_config`, `shift_violations` |
| `007_coverage.sql` | `employee_skills`, `coverage_rules`, `coverage_violations`, `staffing_rules`, `staffing_results` |
| `008_misc.sql` | `activity_log`, `kiosk_messages`, `kiosk_message_acks`, `dashboard_info`, `feature_toggles`, `dashboard_info_entries` |

---

## Manual Inspection

Connect to the running Postgres container to see applied migrations:

```bash
# Podman
podman exec -it odin_postgres psql -U odin -d odin \
  -c "SELECT id, name, applied_at FROM schema_migrations ORDER BY id;"

# Docker
docker exec -it odin_postgres psql -U odin -d odin \
  -c "SELECT id, name, applied_at FROM schema_migrations ORDER BY id;"
```

---

## Rollback / Recovery

The runner does **not** implement automatic down-migrations.  To roll back:

1. Connect to psql (see above).
2. Run the inverse DDL manually (`DROP TABLE`, `ALTER TABLE DROP COLUMN`, etc.).
3. Delete the corresponding row from `schema_migrations`:

   ```sql
   DELETE FROM schema_migrations WHERE name = '009_my_new_feature';
   ```

4. Fix the migration file and restart the backend — it will re-apply.

---

## Legacy Note

The old `backend/db/initSchema.js` previously ran raw `CREATE TABLE` statements
on every startup.  It has been superseded by the migration runner.

Helper exports from `initSchema.js` (`getGroups`, `getGroupPolicy`,
`groupExists`, `normalizeGroupKey`) are still used by auth and admin routes
and have **not** been moved — do not remove the file until those callsites
are refactored.
