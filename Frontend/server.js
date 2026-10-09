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

/*
 * Performance: the embedded page is loaded on every open of the panel.
 *  - Vite emits content-hashed files under /assets: cache them for a year.
 *  - index.html must always be revalidated so a deployment is picked up at once.
 *  - Text assets are compressed (brotli/gzip) once and kept in memory.
 */
const zlib = require("zlib");
const fs = require("fs");
const COMPRESSIBLE = /\.(?:js|mjs|css|html|json|svg|map|txt)$/i;
const compressedCache = new Map(); // `${file}:${encoding}:${mtime}` -> Buffer
const DIST_DIR = path.join(__dirname, "dist");

function chooseEncoding(acceptEncoding) {
    const header = String(acceptEncoding || "");
    if (/\bbr\b/.test(header)) return "br";
    if (/\bgzip\b/.test(header)) return "gzip";
    return null;
}

app.use((req, res, next) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || !COMPRESSIBLE.test(req.path)) return next();
    const encoding = chooseEncoding(req.headers["accept-encoding"]);
    if (!encoding) return next();
    let file;
    try {
        file = path.join(DIST_DIR, path.normalize(decodeURIComponent(req.path)));
    } catch {
        return next();
    }
    if (!file.startsWith(DIST_DIR)) return next();
    fs.stat(file, (statError, stat) => {
        if (statError || !stat.isFile()) return next();
        const key = `${file}:${encoding}:${stat.mtimeMs}`;
        const send = (body) => {
            res.setHeader("Content-Encoding", encoding);
            res.setHeader("Vary", "Accept-Encoding");
            res.setHeader("Content-Type", express.static.mime.lookup(file) || "application/octet-stream");
            res.setHeader("Content-Length", body.length);
            res.setHeader("Cache-Control", req.path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
            res.end(req.method === "HEAD" ? undefined : body);
        };
        if (compressedCache.has(key)) return send(compressedCache.get(key));
        fs.readFile(file, (readError, content) => {
            if (readError) return next();
            const done = (compressError, body) => {
                if (compressError) return next();
                compressedCache.set(key, body);
                send(body);
            };
            if (encoding === "br") {
                zlib.brotliCompress(content, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }, done);
            } else {
                zlib.gzip(content, { level: 6 }, done);
            }
        });
    });
});

app.use(express.static(DIST_DIR, {
    index: false,
    setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        else res.setHeader("Cache-Control", "no-cache");
    },
}));

/* ------------------------------------------------ */
/* SPA FALLBACK – return index.html for all other    */
/* routes (React Router)                             */
/* ------------------------------------------------ */

app.get("*", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    const encoding = chooseEncoding(req.headers["accept-encoding"]);
    const indexFile = path.join(DIST_DIR, "index.html");
    if (!encoding) return res.sendFile(indexFile);
    return fs.readFile(indexFile, (error, content) => {
        if (error) return res.sendFile(indexFile);
        const key = `${indexFile}:${encoding}:${content.length}`;
        const send = (body) => {
            res.setHeader("Content-Encoding", encoding);
            res.setHeader("Vary", "Accept-Encoding");
            res.type("html").send(body);
        };
        if (compressedCache.has(key)) return send(compressedCache.get(key));
        const done = (compressError, body) => {
            if (compressError) return res.sendFile(indexFile);
            compressedCache.set(key, body);
            send(body);
        };
        return encoding === "br" ? zlib.brotliCompress(content, done) : zlib.gzip(content, done);
    });
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
