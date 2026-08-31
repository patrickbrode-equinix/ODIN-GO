/* ------------------------------------------------ */
/* DB SEED – MASTER ADMIN USER                      */
/* ------------------------------------------------ */
/**
 * seedDefaultAdmin()
 *
 * Ensures that the built-in master account is always present and usable.
 * This intentionally repairs the account on every startup so lockouts on
 * reused volumes do not block access to the system.
 *
 * Default credentials:
 *   login    : admin@local
 *   password : root
 */

import bcrypt from "bcrypt";
import { query } from "../db.js";

const DEFAULT_LOGIN_NAME = "admin@local";
const DEFAULT_EMAIL = "admin@local";
const DEFAULT_PASSWORD = "root";
const DEFAULT_FIRST_NAME = "Admin";
const DEFAULT_LAST_NAME = "Local";
const DEFAULT_USERNAME = "admin";
const DEFAULT_GROUP = "c-ops";
const DEFAULT_IBX = "FR2";
const BCRYPT_ROUNDS = 12;

export async function seedDefaultAdmin(queryFn = query) {
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

      console.log(`[SEED] Master account repaired/ensured → ${DEFAULT_LOGIN_NAME}`);
      return { updated: true };
    }

    await queryFn(
      `INSERT INTO users
         (first_name, last_name, username, login_name, email, password_hash,
          user_group, department, ibx, approved, is_root, is_admin, must_change_password)
       VALUES
         ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE, TRUE, TRUE, FALSE)`,
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

    console.log(`[SEED] Master account created → ${DEFAULT_LOGIN_NAME}`);
    return { created: true };
  } catch (err) {
    // Non-fatal: log and continue.  The server must not crash here.
    console.error("[SEED] ❌ Failed to seed default admin:", err.message);
    return { error: err.message };
  }
}
