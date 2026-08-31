/* ------------------------------------------------ */
/* TEAMS COMMUNICATION CENTER ROUTES                */
/* /api/teams-config                                */
/* Events, Routing, Templates, Settings, Test       */
/* ------------------------------------------------ */

import express from "express";
import db from "../db.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { requirePageAccess } from "../middleware/requirePageAccess.js";
import { logSettingsChange } from "../services/settingsAudit.js";
import {
  loadTeamsSettings,
  resolveTeamsWebhookUrl,
  sendTeamsAssignmentTestNotification,
  sendTeamsMessage,
  testPowerAutomateWebhook,
} from "../services/teamsMessaging.js";

const router = express.Router();

function maskValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.length <= 8) return "********";
  return `${normalized.slice(0, 4)}...${normalized.slice(-4)}`;
}

const SECRET_SETTING_KEYS = new Set([
  "teams.powerAutomateWebhookUrl",
  "teams.webhookUrl",
  "teams.personalWebhookUrl",
]);

function maskSecretSetting(key, value) {
  return SECRET_SETTING_KEYS.has(key) ? (maskValue(value) || "") : value;
}

function isMaskedSecretValue(value) {
  return String(value || "").includes("...");
}

function decodeJwtPayload(token) {
  try {
    const [, payload] = String(token || "").split(".");
    if (!payload) return null;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

function parseJsonSafely(rawText) {
  try {
    return rawText ? JSON.parse(rawText) : null;
  } catch {
    return null;
  }
}

function createCheck({ key, title, status, action, detail, nextStep = null, data = null, category = "general" }) {
  return {
    key,
    title,
    status,
    category,
    action,
    detail,
    next_step: nextStep,
    data,
  };
}

function hasGraphConfig() {
  const clientId = process.env.GRAPH_CLIENT_ID || process.env.CLIENT_ID || process.env.BOT_ID;
  const clientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET || process.env.CLIENT_PASSWORD;
  const tenantId = process.env.GRAPH_TENANT_ID || process.env.TENANT_ID || process.env.BOT_TENANT_ID;
  const botAppId = process.env.BOT_APP_ID || process.env.TEAMS_APP_ID;

  return !!(clientId && clientSecret && tenantId && botAppId);
}

/* ================================================ */
/* OVERVIEW / STATUS                                */
/* ================================================ */

/* GET /api/teams-config/status */
router.get("/status", requireAuth, requirePageAccess("teams_center", "view"), async (_req, res) => {
  try {
    // Collect health data
    const [
      { rows: todayStats },
      { rows: lastSuccess },
      { rows: lastError },
      { rows: pendingRetries },
      { rows: mappingCount },
    ] = await Promise.all([
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent') as sent_today,
           COUNT(*) FILTER (WHERE status = 'failed') as failed_today
         FROM teams_message_log
         WHERE sent_at >= CURRENT_DATE`
      ),
      db.query(
        `SELECT sent_at, message_type, recipient FROM teams_message_log
         WHERE status = 'sent' ORDER BY sent_at DESC LIMIT 1`
      ),
      db.query(
        `SELECT sent_at, error_msg, message_type FROM teams_message_log
         WHERE status = 'failed' ORDER BY sent_at DESC LIMIT 1`
      ),
      db.query(
        `SELECT COUNT(*) as count FROM teams_message_log
         WHERE status = 'failed' AND sent_at >= NOW() - INTERVAL '24 hours'`
      ),
      db.query(
        `SELECT COUNT(*) as count FROM employee_contacts WHERE email IS NOT NULL AND email != ''`
      ),
    ]);

    const teamsSettings = await loadTeamsSettings([
      "teams.powerAutomateWebhookUrl",
      "teams.webhookUrl",
      "teams.webhookEnabled",
      "teams.powerAutomateWebhookStatus",
    ]);
    const webhookUrl = resolveTeamsWebhookUrl(teamsSettings, "channel");
    const hasWebhook = !!webhookUrl;

    res.json({
      webhook_configured: hasWebhook,
      webhook_active: hasWebhook && teamsSettings["teams.powerAutomateWebhookStatus"] === "active",
      bot_configured: !!process.env.BOT_INTERNAL_API_KEY,
      graph_configured: hasGraphConfig(),
      sent_today: parseInt(todayStats[0]?.sent_today || 0),
      failed_today: parseInt(todayStats[0]?.failed_today || 0),
      last_success: lastSuccess[0] || null,
      last_error: lastError[0] || null,
      pending_retries: parseInt(pendingRetries[0]?.count || 0),
      mapped_employees: parseInt(mappingCount[0]?.count || 0),
    });
  } catch (err) {
    console.error("GET /teams-config/status error", err);
    res.status(500).json({ error: "Failed to fetch Teams status" });
  }
});

router.get("/diagnostics", requireAuth, requirePageAccess("teams_center", "view"), async (_req, res) => {
  const checks = [];
  const blockingIssues = [];

  try {
    const graphClientId = process.env.GRAPH_CLIENT_ID || process.env.CLIENT_ID || process.env.BOT_ID || "";
    const graphClientSecret = process.env.GRAPH_CLIENT_SECRET || process.env.CLIENT_SECRET || process.env.CLIENT_PASSWORD || "";
    const graphTenantId = process.env.GRAPH_TENANT_ID || process.env.TENANT_ID || process.env.BOT_TENANT_ID || "";
    const botAppId = process.env.BOT_APP_ID || process.env.TEAMS_APP_ID || "";
    const webhookUrl = process.env.TEAMS_CHANNEL_WEBHOOK || process.env.TEAMS_PERSONAL_WEBHOOK || "";
    const botConfigured = !!process.env.BOT_INTERNAL_API_KEY;

    const [
      { rows: lastErrorRows },
      { rows: recentHealthRows },
      { rows: mappingRows },
      { rows: fallbackRows },
    ] = await Promise.all([
      db.query(
        `SELECT sent_at, message_type, error_msg
         FROM teams_message_log
         WHERE status = 'failed'
         ORDER BY sent_at DESC
         LIMIT 1`
      ),
      db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'sent' AND sent_at >= CURRENT_DATE) AS sent_today,
           COUNT(*) FILTER (WHERE status = 'failed' AND sent_at >= CURRENT_DATE) AS failed_today,
           COUNT(*) FILTER (WHERE status = 'failed' AND sent_at >= NOW() - INTERVAL '24 hours') AS pending_retries
         FROM teams_message_log`
      ),
      db.query(
        `SELECT COUNT(*) AS count
         FROM employee_contacts
         WHERE email IS NOT NULL AND email <> ''`
      ),
      db.query(
        `SELECT value FROM teams_settings WHERE key = 'fallback_recipient' LIMIT 1`
      ),
    ]);

    const mappedEmployees = parseInt(mappingRows[0]?.count || 0, 10);
    const sentToday = parseInt(recentHealthRows[0]?.sent_today || 0, 10);
    const failedToday = parseInt(recentHealthRows[0]?.failed_today || 0, 10);
    const pendingRetries = parseInt(recentHealthRows[0]?.pending_retries || 0, 10);
    const fallbackRecipient = String(fallbackRows[0]?.value || "").trim();
    const lastError = lastErrorRows[0] || null;

    checks.push(
      createCheck({
        key: "channel_webhook",
        title: "Channel/Webhook-Konfiguration",
        status: webhookUrl ? "ok" : "failed",
        category: "config",
        action: "Pruefung auf vorhandene Teams-Webhooks in den Backend-Umgebungsvariablen.",
        detail: webhookUrl
          ? "Mindestens ein Teams-Webhook ist hinterlegt. Kanalnachrichten koennen grundsaetzlich versendet werden."
          : "Es ist kein Teams-Webhook hinterlegt. Kanalnachrichten sind aktuell komplett blockiert.",
        nextStep: webhookUrl ? null : "TEAMS_CHANNEL_WEBHOOK oder TEAMS_PERSONAL_WEBHOOK im Backend setzen.",
        data: {
          channel_webhook_present: !!process.env.TEAMS_CHANNEL_WEBHOOK,
          personal_webhook_present: !!process.env.TEAMS_PERSONAL_WEBHOOK,
        },
      })
    );

    if (!webhookUrl) {
      blockingIssues.push("Kein Teams-Webhook konfiguriert - Kanalversand ist blockiert.");
    }

    checks.push(
      createCheck({
        key: "bot_api",
        title: "Bot-API-Konfiguration",
        status: botConfigured ? "ok" : "warning",
        category: "config",
        action: "Pruefung auf interne Bot-API-Schluessel fuer persoenliche Teams-Nachrichten.",
        detail: botConfigured
          ? "Die interne Bot-API ist konfiguriert. 1:1-Nachrichten koennen ueber den Bot-Pfad verarbeitet werden."
          : "Keine interne Bot-API-Konfiguration gefunden. Persoenliche Nachrichten laufen nur ueber Fallbacks oder sind nicht verfuegbar.",
        nextStep: botConfigured ? null : "BOT_INTERNAL_API_KEY setzen, wenn 1:1-Nachrichten ueber den Bot genutzt werden sollen.",
      })
    );

    const graphCredentialsPresent = Boolean(graphClientId && graphClientSecret && graphTenantId && botAppId);
    checks.push(
      createCheck({
        key: "graph_credentials",
        title: "Microsoft-Graph-Credentials",
        status: graphCredentialsPresent ? "ok" : "failed",
        category: "auth",
        action: "Pruefung auf Tenant-ID, Client-ID, Client-Secret und Bot-App-ID fuer Microsoft Graph.",
        detail: graphCredentialsPresent
          ? "Alle benoetigten Graph-Credentials sind hinterlegt. Der naechste Schritt ist die echte Authentifizierungsprobe gegen Entra ID."
          : "Mindestens eine Graph-Credential fehlt. User-Mapping und Graph-basierte Teams-Funktionen koennen damit nicht aktiv werden.",
        nextStep: graphCredentialsPresent ? null : "GRAPH_TENANT_ID/TENANT_ID, GRAPH_CLIENT_ID/CLIENT_ID, GRAPH_CLIENT_SECRET/CLIENT_SECRET und BOT_APP_ID/TEAMS_APP_ID pruefen.",
        data: {
          tenant_id: maskValue(graphTenantId),
          client_id: maskValue(graphClientId),
          bot_app_id: maskValue(botAppId),
          client_secret_present: Boolean(graphClientSecret),
        },
      })
    );

    if (!graphCredentialsPresent) {
      blockingIssues.push("Graph-Credentials sind unvollstaendig - Graph-Aufloesung und persoenliche Teams-Unterstuetzung sind blockiert.");
    }

    let graphAccessToken = null;
    let graphTokenPayload = null;
    let graphUsersProbeOk = false;

    if (graphCredentialsPresent) {
      try {
        const tokenResponse = await fetch(
          `https://login.microsoftonline.com/${encodeURIComponent(graphTenantId)}/oauth2/v2.0/token`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: graphClientId,
              client_secret: graphClientSecret,
              grant_type: "client_credentials",
              scope: "https://graph.microsoft.com/.default",
            }),
          }
        );

        const rawTokenBody = await tokenResponse.text();
        const parsedTokenBody = parseJsonSafely(rawTokenBody) || {};

        if (!tokenResponse.ok || !parsedTokenBody.access_token) {
          const detail = parsedTokenBody.error_description || parsedTokenBody.error || rawTokenBody || `HTTP ${tokenResponse.status}`;
          checks.push(
            createCheck({
              key: "graph_token",
              title: "Graph-Authentifizierung",
              status: "failed",
              category: "auth",
              action: "Client-Credentials-Login gegen Microsoft Entra ID ausgefuehrt.",
              detail: `Token-Anforderung fehlgeschlagen: ${detail}`,
              nextStep: "Client-ID, Secret, Tenant und App-Registrierung in Entra ID pruefen.",
              data: { http_status: tokenResponse.status },
            })
          );
          blockingIssues.push(`Graph-Authentifizierung fehlgeschlagen: ${detail}`);
        } else {
          graphAccessToken = parsedTokenBody.access_token;
          graphTokenPayload = decodeJwtPayload(graphAccessToken);

          checks.push(
            createCheck({
              key: "graph_token",
              title: "Graph-Authentifizierung",
              status: "ok",
              category: "auth",
              action: "Client-Credentials-Login gegen Microsoft Entra ID ausgefuehrt.",
              detail: "Token wurde erfolgreich von Entra ID ausgestellt. Die Credentials sind technisch gueltig.",
              data: {
                expires_in: parsedTokenBody.expires_in || null,
                audience: graphTokenPayload?.aud || null,
                tenant_id: graphTokenPayload?.tid || maskValue(graphTenantId),
              },
            })
          );
        }
      } catch (err) {
        checks.push(
          createCheck({
            key: "graph_token",
            title: "Graph-Authentifizierung",
            status: "failed",
            category: "auth",
            action: "Client-Credentials-Login gegen Microsoft Entra ID ausgefuehrt.",
            detail: `Token-Anforderung ist technisch fehlgeschlagen: ${err.message}`,
            nextStep: "Netzwerk, Proxy, DNS und ausgehende HTTPS-Verbindungen pruefen.",
          })
        );
        blockingIssues.push(`Graph-Authentifizierung konnte technisch nicht abgeschlossen werden: ${err.message}`);
      }
    }

    if (graphTokenPayload) {
      const roles = Array.isArray(graphTokenPayload.roles) ? graphTokenPayload.roles : [];
      const scopes = typeof graphTokenPayload.scp === "string" ? graphTokenPayload.scp.split(" ").filter(Boolean) : [];
      const hasPermissions = roles.length > 0 || scopes.length > 0;

      checks.push(
        createCheck({
          key: "graph_permissions",
          title: "Graph-Berechtigungen im Token",
          status: hasPermissions ? "ok" : "failed",
          category: "graph",
          action: "Access-Token auf Rollen/Scopes fuer Microsoft Graph ausgewertet.",
          detail: hasPermissions
            ? `Graph-Token enthaelt Berechtigungen: ${(roles.length ? roles : scopes).join(", ")}`
            : "Das Graph-Token enthaelt keine Rollen oder Scopes. Das deutet typischerweise auf fehlende Application Permissions oder fehlenden Admin Consent hin.",
          nextStep: hasPermissions ? null : "In Azure/Entra ID Graph-Application-Permissions vergeben und Admin Consent erneut erteilen.",
          data: {
            roles,
            scopes,
          },
        })
      );

      if (!hasPermissions) {
        blockingIssues.push("Graph-Token enthaelt keine nutzbaren Rollen/Scopes - Admin Consent oder Graph-Rechte fehlen.");
      }
    }

    if (graphAccessToken) {
      try {
        const graphResponse = await fetch(
          "https://graph.microsoft.com/v1.0/users?$top=1&$select=id,displayName",
          {
            headers: {
              Authorization: `Bearer ${graphAccessToken}`,
              Accept: "application/json",
            },
          }
        );

        const rawGraphBody = await graphResponse.text();
        const parsedGraphBody = parseJsonSafely(rawGraphBody) || {};

        if (graphResponse.ok) {
          graphUsersProbeOk = true;
          checks.push(
            createCheck({
              key: "graph_users_probe",
              title: "Graph-API-Probe /users",
              status: "ok",
              category: "graph",
              action: "Lesetest gegen Microsoft Graph /users mit dem ausgestellten Access-Token ausgefuehrt.",
              detail: "Der Graph-/users-Test war erfolgreich. Benutzeraufloesung ueber Graph ist grundsaetzlich erreichbar.",
              data: {
                http_status: graphResponse.status,
                sample_users_returned: Array.isArray(parsedGraphBody.value) ? parsedGraphBody.value.length : 0,
              },
            })
          );
        } else {
          const graphError = parsedGraphBody?.error?.message || parsedGraphBody?.error?.code || rawGraphBody || `HTTP ${graphResponse.status}`;
          const nextStep = graphResponse.status === 403
            ? "Graph Application Permissions und Admin Consent fuer die App pruefen; 403 deutet meist auf fehlende Rechte hin."
            : graphResponse.status === 401
              ? "Token-Ausstellung und Audience pruefen; 401 deutet auf ein ungueltiges oder nicht akzeptiertes Token hin."
              : "Microsoft-Graph-Fehlerdetails pruefen und mit Azure/Entra ID abgleichen.";

          checks.push(
            createCheck({
              key: "graph_users_probe",
              title: "Graph-API-Probe /users",
              status: "failed",
              category: "graph",
              action: "Lesetest gegen Microsoft Graph /users mit dem ausgestellten Access-Token ausgefuehrt.",
              detail: `Graph-Aufruf fehlgeschlagen: ${graphError}`,
              nextStep,
              data: { http_status: graphResponse.status },
            })
          );
          blockingIssues.push(`Graph-/users-Aufruf fehlgeschlagen: ${graphError}`);
        }
      } catch (err) {
        checks.push(
          createCheck({
            key: "graph_users_probe",
            title: "Graph-API-Probe /users",
            status: "failed",
            category: "graph",
            action: "Lesetest gegen Microsoft Graph /users mit dem ausgestellten Access-Token ausgefuehrt.",
            detail: `Graph-Aufruf konnte technisch nicht ausgefuehrt werden: ${err.message}`,
            nextStep: "Netzwerk, Proxy und ausgehende HTTPS-Verbindungen zum Graph-Endpunkt pruefen.",
          })
        );
        blockingIssues.push(`Graph-/users-Probe technisch fehlgeschlagen: ${err.message}`);
      }
    }

    checks.push(
      createCheck({
        key: "recipient_mapping",
        title: "Empfaenger-Mapping und Fallback",
        status: mappedEmployees > 0 || fallbackRecipient ? "ok" : "warning",
        category: "delivery",
        action: "Vorhandene Mitarbeiter-Mappings und Teams-Fallback-Empfaenger aus Datenbank/Settings geprueft.",
        detail: mappedEmployees > 0 || fallbackRecipient
          ? `${mappedEmployees} Mitarbeiter mit Teams-E-Mail gefunden.${fallbackRecipient ? " Ein Fallback-Empfaenger ist ebenfalls hinterlegt." : ""}`
          : "Es gibt weder Mitarbeiter-Mappings noch einen Fallback-Empfaenger. Personalisierte Nachrichten koennen dadurch nicht zielgerichtet zugestellt werden.",
        nextStep: mappedEmployees > 0 || fallbackRecipient ? null : "Mitarbeiter-Mappings pflegen oder einen fallback_recipient in den Teams-Settings setzen.",
        data: {
          mapped_employees: mappedEmployees,
          fallback_recipient_present: Boolean(fallbackRecipient),
        },
      })
    );

    checks.push(
      createCheck({
        key: "delivery_health",
        title: "Letzte Versand-/Fehlerlage",
        status: failedToday > 0 || pendingRetries > 0 ? "warning" : "ok",
        category: "delivery",
        action: "Teams-Nachrichtenlog auf aktuelle Fehler, Retries und letzte Fehlerursache ausgewertet.",
        detail: failedToday > 0 || pendingRetries > 0
          ? `Heute fehlgeschlagen: ${failedToday}, offene Retries (24h): ${pendingRetries}.${lastError ? ` Letzter Fehler: ${lastError.error_msg}` : ""}`
          : `Heute wurden ${sentToday} Nachrichten erfolgreich verarbeitet und es liegen keine offenen Fehler-Retries vor.`,
        nextStep: failedToday > 0 || pendingRetries > 0 ? "Im Fehlercenter den letzten Fehler pruefen und nach Behebung einen Retry ausloesen." : null,
        data: {
          sent_today: sentToday,
          failed_today: failedToday,
          pending_retries: pendingRetries,
          last_error_at: lastError?.sent_at || null,
          last_error_type: lastError?.message_type || null,
        },
      })
    );

    const capabilities = {
      channel_notifications: Boolean(webhookUrl),
      graph_lookup: graphUsersProbeOk,
      personal_notifications: Boolean(botConfigured && graphUsersProbeOk),
    };

    let summary = "Teams-Unterstuetzung ist vollstaendig aktiv.";
    if (!capabilities.channel_notifications && !capabilities.personal_notifications) {
      summary = "Teams-Unterstuetzung ist derzeit nicht aktiv. Mindestens ein Blocker verhindert den produktiven Versand.";
    } else if (!capabilities.personal_notifications || blockingIssues.length > 0) {
      summary = "Teams-Unterstuetzung ist nur teilweise aktiv. Einzelne Funktionspfade sind blockiert oder fehlerhaft.";
    }

    res.json({
      generated_at: new Date().toISOString(),
      ready: blockingIssues.length === 0,
      summary,
      blocking_issues: blockingIssues,
      capabilities,
      checks,
    });
  } catch (err) {
    console.error("GET /teams-config/diagnostics error", err);
    res.status(500).json({ error: "Failed to run Teams diagnostics" });
  }
});

