import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import express from "express";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";

import db from "../db.js";
import { config } from "../config/index.js";
import jarvisNotificationRoutes from "../routes/jarvisNotifications.js";

process.env.JWT_SECRET ||= config.JWT_SECRET;

function startApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/jarvis-notifications", jarvisNotificationRoutes);
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => {
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

function authHeaders() {
  if (config.isShiftplannerMode) {
    return {
      "x-shiftplanner-key": config.SHIFTPLANNER_API_KEY,
      "x-shiftplanner-identity": jwt.sign(
        { scope: "shiftplanner_identity", userId: 7, displayName: "Test User" },
        config.JWT_SECRET,
      ),
    };
  }
  return { Authorization: `Bearer ${jwt.sign({ userId: 7 }, config.JWT_SECRET)}` };
}

function createMockQuery({ enabled = true, activeNotifications = [] } = {}) {
  const calls = [];
  const query = async (sql, params = []) => {
    const text = String(sql);
    calls.push({ text, params });
    if (text.includes("SELECT n.*")) {
      return { rows: [{ id: 9, title: "Info", body: "Text", recipients: [] }] };
    }
    if (text.includes("SELECT n.id, n.title") && text.includes("occurrence_key")) {
      return { rows: activeNotifications };
    }
    if (text.includes("SELECT n.id, n.recurrence")) {
      return { rows: [{ id: Number(params[0]), recurrence: "daily" }] };
    }
    if (text.includes("INSERT INTO jarvis_notification_dismissals")) {
      return { rowCount: 1, rows: [] };
    }
    if (text.includes("jarvis_notification_preferences") && text.includes("SELECT enabled")) {
      return { rows: [{ enabled }] };
    }
    if (text.includes("WHERE approved = TRUE") && text.includes("is_root = FALSE")) {
      return { rows: [{ id: 7, displayName: "Test User", email: "test.user@example.test" }] };
    }
    if (text.includes("FROM users")) {
      return {
        rowCount: 1,
        rows: [{
          id: 7,
          login_name: "test.user@example.test",
          email: "test.user@example.test",
          first_name: "Test",
          last_name: "User",
          user_group: "Employee",
          approved: true,
          is_root: false,
          is_admin: false,
          must_change_password: false,
          access_override: {},
        }],
      };
    }
    return { rowCount: 0, rows: [] };
  };
  return { query, calls };
}

describe("Jarvis notification routes", () => {
  let originalQuery;

  beforeEach(() => { originalQuery = db.query; });
  afterEach(() => { db.query = originalQuery; });

  it("returns delivery metadata and occurrence keys for active notifications", async () => {
    const mock = createMockQuery({
      activeNotifications: [{ id: 12, title: "Test", occurrence_key: "daily:2026-08-20" }],
    });
    db.query = mock.query;
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/jarvis-notifications/active`, { headers: authHeaders() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.enabled, true);
      assert.equal(body.pollAfterMs, 15000);
      assert.equal(body.notifications[0].occurrence_key, "daily:2026-08-20");
    } finally {
      await server.close();
    }
  });

  it("returns the notification workspace in one bootstrap request", async () => {
    const mock = createMockQuery();
    db.query = mock.query;
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/jarvis-notifications/bootstrap`, { headers: authHeaders() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.enabled, true);
      assert.equal(body.notifications.length, 1);
      assert.equal(body.recipients.length, 1);
    } finally {
      await server.close();
    }
  });

  it("dismisses one recurrence occurrence idempotently", async () => {
    const mock = createMockQuery();
    db.query = mock.query;
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/jarvis-notifications/12/dismiss`, {
        method: "POST",
        headers: authHeaders(),
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.dismissed, true);
      assert.match(body.occurrenceKey, /^daily:\d{4}-\d{2}-\d{2}$/);
      const insert = mock.calls.find((call) => call.text.includes("INSERT INTO jarvis_notification_dismissals"));
      assert.equal(insert.params[2], body.occurrenceKey);
      assert.match(insert.text, /ON CONFLICT/);
    } finally {
      await server.close();
    }
  });
});
