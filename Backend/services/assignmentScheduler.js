/* ================================================ */
/* Assignment Scheduler                             */
/* Polls assignment.enabled and runs ODIN engine    */
/* automatically when automation is active.         */
/* ================================================ */

import { assignmentSettingsService } from '../assignment/services/index.js';
import { runAssignmentCycle } from '../assignment/engine/runAssignmentCycle.js';

let intervalId = null;
let immediateTimerId = null;
let runInProgress = false;

const CHECK_INTERVAL_MS = 60_000;

async function runCycle(trigger = 'interval') {
  if (runInProgress) {
    return;
  }

  try {
    const { settings } = await assignmentSettingsService.getAll();
    if (settings['assignment.enabled'] !== 'true') {
      return;
    }

    runInProgress = true;
    const result = await runAssignmentCycle({ triggeredBy: `scheduler:${trigger}` });
    if (result?.runId) {
      console.log(`[ASSIGNMENT SCHEDULER] Run #${result.runId} completed via ${trigger}`);
    }
  } catch (err) {
    if (String(err?.message || '').includes('already running')) {
      console.log('[ASSIGNMENT SCHEDULER] Skipping tick because another assignment cycle is already active');
      return;
    }

    console.error('[ASSIGNMENT SCHEDULER] Cycle error:', err?.message || err);
  } finally {
    runInProgress = false;
  }
}

export function triggerAssignmentSchedulerSoon(delayMs = 1_000) {
  if (immediateTimerId) {
    clearTimeout(immediateTimerId);
  }

  immediateTimerId = setTimeout(() => {
    immediateTimerId = null;
    runCycle('manual-trigger');
  }, Math.max(0, delayMs));
}

export function startAssignmentScheduler() {
  if (intervalId) return;

  console.log('[ASSIGNMENT SCHEDULER] Starting (interval: 60s)');
  triggerAssignmentSchedulerSoon(5_000);
  intervalId = setInterval(() => {
    runCycle('interval');
  }, CHECK_INTERVAL_MS);
}

export function stopAssignmentScheduler() {
  if (immediateTimerId) {
    clearTimeout(immediateTimerId);
    immediateTimerId = null;
  }

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[ASSIGNMENT SCHEDULER] Stopped');
  }
}

export function getAssignmentSchedulerStatus() {
  return {
    running: !!intervalId,
    runInProgress,
    intervalMs: CHECK_INTERVAL_MS,
  };
}