/* ================================================ */
/* EVENT CONFIG                                     */
/* ================================================ */

/* GET /api/teams-config/events */
router.get("/events", requireAuth, requirePageAccess("teams_center", "view"), async (_req, res) => {
  try {
    const { rows } = await db.query(
      "SELECT * FROM teams_event_config ORDER BY priority, event_key"
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /teams-config/events error", err);
    res.status(500).json({ error: "Failed to fetch events" });
  }
});

/* PUT /api/teams-config/events/:eventKey */
router.put("/events/:eventKey", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { eventKey } = req.params;
    const { enabled, priority, send_mode, respect_quiet_hours, cooldown_minutes, deduplicate, escalation } = req.body;
    const actor = req.user?.name || req.user?.email || "system";

    // Get old value
    const { rows: old } = await db.query("SELECT * FROM teams_event_config WHERE event_key = $1", [eventKey]);
    if (old.length === 0) return res.status(404).json({ error: "Event not found" });

    await db.query(
      `UPDATE teams_event_config SET
         enabled = COALESCE($2, enabled),
         priority = COALESCE($3, priority),
         send_mode = COALESCE($4, send_mode),
         respect_quiet_hours = COALESCE($5, respect_quiet_hours),
         cooldown_minutes = COALESCE($6, cooldown_minutes),
         deduplicate = COALESCE($7, deduplicate),
         escalation = COALESCE($8, escalation),
         updated_at = NOW()
       WHERE event_key = $1`,
      [eventKey, enabled, priority, send_mode, respect_quiet_hours, cooldown_minutes, deduplicate, escalation]
    );

    // Audit
    const oldRow = old[0];
    if (enabled != null && enabled !== oldRow.enabled) {
      await logSettingsChange("teams", `event.${eventKey}.enabled`, oldRow.enabled, enabled, actor);
    }
    if (priority != null && priority !== oldRow.priority) {
      await logSettingsChange("teams", `event.${eventKey}.priority`, oldRow.priority, priority, actor);
    }

    const { rows } = await db.query("SELECT * FROM teams_event_config WHERE event_key = $1", [eventKey]);
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /teams-config/events error", err);
    res.status(500).json({ error: "Failed to update event" });
  }
});

