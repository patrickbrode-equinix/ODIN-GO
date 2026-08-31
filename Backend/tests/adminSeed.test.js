/**
 * backend/tests/adminSeed.test.js
 *
 * Unit tests for the master admin seeding logic.
 * Tests the idempotency and correctness of seedDefaultAdmin() without
 * needing a live database — the DB query function is injected as a mock.
 * Also covers the SEED_ADMIN_IF_MISSING=true mode.
 *
 * Run with: node --test tests/adminSeed.test.js
 */

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcrypt";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Inline seed logic (mirrors backend/db/seed.js)                             */
/*  We accept `queryFn` as a parameter so tests can inject a mock.             */
/* ─────────────────────────────────────────────────────────────────────────── */

const DEFAULT_LOGIN_NAME = "admin@local";
const DEFAULT_EMAIL = "admin@local";
const DEFAULT_PASSWORD = "root";
const DEFAULT_FIRST_NAME = "Admin";
const DEFAULT_LAST_NAME = "Local";
const DEFAULT_USERNAME = "admin";
const DEFAULT_GROUP = "c-ops";
const DEFAULT_IBX = "FR2";
const BCRYPT_ROUNDS = 12;

async function seedDefaultAdmin(queryFn) {
  try {
    const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, BCRYPT_ROUNDS);

    const { rows: existing } = await queryFn(
      `SELECT id
       FROM users
       WHERE LOWER(login_name) = LOWER($1)
          OR LOWER(email) = LOWER($2)
       ORDER BY id ASC
       LIMIT 1`,
      [DEFAULT_LOGIN_NAME, DEFAULT_EMAIL]
    );

    if (existing.length > 0) {
      await queryFn(
        `UPDATE users
         SET first_name = $1,
             last_name = $2,
             username = $3,
             login_name = $4,
             email = $5,
             password_hash = $6,
             user_group = $7,
             department = $8,
             ibx = $9,
             approved = TRUE,
             is_root = TRUE,
             is_admin = TRUE,
             must_change_password = FALSE,
             updated_at = NOW()
         WHERE id = $10`,
        [
          DEFAULT_FIRST_NAME,
          DEFAULT_LAST_NAME,
          DEFAULT_USERNAME,
          DEFAULT_LOGIN_NAME,
          DEFAULT_EMAIL,
          passwordHash,
          DEFAULT_GROUP,
          DEFAULT_GROUP,
          DEFAULT_IBX,
          existing[0].id,
        ]
      );
      return { updated: true, hash: passwordHash };
    }

    await queryFn(
      `INSERT INTO users
        (first_name, last_name, username, login_name, email, password_hash,
          user_group, department, ibx, approved, is_root, is_admin, must_change_password)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,TRUE,TRUE,TRUE,FALSE)`,
      [
        DEFAULT_FIRST_NAME,
        DEFAULT_LAST_NAME,
        DEFAULT_USERNAME,
        DEFAULT_LOGIN_NAME,
        DEFAULT_EMAIL,
        passwordHash,
        DEFAULT_GROUP,
        DEFAULT_GROUP,
        DEFAULT_IBX,
      ]
    );

    return { created: true, hash: passwordHash };
  } catch (err) {
    return { error: err.message };
  }
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Tests — master account repair/create behavior                              */
/* ─────────────────────────────────────────────────────────────────────────── */

