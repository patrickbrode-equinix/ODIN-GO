/* ------------------------------------------------ */
/* lib/dateParser.js                                */
/* Pure date parsing functions for queue ingestion. */
/* Supports: DE (DD.MM.YYYY), US (M/d/yyyy h:mm),  */
/* ISO-like strings.                                */
/*                                                  */
/* All ambiguous (no-offset) dates are interpreted  */
/* in OPERATIONAL_TIMEZONE, NOT the system timezone. */
/* ------------------------------------------------ */

import { config } from "../config/index.js";

const OPS_TZ = config.OPERATIONAL_TIMEZONE || "Europe/Berlin";

/**
 * Convert date components (year, month0, day, hour, min, sec) expressed
 * in the operational timezone to a UTC millisecond timestamp.
 *
 * Uses Intl.DateTimeFormat to determine the UTC offset of OPS_TZ at the
 * given point in time, making this robust against DST transitions.
 */
function datePartsToUtcMs(year, month0, day, hour, min, sec) {
  // Step 1: treat the face values as if they were UTC
  const faceUtcMs = Date.UTC(year, month0, day, hour, min, sec);

  // Step 2: format that UTC instant in OPS_TZ to see what date/time it maps to
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: OPS_TZ,
    year: "numeric", month: "numeric", day: "numeric",
    hour: "numeric", minute: "numeric", second: "numeric",
    hourCycle: "h23",
  });
  const parts = {};
  for (const { type, value } of fmt.formatToParts(new Date(faceUtcMs))) {
    if (type !== "literal") parts[type] = parseInt(value, 10);
  }

  // Step 3: the OPS_TZ representation of faceUtcMs, back as UTC face
  const tzViewUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day,
                               parts.hour, parts.minute, parts.second);

  // Step 4: offset = how far ahead OPS_TZ is from UTC at this moment
  const offsetMs = tzViewUtcMs - faceUtcMs;

  // Step 5: we want the UTC instant where OPS_TZ local = our input
  //         local = utc + offset → utc = local - offset = faceUtcMs - offsetMs
  return faceUtcMs - offsetMs;
}

/**
 * Parse a date string (DE, US, or ISO) to milliseconds (UTC).
 * Ambiguous formats (no timezone info) are interpreted in OPERATIONAL_TIMEZONE.
 * Returns null if unparseable.
 */
export function parseCommitDateToMs(v) {
  if (!v) return null;
  const txt = String(v).trim();
  if (!txt) return null;

  // DE: DD.MM.YYYY [HH:MM[:SS]]
  const de = txt.match(
    /^([0-9]{1,2})\.([0-9]{1,2})\.([0-9]{4})(?:\s+([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?)?$/
  );
  if (de) {
    const dd   = Number(de[1]);
    const mm   = Number(de[2]);
    const yyyy = Number(de[3]);
    const hh   = Number(de[4] || 0);
    const mi   = Number(de[5] || 0);
    const ss   = Number(de[6] || 0);
    const ms   = datePartsToUtcMs(yyyy, mm - 1, dd, hh, mi, ss);
    return Number.isFinite(ms) ? ms : null;
  }

  // US: M/d/yyyy, h:mm[:ss] AM/PM  (Jarvis EMEA sends this format)
  const us = txt.match(
    /^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4}),?\s+([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?\s*(AM|PM)$/i
  );
  if (us) {
    const mm   = Number(us[1]);
    const dd   = Number(us[2]);
    const yyyy = Number(us[3]);
    let hh     = Number(us[4]);
    const mi   = Number(us[5]);
    const ss   = Number(us[6] || 0);
    const ampm = (us[7] || "").toUpperCase();
    if (ampm === "PM" && hh < 12) hh += 12;
    if (ampm === "AM" && hh === 12) hh = 0;
    const ms = datePartsToUtcMs(yyyy, mm - 1, dd, hh, mi, ss);
    return Number.isFinite(ms) ? ms : null;
  }

  // US date-only: M/d/yyyy (no time)
  const usDateOnly = txt.match(/^([0-9]{1,2})\/([0-9]{1,2})\/([0-9]{4})$/);
  if (usDateOnly) {
    const mm   = Number(usDateOnly[1]);
    const dd   = Number(usDateOnly[2]);
    const yyyy = Number(usDateOnly[3]);
    const ms   = datePartsToUtcMs(yyyy, mm - 1, dd, 0, 0, 0);
    return Number.isFinite(ms) ? ms : null;
  }

  // ISO with explicit offset or Z → use native parser (already TZ-aware)
  if (/[Zz]|[+-]\d{2}:\d{2}/.test(txt)) {
    const d = new Date(txt);
    return Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  // ISO-like without offset: YYYY-MM-DD or YYYY-MM-DD HH:MM[:SS]
  const isoMatch = txt.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );
  if (isoMatch) {
    const yyyy = Number(isoMatch[1]);
    const mm   = Number(isoMatch[2]);
    const dd   = Number(isoMatch[3]);
    const hh   = Number(isoMatch[4] || 0);
    const mi   = Number(isoMatch[5] || 0);
    const ss   = Number(isoMatch[6] || 0);
    const ms   = datePartsToUtcMs(yyyy, mm - 1, dd, hh, mi, ss);
    return Number.isFinite(ms) ? ms : null;
  }

  // Fallback: native Date parser
  const d = new Date(txt);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

/**
 * Parse any supported date format to ISO string.
 * Returns null if unparseable.
 */
export function parseAnyDateToIso(v) {
  if (!v) return null;
  const txt = String(v).trim();
  if (!txt) return null;

  const ms = parseCommitDateToMs(txt);
  if (ms !== null) {
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  const d = new Date(txt);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

/**
 * Format a remaining time string from a commit date.
 * Returns "" if date is unparseable.
 */
export function formatRemainingFromCommit(commitDate) {
  const ms = parseCommitDateToMs(commitDate);
  if (ms === null) return "";
  const diffMin = Math.round((ms - Date.now()) / 60000);
  const sign    = diffMin < 0 ? -1 : 1;
  const abs     = Math.abs(diffMin);

  const days  = Math.floor(abs / (24 * 60));
  const hours = Math.floor((abs - days * 24 * 60) / 60);
  const mins  = abs - days * 24 * 60 - hours * 60;

  const sgn = sign < 0 ? "-" : "";
  return `${sgn}${days} D ${sgn}${hours} H ${sgn}${mins} M`;
}

/**
 * Calculate remaining hours from a commit date.
 * Returns null if unparseable.
 */
export function remainingHoursFromCommit(commitDate) {
  const ms = parseCommitDateToMs(commitDate);
  if (ms === null) return null;
  return (ms - Date.now()) / 3600000;
}
