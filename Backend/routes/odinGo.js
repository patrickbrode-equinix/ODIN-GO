import express from "express";
import { isIP } from "node:net";
import db from "../db.js";
import { requireAuth, requireVerifiedIdentity } from "../middleware/authMiddleware.js";
import { parseMonthLabel } from "../lib/monthParser.js";

const router = express.Router();
router.use(requireAuth);

const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000;
const weatherCache = new Map();
const FALLBACK_LOCATION = {
  latitude: Number(process.env.WEATHER_FALLBACK_LAT || 50.1109),
  longitude: Number(process.env.WEATHER_FALLBACK_LON || 8.6821),
  city: String(process.env.WEATHER_FALLBACK_NAME || "Frankfurt am Main"),
  region: "Hessen",
  country: "Deutschland",
  timezone: "Europe/Berlin",
};

export function classifyShiftCode(value) {
  const code = String(value || "").trim().toUpperCase();
  if (/^(?:E|HE)/.test(code)) return "early";
  if (/^(?:L|HL)/.test(code)) return "late";
  if (code === "N" || code.startsWith("NACHT")) return "night";
  return null;
}

function normalizeClientIp(value) {
  let ip = String(value || "").split(",")[0].trim();
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip.startsWith("[") && ip.includes("]")) ip = ip.slice(1, ip.indexOf("]"));
  return isIP(ip) ? ip : "";
}

export function isPrivateIp(value) {
  const ip = normalizeClientIp(value);
  if (!ip) return true;
  if (ip === "::1") return true;
  if (ip.includes(":")) {
    const normalized = ip.toLowerCase();
    return normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb");
  }
  const octets = ip.split(".").map(Number);
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

function localDateKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function parseDateKey(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() + 1 !== month || candidate.getUTCDate() !== day) return null;
  return { year, month, day, key: raw };
}

async function fetchMonthRows(parsedMonth) {
  const { rows } = await db.query(
    `SELECT month, employee_name, day, shift_code
       FROM shifts
      WHERE month LIKE $1`,
    [`%${parsedMonth.year}%`],
  );
  return rows.filter((row) => {
    const parsed = parseMonthLabel(String(row.month || ""));
    return parsed?.year === parsedMonth.year && parsed?.month === parsedMonth.month;
  });
}

export function buildSchedulePayload(rows, requestedLabel, parsedMonth) {
  const schedule = {};
  for (const row of rows) {
    const employeeName = String(row.employee_name || "").trim();
    const day = Number(row.day);
    if (!employeeName || !Number.isInteger(day) || day < 1 || day > 31) continue;
    if (!schedule[employeeName]) schedule[employeeName] = {};
    schedule[employeeName][day] = String(row.shift_code || "").trim();
  }
  const storedLabel = String(rows[0]?.month || requestedLabel);
  return {
    meta: {
      label: storedLabel,
      year: parsedMonth.year,
      month: parsedMonth.month,
      id: `${parsedMonth.year}-${String(parsedMonth.month).padStart(2, "0")}`,
      daysInMonth: new Date(parsedMonth.year, parsedMonth.month, 0).getDate(),
    },
    schedule,
    manualEmployees: [],
  };
}

