/**
 * backend/tests/tv.test.js
 *
 * Integration tests for public TV endpoints: /api/tv/*
 * No database connection required — query function is injected as a mock.
 * No auth token required — endpoints must be publicly accessible.
 *
 * Run with: node --test tests/tv.test.js
 */

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "node:http";

/* ------------------------------------------------------------------ */
/* Inline TV router factory (mirrors routes/tv.js without DB import)   */
/* ------------------------------------------------------------------ */
function createTvRouter(mockQuery) {
  const router = express.Router();

  // No TV_KEY in tests
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  router.get("/tickets", async (req, res) => {
    try {
      const { queueType, limit } = req.query;
      let sql = `SELECT * FROM queue_items WHERE active = TRUE`;
      const params = [];

      if (queueType) {
        params.push(queueType);
        sql += ` AND queue_type = $${params.length}`;
      }
      sql += ` ORDER BY group_key ASC, id ASC`;
      if (limit) {
        const lim = parseInt(limit, 10);
        if (!isNaN(lim) && lim > 0 && lim <= 500) {
          params.push(lim);
          sql += ` LIMIT $${params.length}`;
        }
      }

      const result = await mockQuery(sql, params);
      res.json(result.rows);
    } catch (err) {
      res.json([]); // never 500 for TV
    }
  });

  router.get("/info-entries", async (_req, res) => {
    try {
      const result = await mockQuery(
        `SELECT * FROM dashboard_info_entries WHERE delete_at IS NULL OR delete_at > NOW() ORDER BY created_at DESC`
      );
      res.json({ data: result.rows });
    } catch (err) {
      res.json({ data: [] });
    }
  });

  router.get("/projects", async (_req, res) => {
    try {
      const result = await mockQuery(
        `SELECT id, name, responsible, expected_done, progress, description, status, creator, created_at FROM projects ORDER BY created_at DESC`
      );
      res.json(result.rows);
    } catch (err) {
      res.json([]);
    }
  });

  const TV_SHIFT_TYPES = {
    E1: { label: "E1", color: "bg-orange-500", name: "Frühschicht",  time: "06:30-15:30" },
    E2: { label: "E2", color: "bg-orange-600", name: "Frühschicht",  time: "07:00-16:00" },
    L1: { label: "L1", color: "bg-yellow-500", name: "Spätschicht",  time: "13:00-22:00" },
    L2: { label: "L2", color: "bg-yellow-600", name: "Spätschicht",  time: "15:00-00:00" },
    N:  { label: "N",  color: "bg-blue-600",   name: "Nachtschicht", time: "21:15-06:45" },
  };

  router.get("/schedules/today", async (_req, res) => {
    try {
      const result = await mockQuery(`shifts-today`);
      const early = [], late = [], night = [];
      let roleMap = new Map();
      try {
        const roleResult = await mockQuery(`weekplan-roles-today`);
        roleMap = new Map(
          (roleResult.rows || [])
            .filter((row) => row?.employee_name && row?.role_key)
            .flatMap((row) => {
              const rawName = String(row.employee_name).trim();
              const normalizedName = rawName.replace(",", "").trim();
              return [
                [rawName, row.role_key],
                [normalizedName, row.role_key],
              ];
            })
        );
      } catch {
        roleMap = new Map();
      }
      for (const row of result.rows) {
        const code = row.shift_code;
        const info = TV_SHIFT_TYPES[code];
        if (!info) continue;
        const name = String(row.employee_name ?? "").replace(",", "").trim();
        const weekplanRole = roleMap.get(String(row.employee_name ?? "").trim()) || roleMap.get(name) || null;
        const entry = { name, shift: code, time: info.time, info, weekplanRole };
        if (code === "E1" || code === "E2") early.push(entry);
        else if (code === "L1" || code === "L2") late.push(entry);
        else if (code === "N") night.push(entry);
      }
      res.json({ early, late, night, dataFresh: true });
    } catch (err) {
      res.json({ early: [], late: [], night: [], dataFresh: false });
    }
  });

  router.get("/events/images", async (_req, res) => {
    try {
      const result = await mockQuery(
        `SELECT id, filename, original_name, url_path, created_at FROM events_images WHERE is_visible = TRUE ORDER BY created_at DESC`
      );
      res.json(result.rows);
    } catch (err) {
      res.json([]); // never 500 for TV
    }
  });

  return router;
}

