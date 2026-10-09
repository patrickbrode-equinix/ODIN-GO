/* ———————————————————————————————— */
/* WEB SSO (authentik / OpenID Connect) */
/*                                      */
/* Authorization-code flow with PKCE,   */
/* executed entirely on the backend.    */
/* On success the user receives the     */
/* same signed web session that the     */
/* admin password login issues.         */
/* ———————————————————————————————— */

import crypto from "node:crypto";
import express from "express";
import jwt from "jsonwebtoken";
import db from "../db.js";
import { config } from "../config/index.js";

const router = express.Router();

const FLOW_COOKIE = "odin_sso_flow";
const FLOW_TTL_SECONDS = 10 * 60;
const SESSION_TTL = "4h";
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

let discoveryCache = null;

export function isSsoConfigured() {
  const sso = config.SSO;
  return Boolean(sso.ISSUER_URL && sso.CLIENT_ID && sso.CLIENT_SECRET);
}

function base64Url(buffer) {
  return buffer.toString("base64url");
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function publicBaseUrl(req) {
  if (config.SSO.PUBLIC_URL) return config.SSO.PUBLIC_URL.replace(/\/+$/, "");
  // "trust proxy" is enabled, so these reflect the external URL behind the reverse proxy.
  return `${req.protocol}://${req.get("host")}`;
}

function redirectUri(req) {
  return `${publicBaseUrl(req)}/api/auth/sso/callback`;
}

function secureCookie(req) {
  return config.isProd || req.protocol === "https";
}

function setFlowCookie(req, res, value) {
  const attributes = [
    `${FLOW_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/api/auth/sso",
    "HttpOnly",
    // Lax is required: the callback is a top-level navigation coming from authentik.
    "SameSite=Lax",
    `Max-Age=${value ? FLOW_TTL_SECONDS : 0}`,
  ];
  if (secureCookie(req)) attributes.push("Secure");
  res.setHeader("Set-Cookie", attributes.join("; "));
}

function clearFlowCookie(req, res) {
  setFlowCookie(req, res, "");
}

async function getDiscovery() {
  if (discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) return discoveryCache.document;

  const issuer = config.SSO.ISSUER_URL.replace(/\/+$/, "");
  const response = await fetch(`${issuer}/.well-known/openid-configuration`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`OIDC discovery failed with HTTP ${response.status}`);
  const document = await response.json();
  if (!document.authorization_endpoint || !document.token_endpoint || !document.userinfo_endpoint) {
    throw new Error("OIDC discovery document is incomplete");
  }
  discoveryCache = { document, at: Date.now() };
  return document;
}

function toStringList(value) {
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === "string" && value) return [value];
  return [];
}

/** Maps the authentik identity onto an ODIN GO user row (email, UPN or login name). */
async function findLocalUser(profile) {
  const candidates = [profile.email, profile.preferred_username, profile.upn]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  if (!candidates.length) return null;

  const { rows } = await db.query(
    `SELECT id, first_name, last_name, login_name, email, upn, approved, is_admin, is_root
       FROM users
      WHERE LOWER(COALESCE(email, '')) = ANY($1)
         OR LOWER(COALESCE(upn, '')) = ANY($1)
         OR LOWER(COALESCE(login_name, '')) = ANY($1)
      ORDER BY approved DESC, id ASC
      LIMIT 2`,
    [candidates],
  );
  // An ambiguous mapping must never pick an arbitrary account.
  return rows.length === 1 ? rows[0] : null;
}

function redirectToApp(res, params) {
  const fragment = new URLSearchParams(params).toString();
  res.redirect(302, `/#${fragment}`);
}

/** Tells the login page whether the SSO button should be shown. */
router.get("/config", (_req, res) => {
  res.json({ enabled: isSsoConfigured(), providerName: config.SSO.PROVIDER_NAME });
});

router.get("/login", async (req, res) => {
  if (!isSsoConfigured()) return res.status(404).json({ message: "SSO ist nicht konfiguriert." });

  try {
    const discovery = await getDiscovery();
    const state = base64Url(crypto.randomBytes(24));
    const nonce = base64Url(crypto.randomBytes(24));
    const codeVerifier = base64Url(crypto.randomBytes(48));
    const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());

    const flow = jwt.sign({ scope: "shiftplanner_sso_flow", state, nonce, codeVerifier }, config.JWT_SECRET, {
      expiresIn: FLOW_TTL_SECONDS,
    });
    setFlowCookie(req, res, flow);

    const authorizeUrl = new URL(discovery.authorization_endpoint);
    authorizeUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: config.SSO.CLIENT_ID,
      redirect_uri: redirectUri(req),
      scope: config.SSO.SCOPES,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    }).toString();
    return res.redirect(302, authorizeUrl.toString());
  } catch (error) {
    console.error("SSO LOGIN START ERROR:", error);
    return res.status(502).json({ message: "Der SSO-Anbieter ist nicht erreichbar." });
  }
});

