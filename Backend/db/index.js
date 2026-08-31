/* ------------------------------------------------ */
/* DATABASE HELPER – POSTGRESQL                     */
/* ------------------------------------------------ */

import pool from "../db.js";

/* ------------------------------------------------ */
/* QUERY – MEHRERE ZEILEN                           */
/* ------------------------------------------------ */

export async function query(sql, params = []) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    console.error("DB QUERY ERROR:", err.message);
    throw err;
  }
}

/* ------------------------------------------------ */
/* ONE – GENAU EINE ZEILE                           */
/* ------------------------------------------------ */

export async function one(sql, params = []) {
  const result = await query(sql, params);
  return result.rows[0] || null;
}

/* ------------------------------------------------ */
/* NONE – NUR AUSFÜHREN                             */
/* ------------------------------------------------ */

export async function none(sql, params = []) {
  await query(sql, params);
  return true;
}

export default {
  query,
  one,
  none,
};
