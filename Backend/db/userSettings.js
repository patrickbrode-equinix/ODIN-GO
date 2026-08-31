/* ------------------------------------------------ */
/* DB – USER SETTINGS + USER META (FINAL)           */
/* ------------------------------------------------ */

import db from "../db.js";

/* ------------------------------------------------ */
/* DEFAULTS                                         */
/* ------------------------------------------------ */

const DEFAULT_SETTINGS = {
  language: "de",
  theme: "dark",
  notify_email: true,
  notify_browser: false,
  notify_shift_reminder: true,
};

/* ------------------------------------------------ */
/* ENSURE SETTINGS ROW                              */
/* ------------------------------------------------ */

export async function ensureUserSettings(userId) {
  if (!userId) throw new Error("ensureUserSettings: userId missing");

  const { rows } = await db.query(
    `
    SELECT
      user_id,
      language,
      theme,
      notify_email,
      notify_browser,
      notify_shift_reminder
    FROM user_settings
    WHERE user_id = $1
    `,
    [userId]
  );

  if (rows.length) return rows[0];

  const created = await db.query(
    `
    INSERT INTO user_settings
      (user_id, language, theme, notify_email, notify_browser, notify_shift_reminder)
    VALUES
      ($1, $2, $3, $4, $5, $6)
    RETURNING
      user_id,
      language,
      theme,
      notify_email,
      notify_browser,
      notify_shift_reminder
    `,
    [
      userId,
      DEFAULT_SETTINGS.language,
      DEFAULT_SETTINGS.theme,
      DEFAULT_SETTINGS.notify_email,
      DEFAULT_SETTINGS.notify_browser,
      DEFAULT_SETTINGS.notify_shift_reminder,
    ]
  );

  return created.rows[0];
}

/* ------------------------------------------------ */
/* GET SETTINGS                                     */
/* ------------------------------------------------ */

export async function getUserSettings(userId) {
  return ensureUserSettings(userId);
}

/* ------------------------------------------------ */
/* UPDATE SETTINGS                                  */
/* ------------------------------------------------ */

export async function updateUserSettings(userId, patch) {
  const current = await ensureUserSettings(userId);

  const next = {
    language: patch.language ?? current.language,
    theme: patch.theme ?? current.theme,
    notify_email: patch.notify_email ?? current.notify_email,
    notify_browser: patch.notify_browser ?? current.notify_browser,
    notify_shift_reminder:
      patch.notify_shift_reminder ?? current.notify_shift_reminder,
  };

  const { rows } = await db.query(
    `
    UPDATE user_settings
    SET
      language = $2,
      theme = $3,
      notify_email = $4,
      notify_browser = $5,
      notify_shift_reminder = $6,
      updated_at = NOW()
    WHERE user_id = $1
    RETURNING
      user_id,
      language,
      theme,
      notify_email,
      notify_browser,
      notify_shift_reminder
    `,
    [
      userId,
      next.language,
      next.theme,
      next.notify_email,
      next.notify_browser,
      next.notify_shift_reminder,
    ]
  );

  return rows[0];
}

/* ------------------------------------------------ */
/* GET USER META (READ ONLY)                        */
/* ------------------------------------------------ */

export async function getUserMeta(userId) {
  const { rows } = await db.query(
    `
    SELECT
      created_at,
      last_login,
      provisioned_employee_name,
      ibx       AS location,
      department AS team
    FROM users
    WHERE id = $1
    `,
    [userId]
  );

  return rows[0] ?? null;
}

/* ------------------------------------------------ */
/* SHIFTPLAN PREFERENCES                            */
/* ------------------------------------------------ */

export async function getShiftplanPreferences(userId) {
  const { rows } = await db.query(
    `SELECT preferences FROM user_shiftplan_preferences WHERE user_id = $1`,
    [userId]
  );
  return rows[0]?.preferences || {};
}

export async function updateShiftplanPreferences(userId, patch) {
  // 1. Get existing or default
  const current = await getShiftplanPreferences(userId);

  // 2. Merge (shallow merge for top-level keys is usually enough, 
  // but let's do safe merge)
  const next = { ...current, ...patch };

  // 3. Upsert
  const { rows } = await db.query(
    `
    INSERT INTO user_shiftplan_preferences (user_id, preferences)
    VALUES ($1, $2)
    ON CONFLICT (user_id)
    DO UPDATE SET preferences = EXCLUDED.preferences, updated_at = NOW()
    RETURNING preferences
    `,
    [userId, JSON.stringify(next)]
  );

  return rows[0]?.preferences || {};
}
