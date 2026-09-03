const DEFAULTS = { plannerUrl: "", apiKey: "" };
const plannerUrl = document.getElementById("plannerUrl");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");
const testButton = document.getElementById("test");

function normalizedUrl() { return plannerUrl.value.trim().replace(/\/+$/, ""); }
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
  if (!/^https?:\/\/[^\s]+$/i.test(next.plannerUrl)) {
    showStatus("Bitte eine vollständige HTTP(S)-Adresse eingeben.", false);
    return;
  }
  await chrome.storage.sync.set(next);
  showStatus("Gespeichert");
  window.setTimeout(() => { status.textContent = ""; }, 2500);
});

testButton.addEventListener("click", async () => {
  const url = normalizedUrl();
  if (!/^https?:\/\/[^\s]+$/i.test(url)) {
    showStatus("Bitte zuerst eine vollständige HTTP(S)-Adresse eingeben.", false);
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
