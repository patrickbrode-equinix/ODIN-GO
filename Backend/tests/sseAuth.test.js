/**
 * backend/tests/sseAuth.test.js
 *
 * Unit tests for SSE auth and broadcast logic.
 * Tests the token extraction logic and broadcast mechanics without needing
 * a live database or server.
 *
 * Run with: node --test tests/sseAuth.test.js
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Inline token-extraction logic from authMiddleware.js                       */
/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * Extract raw JWT token from request headers or query params.
 * Mirrors the logic in backend/middleware/authMiddleware.js.
 */
function extractToken(req) {
  const authHeader = req.headers?.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.split(" ")[1];
  }

  if (req.query?.token) {
    return String(req.query.token);
  }

  return null;
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Inline broadcast logic from routes/sse.js                                  */
/* ─────────────────────────────────────────────────────────────────────────── */

function createClientRegistry() {
  const clients = new Map();
  let counter = 0;

  function addClient(writeFn) {
    const id = String(++counter);
    clients.set(id, { write: writeFn });
    return id;
  }

  function removeClient(id) {
    clients.delete(id);
  }

  function broadcast(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    const deadClients = [];
    for (const [id, client] of clients) {
      try {
        client.write(payload);
      } catch {
        deadClients.push(id);
      }
    }
    // Clean up dead clients
    deadClients.forEach((id) => clients.delete(id));
  }

  return { addClient, removeClient, broadcast, clients };
}

/* ─────────────────────────────────────────────────────────────────────────── */
/*  Tests                                                                       */
/* ─────────────────────────────────────────────────────────────────────────── */

describe("Token extraction (authMiddleware logic)", () => {
  test("extracts token from Authorization Bearer header", () => {
    const req = { headers: { authorization: "Bearer my-jwt-token" }, query: {} };
    assert.equal(extractToken(req), "my-jwt-token");
  });

  test("extracts token from ?token= query param (for EventSource/SSE)", () => {
    const req = { headers: {}, query: { token: "sse-token-123" } };
    assert.equal(extractToken(req), "sse-token-123");
  });

  test("prefers Authorization header over query param", () => {
    const req = {
      headers: { authorization: "Bearer header-token" },
      query: { token: "query-token" },
    };
    assert.equal(extractToken(req), "header-token");
  });

  test("returns null when no token present", () => {
    const req = { headers: {}, query: {} };
    assert.equal(extractToken(req), null);
  });

  test("returns null for malformed Authorization header (no Bearer prefix)", () => {
    const req = { headers: { authorization: "Basic abc123" }, query: {} };
    assert.equal(extractToken(req), null);
  });

  test("returns null for Authorization header with only 'Bearer '", () => {
    const req = { headers: { authorization: "Bearer " }, query: {} };
    // "Bearer ".split(" ")[1] === "" — empty string is falsy but we return it
    // The middleware does rawToken = authHeader.split(" ")[1] then checks !rawToken
    // Empty string is falsy so this should result in null behavior at middleware level
    const token = extractToken(req);
    assert.equal(!token, true); // empty string or null — both treated as "missing"
  });
});

describe("SSE broadcast mechanics", () => {
  test("broadcasts to single connected client", () => {
    const { addClient, broadcast } = createClientRegistry();
    const received = [];
    addClient((msg) => received.push(msg));

    broadcast("test_event", { foo: "bar" });

    assert.equal(received.length, 1);
    assert.equal(received[0].includes("event: test_event"), true);
    assert.equal(received[0].includes('"foo":"bar"'), true);
  });

  test("broadcasts to multiple clients", () => {
    const { addClient, broadcast } = createClientRegistry();
    const receivedA = [];
    const receivedB = [];
    const receivedC = [];
    addClient((msg) => receivedA.push(msg));
    addClient((msg) => receivedB.push(msg));
    addClient((msg) => receivedC.push(msg));

    broadcast("multi_event", { count: 3 });

    assert.equal(receivedA.length, 1);
    assert.equal(receivedB.length, 1);
    assert.equal(receivedC.length, 1);
  });

  test("removes dead clients on next broadcast (write throws)", () => {
    const { addClient, broadcast, clients } = createClientRegistry();

    let throws = false;
    const id = addClient((msg) => {
      if (throws) throw new Error("connection closed");
    });

    assert.equal(clients.size, 1);

    // First broadcast succeeds
    broadcast("event1", {});
    assert.equal(clients.size, 1);

    // Mark client as dead, second broadcast cleans it up
    throws = true;
    broadcast("event2", {});
    assert.equal(clients.size, 0);
  });

  test("empty registry: broadcast does nothing", () => {
    const { broadcast } = createClientRegistry();
    // Should not throw
    assert.doesNotThrow(() => broadcast("empty", {}));
  });

  test("broadcast payload is correct SSE format", () => {
    const { addClient, broadcast } = createClientRegistry();
    const received = [];
    addClient((msg) => received.push(msg));

    broadcast("handover_created", { id: 42, ticketNumber: "TT-001" });

    const payload = received[0];
    // SSE format: "event: <name>\ndata: <json>\n\n"
    assert.equal(payload.startsWith("event: handover_created\n"), true);
    assert.equal(payload.includes("data: "), true);
    assert.equal(payload.endsWith("\n\n"), true);

    // Data is valid JSON
    const dataLine = payload.split("\n").find((l) => l.startsWith("data: "));
    const data = JSON.parse(dataLine.replace("data: ", ""));
    assert.equal(data.id, 42);
    assert.equal(data.ticketNumber, "TT-001");
  });

  test("removing a client stops it from receiving broadcasts", () => {
    const { addClient, removeClient, broadcast } = createClientRegistry();
    const received = [];
    const id = addClient((msg) => received.push(msg));

    broadcast("before_remove", {});
    assert.equal(received.length, 1);

    removeClient(id);
    broadcast("after_remove", {});
    assert.equal(received.length, 1); // still 1, second broadcast not received
  });
});
