const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

let backend, frontend, baseUrl;
const requests = [];
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const close = (server) => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
});

before(async () => {
    backend = http.createServer((req, res) => {
        requests.push({ url: req.url, key: req.headers["x-shiftplanner-key"] });
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ready: true, url: req.url }));
    });
    await listen(backend);
    process.env.BACKEND_URL = `http://127.0.0.1:${backend.address().port}`;
    const app = require("../server.js");
    frontend = http.createServer(app);
    await listen(frontend);
    baseUrl = `http://127.0.0.1:${frontend.address().port}`;
});

after(async () => {
    if (frontend) await close(frontend);
    if (backend) await close(backend);
});

test("/healthz is answered by the frontend without contacting the backend", async () => {
    const count = requests.length;
    const response = await fetch(`${baseUrl}/healthz`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).service, "frontend");
    assert.equal(requests.length, count);
});

test("/api/health/ready reaches the backend with its entire /api prefix", async () => {
    const response = await fetch(`${baseUrl}/api/health/ready`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ready: true, url: "/api/health/ready" });
    assert.equal(requests.at(-1).url, "/api/health/ready");
});

test("the API proxy preserves query strings and the browser application key", async () => {
    const url = "/api/health/ready?probe=a%2Fb&second=1";
    const response = await fetch(`${baseUrl}${url}`, {
        headers: { "x-shiftplanner-key": "test-browser-key" },
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, url);
    assert.deepEqual(requests.at(-1), { url, key: "test-browser-key" });
});

test("the uploads proxy also preserves its prefix", async () => {
    const response = await fetch(`${baseUrl}/uploads/example.pdf?download=1`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).url, "/uploads/example.pdf?download=1");
});

test("/odin-go/shiftplan serves the production SPA without contacting the backend", async () => {
    const count = requests.length;
    const response = await fetch(`${baseUrl}/odin-go/shiftplan`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/html/);
    assert.equal(await response.text(), fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8"));
    assert.equal(requests.length, count);
});

test("backend unavailability returns 502 while local health remains available", async () => {
    await close(backend);
    backend = null;
    const response = await fetch(`${baseUrl}/api/health/ready`);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: "Proxy error" });
    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
});