router.get("/callback", async (req, res) => {
  if (!isSsoConfigured()) return res.status(404).json({ message: "SSO ist nicht konfiguriert." });

  const fail = (code) => {
    clearFlowCookie(req, res);
    redirectToApp(res, { sso_error: code });
  };

  if (req.query.error) {
    console.warn("SSO PROVIDER ERROR:", String(req.query.error), String(req.query.error_description || ""));
    return fail("provider_error");
  }

  let flow;
  try {
    flow = jwt.verify(parseCookies(req.headers.cookie)[FLOW_COOKIE] || "", config.JWT_SECRET);
  } catch {
    return fail("flow_expired");
  }
  const suppliedState = Buffer.from(String(req.query.state || ""));
  const expectedState = Buffer.from(String(flow?.state || ""));
  const stateValid = flow?.scope === "shiftplanner_sso_flow"
    && suppliedState.length > 0
    && suppliedState.length === expectedState.length
    && crypto.timingSafeEqual(suppliedState, expectedState);
  if (!stateValid || !req.query.code) return fail("state_mismatch");

  try {
    const discovery = await getDiscovery();

    const tokenResponse = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: String(req.query.code),
        redirect_uri: redirectUri(req),
        client_id: config.SSO.CLIENT_ID,
        client_secret: config.SSO.CLIENT_SECRET,
        code_verifier: flow.codeVerifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!tokenResponse.ok) {
      console.error("SSO TOKEN EXCHANGE FAILED:", tokenResponse.status);
      return fail("token_exchange_failed");
    }
    const tokens = await tokenResponse.json();

    // The ID token comes straight from the token endpoint over TLS, so only its
    // nonce is checked; identity and groups are read from the userinfo endpoint.
    const idClaims = tokens.id_token ? jwt.decode(tokens.id_token) : null;
    if (!idClaims || idClaims.nonce !== flow.nonce) return fail("nonce_mismatch");

    const userinfoResponse = await fetch(discovery.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!userinfoResponse.ok) return fail("userinfo_failed");
    const profile = await userinfoResponse.json();
    if (profile.sub !== idClaims.sub) return fail("subject_mismatch");

    const groups = toStringList(profile.groups);
    const localUser = await findLocalUser(profile);
    const inAdminGroup = Boolean(config.SSO.ADMIN_GROUP) && groups.includes(config.SSO.ADMIN_GROUP);
    const isLocalAdmin = localUser?.approved !== false && (localUser?.is_admin === true || localUser?.is_root === true);

    // The web surface is an administration overview, so only administrators may enter.
    if (!inAdminGroup && !isLocalAdmin) {
      console.warn(`SSO LOGIN DENIED (no admin rights): ${profile.email || profile.preferred_username || profile.sub}`);
      return fail("not_authorized");
    }

    if (localUser) {
      await db.query("UPDATE users SET last_login = NOW(), last_seen_at = NOW() WHERE id = $1", [localUser.id]);
    }

    const displayName = profile.name
      || [localUser?.first_name, localUser?.last_name].filter(Boolean).join(" ")
      || profile.preferred_username
      || profile.email
      || "SSO";
    const token = jwt.sign(
      { scope: "shiftplanner_admin", auth: "sso", sub: profile.sub, displayName },
      config.JWT_SECRET,
      { expiresIn: SESSION_TTL },
    );

    clearFlowCookie(req, res);
    // The fragment is never sent to a server or written to access logs.
    return redirectToApp(res, { sso_token: token, sso_name: displayName });
  } catch (error) {
    console.error("SSO CALLBACK ERROR:", error);
    return fail("internal_error");
  }
});

export default router;
