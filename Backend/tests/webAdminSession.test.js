import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import jwt from "jsonwebtoken";

import db from "../db.js";
import { config } from "../config/index.js";
import { requireApplicationKey, requireAuth } from "../middleware/authMiddleware.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function createRequest(headers = {}) {
  return { headers, socket: { remoteAddress: "10.0.0.25" }, originalUrl: "/api/test" };
}

async function run(middleware, req) {
  const res = createResponse();
  let nextCalled = false;
  await middleware(req, res, () => { nextCalled = true; });
  return { res, nextCalled };
}

describe("web admin session without application key", () => {
  const original = {};

  beforeEach(() => {
    original.isShiftplannerMode = config.isShiftplannerMode;
    original.isProd = config.isProd;
    original.apiKey = config.SHIFTPLANNER_API_KEY;
    original.query = db.query;
    config.isShiftplannerMode = true;
    config.isProd = true;
    config.SHIFTPLANNER_API_KEY = "extension-key-for-tests";
    db.query = async () => ({ rows: [{ id: 1, login_name: "root", is_root: true }] });
  });

  afterEach(() => {
    config.isShiftplannerMode = original.isShiftplannerMode;
    config.isProd = original.isProd;
    config.SHIFTPLANNER_API_KEY = original.apiKey;
    db.query = original.query;
  });

  it("accepts a valid admin session without the key", async () => {
    const adminToken = jwt.sign({ scope: "shiftplanner_admin" }, config.JWT_SECRET);
    const auth = await run(requireAuth, createRequest({ "x-shiftplanner-admin": adminToken }));
    assert.equal(auth.nextCalled, true);
    const application = await run(requireApplicationKey, createRequest({ "x-shiftplanner-admin": adminToken }));
    assert.equal(application.nextCalled, true);
  });

  it("still requires the key for extension identities", async () => {
    const identityToken = jwt.sign({ scope: "shiftplanner_identity", userId: 7, displayName: "Test" }, config.JWT_SECRET);
    const withoutKey = await run(requireAuth, createRequest({ "x-shiftplanner-identity": identityToken }));
    assert.equal(withoutKey.nextCalled, false);
    assert.equal(withoutKey.res.statusCode, 401);

    const withKey = await run(requireAuth, createRequest({
      "x-shiftplanner-identity": identityToken,
      "x-shiftplanner-key": config.SHIFTPLANNER_API_KEY,
    }));
    assert.equal(withKey.nextCalled, true);
  });

  it("rejects keyless requests with an invalid admin token", async () => {
    const result = await run(requireApplicationKey, createRequest({ "x-shiftplanner-admin": "forged" }));
    assert.equal(result.nextCalled, false);
    assert.equal(result.res.statusCode, 401);
  });
});
