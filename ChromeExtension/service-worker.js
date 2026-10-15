const DEFAULTS = {
  plannerUrl: "https://eqx-portal.corp.equinix.com",
  apiKey: "",
};
const ADMIN_SESSION_KEY = "odinGoAdminSession";
const NOTIFICATION_CLAIM_TTL_MS = 90_000;
const notificationClaims = new Map();

function logConnection(event, details = {}) { console.info("[ODIN GO]", event, details); }

function validatePlannerUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") {
      return { ok: false, message: "ODIN GO muss innerhalb von Jarvis über HTTPS erreichbar sein. Die konfigurierte Planner-URL verwendet HTTP." };
    }
    if (url.username || url.password || url.search || url.hash) {
      return { ok: false, message: "Die Planner-URL darf keine Zugangsdaten, Query-Parameter oder Fragmente enthalten." };
    }
    return { ok: true, url: url.origin + url.pathname.replace(/\/+$/, "") };
  } catch {
    return { ok: false, message: "Ungültige Planner-Adresse." };
  }
}

async function testConnection(plannerUrl, apiKey) {
  const validation = validatePlannerUrl(plannerUrl);
  if (!validation.ok) return { ok: false, status: 0, message: validation.message };
  const baseUrl = validation.url;
  // Endpoint behind requireApplicationKey (cached, cheap) so a wrong/empty key is reported as HTTP 401.
  const url = `${baseUrl}/api/odin-go/weather`;
  logConnection("Verbindungsversuch", { url });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { headers: { "x-shiftplanner-key": apiKey || "" }, signal: controller.signal });
    logConnection("Verbindungsantwort", { url, status: response.status, ok: response.ok });
    return { ok: response.ok, status: response.status, message: response.ok ? "" : `Backend antwortet mit HTTP ${response.status}.` };
  } catch (error) {
    const message = error.name === "AbortError" ? "Zeitüberschreitung beim Backend-Aufruf." : error.message;
    logConnection("Verbindungsfehler", { url, message });
    return { ok: false, status: 0, message: `Backend nicht erreichbar: ${message}` };
  } finally { clearTimeout(timeout); }
}