async function fetchJson(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "ODIN-GO/1.0" }, signal: controller.signal });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function resolveWeatherLocation(req) {
  const clientIp = normalizeClientIp(req.ips?.[0] || req.ip || req.socket?.remoteAddress);
  if (!clientIp || isPrivateIp(clientIp)) return { ...FALLBACK_LOCATION, source: "fallback" };
  try {
    const geo = await fetchJson(`https://ipwho.is/${encodeURIComponent(clientIp)}?fields=success,message,city,region,country,latitude,longitude,timezone`, 4000);
    if (geo?.success !== true || !Number.isFinite(Number(geo.latitude)) || !Number.isFinite(Number(geo.longitude))) {
      throw new Error(geo?.message || "IP location unavailable");
    }
    return {
      latitude: Number(geo.latitude),
      longitude: Number(geo.longitude),
      city: String(geo.city || "Standort"),
      region: String(geo.region || ""),
      country: String(geo.country || ""),
      timezone: String(geo.timezone?.id || geo.timezone || "auto"),
      source: "ip",
    };
  } catch (error) {
    console.warn("[odin-go] IP location unavailable, using fallback", error?.message || error);
    return { ...FALLBACK_LOCATION, source: "fallback" };
  }
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function buildWeatherPayload(weather, location) {
  const hourlyTimes = Array.isArray(weather?.hourly?.time) ? weather.hourly.time : [];
  const dailyTimes = Array.isArray(weather?.daily?.time) ? weather.daily.time : [];
  const hourly = hourlyTimes.map((time, index) => ({
    time,
    temperature: finiteNumber(weather?.hourly?.temperature_2m?.[index]),
    apparentTemperature: finiteNumber(weather?.hourly?.apparent_temperature?.[index]),
    weatherCode: finiteNumber(weather?.hourly?.weather_code?.[index]),
    precipitationProbability: finiteNumber(weather?.hourly?.precipitation_probability?.[index]),
    windSpeed: finiteNumber(weather?.hourly?.wind_speed_10m?.[index]),
  }));
  const daily = dailyTimes.map((date, index) => ({
    date,
    weatherCode: finiteNumber(weather?.daily?.weather_code?.[index]),
    temperatureMax: finiteNumber(weather?.daily?.temperature_2m_max?.[index]),
    temperatureMin: finiteNumber(weather?.daily?.temperature_2m_min?.[index]),
    precipitationProbability: finiteNumber(weather?.daily?.precipitation_probability_max?.[index]),
    windSpeedMax: finiteNumber(weather?.daily?.wind_speed_10m_max?.[index]),
    sunrise: weather?.daily?.sunrise?.[index] || null,
    sunset: weather?.daily?.sunset?.[index] || null,
  }));

  return {
    available: Number.isFinite(Number(weather?.current?.temperature_2m)),
    location: { city: location.city, region: location.region, country: location.country, source: location.source },
    timezone: String(weather?.timezone || location.timezone || "Europe/Berlin"),
    current: {
      temperature: finiteNumber(weather?.current?.temperature_2m),
      apparentTemperature: finiteNumber(weather?.current?.apparent_temperature),
      weatherCode: finiteNumber(weather?.current?.weather_code),
      windSpeed: finiteNumber(weather?.current?.wind_speed_10m),
      isDay: Number(weather?.current?.is_day) === 1,
      asOf: weather?.current?.time || null,
    },
    hourly,
    daily,
    source: "open-meteo",
    cached: false,
  };
}

router.get("/schedule/:month", async (req, res) => {
  try {
    const requestedLabel = String(req.params.month || "").trim();
    const parsedMonth = parseMonthLabel(requestedLabel);
    if (!parsedMonth) return res.status(400).json({ error: "INVALID_MONTH", message: "Ungültiger Monat." });
    const rows = await fetchMonthRows(parsedMonth);
    return res.json(buildSchedulePayload(rows, requestedLabel, parsedMonth));
  } catch (error) {
    console.error("ODIN GO SCHEDULE ERROR:", error);
    return res.status(500).json({ error: "SCHEDULE_LOAD_FAILED", message: "Der Dienstplan konnte nicht geladen werden." });
  }
});

router.get("/overview", async (req, res) => {
  try {
    const parsedDate = parseDateKey(req.query?.date || localDateKey());
    if (!parsedDate) return res.status(400).json({ error: "INVALID_DATE", message: "Ungültiges Datum." });
    const rows = (await fetchMonthRows(parsedDate)).filter((row) => Number(row.day) === parsedDate.day);
    const employees = { early: new Set(), late: new Set(), night: new Set() };
    for (const row of rows) {
      const category = classifyShiftCode(row.shift_code);
      const employeeName = String(row.employee_name || "").trim();
      if (category && employeeName) employees[category].add(employeeName);
    }
    return res.json({
      date: parsedDate.key,
      staffing: {
        early: employees.early.size,
        late: employees.late.size,
        night: employees.night.size,
      },
    });
  } catch (error) {
    console.error("ODIN GO OVERVIEW ERROR:", error);
    return res.status(500).json({ error: "OVERVIEW_LOAD_FAILED", message: "Die Personalstärke konnte nicht geladen werden." });
  }
});

router.get("/weather", async (req, res) => {
  const location = await resolveWeatherLocation(req);
  const cacheKey = `${location.latitude.toFixed(2)}:${location.longitude.toFixed(2)}`;
  const cached = weatherCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_CACHE_TTL_MS) return res.json({ ...cached.data, cached: true });
  try {
    const query = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current: "temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m",
      hourly: "temperature_2m,apparent_temperature,weather_code,precipitation_probability,wind_speed_10m",
      daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,sunrise,sunset",
      forecast_days: "7",
      timezone: location.timezone || "auto",
    });
    const weather = await fetchJson(`https://api.open-meteo.com/v1/forecast?${query.toString()}`, 5000);
    const data = buildWeatherPayload(weather, location);
    weatherCache.set(cacheKey, { data, fetchedAt: Date.now() });
    return res.json(data);
  } catch (error) {
    console.warn("[odin-go] Weather unavailable", error?.message || error);
    if (cached) return res.json({ ...cached.data, cached: true, stale: true });
    return res.json({ available: false, location: { city: location.city, region: location.region, country: location.country, source: location.source }, current: null, source: "open-meteo", cached: false });
  }
});

