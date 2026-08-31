import assert from "node:assert/strict";
import test from "node:test";
import { requirePageAccess } from "../middleware/requirePageAccess.js";

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("expired admin session returns a structured reauthentication response", async () => {
  const req = {
    adminError: "admin_token_expired_or_invalid",
    user: { approved: true, is_root: false, accessPolicy: {} },
  };
  const res = createResponse();
  let nextCalled = false;

  await requirePageAccess("user_management", "view")(req, res, () => { nextCalled = true; });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, {
    code: "ADMIN_SESSION_EXPIRED",
    message: "Die Admin-Sitzung ist abgelaufen. Bitte den Adminbereich erneut freischalten.",
  });
});

test("regular insufficient access remains forbidden", async () => {
  const req = {
    adminError: null,
    user: { approved: true, is_root: false, accessPolicy: {} },
  };
  const res = createResponse();

  await requirePageAccess("user_management", "view")(req, res, () => {});

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "INSUFFICIENT_PERMISSION");
});