/* ================================================ */
/* ROUTING RULES                                    */
/* ================================================ */

/* GET /api/teams-config/routing */
router.get("/routing", requireAuth, requirePageAccess("teams_center", "view"), async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, e.label as event_label
       FROM teams_routing_rules r
       JOIN teams_event_config e ON e.event_key = r.event_key
       ORDER BY r.event_key, r.sort_order`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /teams-config/routing error", err);
    res.status(500).json({ error: "Failed to fetch routing rules" });
  }
});

/* POST /api/teams-config/routing */
router.post("/routing", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { event_key, target_type, target_value, enabled = true, sort_order = 0 } = req.body;
    if (!event_key || !target_type || !target_value) {
      return res.status(400).json({ error: "event_key, target_type, target_value required" });
    }
    const actor = req.user?.name || req.user?.email || "system";

    const { rows } = await db.query(
      `INSERT INTO teams_routing_rules (event_key, target_type, target_value, enabled, sort_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [event_key, target_type, target_value, enabled, sort_order]
    );

    await logSettingsChange("teams", `routing.${event_key}`, null, `${target_type}:${target_value}`, actor, "Rule added");
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /teams-config/routing error", err);
    res.status(500).json({ error: "Failed to create routing rule" });
  }
});

/* PUT /api/teams-config/routing/:id */
router.put("/routing/:id", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { id } = req.params;
    const { target_type, target_value, enabled, sort_order } = req.body;
    const actor = req.user?.name || req.user?.email || "system";

    const { rows } = await db.query(
      `UPDATE teams_routing_rules SET
         target_type = COALESCE($2, target_type),
         target_value = COALESCE($3, target_value),
         enabled = COALESCE($4, enabled),
         sort_order = COALESCE($5, sort_order)
       WHERE id = $1 RETURNING *`,
      [id, target_type, target_value, enabled, sort_order]
    );
    if (rows.length === 0) return res.status(404).json({ error: "Rule not found" });

    await logSettingsChange("teams", `routing.${rows[0].event_key}`, null, JSON.stringify(req.body), actor, "Rule updated");
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /teams-config/routing error", err);
    res.status(500).json({ error: "Failed to update routing rule" });
  }
});

