const DEFAULTS = { plannerUrl: "http://127.0.0.1:5173", apiKey: "" };
const plannerUrl = document.getElementById("plannerUrl");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");

chrome.storage.sync.get(DEFAULTS).then((settings) => {
  plannerUrl.value = settings.plannerUrl;
  apiKey.value = settings.apiKey;
});

document.getElementById("save").addEventListener("click", async () => {
  const next = {
    plannerUrl: plannerUrl.value.trim().replace(/\/+$/, ""),
    apiKey: apiKey.value.trim(),
  };
  await chrome.storage.sync.set(next);
  status.textContent = "Gespeichert";
  window.setTimeout(() => { status.textContent = ""; }, 2000);
});
