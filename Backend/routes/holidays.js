/* ------------------------------------------------ */
/* HOLIDAYS ROUTE                                   */
/* GET /api/holidays?year=YYYY&state=HE             */
/* Returns nationwide + Hessen (HE) public holidays */
/* In-memory cache, no DB required                  */
/* ------------------------------------------------ */

import express from "express";

const router = express.Router();

// In-memory cache: `${year}:${state}` -> array of { date, name }
const cache = new Map();

// Easter Sunday (Gauss algorithm)
function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31) - 1; // 0-indexed
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month, day);
}

function addDays(date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
}

function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
}

function computeHolidays(year, state) {
    const easter = easterSunday(year);
    const holidays = [
        { date: toISO(new Date(year, 0, 1)), name: "Neujahr" },
        { date: toISO(addDays(easter, -2)), name: "Karfreitag" },
        { date: toISO(addDays(easter, 1)), name: "Ostermontag" },
        { date: toISO(new Date(year, 4, 1)), name: "Tag der Arbeit" },
        { date: toISO(addDays(easter, 39)), name: "Christi Himmelfahrt" },
        { date: toISO(addDays(easter, 50)), name: "Pfingstmontag" },
        { date: toISO(new Date(year, 9, 3)), name: "Tag der Deutschen Einheit" },
        { date: toISO(new Date(year, 11, 25)), name: "1. Weihnachtstag" },
        { date: toISO(new Date(year, 11, 26)), name: "2. Weihnachtstag" },
    ];

    // Hessen-specific: Fronleichnam (Corpus Christi) = Easter + 60 days
    if (state === "HE") {
        holidays.push({ date: toISO(addDays(easter, 60)), name: "Fronleichnam" });
    }

    // Sort by date
    holidays.sort((a, b) => a.date.localeCompare(b.date));
    return holidays;
}

// GET /api/holidays?year=2026&state=HE
router.get("/", (req, res) => {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const state = (req.query.state || "DE").toUpperCase();

    const cacheKey = `${year}:${state}`;
    if (cache.has(cacheKey)) {
        return res.json(cache.get(cacheKey));
    }

    const holidays = computeHolidays(year, state);
    cache.set(cacheKey, holidays);
    res.json(holidays);
});

export default router;