/* DELETE /api/teams-config/routing/:id */
router.delete("/routing/:id", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { id } = req.params;
    const actor = req.user?.name || req.user?.email || "system";

    const { rows } = await db.query("DELETE FROM teams_routing_rules WHERE id = $1 RETURNING *", [id]);
    if (rows.length === 0) return res.status(404).json({ error: "Rule not found" });

    await logSettingsChange("teams", `routing.${rows[0].event_key}`, `${rows[0].target_type}:${rows[0].target_value}`, null, actor, "Rule deleted");
    res.json({ deleted: true });
  } catch (err) {
    console.error("DELETE /teams-config/routing error", err);
    res.status(500).json({ error: "Failed to delete routing rule" });
  }
});

/* ================================================ */
/* TEMPLATES                                        */
/* ================================================ */

/* GET /api/teams-config/templates */
router.get("/templates", requireAuth, requirePageAccess("teams_center", "view"), async (_req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM teams_templates ORDER BY template_key");
    res.json(rows);
  } catch (err) {
    console.error("GET /teams-config/templates error", err);
    res.status(500).json({ error: "Failed to fetch templates" });
  }
});

/* PUT /api/teams-config/templates/:templateKey */
router.put("/templates/:templateKey", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { templateKey } = req.params;
    const { title, body_text, compact_body, include_deep_link, include_ticket_details, include_remaining_time, include_priority_badge } = req.body;
    const actor = req.user?.name || req.user?.email || "system";

    const { rows: old } = await db.query("SELECT * FROM teams_templates WHERE template_key = $1", [templateKey]);
    if (old.length === 0) return res.status(404).json({ error: "Template not found" });

    await db.query(
      `UPDATE teams_templates SET
         title = COALESCE($2, title),
         body_text = COALESCE($3, body_text),
         compact_body = COALESCE($4, compact_body),
         include_deep_link = COALESCE($5, include_deep_link),
         include_ticket_details = COALESCE($6, include_ticket_details),
         include_remaining_time = COALESCE($7, include_remaining_time),
         include_priority_badge = COALESCE($8, include_priority_badge),
         updated_at = NOW()
       WHERE template_key = $1`,
      [templateKey, title, body_text, compact_body, include_deep_link, include_ticket_details, include_remaining_time, include_priority_badge]
    );

    await logSettingsChange("teams", `template.${templateKey}`, old[0].body_text, body_text || old[0].body_text, actor);

    const { rows } = await db.query("SELECT * FROM teams_templates WHERE template_key = $1", [templateKey]);
    res.json(rows[0]);
  } catch (err) {
    console.error("PUT /teams-config/templates error", err);
    res.status(500).json({ error: "Failed to update template" });
  }
});