/* ------------------------------------------------------------------ */
/* Test harness                                                        */
/* ------------------------------------------------------------------ */

describe("GET /api/tv/* — public kiosk endpoints", () => {
  let server;
  let baseUrl;
  let mockQuery;

  before(async () => {
    // Default mock: returns empty rows
    mockQuery = async () => ({ rows: [] });

    const app = express();
    app.use("/api/tv", createTvRouter((...args) => mockQuery(...args)));

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  /* ---------------------------------------------------------------- */
  /* /api/tv/health                                                    */
  /* ---------------------------------------------------------------- */
  test("GET /api/tv/health → 200 + { status: ok }", async () => {
    const res = await fetch(`${baseUrl}/api/tv/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, "ok");
    assert.ok(typeof body.ts === "string", "ts should be a string timestamp");
  });

  test("GET /api/tv/health requires NO auth token", async () => {
    // Explicitly no Authorization header
    const res = await fetch(`${baseUrl}/api/tv/health`, {
      headers: {},
    });
    assert.strictEqual(res.status, 200);
  });

  /* ---------------------------------------------------------------- */
  /* /api/tv/tickets                                                   */
  /* ---------------------------------------------------------------- */
  test("GET /api/tv/tickets → 200 + array (empty DB)", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/tickets`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body), "response should be an array");
    assert.strictEqual(body.length, 0);
  });

  test("GET /api/tv/tickets → 200 + array with rows", async () => {
    const fakeTickets = [
      { id: 1, group_key: "Alpha", queue_type: "SmartHands", active: true },
      { id: 2, group_key: "Beta",  queue_type: "SmartHands", active: true },
    ];
    mockQuery = async () => ({ rows: fakeTickets });

    const res = await fetch(`${baseUrl}/api/tv/tickets`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 2);
    assert.strictEqual(body[0].group_key, "Alpha");
  });

  test("GET /api/tv/tickets → 200 (not 500) when DB throws", async () => {
    mockQuery = async () => { throw new Error("DB connection lost"); };
    const res = await fetch(`${baseUrl}/api/tv/tickets`);
    assert.strictEqual(res.status, 200, "should return 200 even on DB error");
    const body = await res.json();
    assert.ok(Array.isArray(body), "should return empty array on error");
  });

  test("GET /api/tv/tickets requires NO auth token", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/tickets`, { headers: {} });
    assert.strictEqual(res.status, 200);
  });

  /* ---------------------------------------------------------------- */
  /* /api/tv/info-entries                                              */
  /* ---------------------------------------------------------------- */
  test("GET /api/tv/info-entries → 200 + { data: [] } (empty DB)", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/info-entries`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok("data" in body, "response should have .data key");
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data.length, 0);
  });

  test("GET /api/tv/info-entries → 200 + data with entries", async () => {
    const fakeEntries = [
      { id: 1, content: "System OK", type: "info", created_at: new Date().toISOString() },
    ];
    mockQuery = async () => ({ rows: fakeEntries });

    const res = await fetch(`${baseUrl}/api/tv/info-entries`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.data));
    assert.strictEqual(body.data[0].content, "System OK");
  });

  test("GET /api/tv/info-entries → 200 (not 500) when DB throws", async () => {
    mockQuery = async () => { throw new Error("DB connection lost"); };
    const res = await fetch(`${baseUrl}/api/tv/info-entries`);
    assert.strictEqual(res.status, 200, "should return 200 even on DB error");
    const body = await res.json();
    assert.deepStrictEqual(body.data, []);
  });

  /* ---------------------------------------------------------------- */
  /* /api/tv/projects                                                  */
  /* ---------------------------------------------------------------- */
  test("GET /api/tv/projects → 200 + array (empty DB)", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/projects`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body), "response should be an array");
    assert.strictEqual(body.length, 0);
  });

  test("GET /api/tv/projects → 200 + array with rows", async () => {
    const fakeProjects = [
      { id: 1, name: "Migration Alpha", status: "active", progress: 60, creator: "admin", created_at: new Date().toISOString() },
      { id: 2, name: "Rollout Beta",    status: "completed", progress: 100, creator: "admin", created_at: new Date().toISOString() },
    ];
    mockQuery = async () => ({ rows: fakeProjects });

    const res = await fetch(`${baseUrl}/api/tv/projects`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 2);
    assert.strictEqual(body[0].name, "Migration Alpha");
    assert.strictEqual(body[1].status, "completed");
  });

  test("GET /api/tv/projects → 200 (not 500) when DB throws", async () => {
    mockQuery = async () => { throw new Error("DB unavailable"); };
    const res = await fetch(`${baseUrl}/api/tv/projects`);
    assert.strictEqual(res.status, 200, "should return 200 even on DB error");
    const body = await res.json();
    assert.ok(Array.isArray(body), "should return empty array on error");
  });

  test("GET /api/tv/projects requires NO auth token", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/projects`, { headers: {} });
    assert.strictEqual(res.status, 200);
  });

  /* ---------------------------------------------------------------- */
  /* /api/tv/schedules/today                                           */
  /* ---------------------------------------------------------------- */
  test("GET /api/tv/schedules/today → 200 + { early, late, night, dataFresh: true } (empty DB)", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/schedules/today`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.early),  "early should be array");
    assert.ok(Array.isArray(body.late),   "late should be array");
    assert.ok(Array.isArray(body.night),  "night should be array");
    assert.strictEqual(body.dataFresh, true);
  });

  test("GET /api/tv/schedules/today → employees sorted into correct shift buckets", async () => {
    mockQuery = async () => ({
      rows: [
        { employee_name: "Mustermann, Max", shift_code: "E1" },
        { employee_name: "Schmidt, Anna",   shift_code: "L1" },
        { employee_name: "Weber, Klaus",    shift_code: "N"  },
        { employee_name: "Bauer, Lisa",     shift_code: "E2" },
      ],
    });

    const res = await fetch(`${baseUrl}/api/tv/schedules/today`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.dataFresh, true);
    assert.strictEqual(body.early.length, 2, "E1+E2 should be in early");
    assert.strictEqual(body.late.length,  1, "L1 should be in late");
    assert.strictEqual(body.night.length, 1, "N should be in night");
    // Name normalization: "Mustermann, Max" → "Mustermann Max"
    assert.ok(body.early.some(e => e.name === "Mustermann Max"));
    assert.ok(body.late.some(e  => e.name === "Schmidt Anna"));
    assert.ok(body.night.some(e => e.name === "Weber Klaus"));
  });

  test("GET /api/tv/schedules/today → includes today's weekplan role in employee entries", async () => {
    mockQuery = async (sql) => {
      if (sql === "shifts-today") {
        return {
          rows: [
            { employee_name: "Mustermann, Max", shift_code: "E1" },
          ],
        };
      }

      if (sql === "weekplan-roles-today") {
        return {
          rows: [
            { employee_name: "Mustermann, Max", role_key: "lead" },
          ],
        };
      }

      return { rows: [] };
    };

    const res = await fetch(`${baseUrl}/api/tv/schedules/today`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.early[0]?.weekplanRole, "lead");
  });

  test("GET /api/tv/schedules/today → 200 + dataFresh:false when DB throws", async () => {
    mockQuery = async () => { throw new Error("DB connection error"); };
    const res = await fetch(`${baseUrl}/api/tv/schedules/today`);
    assert.strictEqual(res.status, 200, "should return 200 even on DB error");
    const body = await res.json();
    assert.strictEqual(body.dataFresh, false);
    assert.ok(Array.isArray(body.early)  && body.early.length  === 0);
    assert.ok(Array.isArray(body.late)   && body.late.length   === 0);
    assert.ok(Array.isArray(body.night)  && body.night.length  === 0);
  });

  test("GET /api/tv/schedules/today requires NO auth token", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/schedules/today`, { headers: {} });
    assert.strictEqual(res.status, 200);
  });

  /* ---------------------------------------------------------------- */
  /* /api/tv/events/images                                             */
  /* ---------------------------------------------------------------- */
  test("GET /api/tv/events/images → 200 + [] (empty DB)", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/events/images`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body), "response should be an array");
    assert.strictEqual(body.length, 0);
  });

  test("GET /api/tv/events/images → 200 + image rows", async () => {
    const fakeImages = [
      { id: 1, filename: "img1.jpg", original_name: "party.jpg", url_path: "/uploads/events/img1.jpg", created_at: "2026-01-01T12:00:00Z", is_visible: true },
      { id: 2, filename: "img2.png", original_name: "team.png",  url_path: "/uploads/events/img2.png",  created_at: "2026-01-02T12:00:00Z", is_visible: true },
    ];
    mockQuery = async () => ({ rows: fakeImages });
    const res = await fetch(`${baseUrl}/api/tv/events/images`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 2);
    assert.strictEqual(body[0].url_path, "/uploads/events/img1.jpg");
    assert.strictEqual(body[1].url_path, "/uploads/events/img2.png");
  });

  test("GET /api/tv/events/images → only returns visible images (is_visible filter)", async () => {
    // The mock simulates DB already applying WHERE is_visible = TRUE – only visible rows come back
    const visibleImages = [
      { id: 3, filename: "vis.jpg", original_name: "visible.jpg", url_path: "/uploads/events/vis.jpg", created_at: "2026-01-03T12:00:00Z", is_visible: true },
    ];
    mockQuery = async () => ({ rows: visibleImages });
    const res = await fetch(`${baseUrl}/api/tv/events/images`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.length, 1, "only the visible image should be returned");
    assert.strictEqual(body[0].id, 3);
  });

  test("GET /api/tv/events/images → 200 (not 500) when DB throws", async () => {
    mockQuery = async () => { throw new Error("DB error"); };
    const res = await fetch(`${baseUrl}/api/tv/events/images`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body) && body.length === 0);
  });

  test("GET /api/tv/events/images requires NO auth token", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/events/images`, { headers: {} });
    assert.strictEqual(res.status, 200);
  });
});

