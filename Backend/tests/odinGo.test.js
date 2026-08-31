import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import express from "express";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";

import db from "../db.js";
import { config } from "../config/index.js";
import odinGoRoutes, { buildSchedulePayload, buildWeatherPayload, classifyShiftCode, isPrivateIp } from "../routes/odinGo.js";

function startApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/odin-go", odinGoRoutes);
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "x-shiftplanner-key": config.SHIFTPLANNER_API_KEY,
    "x-shiftplanner-identity": jwt.sign(
      { scope: "shiftplanner_identity", userId: 7, displayName: "Test User" },
      config.JWT_SECRET,
    ),
  };
}

function applicationHeaders() {
  return {
    "Content-Type": "application/json",
    "x-shiftplanner-key": config.SHIFTPLANNER_API_KEY,
  };
}

function staleSessionHeaders() {
  return {
    ...applicationHeaders(),
    "x-shiftplanner-admin": "expired-admin-token",
    "x-shiftplanner-identity": "expired-identity-token",
  };
}

function mockDatabase(preference = null) {
  return async (sql, params = []) => {
    const text = String(sql);
    if (text.includes("FROM users")) {
      return { rows: [{ id: 7, login_name: "test.user", email: "test.user@example.test", first_name: "Test", last_name: "User", user_group: "Employee", is_root: false }] };
    }
    if (text.includes("UPDATE users")) return { rows: [], rowCount: 1 };
    if (text.includes("FROM shifts")) {
      return {
        rows: [
          { month: "August 2026", employee_name: "Early One", day: 21, shift_code: "E1" },
          { month: "August 2026", employee_name: "Early Two", day: 21, shift_code: "HE2" },
          { month: "August 2026", employee_name: "Late One", day: 21, shift_code: "L2" },
          { month: "August 2026", employee_name: "Night One", day: 21, shift_code: "N" },
          { month: "August 2026", employee_name: "Off Duty", day: 21, shift_code: "FS" },
        ],
      };
    }
    if (text.includes("SELECT launcher_x_ratio")) {
      return { rows: preference ? [preference] : [] };
    }
    if (text.includes("INSERT INTO odin_go_user_preferences")) {
      return {
        rows: [{ launcher_x_ratio: params[1], launcher_y_ratio: params[2], updated_at: "2026-08-21T10:00:00.000Z" }],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };
}

describe("ODIN GO user preferences", () => {
  let originalQuery;

  beforeEach(() => { originalQuery = db.query; });
  afterEach(() => { db.query = originalQuery; });

  it("returns an empty launcher position for a verified user without preferences", async () => {
    db.query = mockDatabase();
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/odin-go/preferences`, { headers: authHeaders() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.userId, 7);
      assert.equal(body.launcherPosition, null);
    } finally {
      await server.close();
    }
  });

  it("stores a normalized launcher position for the verified user", async () => {
    db.query = mockDatabase();
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/odin-go/preferences`, {
        method: "PUT",
        headers: authHeaders(),
        body: JSON.stringify({ launcherPosition: { xRatio: 0.25, yRatio: 0.75 } }),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.launcherPosition, { xRatio: 0.25, yRatio: 0.75 });
    } finally {
      await server.close();
    }
  });

  it("keeps personal preferences protected when the identity token is stale", async () => {
    db.query = mockDatabase();
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/odin-go/preferences`, { headers: staleSessionHeaders() });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.code, "JARVIS_IDENTITY_REQUIRED");
    } finally {
      await server.close();
    }
  });
});

describe("ODIN GO operational schedule", () => {
  let originalQuery;

  beforeEach(() => { originalQuery = db.query; });
  afterEach(() => { db.query = originalQuery; });

  it("loads the read-only schedule without a Jarvis identity token", async () => {
    db.query = mockDatabase();
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/odin-go/schedule/August%202026`, { headers: applicationHeaders() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.schedule["Early One"][21], "E1");
      assert.equal(body.schedule["Night One"][21], "N");
    } finally {
      await server.close();
    }
  });

  it("loads the read-only schedule when old session tokens are still stored", async () => {
    db.query = mockDatabase();
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/odin-go/schedule/August%202026`, { headers: staleSessionHeaders() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.schedule["Early One"][21], "E1");
    } finally {
      await server.close();
    }
  });

  it("returns distinct staffing totals for the selected day", async () => {
    db.query = mockDatabase();
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/odin-go/overview?date=2026-08-21`, { headers: applicationHeaders() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.deepEqual(body.staffing, { early: 2, late: 1, night: 1 });
    } finally {
      await server.close();
    }
  });

  it("classifies shift variants and ignores absence codes", () => {
    assert.equal(classifyShiftCode("E1WE"), "early");
    assert.equal(classifyShiftCode("HL2"), "late");
    assert.equal(classifyShiftCode("N"), "night");
    assert.equal(classifyShiftCode("ABW"), null);
  });

  it("does not send private network addresses to geolocation providers", () => {
    assert.equal(isPrivateIp("127.0.0.1"), true);
    assert.equal(isPrivateIp("192.168.1.25"), true);
    assert.equal(isPrivateIp("8.8.8.8"), false);
  });

  it("builds a schedule payload with a stable month descriptor", () => {
    const payload = buildSchedulePayload(
      [{ month: "August 2026", employee_name: "Test User", day: 4, shift_code: "L1" }],
      "August 2026",
      { year: 2026, month: 8 },
    );
    assert.equal(payload.meta.id, "2026-08");
    assert.equal(payload.schedule["Test User"][4], "L1");
  });

  it("builds current, hourly and daily weather forecasts", () => {
    const payload = buildWeatherPayload({
      timezone: "Europe/Berlin",
      current: { temperature_2m: 21.4, apparent_temperature: 20.8, weather_code: 2, wind_speed_10m: 11, is_day: 1, time: "2026-08-21T12:00" },
      hourly: { time: ["2026-08-21T12:00"], temperature_2m: [21.4], apparent_temperature: [20.8], weather_code: [2], precipitation_probability: [15], wind_speed_10m: [11] },
      daily: { time: ["2026-08-21"], weather_code: [2], temperature_2m_max: [24], temperature_2m_min: [14], precipitation_probability_max: [20], wind_speed_10m_max: [18], sunrise: ["2026-08-21T06:20"], sunset: ["2026-08-21T20:35"] },
    }, { city: "Frankfurt", region: "Hessen", country: "Deutschland", source: "fallback", timezone: "Europe/Berlin" });
    assert.equal(payload.current.temperature, 21.4);
    assert.equal(payload.hourly[0].precipitationProbability, 15);
    assert.equal(payload.daily[0].temperatureMax, 24);
    assert.equal(payload.daily[0].sunset, "2026-08-21T20:35");
  });
});