/* POST /api/teams-config/templates/preview — render a template with sample data */
router.post("/templates/preview", requireAuth, requirePageAccess("teams_center", "view"), async (req, res) => {
  try {
    const { body_text, sample_data } = req.body;
    if (!body_text) return res.status(400).json({ error: "body_text required" });

    const defaults = {
      employeeName: "Max Mustermann",
      ticketId: "TT-12345",
      activity: "SmartHands Install",
      systemName: "FR5-0101A",
      ticketType: "SmartHands",
      priority: "high",
      restTime: "2h 15m",
      commitDate: "2026-04-03 14:00",
      shift: "E1",
      reason: "Nur 3 von 5 Mitarbeitern verfügbar",
      dashboardLink: "https://odin.equinix.com/dashboard",
      threshold: "10",
      totalTickets: "42",
      assignedCount: "28",
      openCount: "14",
      accountName: "Deutsche Telekom",
    };

    const data = { ...defaults, ...(sample_data || {}) };
    let rendered = body_text;
    for (const [key, val] of Object.entries(data)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
    }

    res.json({ rendered, placeholders: Object.keys(data) });
  } catch (err) {
    res.status(500).json({ error: "Preview failed" });
  }
});

/* ================================================ */
/* TEAMS SETTINGS                                   */
/* ================================================ */

