/* ------------------------------------------------ */
/* AUTH – CHANGE PASSWORD                           */
/* ------------------------------------------------ */

import express from "express";
import bcrypt from "bcrypt";
import { requireAuth } from "../../middleware/authMiddleware.js";
import db from "../../db.js";

const router = express.Router();

/* ------------------------------------------------ */
/* POST /api/auth/change-password                   */
/* ------------------------------------------------ */

router.post("/change-password", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ message: "Fehlende Daten" });
  }

  try {
    const result = await db.query(
      `SELECT password_hash FROM users WHERE id = $1`,
      [userId]
    );

    if (!result.rowCount) {
      return res.status(404).json({ message: "User nicht gefunden" });
    }

    const passwordOk = await bcrypt.compare(
      currentPassword,
      result.rows[0].password_hash
    );

    if (!passwordOk) {
      return res.status(400).json({
       message: "Aktuelles Passwort ist falsch",
      });

    }

    const newHash = await bcrypt.hash(newPassword, 12);

    await db.query(
      `UPDATE users
       SET password_hash = $1,
           must_change_password = false,
           password_changed_at = NOW()
       WHERE id = $2`,
      [newHash, userId]
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("CHANGE PASSWORD ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
