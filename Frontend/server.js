/* ------------------------------------------------ */
/* FRONTEND PRODUCTION SERVER                        */
/* Static files + /api proxy to backend              */
/* ------------------------------------------------ */

const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");

const app = express();
const PORT = parseInt(process.env.PORT || "8000", 10);

// Backend URL: In host-networking mode, backend is on localhost:8001
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8001";

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
    "/api",
    createProxyMiddleware({
        target: BACKEND_URL,
        changeOrigin: true,
        xfwd: true,
        // SSE / long-lived connections must not time out at the proxy layer.
        // proxyTimeout: 0  => no timeout waiting for backend to respond.
        // timeout: 0       => no timeout on inactive socket (SSE keepalive pings every 25s).
        proxyTimeout: 0,
        timeout: 0,
        on: {
            error: (err, req, res) => {
                // Swallow connection-reset errors from SSE client disconnects
                if (res && !res.headersSent) {
                    res.writeHead(502, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: "Proxy error" }));
                }
            },
        },
    })
);

app.use(
    "/uploads",
    createProxyMiddleware({
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

app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FRONTEND] Listening on http://0.0.0.0:${PORT}`);
    console.log(`[FRONTEND] Proxying /api/* => ${BACKEND_URL}`);
});
