const DEFAULTS = {
  plannerUrl: "http://127.0.0.1:5173",
  apiKey: "",
};
const ADMIN_SESSION_KEY = "odinGoAdminSession";
const NOTIFICATION_CLAIM_TTL_MS = 90_000;
const notificationClaims = new Map();

function normalizeBaseUrl(value) {
  return String(value || DEFAULTS.plannerUrl).trim().replace(/\/+$/, "");
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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
    });
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
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type !== "UNLOCK_ADMIN") return false;

  chrome.storage.sync.get(DEFAULTS).then(async (settings) => {
    try {
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
      sendResponse({ ok: false, message: `Schichtplaner nicht erreichbar: ${error.message}` });
    }
  });

  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "GET_ODIN_GO_PREFERENCES" && message?.type !== "SAVE_ODIN_GO_PREFERENCES") return false;

  chrome.storage.sync.get(DEFAULTS).then(async (settings) => {
    try {
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

  chrome.storage.sync.get(DEFAULTS).then(async (settings) => {
    try {
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
      sendResponse({ ok: false, message: `Schichtplaner nicht erreichbar: ${error.message}` });
    }
  });

  return true;
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "GET_JARVIS_NOTIFICATIONS" && message?.type !== "DISMISS_JARVIS_NOTIFICATION") return false;

  chrome.storage.sync.get(DEFAULTS).then(async (settings) => {
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
      sendResponse({ ok: false, message: error.message });
    }
  });
  return true;
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_JARVIS_STAFFING") return false;

  chrome.storage.sync.get(DEFAULTS).then(async (settings) => {
    try {
      const response = await fetch(`${normalizeBaseUrl(settings.plannerUrl)}/api/jarvis-notifications/staffing`, {
        headers: {
          "Content-Type": "application/json",
          "x-shiftplanner-key": settings.apiKey || "",
          "x-shiftplanner-identity": message.identityToken || "",
        },
      });
      const data = await response.json().catch(() => ({}));
      sendResponse({ ok: response.ok, staffing: data, message: data.message || data.error || "" });
    } catch (error) {
      sendResponse({ ok: false, message: error.message });
    }
  });
  return true;
});