router.use(requireVerifiedIdentity);

function normalizeRatio(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(1, Math.max(0, number));
}

router.get("/preferences", async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT launcher_x_ratio, launcher_y_ratio, updated_at
         FROM odin_go_user_preferences
        WHERE user_id = $1`,
      [req.user.id],
    );
    const preference = rows[0];
    res.json({
      userId: req.user.id,
      launcherPosition: preference?.launcher_x_ratio == null || preference?.launcher_y_ratio == null
        ? null
        : {
            xRatio: Number(preference.launcher_x_ratio),
            yRatio: Number(preference.launcher_y_ratio),
          },
      updatedAt: preference?.updated_at || null,
    });
  } catch (error) {
    console.error("ODIN GO PREFERENCES GET ERROR:", error);
    res.status(500).json({ error: "ODIN_GO_PREFERENCES_FAILED", message: "Die Button-Position konnte nicht geladen werden." });
  }
});

router.put("/preferences", async (req, res) => {
  const xRatio = normalizeRatio(req.body?.launcherPosition?.xRatio);
  const yRatio = normalizeRatio(req.body?.launcherPosition?.yRatio);
  if (xRatio == null || yRatio == null) {
    return res.status(400).json({ error: "INVALID_LAUNCHER_POSITION", message: "Die Button-Position ist ungültig." });
  }

  try {
    const { rows } = await db.query(
      `INSERT INTO odin_go_user_preferences (user_id, launcher_x_ratio, launcher_y_ratio)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE
         SET launcher_x_ratio = EXCLUDED.launcher_x_ratio,
             launcher_y_ratio = EXCLUDED.launcher_y_ratio,
             updated_at = NOW()
       RETURNING launcher_x_ratio, launcher_y_ratio, updated_at`,
      [req.user.id, xRatio, yRatio],
    );
    res.json({
      userId: req.user.id,
      launcherPosition: {
        xRatio: Number(rows[0].launcher_x_ratio),
        yRatio: Number(rows[0].launcher_y_ratio),
      },
      updatedAt: rows[0].updated_at,
    });
  } catch (error) {
    console.error("ODIN GO PREFERENCES PUT ERROR:", error);
    res.status(500).json({ error: "ODIN_GO_PREFERENCES_FAILED", message: "Die Button-Position konnte nicht gespeichert werden." });
  }
});

export default router;
