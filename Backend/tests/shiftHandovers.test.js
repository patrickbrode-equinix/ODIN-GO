import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import express from "express";
import { createServer } from "node:http";
import jwt from "jsonwebtoken";

import db from "../db.js";
import { config } from "../config/index.js";
import shiftHandoverRoutes from "../routes/shiftHandovers.js";

function startApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/shift-handovers", shiftHandoverRoutes);
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, "127.0.0.1", () => resolve({
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      close: () => new Promise((done) => server.close(done)),
    }));
  });
}

function headers() {
  return {
    "Content-Type": "application/json",
    "x-shiftplanner-key": config.SHIFTPLANNER_API_KEY,
    "x-shiftplanner-identity": jwt.sign(
      { scope: "shiftplanner_identity", userId: 7, displayName: "Test User" },
      config.JWT_SECRET,
    ),
  };
}

function row(overrides = {}) {
  return {
    id: 12,
    handoverAt: "2026-08-21T12:30:00.000Z",
    direction: "early_to_late",
    category: "trouble_ticket",
    ticketNumber: "5-2630001",
    customerName: "Example GmbH",
    notes: "Weiter beobachten.",
    createdByUserId: 7,
    createdByName: "Test User",
    createdAt: "2026-08-21T12:31:00.000Z",
    ...overrides,
  };
}

describe("shift handover routes", () => {
  let originalQuery;

  beforeEach(() => { originalQuery = db.query; });
  afterEach(() => { db.query = originalQuery; });

  it("returns the saved handover history for a verified Jarvis user", async () => {
    db.query = async (sql) => {
      if (String(sql).includes("FROM users")) return { rows: [{ id: 7, login_name: "test.user", email: "test@example.test", first_name: "Test", last_name: "User", user_group: "Employee", is_root: false }] };
      if (String(sql).includes("UPDATE users")) return { rows: [], rowCount: 1 };
      if (String(sql).includes("FROM shift_handovers")) return { rows: [row()] };
      return { rows: [] };
    };
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/shift-handovers`, { headers: headers() });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.handovers.length, 1);
      assert.equal(body.handovers[0].ticketNumber, "5-2630001");
      assert.equal(body.handovers[0].createdByName, "Test User");
    } finally {
      await server.close();
    }
  });

  it("stores ticket details and always uses the verified user as creator", async () => {
    let insertParams = null;
    db.query = async (sql, params = []) => {
      if (String(sql).includes("FROM users")) return { rows: [{ id: 7, login_name: "test.user", email: "test@example.test", first_name: "Test", last_name: "User", user_group: "Employee", is_root: false }] };
      if (String(sql).includes("UPDATE users")) return { rows: [], rowCount: 1 };
      if (String(sql).includes("INSERT INTO shift_handovers")) {
        insertParams = params;
        return { rows: [row({ direction: params[1], category: params[2], ticketNumber: params[3], customerName: params[4], notes: params[5], createdByUserId: params[6], createdByName: params[7] })] };
      }
      return { rows: [] };
    };
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/shift-handovers`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          handoverAt: "2026-08-21T13:00:00.000Z",
          direction: "late_to_night",
          category: "trouble_ticket",
          ticketNumber: "5-2630001",
          customerName: "Example GmbH",
          notes: "Owner informieren.",
          createdByName: "Manipulierter Name",
        }),
      });
      assert.equal(response.status, 201);
      assert.equal(insertParams[6], 7);
      assert.equal(insertParams[7], "Test User");
      const body = await response.json();
      assert.equal(body.handover.createdByName, "Test User");
    } finally {
      await server.close();
    }
  });

  it("requires ticket number and customer for ticket categories", async () => {
    db.query = async (sql) => {
      if (String(sql).includes("FROM users")) return { rows: [{ id: 7, login_name: "test.user", email: "test@example.test", first_name: "Test", last_name: "User", user_group: "Employee", is_root: false }] };
      return { rows: [] };
    };
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/shift-handovers`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ handoverAt: new Date().toISOString(), direction: "night_to_early", category: "smart_hand", notes: "Offene Arbeit." }),
      });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.equal(body.error, "TICKET_DETAILS_REQUIRED");
    } finally {
      await server.close();
    }
  });

  it("rejects access without a verified Jarvis identity", async () => {
    db.query = async (sql) => {
      if (String(sql).includes("FROM users")) return { rows: [{ id: 1, login_name: "root", first_name: "Root", last_name: "User", is_root: true }] };
      return { rows: [] };
    };
    const server = await startApp();
    try {
      const response = await fetch(`${server.baseUrl}/api/shift-handovers`, { headers: { "x-shiftplanner-key": config.SHIFTPLANNER_API_KEY } });
      assert.equal(response.status, 401);
      const body = await response.json();
      assert.equal(body.code, "JARVIS_IDENTITY_REQUIRED");
    } finally {
      await server.close();
    }
  });
});
