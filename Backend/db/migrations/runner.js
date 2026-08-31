/* ------------------------------------------------ */
/* DB MIGRATION RUNNER                               */
/* Runs numbered SQL migrations in order.           */
/* Tracks applied migrations in schema_migrations.  */
/* ------------------------------------------------ */
/**
 * Usage:
 *   import { runMigrations } from "./db/migrations/runner.js";
 *   await runMigrations();
 *
 * Adding a new migration:
 *   1. Create backend/db/migrations/NNN_description.sql
 *   2. The runner will detect and apply it automatically on next start.
 *
 * Each SQL file may contain multiple statements separated by semicolons.
 * Transactions are used per-migration — if one fails, it is rolled back and
 * subsequent migrations are skipped.
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import pool from "../../db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------ */
/* Bootstrap: ensure schema_migrations table exists */
/* ------------------------------------------------ */

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          SERIAL PRIMARY KEY,
      filename    VARCHAR(256) UNIQUE NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

/* ------------------------------------------------ */
/* Collect migration files                          */
/* ------------------------------------------------ */

function collectMigrationFiles() {
  const files = fs
    .readdirSync(__dirname)
    .filter((f) => /^\d{3}_.*\.sql$/.test(f))
    .sort();
  return files;
}

/* ------------------------------------------------ */
/* Check which migrations have already been applied */
/* ------------------------------------------------ */

async function getAppliedMigrations() {
  const result = await pool.query(
    `SELECT filename FROM schema_migrations ORDER BY filename ASC`
  );
  return new Set(result.rows.map((r) => r.filename));
}

/* ------------------------------------------------ */
/* Run a single migration file inside a transaction */
/* ------------------------------------------------ */

async function applyMigration(filename) {
  const filePath = path.join(__dirname, filename);
  const sql = fs.readFileSync(filePath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Execute all statements in the file.
    // We run them as a single multi-statement query — PostgreSQL handles this fine.
    await client.query(sql);

    await client.query(
      `INSERT INTO schema_migrations (filename) VALUES ($1)`,
      [filename]
    );

    await client.query("COMMIT");
    console.log(`[MIGRATIONS] Applied: ${filename}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`[MIGRATIONS] FAILED: ${filename} — ${err.message}`);
    throw err;
  } finally {
    client.release();
  }
}

/* ------------------------------------------------ */
/* Main entry point                                 */
/* ------------------------------------------------ */

export async function runMigrations() {
  console.log("[MIGRATIONS] Starting migration runner...");

  await ensureMigrationsTable();

  const files = collectMigrationFiles();
  const applied = await getAppliedMigrations();

  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log("[MIGRATIONS] All migrations already applied. Nothing to do.");
    return;
  }

  console.log(`[MIGRATIONS] Pending: ${pending.length} migration(s)`);

  for (const filename of pending) {
    await applyMigration(filename);
  }

  console.log("[MIGRATIONS] All migrations applied successfully.");
}