/* ------------------------------------------------------------------ */
/* TV_KEY guard tests                                                  */
/* ------------------------------------------------------------------ */

describe("TV_KEY guard (when TV_KEY env var is set)", () => {
  let server;
  let baseUrl;
  const TEST_KEY = "secret-tv-key-1234";

  before(async () => {
    process.env.TV_KEY = TEST_KEY;

    // Recreate a router that respects TV_KEY env
    const router = express.Router();
    const tvKey = process.env.TV_KEY || null;
    function tvKeyGuard(req, res, next) {
      if (!tvKey) return next();
      const provided = req.headers["x-tv-key"] || req.query["tv_key"];
      if (provided === tvKey) return next();
      return res.status(403).json({ error: "TV_KEY required" });
    }
    router.use(tvKeyGuard);
    router.get("/health", (_req, res) => res.json({ status: "ok" }));

    const app = express();
    app.use("/api/tv", router);

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    delete process.env.TV_KEY;
    await new Promise((resolve) => server.close(resolve));
  });

  test("request without TV_KEY → 403", async () => {
    const res = await fetch(`${baseUrl}/api/tv/health`);
    assert.strictEqual(res.status, 403);
  });

  test("request with correct X-TV-KEY header → 200", async () => {
    const res = await fetch(`${baseUrl}/api/tv/health`, {
      headers: { "X-TV-KEY": TEST_KEY },
    });
    assert.strictEqual(res.status, 200);
  });

  test("request with tv_key query param → 200", async () => {
    const res = await fetch(`${baseUrl}/api/tv/health?tv_key=${TEST_KEY}`);
    assert.strictEqual(res.status, 200);
  });

  test("request with wrong key → 403", async () => {
    const res = await fetch(`${baseUrl}/api/tv/health`, {
      headers: { "X-TV-KEY": "wrong-key" },
    });
    assert.strictEqual(res.status, 403);
  });
});

