const DEFAULT_PLANNER_URL = "https://eqx-portal.corp.equinix.com";
const DEFAULTS = { plannerUrl: DEFAULT_PLANNER_URL, apiKey: "" };
const plannerUrl = document.getElementById("plannerUrl");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");
const testButton = document.getElementById("test");

function normalizedUrl() { return plannerUrl.value.trim().replace(/\/+$/, ""); }
function validatePlannerUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return "ODIN GO muss innerhalb von Jarvis über HTTPS erreichbar sein. Die konfigurierte Planner-URL verwendet HTTP.";
    }
    if (url.username || url.password || url.search || url.hash) {
      return "Bitte nur die HTTPS-Basisadresse ohne Zugangsdaten, Query-Parameter oder Fragment eingeben.";
    }
    return "";
  } catch {
    return "Bitte eine vollständige HTTPS-Adresse eingeben.";
  }
}
function showStatus(message, ok = true) {
  status.textContent = message;
  status.style.color = ok ? "#7ce6ad" : "#ff9b9b";
}

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  plannerUrl.value = settings.plannerUrl;
  apiKey.value = settings.apiKey;
});

document.getElementById("save").addEventListener("click", async () => {
  const next = {
    plannerUrl: normalizedUrl(),
    apiKey: apiKey.value.trim(),
  };
  const validationError = validatePlannerUrl(next.plannerUrl);
  if (validationError) {
    showStatus(validationError, false);
    return;
  }
  await chrome.storage.sync.set(next);
  showStatus("Gespeichert");
  window.setTimeout(() => { status.textContent = ""; }, 2500);
});

testButton.addEventListener("click", async () => {
  const url = normalizedUrl();
  const validationError = validatePlannerUrl(url);
  if (validationError) {
    showStatus(validationError, false);
    return;
  }
  testButton.disabled = true;
  showStatus("Verbindung wird geprüft ...");
  try {
    const response = await chrome.runtime.sendMessage({ type: "TEST_CONNECTION", plannerUrl: url, apiKey: apiKey.value.trim() });
    showStatus(response?.ok ? `Verbunden (HTTP ${response.status})` : (response?.message || `Fehler (HTTP ${response?.status || 0})`), Boolean(response?.ok));
  } catch (error) {
    showStatus(`Fehler: ${error.message}`, false);
  } finally { testButton.disabled = false; }
});