function normalizeBaseUrl(value) {
  const validation = validatePlannerUrl(value || DEFAULTS.plannerUrl);
  if (!validation.ok) throw new Error(validation.message);
  return validation.url;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "TEST_CONNECTION") {
    testConnection(message.plannerUrl, message.apiKey).then(sendResponse);
    return true;
  }
  if (message?.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }

  if (message?.type === "GET_ADMIN_SESSION") {
    chrome.storage.session.get(ADMIN_SESSION_KEY).then(async (result) => {
      const session = result?.[ADMIN_SESSION_KEY];
      if (!session?.token || Number(session.expiresAt || 0) <= Date.now()) {
        await chrome.storage.session.remove(ADMIN_SESSION_KEY);
        sendResponse({ ok: false, token: null });
        return;
      }
      sendResponse({ ok: true, token: session.token });
    }).catch(() => sendResponse({ ok: false, token: null }));
    return true;
  }

  if (message?.type === "SET_ADMIN_SESSION") {
    const token = String(message.token || "").trim();
    if (!token) {
      sendResponse({ ok: false, message: "Ungueltige Admin-Sitzung." });
      return false;
    }
    chrome.storage.session.set({
      [ADMIN_SESSION_KEY]: {
        token,
        expiresAt: Date.now() + (4 * 60 * 60 * 1000) - 60_000,
      },
    }).then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false, message: "Admin-Sitzung konnte nicht gespeichert werden." }));
    return true;
  }

  if (message?.type !== "UNLOCK_ADMIN") return false;

  loadSettings().then(async (settings) => {
    try {
      logConnection("Admin-Entsperrung", { url: `${normalizeBaseUrl(settings.plannerUrl)}/api/standalone-admin/unlock` });
      const response = await fetch(`${normalizeBaseUrl(settings.plannerUrl)}/api/standalone-admin/unlock`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-shiftplanner-key": settings.apiKey || "" },
        body: JSON.stringify({ password: message.password }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.token) {
        await chrome.storage.session.set({
          [ADMIN_SESSION_KEY]: {
            token: data.token,
            expiresAt: Date.now() + (4 * 60 * 60 * 1000) - 60_000,
          },
        });
      }
      sendResponse({
        ok: response.ok,
        token: data.token || null,
        message: data.message || (response.ok ? "Freigeschaltet" : "Admin-Freigabe fehlgeschlagen"),
      });
    } catch (error) {
      logConnection("Admin-Aufruf fehlgeschlagen", { message: error.message });
      sendResponse({ ok: false, message: `Schichtplaner nicht erreichbar: ${error.message}` });
    }
  });

  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "GET_ODIN_GO_PREFERENCES" && message?.type !== "SAVE_ODIN_GO_PREFERENCES") return false;

  loadSettings().then(async (settings) => {
    try {
      logConnection(message.type, { url: `${normalizeBaseUrl(settings.plannerUrl)}/api/odin-go/preferences` });
      const isSave = message.type === "SAVE_ODIN_GO_PREFERENCES";
      const response = await fetch(`${normalizeBaseUrl(settings.plannerUrl)}/api/odin-go/preferences`, {
        method: isSave ? "PUT" : "GET",
        headers: {
          "Content-Type": "application/json",
          "x-shiftplanner-key": settings.apiKey || "",
          "x-shiftplanner-identity": message.identityToken || "",
        },
        body: isSave ? JSON.stringify({ launcherPosition: message.launcherPosition }) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      sendResponse({
        ok: response.ok,
        status: response.status,
        launcherPosition: data.launcherPosition || null,
        updatedAt: data.updatedAt || null,
        message: data.message || data.error || "",
      });
    } catch (error) {
      logConnection("Präferenz-Aufruf fehlgeschlagen", { message: error.message });
      sendResponse({ ok: false, status: 0, launcherPosition: null, message: error.message });
    }
  });
  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "VERIFY_JARVIS_IDENTITY") return false;

  const senderUrl = sender.tab?.url || sender.url || "";
  if (!senderUrl.startsWith("https://jarvis-emea.equinix.com/")) {
    sendResponse({ ok: false, message: "Identität kann nur direkt aus Jarvis verifiziert werden." });
    return false;
  }

  loadSettings().then(async (settings) => {
    try {
      logConnection("Jarvis-Identität", { url: `${normalizeBaseUrl(settings.plannerUrl)}/api/standalone-identity/verify` });
      const response = await fetch(`${normalizeBaseUrl(settings.plannerUrl)}/api/standalone-identity/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-shiftplanner-key": settings.apiKey || "" },
        body: JSON.stringify({
          email: message.identity?.email,
          displayName: message.identity?.displayName,
          jarvisUserName: message.identity?.jarvisUserName,
        }),
      });
      const data = await response.json().catch(() => ({}));
      sendResponse({
        ok: response.ok,
        token: data.token || null,
        user: data.user || null,
        message: data.message || (response.ok ? "Jarvis-Benutzer verifiziert" : "Verifizierung fehlgeschlagen"),
      });
    } catch (error) {
      logConnection("Identitäts-Aufruf fehlgeschlagen", { message: error.message });
      sendResponse({ ok: false, message: `Schichtplaner nicht erreichbar: ${error.message}` });
    }
  });

  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "GET_JARVIS_NOTIFICATIONS" && message?.type !== "DISMISS_JARVIS_NOTIFICATION") return false;

  loadSettings().then(async (settings) => {
    try {
      const isDismiss = message.type === "DISMISS_JARVIS_NOTIFICATION";
      const response = await fetch(
        `${normalizeBaseUrl(settings.plannerUrl)}/api/jarvis-notifications${isDismiss ? `/${encodeURIComponent(message.id)}/dismiss` : `/active?_=${Date.now()}`}`,
        {
          method: isDismiss ? "POST" : "GET",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "x-shiftplanner-key": settings.apiKey || "",
            "x-shiftplanner-identity": message.identityToken || "",
          },
        },
      );
      logConnection("Notifications", { status: response.status, ok: response.ok });
      const data = await response.json().catch(() => ({}));
      let notifications = Array.isArray(data.notifications) ? data.notifications : [];
      if (isDismiss) {
        for (const key of notificationClaims.keys()) {
          if (key.startsWith(`${Number(message.id)}:`)) notificationClaims.delete(key);
        }
      } else if (response.ok && sender.tab?.id != null) {
        const now = Date.now();
        for (const [key, claim] of notificationClaims.entries()) {
          if (now - claim.claimedAt > NOTIFICATION_CLAIM_TTL_MS) notificationClaims.delete(key);
        }
        notifications = notifications.filter((item) => {
          const key = `${Number(item.id)}:${String(item.occurrence_key || "current")}`;
          const claim = notificationClaims.get(key);
          if (claim && claim.tabId !== sender.tab.id) return false;
          notificationClaims.set(key, { tabId: sender.tab.id, claimedAt: now });
          return true;
        });
      }
      sendResponse({
        ok: response.ok,
        status: response.status,
        notifications,
        enabled: data.enabled !== false,
        pollAfterMs: data.pollAfterMs,
        serverTime: data.serverTime,
        dismissed: data.dismissed,
        occurrenceKey: data.occurrenceKey,
        message: data.message || data.error || (response.ok ? "" : `Notifications konnten nicht geladen werden (${response.status}).`),
      });
    } catch (error) {
      logConnection("Notifications-Aufruf fehlgeschlagen", { message: error.message });
      sendResponse({ ok: false, message: error.message });
    }
  });
  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_JARVIS_STAFFING") return false;

  loadSettings().then(async (settings) => {
    try {
      const response = await fetch(`${normalizeBaseUrl(settings.plannerUrl)}/api/jarvis-notifications/staffing`, {
        headers: {
          "Content-Type": "application/json",
          "x-shiftplanner-key": settings.apiKey || "",
          "x-shiftplanner-identity": message.identityToken || "",
        },
      });
      logConnection("Staffing", { status: response.status, ok: response.ok });
      const data = await response.json().catch(() => ({}));
      sendResponse({ ok: response.ok, staffing: data, message: data.message || data.error || "" });
    } catch (error) {
      logConnection("Staffing-Aufruf fehlgeschlagen", { message: error.message });
      sendResponse({ ok: false, message: error.message });
    }
  });
  return true;
});

/* ------------------------------------------------ */
/* SETTINGS: policy > this PC > Chrome sync         */
/* ------------------------------------------------ */

/**
 * The settings used to live only in chrome.storage.sync. Without a signed-in Chrome profile that is
 * just local storage of this one PC, so every employee had to type the key by hand and a rotated
 * key broke the PCs one by one. Now an IT policy (chrome.storage.managed, see managed_schema.json)
 * wins, then the values saved on this PC, then Chrome sync, then the defaults.
 */
async function loadSettings() {
  const [managed, local, sync] = await Promise.all([
    chrome.storage.managed.get(null).catch(() => ({})),
    chrome.storage.local.get({ odinGoSettings: null }).catch(() => ({ odinGoSettings: null })),
    chrome.storage.sync.get(DEFAULTS).catch(() => ({ ...DEFAULTS })),
  ]);
  const saved = local.odinGoSettings && typeof local.odinGoSettings === "object" ? local.odinGoSettings : {};
  const pick = (key) => String(managed?.[key] || saved[key] || sync?.[key] || DEFAULTS[key] || "").trim();
  return {
    plannerUrl: pick("plannerUrl") || DEFAULTS.plannerUrl,
    apiKey: pick("apiKey"),
    managed: Boolean(managed?.apiKey || managed?.plannerUrl),
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_SETTINGS") return false;
  loadSettings()
    .then((settings) => sendResponse({ ok: true, settings }))
    .catch((error) => sendResponse({ ok: false, message: error.message }));
  return true;
});

/* ------------------------------------------------ */
/* JARVIS SESSION (Mendix client)                   */
/* ------------------------------------------------ */

/**
 * Jarvis is a Mendix app. Its client object `mx` knows the signed-in user even when the profile
 * menu was never opened (the DOM probe then finds nothing). The code runs in the page's own
 * JavaScript world, which is not subject to the page's content security policy.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "READ_JARVIS_SESSION") return false;
  const tabId = sender.tab?.id;
  const senderUrl = sender.tab?.url || sender.url || "";
  if (!tabId || !senderUrl.startsWith("https://jarvis-emea.equinix.com/")) {
    sendResponse({ ok: false, message: "Nur aus Jarvis möglich." });
    return false;
  }
  chrome.scripting.executeScript({
    target: { tabId },
    world: "MAIN",
    func: () => {
      const result = { userName: "", email: "", displayName: "" };
      try {
        const session = window.mx && window.mx.session;
        if (!session) return result;
        const user = (session.sessionData && session.sessionData.user) || {};
        const candidates = [
          typeof session.getUserName === "function" ? session.getUserName() : "",
          user.name, user.userName, user.username, user.login,
        ].map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean);
        result.userName = candidates[0] || "";
        result.email = candidates.find((value) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) || "";
        const full = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.fullName || user.displayName || "";
        result.displayName = typeof full === "string" ? full.trim() : "";
      } catch {
        // Not a Mendix page state we know: report nothing.
      }
      return result;
    },
  }).then((results) => {
    const value = results?.[0]?.result || {};
    sendResponse({ ok: Boolean(value.userName || value.email), session: value });
  }).catch((error) => sendResponse({ ok: false, message: error.message }));
  return true;
});
