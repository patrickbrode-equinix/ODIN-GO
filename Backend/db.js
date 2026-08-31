/* ─────────────────────────────────────────────────────────────────────────── */
/*  backend/db.js  –  PostgreSQL connection pool                               */
/*  All configuration is sourced from backend/config/index.js.                 */
/* ─────────────────────────────────────────────────────────────────────────── */

// NOTE: do NOT add "import dotenv/config" here — config/index.js handles it.
import { config } from "./config/index.js";
import pkg from "pg";
const { Pool, types } = pkg;

/*
 * TIMEZONE FIX – OID 1114 = TIMESTAMP WITHOUT TIME ZONE
 *
 * Problem: parseAnyDateToIso() stores dates as UTC ISO strings (via toISOString()).
 * Postgres strips the 'Z' when inserting into TIMESTAMP columns, so it stores
 * the UTC face value (e.g. "13:00:00" for a 14:00 CET commit).
 * By default, pg reads TIMESTAMP values back as LOCAL time, which means
 * new Date("2026-03-06 13:00:00") = local 13:00 CET = UTC 12:00 → 1 h too early.
 *
 * Fix: tell pg to treat TIMESTAMP face values as UTC (matching storage convention).
 */
types.setTypeParser(1114, val => val === null ? null : new Date(val.replace(' ', 'T') + 'Z'));

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Pool configuration: DATABASE_URL preferred, db.* fallback                  */
/* ─────────────────────────────────────────────────────────────────────────── */

const poolConfig = config.DATABASE_URL
  ? {
    connectionString: config.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  }
  : {
    host: config.db.host,
    port: config.db.port,
    database: config.db.database,
    user: config.db.user,
    password: config.db.password,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  };

console.log(`[DB] Connecting via ${config.DATABASE_URL ? "DATABASE_URL" : `${config.db.host}:${config.db.port}/${config.db.database}`}`);

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Pool creation                                                               */
/* ─────────────────────────────────────────────────────────────────────────── */

const pool = new Pool(poolConfig);

pool.on("error", (err) => {
  console.error("!! [DB] FATAL: Unexpected error on idle client", err);
});

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Connection test (called on startup)                                         */
/* ─────────────────────────────────────────────────────────────────────────── */

export const testConnection = async () => {
  console.log(">> [DB] Testing connection...");
  try {
    const res = await pool.query("SELECT 1 as val");
    if (res.rows[0].val === 1) {
      console.log(">> [DB] CONNECTION SUCCESS ✅");
      return true;
    }
  } catch (err) {
    console.error(">> [DB] CONNECTION FAILED ❌");
    console.error(`   Error: ${err.message}`);
    if (err.code === "28P01") console.error("   Hint: Check DB_USER and DB_PASSWORD in backend/.env");
    if (err.code === "ECONNREFUSED") console.error("   Hint: Is Postgres running? Check DB_HOST / DB_PORT.");
    return false;
  }
  return false;
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Query helper with slow-query warning                                        */
/* ─────────────────────────────────────────────────────────────────────────── */

export const query = async (text, params) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`[DB] Slow Query (${duration}ms): ${text}`);
    }
    return res;
  } catch (err) {
    console.error(`[DB] Query Error: ${err.message}`, { text });
    throw err;
  }
};

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Health check (used by /api/health route)                                    */
/* ─────────────────────────────────────────────────────────────────────────── */

export const checkHealth = async () => {
  try {
    const res = await pool.query("SELECT NOW() as time");
    return {
      status: "connected",
      time: res.rows[0].time,
      config: {
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        database: config.db.database,
      },
    };
  } catch (err) {
    return { status: "disconnected", error: err.message };
  }
};

export default pool;
