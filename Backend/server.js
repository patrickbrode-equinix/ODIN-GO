/* ------------------------------------------------ */
/* OES BACKEND – MAIN ENTRY POINT (ROBUST)          */
/* ------------------------------------------------ */

// NOTE: do NOT add 'import dotenv/config' — config/index.js handles it.
import { config } from "./config/index.js";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// DB
import { testConnection, checkHealth, query as dbQuery } from "./db.js";

// DB Migrations
import { runMigrations } from "./db/migrations/runner.js";
import { seedDefaultAdmin } from "./db/seed.js";
import { provisionUsersFromShiftplan } from "./services/shiftUserProvisioning.service.js";

// Routes
import queueSnapshotRoute from "./routes/queue/snapshot.route.js";
import queueRoutes from "./routes/queue.js";
import healthRoutes from "./routes/health.js";
import metricsRoutes from "./routes/metrics.js";
import marketRoutes from "./routes/market.js";
import kioskRoutes from "./routes/kiosk.js";
import dashboardRoutes from "./routes/dashboard.js";
import userSettingsRoutes from "./routes/userSettings.js";
import authRoutes from "./routes/auth/index.js";
import activityRoutes from "./routes/activity.js";
import schedulesRoutes from "./routes/schedules.js";
import statusRoutes from "./routes/status.js";
import commitRoutes from "./routes/commit.js";
import ingestRoutes from "./routes/ingest.js";
import adminUsersRoutes from "./routes/adminUsers.js";
import adminGroupsRoutes from "./routes/adminGroups.js";
import handoverRoutes from "./routes/handover.js";
import commitComplianceRoutes from "./routes/commitCompliance.js";
import statsRoutes from "./routes/stats.js";
import holidaysRoutes from "./routes/holidays.js";
import competenciesRoutes from "./routes/competencies.js";
import projectsRoutes from "./routes/projects.js";
import appSettingsRoutes from "./routes/appSettings.js";
import sseRoutes from "./routes/sse.js";
import teamsRoutes from "./routes/teams.js";
import tvRoutes from "./routes/tv.js";
import eventsRoutes from "./routes/events.js";
import assignmentRoutes from "./routes/assignment.js";
import engineRoutes from "./routes/engine.js";
import feedbackRoutes from "./routes/feedback.js";
import shiftplanControlRoutes from "./routes/shiftplanControl.js";
import shiftConfigRoutes from "./routes/shiftConfig.js";
import verificationRoutes from "./routes/verification.js";
import standaloneAdminRoutes from "./routes/standaloneAdmin.js";
import standaloneIdentityRoutes from "./routes/standaloneIdentity.js";
import cocRoutes from "./routes/coc.js";
import jarvisNotificationsRoutes from "./routes/jarvisNotifications.js";
import odinGoRoutes from "./routes/odinGo.js";
import shiftHandoverRoutes from "./routes/shiftHandovers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ------------------------------------------------ */
/* CONFIG                                           */
/* ------------------------------------------------ */

const app = express();
const PORT = config.PORT;

// Behind reverse proxy (Portal / Nginx / Ingress) — trust X-Forwarded-* headers.
app.set("trust proxy", true);

/* ------------------------------------------------ */
/* MIDDLEWARE                                       */
/* ------------------------------------------------ */

// CORS: proxy-mode aware.
// If CORS_ORIGINS env var is NOT explicitly set → proxy mode assumed → allow all origins.
// If CORS_ORIGINS IS set → strict CSV whitelist.
// Blocked origins return 403 (callback(null,false)), NEVER 500 (never throw Error).
const CORS_ORIGINS_EXPLICIT = !!(process.env.CORS_ORIGINS || process.env.CORS_ORIGIN);
if (!CORS_ORIGINS_EXPLICIT) {
  console.warn("[CORS] CORS_ORIGINS not set — allowing all origins (proxy mode). Set CORS_ORIGINS=<comma-separated URLs> to enable strict whitelist.");
} else {
  console.log(`[CORS] Strict whitelist active: ${config.CORS_ORIGINS.join(", ")}`);
}