/* GET /api/teams-config/settings */
router.get("/settings", requireAuth, requirePageAccess("teams_center", "view"), async (_req, res) => {
  try {
    const { rows } = await db.query("SELECT key, value FROM teams_settings ORDER BY key");
    res.json(Object.fromEntries(rows.map((r) => [r.key, maskSecretSetting(r.key, r.value)])));
  } catch (err) {
    console.error("GET /teams-config/settings error", err);
    res.status(500).json({ error: "Failed to fetch Teams settings" });
  }
});

/* PUT /api/teams-config/settings */
router.put("/settings", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ error: "Body must be a key-value object" });
    }
    const actor = req.user?.name || req.user?.email || "system";

    for (const [key, val] of Object.entries(updates)) {
      if (SECRET_SETTING_KEYS.has(key) && isMaskedSecretValue(val)) {
        continue;
      }
      // Get old value
      const { rows: old } = await db.query("SELECT value FROM teams_settings WHERE key = $1", [key]);
      const oldVal = old.length > 0 ? old[0].value : null;

      await db.query(
        `INSERT INTO teams_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, String(val), actor]
      );

      if (oldVal !== String(val)) {
        await logSettingsChange("teams", key, oldVal, String(val), actor);
      }
    }

    const { rows } = await db.query("SELECT key, value FROM teams_settings ORDER BY key");
    res.json(Object.fromEntries(rows.map((r) => [r.key, r.value])));
  } catch (err) {
    console.error("PUT /teams-config/settings error", err);
    res.status(500).json({ error: "Failed to update Teams settings" });
  }
});

/* POST /api/teams-config/webhook/test */
router.post("/webhook/test", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  const actor = req.user?.name || req.user?.email || "system";
  const webhookUrl = String(req.body?.webhookUrl || "").trim();
  const testedAt = new Date().toISOString();

  if (!webhookUrl) {
    return res.status(400).json({
      success: false,
      active: false,
      status: "failed",
      message: "Webhook URL is required.",
    });
  }

  async function upsertSetting(key, value) {
    const { rows: old } = await db.query("SELECT value FROM teams_settings WHERE key = $1", [key]);
    const oldVal = old.length > 0 ? old[0].value : null;
    await db.query(
      `INSERT INTO teams_settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
      [key, String(value), actor]
    );
    if (oldVal !== String(value)) {
      await logSettingsChange("teams", key, oldVal, String(value), actor);
    }
  }

  try {
    const result = await testPowerAutomateWebhook(webhookUrl);
    await upsertSetting("teams.powerAutomateWebhookUrl", webhookUrl);
    await upsertSetting("teams.webhookUrl", webhookUrl);
    await upsertSetting("teams.webhookEnabled", "true");
    await upsertSetting("teams.powerAutomateWebhookStatus", "active");
    await upsertSetting("teams.powerAutomateWebhookLastTestAt", testedAt);
    await upsertSetting("teams.powerAutomateWebhookLastError", "");

    return res.json({
      success: true,
      active: true,
      status: "active",
      httpStatus: result.status || null,
      lastTestAt: testedAt,
      message: "Power Automate webhook is active.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await upsertSetting("teams.powerAutomateWebhookUrl", webhookUrl);
    await upsertSetting("teams.webhookUrl", webhookUrl);
    await upsertSetting("teams.powerAutomateWebhookStatus", "failed");
    await upsertSetting("teams.powerAutomateWebhookLastTestAt", testedAt);
    await upsertSetting("teams.powerAutomateWebhookLastError", message);

    return res.status(502).json({
      success: false,
      active: false,
      status: "failed",
      lastTestAt: testedAt,
      message,
    });
  }
});

