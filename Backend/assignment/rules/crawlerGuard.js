/* ================================================ */
/* Assignment Engine — Crawler Staleness Guard      */
/* ================================================ */

import { CRAWLER_MAX_AGE_MS } from '../constants.js';

/**
 * Check if crawler data is fresh enough for assignment.
 *
 * GLOBAL SAFETY RULE:
 *   If crawler data is older than 10 minutes:
 *   - do not assign tickets
 *   - raise crawler warning
 *   - stop assignment cycle
 *
 * @param {string|Date|null} lastCrawlerTimestamp - Last crawler snapshot_at
 * @param {number} [now] - Current time in ms (for testing)
 * @param {number} [maxAgeMs] - Override max age (default: 10 min)
 * @returns {{ fresh: boolean, reason: string, staleDurationMs: number|null }}
 */
export function checkCrawlerFreshness(lastCrawlerTimestamp, now = Date.now(), maxAgeMs = CRAWLER_MAX_AGE_MS) {
  if (!lastCrawlerTimestamp) {
    return {
      fresh: false,
      reason: 'No crawler timestamp available — cannot verify data freshness',
      staleDurationMs: null,
    };
  }

  const crawlerTime = new Date(lastCrawlerTimestamp).getTime();
  if (isNaN(crawlerTime)) {
    return {
      fresh: false,
      reason: `Invalid crawler timestamp: "${lastCrawlerTimestamp}"`,
      staleDurationMs: null,
    };
  }

  const age = now - crawlerTime;

  if (age > maxAgeMs) {
    return {
      fresh: false,
      reason: `Crawler data is ${Math.round(age / 60000)} minutes old (max: ${Math.round(maxAgeMs / 60000)} minutes)`,
      staleDurationMs: age,
    };
  }

  return {
    fresh: true,
    reason: `Crawler data is ${Math.round(age / 1000)} seconds old — within freshness window`,
    staleDurationMs: age,
  };
}
