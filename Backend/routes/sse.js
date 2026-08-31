/* ------------------------------------------------ */
/* SERVER-SENT EVENTS (SSE) ROUTE                   */
/* /api/sse                                         */
/* Real-time push: handover, ingest, info updates   */
/* ------------------------------------------------ */

import express from "express";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

/* ------------------------------------------------ */
/* CLIENT REGISTRY                                  */
/* ------------------------------------------------ */

/** @type {Map<string, import('express').Response>} */
const clients = new Map();

let clientIdCounter = 0;

/**
 * Broadcast an event to all connected SSE clients.
 * @param {string} event  – event name
 * @param {object} data   – payload (will be JSON-serialized)
 */
export function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const [id, res] of clients) {
    try {
      res.write(payload);
    } catch {
      clients.delete(id);
    }
  }
}

/* ------------------------------------------------ */
/* SSE ENDPOINT                                     */
/* GET /api/sse                                     */
/* ------------------------------------------------ */

router.get("/", requireAuth, (req, res) => {
  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-store");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Nginx: disable buffering
  res.flushHeaders();

  const clientId = String(++clientIdCounter);
  clients.set(clientId, res);

  // Send initial connection confirmation
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId, ts: new Date().toISOString() })}\n\n`);

  // Keep-alive ping every 25s
  const ping = setInterval(() => {
    try {
      res.write(": ping\n\n");
    } catch {
      clearInterval(ping);
    }
  }, 25_000);

  req.on("close", () => {
    clearInterval(ping);
    clients.delete(clientId);
  });
});

export default router;