/* POST /api/teams-config/assignment/test */
router.post("/assignment/test", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const result = await sendTeamsAssignmentTestNotification({
      recipientName: String(req.body?.recipientName || req.user?.name || "ODIN Test User").trim(),
      recipientUpn: String(req.body?.recipientUpn || req.user?.email || "").trim(),
      ticketNumber: String(req.body?.ticketNumber || "TEST-123456").trim(),
      location: String(req.body?.location || "").trim(),
      priority: String(req.body?.priority || "Normal").trim(),
      assignedBy: req.user?.name || req.user?.email || "ODIN",
    });

    if (!result.success) {
      return res.status(result.httpStatus || 503).json({
        success: false,
        eventId: result.eventId || null,
        httpStatus: result.httpStatus || null,
        message: result.message || result.reason || "Teams test notification failed",
      });
    }

    return res.json({
      success: true,
      eventId: result.eventId,
      httpStatus: result.httpStatus,
      message: "Teams test notification sent",
    });
  } catch (err) {
    console.error("POST /teams-config/assignment/test error", err?.message || err);
    return res.status(500).json({
      success: false,
      httpStatus: null,
      message: "Teams test notification failed",
    });
  }
});

/* ================================================ */
/* MESSAGE LOG / AUDIT                              */
/* ================================================ */

