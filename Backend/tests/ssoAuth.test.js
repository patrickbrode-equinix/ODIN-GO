import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import jwt from "jsonwebtoken";

import { config } from "../config/index.js";
import ssoAuthRoutes from "../routes/ssoAuth.js";

function handler(path) {
  return ssoAuthRoutes.stack.find((layer) => layer.route?.path === path).route.stack[0].handle;
}

function createResponse() {
  return {
    statusCode: 200, body: null, redirectUrl: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    redirect(code, url) { this.statusCode = code; this.redirectUrl = url; return this; },
    setHeader(name, value) { this.headers[name] = value; },
  };
}

describe("web SSO (authentik)", () => {
  const original = {};

  beforeEach(() => {
    original.sso = { ...config.SSO };
    original.fetch = globalThis.fetch;
  });

  afterEach(() => {
    Object.assign(config.SSO, original.sso);
    globalThis.fetch = original.fetch;
  });

  it("reports SSO as disabled until it is configured", () => {
    Object.assign(config.SSO, { ISSUER_URL: "", CLIENT_ID: "", CLIENT_SECRET: "" });
    const res = createResponse();
    handler("/config")({}, res);
    assert.equal(res.body.enabled, false);
  });

  it("redirects to authentik with PKCE and stores the flow in a cookie", async () => {
    Object.assign(config.SSO, { ISSUER_URL: "https://auth.test/application/o/odin/", CLIENT_ID: "odin", CLIENT_SECRET: "s", PUBLIC_URL: "https://odin.test" });
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({
        authorization_endpoint: "https://auth.test/authorize/",
        token_endpoint: "https://auth.test/token/",
        userinfo_endpoint: "https://auth.test/userinfo/",
      }),
    });
    const res = createResponse();
    await handler("/login")({}, res);

    const url = new URL(res.redirectUrl);
    assert.equal(url.origin + url.pathname, "https://auth.test/authorize/");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(url.searchParams.get("redirect_uri"), "https://odin.test/api/auth/sso/callback");
    const cookie = decodeURIComponent(res.headers["Set-Cookie"].split(";")[0].split("=").slice(1).join("="));
    assert.equal(jwt.verify(cookie, config.JWT_SECRET).state, url.searchParams.get("state"));
  });

  it("rejects a callback without a matching flow cookie", async () => {
    Object.assign(config.SSO, { ISSUER_URL: "https://auth.test/application/o/odin/", CLIENT_ID: "odin", CLIENT_SECRET: "s" });
    const res = createResponse();
    await handler("/callback")({ query: { code: "x", state: "y" }, headers: {}, protocol: "https", get: () => "odin.test" }, res);
    assert.match(res.redirectUrl, /sso_error=flow_expired/);
  });
});
