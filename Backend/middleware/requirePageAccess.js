/* ———————————————————————————————— */
/* RBAC – PAGE ACCESS ENFORCEMENT                   */
/* Source of truth: resolved user accessPolicy      */
/* Levels: none | view | write                      */
/* ———————————————————————————————— */

/* ———————————————————————————————— */
/* ACCESS LEVEL ORDER                               */
/* ———————————————————————————————— */

const LEVEL_ORDER = {
  none: 0,
  view: 1,
  write: 2,
};

function normalizeLevel(raw) {
  const l = String(raw || "").toLowerCase().trim();
  if (l === "view" || l === "write") return l;
  if (l === "manage") return "write"; // legacy safety
  return "none";
}

function meets(level, min) {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[min];
}

/* ———————————————————————————————— */
/* MAIN MIDDLEWARE                                  */
/* ———————————————————————————————— */

export function requirePageAccess(pageKey, minLevel = "view") {
  return async function (req, res, next) {
    try {
      /* --- authMiddleware MUSS vorher laufen --- */
      const user = req.user;

      if (!user) {
        return res.status(401).json({ message: "Not authenticated" });
      }

      /* --- Root: immer erlaubt --- */
      if (user.is_root === true) {
        return next();
      }

      /* --- Nicht approved: block --- */
      if (user.approved !== true) {
        return res.status(403).json({
          code: "ACCOUNT_NOT_APPROVED",
          message: "Account wartet auf Freigabe",
        });
      }

      const required = normalizeLevel(minLevel);
      const current = normalizeLevel(user.accessPolicy?.[pageKey]);

      if (!meets(current, required)) {
        if (req.adminError) {
          return res.status(401).json({
            code: "ADMIN_SESSION_EXPIRED",
            message: "Die Admin-Sitzung ist abgelaufen. Bitte den Adminbereich erneut freischalten.",
          });
        }
        return res.status(403).json({
          code: "INSUFFICIENT_PERMISSION",
          message: `Access denied (${pageKey}:${required})`,
        });
      }

      next();
    } catch (err) {
      console.error("RBAC ERROR:", err);
      res.status(500).json({ message: "Permission check failed" });
    }
  };
}
