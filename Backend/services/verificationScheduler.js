/* ================================================ */
/* Shift Verification Scheduler                     */
/* Lightweight interval runner that checks if any   */
/* verification messages need to be sent.           */
/* Runs every 60 seconds when enabled.              */
/* ================================================ */

import { triggerPendingVerifications, getVerificationSettings } from "./shiftVerification.js";

let intervalId = null;
const CHECK_INTERVAL_MS = 60_000; // 1 minute

/**
 * Create the Teams verification sender function.
 * Calls the Teams Bot's internal API.
 */
function createTeamsSender() {
  const botBaseUrl = process.env.TEAMS_BOT_URL || "http://localhost:3978";
  const botSecret = process.env.ODIN_BOT_SECRET || process.env.TEAMS_BOT_SECRET || "dev-secret";

  return async function sendTeamsVerification(employeeName, shiftCode, date) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(`${botBaseUrl}/api/internal/notify/verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": botSecret,
        },
        body: JSON.stringify({ employeeName, shiftCode, date }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text().catch(() => "");
        return { success: false, error: `Bot returned ${response.status}: ${text.slice(0, 200)}` };
      }

      const data = await response.json();
      return { success: data.success !== false, error: data.error };
    } catch (err) {
      return { success: false, error: String(err.message || err) };
    }
  };
}

async function runCycle() {
  try {
    const settings = await getVerificationSettings();
    if (!settings.enabled) return;

    const sender = createTeamsSender();
    const result = await triggerPendingVerifications(sender);

    if (result.triggered > 0 || result.failed > 0 || result.timedOut > 0) {
      console.log(
        `[VERIFICATION SCHEDULER] triggered=${result.triggered} skipped=${result.skipped} failed=${result.failed} timedOut=${result.timedOut}`
      );
    }
    if (result.errors?.length) {
      for (const e of result.errors) {
        console.warn(`[VERIFICATION SCHEDULER] Error: ${e}`);
      }
    }
  } catch (err) {
    console.error("[VERIFICATION SCHEDULER] Cycle error:", err?.message || err);
  }
}

/**
 * Start the verification scheduler.
 * Safe to call multiple times (idempotent).
 */
export function startVerificationScheduler() {
  if (intervalId) return;
  console.log("[VERIFICATION SCHEDULER] Starting (interval: 60s)");
  // Run once immediately (after a short delay to let DB initialize)
  setTimeout(runCycle, 5_000);
  intervalId = setInterval(runCycle, CHECK_INTERVAL_MS);
}

/**
 * Stop the verification scheduler.
 */
export function stopVerificationScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[VERIFICATION SCHEDULER] Stopped");
  }
}
