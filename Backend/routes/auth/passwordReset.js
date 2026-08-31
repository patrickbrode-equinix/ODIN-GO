/* ———————————————— */
/* AUTH ROUTES – PASSWORD RESET (STUB)              */
/* ———————————————— */

import express from "express";

/* ———————————————— */
/* ROUTER SETUP                                     */
/* ———————————————— */

const router = express.Router();

/* ———————————————— */
/* FORGOT PASSWORD                                   */
/* POST /api/auth/password/forgot                     */
/* ———————————————— */

router.post("/password/forgot", async (req, res) => {
  return res.status(501).json({
    message: "Password reset ist noch nicht implementiert.",
  });
});

/* ———————————————— */
/* RESET PASSWORD                                    */
/* POST /api/auth/password/reset                      */
/* ———————————————— */

router.post("/password/reset", async (req, res) => {
  return res.status(501).json({
    message: "Password reset ist noch nicht implementiert.",
  });
});

export default router;