/* GET /api/teams-config/log */
router.get("/log", requireAuth, requirePageAccess("teams_center", "view"), async (req, res) => {
  try {
    const { limit = 100, offset = 0, status, recipient, message_type, start, end } = req.query;
    const conditions = [];
    const params = [];
    let idx = 1;

    if (status) { conditions.push(`status = $${idx++}`); params.push(status); }
    if (recipient) { conditions.push(`recipient ILIKE $${idx++}`); params.push(`%${recipient}%`); }
    if (message_type) { conditions.push(`message_type = $${idx++}`); params.push(message_type); }
    if (start) { conditions.push(`sent_at >= $${idx++}`); params.push(start); }
    if (end) { conditions.push(`sent_at <= $${idx++}`); params.push(end); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    params.push(parseInt(limit), parseInt(offset));

    const { rows } = await db.query(
      `SELECT * FROM teams_message_log ${where} ORDER BY sent_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      params
    );

    // Total count for pagination
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) as total FROM teams_message_log ${where}`,
      params.slice(0, -2)
    );

    res.json({ rows, total: parseInt(countRows[0]?.total || 0) });
  } catch (err) {
    console.error("GET /teams-config/log error", err);
    res.status(500).json({ error: "Failed to fetch message log" });
  }
});

/* ================================================ */
/* ERROR & RETRY                                    */
/* ================================================ */

/* GET /api/teams-config/errors */
router.get("/errors", requireAuth, requirePageAccess("teams_center", "view"), async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    const { rows } = await db.query(
      `SELECT * FROM teams_message_log WHERE status = 'failed'
       ORDER BY sent_at DESC LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /teams-config/errors error", err);
    res.status(500).json({ error: "Failed to fetch errors" });
  }
});

/* POST /api/teams-config/retry/:id */
router.post("/retry/:id", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query("SELECT * FROM teams_message_log WHERE id = $1", [parseInt(id)]);
    if (rows.length === 0) return res.status(404).json({ error: "Message not found" });

    const msg = rows[0];
    // Re-attempt to send
    const webhookUrl = msg.channel === "personal"
      ? process.env.TEAMS_PERSONAL_WEBHOOK
      : process.env.TEAMS_CHANNEL_WEBHOOK;

    if (!webhookUrl) {
      return res.status(503).json({ error: "No webhook configured for retry" });
    }

    try {
      const card = {
        type: "message",
        attachments: [{
          contentType: "application/vnd.microsoft.card.adaptive",
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.2",
            body: [
              { type: "TextBlock", size: "Large", weight: "Bolder", text: "Retry: " + (msg.message_type || "Message") },
              { type: "TextBlock", text: msg.content || "", wrap: true },
            ],
          },
        }],
      };

      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(card),
      });

      if (!response.ok) throw new Error(`Webhook returned ${response.status}`);

      await db.query(
        "UPDATE teams_message_log SET status = 'sent', error_msg = NULL WHERE id = $1",
        [parseInt(id)]
      );

      res.json({ success: true, retried: true });
    } catch (sendErr) {
      await db.query(
        "UPDATE teams_message_log SET error_msg = $2 WHERE id = $1",
        [parseInt(id), String(sendErr.message)]
      );
      res.status(502).json({ error: "Retry failed", detail: sendErr.message });
    }
  } catch (err) {
    console.error("POST /teams-config/retry error", err);
    res.status(500).json({ error: "Retry failed" });
  }
});

/* ================================================ */
/* TEST CENTER                                      */
/* ================================================ */

/* POST /api/teams-config/test/send */
router.post("/test/send", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { channel = "channel", title = "ODIN Test Message", body = "Dies ist eine Testnachricht von ODIN." } = req.body;
    const settings = await loadTeamsSettings([
      "teams.powerAutomateWebhookUrl",
      "teams.webhookUrl",
      "teams.personalWebhookUrl",
      "teams.communicationMode",
    ]);
    const webhookUrl = resolveTeamsWebhookUrl(settings, channel);

    if (!webhookUrl) {
      return res.status(503).json({ error: `Kein ${channel} Webhook konfiguriert.` });
    }

    await sendTeamsMessage(webhookUrl, title, body);

    await db.query(
      `INSERT INTO teams_message_log (message_type, recipient, channel, content, status)
       VALUES ('TEST', $1, $2, $3, 'sent')`,
      [req.user?.email || "test", channel, `${title}: ${body}`]
    );

    res.json({ success: true, channel });
  } catch (err) {
    console.error("POST /teams-config/test error", err);
    res.status(500).json({ error: "Test send failed" });
  }
});
/* POST /api/teams-config/test/template */
router.post("/test/template", requireAuth, requirePageAccess("teams_center", "write"), async (req, res) => {
  try {
    const { template_key, channel = "channel" } = req.body;
    if (!template_key) return res.status(400).json({ error: "template_key required" });

    const { rows } = await db.query("SELECT * FROM teams_templates WHERE template_key = $1", [template_key]);
    if (rows.length === 0) return res.status(404).json({ error: "Template not found" });

    const tpl = rows[0];
    const sampleData = {
      employeeName: req.user?.name || "Test User",
      ticketId: "TEST-00001",
      activity: "SmartHands Install",
      systemName: "FR5-TEST",
      ticketType: "SmartHands",
      priority: "high",
      restTime: "3h 45m",
      shift: "E1",
      reason: "Testfall",
      threshold: "10",
    };

    let rendered = tpl.body_text;
    for (const [key, val] of Object.entries(sampleData)) {
      rendered = rendered.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), val);
    }

    // Forward to test/send
    req.body = { channel, title: tpl.title.replace(/\{\{ticketId\}\}/g, "TEST-00001"), body: rendered };
    // Re-use test/send handler logic
    const webhookUrl = channel === "personal" ? process.env.TEAMS_PERSONAL_WEBHOOK : process.env.TEAMS_CHANNEL_WEBHOOK;
    if (!webhookUrl) return res.status(503).json({ error: "Kein Webhook konfiguriert." });

    const card = {
      type: "message",
      attachments: [{
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.2",
          body: [
            { type: "TextBlock", size: "Large", weight: "Bolder", text: req.body.title },
            { type: "TextBlock", text: rendered, wrap: true },
            { type: "TextBlock", text: `Template Test · ${new Date().toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}`, isSubtle: true, size: "Small" },
          ],
        },
      }],
    };

    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(card),
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Webhook returned ${response.status}` });
    }

    res.json({ success: true, template_key, rendered });
  } catch (err) {
    console.error("POST /teams-config/test/template error", err);
    res.status(500).json({ error: "Template test failed" });
  }
});

/* ================================================ */
/* EMPLOYEE MAPPING                                 */
/* ================================================ */

/* GET /api/teams-config/employees */
router.get("/employees", requireAuth, requirePageAccess("teams_center", "view"), async (_req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT ec.employee_name, ec.email, ec.email_source, ec.is_active, ec.updated_at,
              u.id as user_id
       FROM employee_contacts ec
       LEFT JOIN users u ON LOWER(u.email) = LOWER(ec.email)
       ORDER BY ec.employee_name`
    );
    res.json(rows);
  } catch (err) {
    console.error("GET /teams-config/employees error", err);
    res.status(500).json({ error: "Failed to fetch employee mappings" });
  }
});

export default router;
