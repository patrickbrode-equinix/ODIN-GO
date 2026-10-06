/* ------------------------------------------------ */
/* FRONTEND PRODUCTION SERVER                        */
/* Static files + /api proxy to backend              */
/* ------------------------------------------------ */

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const dns = require("dns");
const http = require("http");
const https = require("https");

const app = express();
const PORT = parseInt(process.env.PORT || "8000", 10);

// Docker service DNS on shiftplanner-net; local runs can override BACKEND_URL.
const BACKEND_URL = process.env.BACKEND_URL || "http://odin-backend:8001";

/* ------------------------------------------------ */
/* RESILIENT DNS LOOKUP FOR THE BACKEND              */
/* Container DNS can answer ENOTFOUND intermittently */
/* (several resolvers, e.g. when the container is    */
/* attached to more than one network). Retry the     */
/* lookup and fall back to the last good address     */
/* instead of failing the request with a 502.        */
/* ------------------------------------------------ */

const LOOKUP_RETRIES = 3;
const LOOKUP_CACHE_MS = 10 * 60 * 1000;
const lookupCache = new Map();

function resilientLookup(hostname, options, callback) {
    if (typeof options === "function") {
        callback = options;
        options = {};
    }
    const wantAll = Boolean(options && options.all);

    const attempt = (n) => {
        dns.lookup(hostname, options, (err, address, family) => {
            if (!err) {
                const first = Array.isArray(address) ? address[0] : { address, family };
                if (first && first.address) {
                    lookupCache.set(hostname, { address: first.address, family: first.family, at: Date.now() });
                }
                return callback(null, address, family);
            }
            const cached = lookupCache.get(hostname);
            if (cached && Date.now() - cached.at < LOOKUP_CACHE_MS) {
                return wantAll
                    ? callback(null, [{ address: cached.address, family: cached.family }])
                    : callback(null, cached.address, cached.family);
            }
            if (n < LOOKUP_RETRIES) return setTimeout(() => attempt(n + 1), 150 * (n + 1));
            return callback(err);
        });
    };
    attempt(0);
}

const AgentClass = BACKEND_URL.startsWith("https:") ? https.Agent : http.Agent;
const backendAgent = new AgentClass({ keepAlive: true, lookup: resilientLookup });

/* ------------------------------------------------ */
/* LOCAL HEALTHCHECK (does NOT proxy to backend)     */
/* Used by Docker/Portainer HEALTHCHECK so the       */
/* frontend is not marked unhealthy when the backend */
/* is temporarily unavailable.                       */
/* ------------------------------------------------ */

app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", service: "frontend", timestamp: new Date().toISOString() });
});

/* ------------------------------------------------ */
/* PROXY /api/* and /uploads/* to backend            */
/*
 * The browser (or the Jarvis extension) supplies the application key in
 * x-shiftplanner-key. Do not inject a server-side key here: doing so would
 * overwrite an invalid extension key and make key rotation ineffective.
 */
/* ------------------------------------------------ */

app.use(
    // Mount at the root so Express cannot strip /api from req.url.
    createProxyMiddleware("/api", {
        target: BACKEND_URL,
        agent: backendAgent,
        changeOrigin: true,
        xfwd: true,
        // SSE / long-lived connections must not time out at the proxy layer.
        // proxyTimeout: 0  => no timeout waiting for backend to respond.
        // timeout: 0       => no timeout on inactive socket (SSE keepalive pings every 25s).
        proxyTimeout: 0,
        timeout: 0,
        onError: (err, req, res) => {
            // Log the reason (ECONNREFUSED / ENOTFOUND / ECONNRESET ...) and the resolved
            // backend address, otherwise intermittent 502s cannot be diagnosed from the logs.
            console.error(
                `[FRONTEND] proxy error ${req?.method || ""} ${req?.originalUrl || req?.url || ""} -> ` +
                `${err?.code || "unknown"} ${err?.address ? `${err.address}:${err.port}` : ""} ${err?.message || ""}`.trim()
            );
            // Connection-reset errors from SSE client disconnects must not crash anything
            if (res && !res.headersSent) {
                res.writeHead(502, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Proxy error" }));
            }
        },
    })
);

app.use(
    createProxyMiddleware("/uploads", {
        target: BACKEND_URL,
        agent: backendAgent,
        changeOrigin: true,
        xfwd: true,
    })
);

/* ------------------------------------------------ */
/* SERVE STATIC FILES                                */
/* ------------------------------------------------ */

app.use(express.static(path.join(__dirname, "dist")));

/* ------------------------------------------------ */
/* SPA FALLBACK – return index.html for all other    */
/* routes (React Router)                             */
/* ------------------------------------------------ */

app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "dist", "index.html"));
});

/* ------------------------------------------------ */
/* START                                             */
/* ------------------------------------------------ */

if (require.main === module) {
    app.listen(PORT, "0.0.0.0", () => {
        console.log(`[FRONTEND] Listening on http://0.0.0.0:${PORT}`);
        console.log(`[FRONTEND] Proxying /api/* => ${BACKEND_URL}`);
    });
}

module.exports = app;