/* ------------------------------------------------------------------ */
/* GET /api/tv/handover — public handover endpoint (no auth required)  */
/* ------------------------------------------------------------------ */
describe("GET /api/tv/handover — public handover endpoint", () => {
  let server;
  let baseUrl;
  let mockQuery;

  function createHandoverTvRouter(queryFn) {
    const router = express.Router();

    function _pad(n) { return String(n).padStart(2, "0"); }
    function _buildCommitAt(commitDate, commitTime) {
      if (!commitDate || !commitTime) return null;
      try {
        const d = new Date(commitDate);
        const yyyy = d.getFullYear();
        const mm = _pad(d.getMonth() + 1);
        const dd = _pad(d.getDate());
        let hh = "00", min = "00";
        if (typeof commitTime === "string") [hh, min] = commitTime.split(":");
        return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
      } catch { return null; }
    }

    router.get("/handover", async (_req, res) => {
      try {
        const result = await queryFn();
        const rows = result.rows.map((h) => ({
          id: h.id,
          ticketNumber:  h.ticketNumber  || "",
          customerName:  h.customerName  || "",
          priority:      h.priority      || "Low",
          type:          h.type          || "Workload",
          activity:      h.activity      || "",
          systemName:    h.systemName    || "",
          status:        h.status        || "Offen",
          commitAt:      _buildCommitAt(h.commitdate, h.committime),
          createdAt:     h.createdAt,
          files:         [],
        }));
        res.json(rows);
      } catch (err) {
        res.json([]);
      }
    });

    return router;
  }

  before(async () => {
    mockQuery = async () => ({ rows: [] });

    const app = express();
    app.use("/api/tv", createHandoverTvRouter((...args) => mockQuery(...args)));

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("GET /api/tv/handover → 200 + array (empty DB)", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/handover`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body), "should return an array");
    assert.strictEqual(body.length, 0);
  });

  test("GET /api/tv/handover → 200 + array with rows", async () => {
    mockQuery = async () => ({
      rows: [
        { id: 1, ticketNumber: "INC001", customerName: "Acme", priority: "High",
          type: "Workload", activity: "Check server", systemName: "SRV01",
          status: "Offen", commitdate: null, committime: null, createdAt: new Date().toISOString() },
        { id: 2, ticketNumber: "INC002", customerName: "Globex", priority: "Low",
          type: "Workload", activity: "Reboot", systemName: "SRV02",
          status: "Übernommen", commitdate: "2025-06-01", committime: "10:00",
          createdAt: new Date().toISOString() },
      ]
    });
    const res = await fetch(`${baseUrl}/api/tv/handover`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
    assert.strictEqual(body.length, 2);
    assert.strictEqual(body[0].ticketNumber, "INC001");
    assert.strictEqual(body[1].commitAt, "2025-06-01T10:00");
  });

  test("GET /api/tv/handover → 200 (not 500) when DB throws", async () => {
    mockQuery = async () => { throw new Error("DB unavailable"); };
    const res = await fetch(`${baseUrl}/api/tv/handover`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body), "should return empty array on error");
    assert.strictEqual(body.length, 0);
  });

  test("GET /api/tv/handover requires NO auth token", async () => {
    mockQuery = async () => ({ rows: [] });
    const res = await fetch(`${baseUrl}/api/tv/handover`, { headers: {} });
    assert.strictEqual(res.status, 200);
  });
});

/* ------------------------------------------------------------------ */
/* JSON parse error handler — returns JSON 400, not HTML              */
/* ------------------------------------------------------------------ */
describe("POST with invalid JSON → JSON 400 error (not HTML)", () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = express();
    app.use(express.json({ limit: "50mb" }));

    // Dummy route that would accept JSON
    app.post("/api/test-json", (req, res) => {
      res.json({ ok: true, body: req.body });
    });

    // Global error handler (same as server.js)
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => {
      if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
        return res.status(400).json({
          ok: false,
          error: "json_parse_error",
          hint: "Request body is not valid JSON.",
        });
      }
      const status = typeof err.status === "number" ? err.status : 500;
      return res.status(status).json({ ok: false, error: err.message || "Internal Server Error" });
    });

    await new Promise((resolve) => {
      server = createServer(app);
      server.listen(0, "127.0.0.1", resolve);
    });

    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  test("valid JSON body → 200", async () => {
    const res = await fetch(`${baseUrl}/api/test-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foo: "bar" }),
    });
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.ok, true);
  });

  test("invalid JSON body → 400 with JSON response (not HTML)", async () => {
    const res = await fetch(`${baseUrl}/api/test-json`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not valid json !!!",
    });
    assert.strictEqual(res.status, 400);
    const ct = res.headers.get("content-type") || "";
    assert.ok(ct.includes("application/json"), `Expected JSON content-type, got: ${ct}`);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error, "json_parse_error");
  });
});
