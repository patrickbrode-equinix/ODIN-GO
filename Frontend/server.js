/* ------------------------------------------------ */
/* FRONTEND PRODUCTION SERVER                        */
/* Static files + /api proxy to backend              */
/* ------------------------------------------------ */

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const PORT = parseInt(process.env.PORT || "8000", 10);

// Docker service DNS on shiftplanner-net; local runs can override BACKEND_URL.
const BACKEND_URL = process.env.BACKEND_URL || "http://odin-backend:8001";

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
        changeOrigin: true,
        xfwd: true,
        // SSE / long-lived connections must not time out at the proxy layer.
        // proxyTimeout: 0  => no timeout waiting for backend to respond.
        // timeout: 0       => no timeout on inactive socket (SSE keepalive pings every 25s).
        proxyTimeout: 0,
        timeout: 0,
        onError: (err, req, res) => {
            // Swallow connection-reset errors from SSE client disconnects
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
