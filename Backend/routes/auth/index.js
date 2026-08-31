/* ———————————————— */
/* AUTH ROUTES – INDEX                              */
/* ———————————————— */

import express from "express";

/* ———————————————— */
/* ROUTE MODULES                                    */
/* ———————————————— */

import loginRoutes from "./login.js";
import registerRoutes from "./register.js";
import passwordResetRoutes from "./passwordReset.js";
import changePasswordRoute from "./changePassword.js";


/* ———————————————— */
/* ROUTER SETUP                                     */
/* ———————————————— */

const router = express.Router();

/* ———————————————— */
/* MOUNT ROUTES                                     */
/* ———————————————— */

router.use(loginRoutes);
router.use(registerRoutes);
router.use(passwordResetRoutes);
router.use("/", changePasswordRoute);

export default router;