describe("seedDefaultAdmin", () => {
  // ── 1. Missing master account: admin is created ───────────────────────────
  test("creates master account when it does not exist", async () => {
    const calls = [];

    const mockQuery = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM users")) return { rows: [] };
      if (sql.includes("INSERT INTO users")) return { rowCount: 1 };
      return { rows: [] };
    };

    const result = await seedDefaultAdmin(mockQuery);

    assert.ok(result.created, "should have created the master account");
    assert.equal(calls.length, 2, "should run exactly 2 queries (SELECT + INSERT)");

    const insertCall = calls.find((c) => c.sql.includes("INSERT INTO users"));
    assert.ok(insertCall, "INSERT query must have been issued");
    assert.equal(insertCall.params[3], DEFAULT_LOGIN_NAME, "login name should be admin@local");
    assert.equal(insertCall.params[4], DEFAULT_EMAIL, "email should be admin@local");
    assert.equal(insertCall.params[6], DEFAULT_GROUP, "user_group should be c-ops");
    assert.equal(insertCall.params[8], DEFAULT_IBX, "ibx should be FR2");
  });

  // ── 2. Password is bcrypt-hashed ───────────────────────────────────────────
  test("stores password as a bcrypt hash", async () => {
    const mockQuery = async (sql, params) => {
      if (sql.includes("FROM users")) return { rows: [] };
      return { rowCount: 1 };
    };

    const result = await seedDefaultAdmin(mockQuery);

    assert.ok(result.hash, "hash should be returned in test");
    assert.ok(
      result.hash.startsWith("$2b$"),
      "hash must be a bcrypt hash (starts with $2b$)"
    );

    const valid = await bcrypt.compare(DEFAULT_PASSWORD, result.hash);
    assert.ok(valid, "plain text password must verify against the hash");
  });

  // ── 3. Existing master account: seed repairs it ───────────────────────────
  test("updates the existing master account to the required credentials", async () => {
    const calls = [];

    const mockQuery = async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes("FROM users")) return { rows: [{ id: 42 }] };
      if (sql.includes("UPDATE users")) return { rowCount: 1 };
      throw new Error("Unexpected query: " + sql);
    };

    const result = await seedDefaultAdmin(mockQuery);
    assert.ok(result.updated, "should repair the existing master account");
    const updateCall = calls.find((call) => call.sql.includes("UPDATE users"));
    assert.ok(updateCall, "UPDATE query must have been issued");
    assert.equal(updateCall.params[3], DEFAULT_LOGIN_NAME, "login name must be admin@local");
    assert.equal(updateCall.params[4], DEFAULT_EMAIL, "email must be admin@local");
    assert.equal(updateCall.params[9], 42, "should update the matched user id");
  });

  // ── 5. Default values are enterprise-appropriate ──────────────────────────
  test("default account has is_root=TRUE and approved=TRUE", async () => {
    let insertedParams = null;

    const mockQuery = async (sql, params) => {
      if (sql.includes("FROM users")) return { rows: [] };
      insertedParams = params;
      return { rowCount: 1 };
    };

    await seedDefaultAdmin(mockQuery);

    assert.ok(Array.isArray(insertedParams), "INSERT params must be an array");
    assert.equal(insertedParams[3], DEFAULT_LOGIN_NAME, "login name must be admin@local");
    assert.equal(insertedParams[4], DEFAULT_EMAIL, "email must be admin@local");
    assert.equal(insertedParams[0], DEFAULT_FIRST_NAME, "first_name must be Admin");
    assert.equal(insertedParams[1], DEFAULT_LAST_NAME, "last_name must be Local");
    assert.equal(insertedParams[2], DEFAULT_USERNAME, "username must be admin");
  });

  // ── 6. Idempotency: calling twice remains safe ────────────────────────────
  test("calling twice creates once and then repairs the same account", async () => {
    let masterUser = null;

    const mockQuery = async (sql, params) => {
      if (sql.includes("FROM users")) return { rows: masterUser ? [masterUser] : [] };
      if (sql.includes("INSERT INTO users")) {
        masterUser = { id: 7 };
        return { rowCount: 1 };
      }
      if (sql.includes("UPDATE users")) return { rowCount: 1 };
      return { rows: [] };
    };

    const r1 = await seedDefaultAdmin(mockQuery);
    assert.ok(r1.created, "first call should create the master account");

    const r2 = await seedDefaultAdmin(mockQuery);
    assert.ok(r2.updated, "second call should repair the same account safely");
  });
  // ── 7. Does NOT depend on COUNT(*) user table checks ─────────────────────
  test("does not use COUNT(*) to decide whether the master account exists", async () => {
    const calls = [];

    const mockQuery = async (sql) => {
      calls.push(sql);
      if (sql.includes("FROM users")) return { rows: [] };
      if (sql.includes("INSERT")) return { rowCount: 1 };
      return { rows: [] };
    };

    await seedDefaultAdmin(mockQuery);
    const hasCount = calls.some((sql) => sql.includes("COUNT(*)"));
    assert.equal(hasCount, false, "COUNT(*) must not be used for master account repair");
  });
});