app.use(cors({
  origin: function (origin, callback) {
    // Always allow: no origin header (curl, healthchecks, server-to-server)
    if (!origin) return callback(null, true);

    // Always allow Chrome extensions (OES Crawler background service worker)
    if (origin.startsWith('chrome-extension://')) return callback(null, true);

    // Proxy mode: no explicit whitelist → allow all
    if (!CORS_ORIGINS_EXPLICIT) return callback(null, true);

    // Strict whitelist check
    if (config.CORS_ORIGINS.includes(origin)) return callback(null, true);

    // Blocked — 403, NOT 500: use callback(null, false), never throw Error
    console.warn(`[CORS] Blocked origin: ${origin} (not in whitelist: ${config.CORS_ORIGINS.join(", ")})`);
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json({ limit: "50mb" }));

if (config.isShiftplannerMode) {
  app.use("/api/standalone-admin", standaloneAdminRoutes);
  app.use("/api/standalone-identity", standaloneIdentityRoutes);
}

/* ------------------------------------------------ */
/* STATIC FILES                                     */
/* Serve /uploads/* directly (images etc.)          */
/* ------------------------------------------------ */
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

/* ------------------------------------------------ */
/* ROUTES                                           */
/* ------------------------------------------------ */

// 0. TV Public endpoints (kiosk-safe, no auth)
app.use("/api/tv", tvRoutes);

// 1. Health + Metrics (proper route files with error handling)
app.use("/api/health", healthRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/market", marketRoutes);

// 2. Auth
if (!config.isShiftplannerMode) {
  app.use("/api/auth", authRoutes);
}

// 3. Queue Snapshot Ingest (public, via ingest key – crawler target)
if (!config.isShiftplannerMode) {
  app.use("/api/queue", queueSnapshotRoute);
}
// 4. Queue GET endpoints (tickets, groups, debug)
if (!config.isShiftplannerMode) {
  app.use("/api/queue", queueRoutes);
}

// 5. Kiosk messages
app.use("/api/kiosk", kioskRoutes);
app.use("/api/jarvis-notifications", jarvisNotificationsRoutes);
app.use("/api/odin-go", odinGoRoutes);
app.use("/api/shift-handovers", shiftHandoverRoutes);

// 6. Dashboard info + toggles
app.use("/api/dashboard", dashboardRoutes);

// 7. User settings + meta
app.use("/api", userSettingsRoutes);

// 8. Activity log
app.use("/api/activity", activityRoutes);

// 9. Schedules
app.use("/api/schedules", schedulesRoutes);

// 10. Status
app.use("/api/status", statusRoutes);

// 11. Commits
if (!config.isShiftplannerMode) {
  app.use("/api/commit", commitRoutes);
}

// 12. Ingest (Excel)
app.use("/api/ingest", ingestRoutes);

// 13. Admin
app.use("/api/admin/users", adminUsersRoutes);
app.use("/api/admin/groups", adminGroupsRoutes);

// 14. Handover
if (!config.isShiftplannerMode) {
  app.use("/api/handover", handoverRoutes);
}

// 16. Commit Compliance (PDF upload)
if (!config.isShiftplannerMode) {
  app.use("/api/commit-compliance", commitComplianceRoutes);
}

// 17. Statistics
app.use("/api/stats", statsRoutes);

// 17a. Ticket Audit (Admin-only statistics)
import ticketAuditRoutes from "./routes/ticketAudit.js";
if (!config.isShiftplannerMode) {
  app.use("/api/stats/audit", ticketAuditRoutes);
}

// 17b. Holidays (public, for Schichtplan)
app.use("/api/holidays", holidaysRoutes);

// 18. Wellbeing
import wellbeingRoutes from "./routes/wellbeing.js";
app.use("/api/wellbeing", wellbeingRoutes);

// 19. Shift Validation
import shiftValidationRoutes from "./routes/shiftValidation.js";
app.use("/api/shiftValidation", shiftValidationRoutes);

// 20. Coverage & Skills
import coverageRoutes from "./routes/coverage.js";
app.use('/api/coverage', coverageRoutes);
// 21. Staffing
import staffingRoutes from "./routes/staffing.js";
app.use('/api/staffing', staffingRoutes);

// 22. Absences
import absencesRoutes from "./routes/absences.js";
import constraintsRoutes from "./routes/constraints.js";
import reportsRoutes from "./routes/reports.js";
import shiftplanDataRoutes from "./routes/shiftplanData.js"; // [NEW]

app.use('/api/absences', absencesRoutes);
app.use("/api/constraints", constraintsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/shiftplan", shiftplanDataRoutes); // [NEW]

// New modules
app.use("/api/competencies", competenciesRoutes);
app.use("/api/projects", projectsRoutes);
app.use("/api/app-settings", appSettingsRoutes);
app.use("/api/sse", sseRoutes);
app.use("/api/teams", teamsRoutes);

// Events (photos for TV slide, auth-protected upload)
app.use("/api/events", eventsRoutes);

// Attendance tracking (Kommen/Gehen)
import attendanceRoutes from "./routes/attendance.js";
app.use("/api/attendance", attendanceRoutes);

// Assignment Engine (ODIN-Logik, Phase 1 Shadow Mode)
if (!config.isShiftplannerMode) {
  app.use("/api/assignment", assignmentRoutes);
}

// Assignment Actions / Writeback (safe, auditable Jarvis writeback layer)
import assignmentActionsRoutes from "./routes/assignmentActions.js";
if (!config.isShiftplannerMode) {
  app.use("/api/assignment-actions", assignmentActionsRoutes);
}

// Legacy engine endpoints kept for backwards compatibility
if (!config.isShiftplannerMode) {
  app.use("/api/engine", engineRoutes);
}

// Shift Verification (employee self-check via Teams)
app.use("/api/verification", verificationRoutes);

// Shiftplan Control Center (Draft generation, activation, Excel)
app.use("/api/shiftplan-control", shiftplanControlRoutes);

// Shift Configuration (definitions, rotation rules, fairness, exclusions, preferences)
app.use("/api/shift-config", shiftConfigRoutes);

// CoC - Chain of Command improvement workflow
app.use("/api/coc", cocRoutes);

// Feedback (email via SMTP)
app.use("/api/feedback", feedbackRoutes);

// Weekplan Roles (per-employee per-day role assignments)
import weekplanRolesRoutes from "./routes/weekplanRoles.js";
app.use("/api/weekplan-roles", weekplanRolesRoutes);

// Employee Contacts (E-Mail-Pflege für Teams-Bot)
import employeeContactsRoutes from "./routes/employeeContacts.js";
app.use("/api/employee-contacts", employeeContactsRoutes);

// TV Slide Config (kiosk + admin)
import tvConfigRoutes from "./routes/tvConfig.js";
app.use("/api/tv/config", tvConfigRoutes);

// Teams Communication Center Config
import teamsConfigRoutes from "./routes/teamsConfig.js";
app.use("/api/teams-config", teamsConfigRoutes);

// Assignment Rules Config (ODIN Logic Editor)
import assignmentRulesRoutes from "./routes/assignmentRules.js";
if (!config.isShiftplannerMode) {
  app.use("/api/assignment-rules", assignmentRulesRoutes);
}

// Settings Audit Log
import settingsAuditRoutes from "./routes/settingsAudit.js";
app.use("/api/admin/settings-audit", settingsAuditRoutes);

// Fairness & Variety Settings (ODIN)
import fairnessSettingsRoutes from "./routes/fairnessSettings.js";
if (!config.isShiftplannerMode) {
  app.use("/api/admin/fairness-settings", fairnessSettingsRoutes);
}

// Polls / Umfragen
import pollsRoutes from "./routes/polls.js";
app.use("/api/polls", pollsRoutes);

/* ------------------------------------------------ */
/* GLOBAL ERROR HANDLER                             */
/* Catches express.json() SyntaxError (malformed    */
/* JSON body) and returns structured JSON 400       */
/* instead of Express's default HTML error page.   */
/* Also catches other unhandled route errors.       */
/* ------------------------------------------------ */
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  // Body-parser SyntaxError (invalid JSON)
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.warn(`[BODY PARSE] Invalid JSON from ${req.ip} ${req.method} ${req.path}: ${err.message}`);
    return res.status(400).json({
      ok: false,
      error: "json_parse_error",
      hint: "Request body is not valid JSON. Ensure Content-Type: application/json and body is valid JSON.",
    });
  }
  // Generic fallback error handler
  const status = typeof err.status === "number" ? err.status : 500;
  console.error(`[ERROR HANDLER] ${req.method} ${req.path} → ${status}:`, err.message || err);
  return res.status(status).json({
    ok: false,
    error: err.message || "Internal Server Error",
  });
});

let serverInstance = null;

async function start() {
  // 1. DB Connection with retry/backoff (max 10 attempts, 5s apart ~50s total)
  let dbOk = false;
  const DB_MAX_RETRIES = 10;
  const DB_RETRY_DELAY_MS = 5_000;

  for (let attempt = 1; attempt <= DB_MAX_RETRIES; attempt++) {
    dbOk = await testConnection();
    if (dbOk) break;
    if (attempt < DB_MAX_RETRIES) {
      console.warn(`[STARTUP] DB not ready (attempt ${attempt}/${DB_MAX_RETRIES}). Retrying in ${DB_RETRY_DELAY_MS / 1000}s...`);
      await new Promise((r) => setTimeout(r, DB_RETRY_DELAY_MS));
    }
  }

  if (!dbOk) {
    console.error("!! [STARTUP] DB Connection Failed after all retries. Server starting in DEGRADED mode.");
  } else {
    // 2. Run migrations only if DB ok
    await runMigrations();
    // 3. Ensure master account exists with recovery-safe credentials.
    await seedDefaultAdmin();
    // 4. Ensure shiftplan employees exist as SSO-only identities.
    try {
      const provisioningSummary = await provisionUsersFromShiftplan({ logger: console });
      console.log(
        `[STARTUP] User provisioning summary: ${provisioningSummary.created} created, ${provisioningSummary.updated} updated, ${provisioningSummary.skipped} skipped.`
      );
    } catch (provisioningError) {
      console.error("[STARTUP] Shiftplan user provisioning failed:", provisioningError?.message || provisioningError);
    }
  }

  // 3. Listen
  // Check if already listening (should not happen in this script structure but good for safety)
  if (serverInstance) {
    console.warn("!! [SERVER] Server already running. Ignoring duplicate start call.");
    return;
  }

  // Log cleanup job: delete activity_log entries older than configured retention days (runs every 6 hours)
  const LOG_CLEANUP_MS = 6 * 60 * 60 * 1000;
  async function cleanupOldLogs() {
    try {
      const { rows } = await dbQuery(
        `SELECT value FROM app_settings WHERE key = 'log_retention_days'`
      ).catch(() => ({ rows: [] }));
      const days = parseInt(rows[0]?.value || "90");
      const result = await dbQuery(
        `DELETE FROM activity_log WHERE ts < NOW() - INTERVAL '1 day' * $1`,
        [days]
      );
      if (result.rowCount > 0) {
        console.log(`[LOG CLEANUP] Deleted ${result.rowCount} old log entries (>${days} days).`);
      }
    } catch (e) { /* ignore – DB may be transiently unavailable */ }
  }
  setInterval(cleanupOldLogs, LOG_CLEANUP_MS);
  cleanupOldLogs();

  serverInstance = app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n✅ [SERVER] PID: ${process.pid}`);
    console.log(`✅ [SERVER] Listening on http://0.0.0.0:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/api/health`);
    if (!dbOk) console.warn("   ⚠️  WARNING: Database is NOT connected.");

    // Start verification scheduler (checks every 60s if verifications need sending)
    import("./services/verificationScheduler.js")
      .then(({ startVerificationScheduler }) => startVerificationScheduler())
      .catch((err) => console.warn("[SERVER] Verification scheduler not started:", err?.message));

    if (config.isShiftplannerMode) {
      console.log("[SERVER] Shiftplanner mode: assignment scheduler disabled.");
    } else {
      // Start assignment scheduler (polls assignment.enabled and runs the engine automatically)
      import("./services/assignmentScheduler.js")
        .then(({ startAssignmentScheduler }) => startAssignmentScheduler())
        .catch((err) => console.warn("[SERVER] Assignment scheduler not started:", err?.message));
    }
  });

  // 4. Error Handling (EADDRINUSE)
  serverInstance.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`\n❌ [ODIN][SERVER] Port ${PORT} already in use (EADDRINUSE). Exiting.`);
      process.exit(1);
    } else {
      console.error("\n❌ [ODIN][SERVER] Server Error:", err);
      process.exit(1);
    }
  });

  // 5. Graceful Shutdown
  const shutdown = () => {
    console.log("\n[ODIN][SERVER] Shutting down...");
    serverInstance.close(() => {
      console.log("[ODIN][SERVER] Server closed.");
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

// Start the server
start();
