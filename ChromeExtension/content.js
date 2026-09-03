(() => {
  if (document.getElementById("shiftplanner-jarvis-host")) return;

  const DEFAULTS = { plannerUrl: "", apiKey: "", employeeName: "" };
  const log = (...args) => console.info("[ODIN GO]", ...args);
  log("Content-Script gestartet", { page: location.href });
  const host = document.createElement("div");
  host.id = "shiftplanner-jarvis-host";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      button, input { font: inherit; }
      .launcher { position: fixed; z-index: 2147483646; top: 8px; left: 108px; display: none; width: 38px; height: 38px; padding: 0; overflow: hidden; touch-action:none; user-select:none; border: 1px solid #4ecbff; border-radius: 50%; background: radial-gradient(circle at 35% 28%,#1d5f8c 0%,#0e2941 42%,#07131f 100%); color:#dff7ff; font:800 11px/1 "Segoe UI",Arial,sans-serif; letter-spacing:.08em; cursor:grab; box-shadow:0 0 0 1px rgba(74,203,255,.22),0 0 14px rgba(0,183,255,.42),inset 0 1px 0 rgba(255,255,255,.35); transition:transform .18s ease,box-shadow .18s ease,filter .18s ease; }
      .launcher.context-open { display: none !important; visibility: hidden; pointer-events: none; }
      .launcher:hover { transform:scale(1.08); filter:brightness(1.18); border-color:#9be8ff; box-shadow:0 0 0 2px rgba(74,203,255,.22),0 0 24px rgba(0,183,255,.68),inset 0 1px 0 rgba(255,255,255,.5); }
      .launcher.dragging { cursor:grabbing; transform:scale(1.06); box-shadow:0 8px 24px rgba(15,23,42,.45),0 0 22px rgba(0,183,255,.65); }
      .launcher img { display:none; }
      .odin-brand { flex:0 0 auto; display:flex; align-items:center; justify-content:center; height:112px; overflow:hidden; border-bottom:1px solid #334155; background:#0b1220; }
      .odin-brand img { display:block; width:auto; height:104px; max-width:88%; object-fit:contain; filter:none; opacity:1; }
      .odin-title { font-family:"Segoe UI",Arial,sans-serif; font-weight:700; letter-spacing:.04em; text-shadow:none; }
      .app-menu { position: fixed; z-index: 2147483647; display: none; width: 260px; padding: 10px; border: 1px solid rgba(103,232,249,.3); border-radius: 18px; background: radial-gradient(circle at 12% 0%,rgba(34,211,238,.17),transparent 35%),rgba(5,15,29,.97); color: #e8f5ff; box-shadow: 0 22px 60px rgba(0,0,0,.58),inset 0 1px rgba(255,255,255,.09); backdrop-filter: blur(24px) saturate(145%); font-family: Inter,Segoe UI,Arial,sans-serif; }
      .app-menu.open { display: none; }
      .app-choice { display: grid; grid-template-columns: 38px 1fr; gap: 10px; align-items: center; width: 100%; padding: 11px; border: 1px solid rgba(255,255,255,.08); border-radius: 13px; background: rgba(255,255,255,.04); color: white; text-align: left; cursor: pointer; transition: .16s ease; }
      .app-choice:hover { transform: translateY(-1px); border-color: rgba(103,232,249,.35); background: rgba(34,211,238,.10); }
      .app-symbol { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 11px; background: linear-gradient(135deg,rgba(6,182,212,.26),rgba(99,102,241,.24)); color: #a5f3fc; font-size: 17px; font-weight: 900; }
      .app-choice strong { display: block; font-size: 13px; }
      .app-choice small { display: block; margin-top: 3px; color: #87a7ba; font-size: 10px; line-height: 1.3; }
      .backdrop { position: fixed; z-index: 2147483647; inset: 0; display: none; background: rgba(15,23,42,.48); }
      .backdrop.open { display: block; }
      .panel { position: absolute; top: 0; right: 0; width: min(1180px,100vw); max-width: 100vw; height: 100%; max-height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background:#0f172a; border-left:1px solid #334155; box-shadow:-16px 0 40px rgba(15,23,42,.3); color:#e2e8f0; font-family:"Segoe UI",Arial,sans-serif; transition:width .18s ease; }
      .panel.expanded { width: 100vw; max-width: 100vw; }
      @media (max-width: 700px) { .panel { width: 100vw; border-left: 0; } .head { padding: 0 10px; } .staffing, .employee { display:none; } }
      .panel.remote-shell > .head, .panel.remote-shell > .odin-brand, .panel.remote-shell > .notice, .panel.remote-shell > .tabs, .panel.remote-shell .admin-login { display:none !important; }
      .head { height:58px; flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:0 16px; background:#172033; border-bottom:1px solid #334155; }
      .title { font-size: 16px; font-weight: 850; margin-right: auto; letter-spacing: -.02em; }
      .employee { color:#cbd5e1; font-size:12px; }
      .staffing { display:flex; align-items:center; gap:5px; }
      .staffing span { border:1px solid #475569; border-radius:5px; background:#111827; padding:5px 7px; color:#cbd5e1; font-size:10px; font-weight:700; white-space:nowrap; }
      .staffing .early { border-left:3px solid #f97316; }
      .staffing .late { border-left:3px solid #eab308; }
      .staffing .night { border-left:3px solid #3b82f6; }
      .icon { border:1px solid #475569; border-radius:6px; background:#1e293b; color:#e2e8f0; cursor:pointer; padding:8px 10px; box-shadow:none; transition:background .15s ease; }
      .icon:hover { background:#334155; border-color:#64748b; }
      .tabs { display:flex; gap:4px; padding:8px 12px; overflow-x:auto; background:#111827; border-bottom:1px solid #334155; scrollbar-width:thin; }
      .tab { white-space:nowrap; border:1px solid transparent; border-radius:5px; background:transparent; color:#cbd5e1; padding:8px 11px; cursor:pointer; font-size:12px; font-weight:600; box-shadow:none; transition:background .15s ease; }
      .tab:hover { background:#1e293b; color:#fff; }
      .tab.active { background:#0f4c81; border-color:#2563a5; color:#fff; box-shadow:none; }
      .body { position: relative; flex: 1; min-height: 0; }
      iframe { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; border: 0; background: #07101c; }
      .offline-fallback { position:absolute; z-index:4; inset:0; display:none; align-items:center; justify-content:center; overflow:auto; padding:24px; background:#07101c; }
      .offline-fallback.open { display:flex; }
      .offline-fallback img { display:block; width:min(100%,1100px); max-height:100%; object-fit:contain; border-radius:14px; box-shadow:0 20px 60px rgba(0,0,0,.55); }
      .admin-login { position: absolute; z-index: 20; inset: 0; display: none; place-items: center; padding: 24px; pointer-events: auto; background: radial-gradient(circle at 50% 15%,#123450,#07101c 55%); }
      .admin-login.open { display: grid; }
      .card { position: relative; z-index: 21; width: min(420px,100%); padding: 28px; pointer-events: auto; border: 1px solid rgba(74,201,255,.3); border-radius: 16px; background: rgba(8,25,40,.98); box-shadow: 0 20px 60px rgba(0,0,0,.5); }
      .card h2 { margin: 0 0 8px; font-size: 20px; }
      .card p { margin: 0 0 18px; color: #9ab5c8; font-size: 13px; line-height: 1.5; }
      .card input { position: relative; z-index: 22; width: 100%; padding: 11px 12px; pointer-events: auto; border: 1px solid #315269; border-radius: 8px; background: #06111c; color: white; outline: none; caret-color: #54d8ff; }
      .card input:focus { border-color: #00c8ff; box-shadow: 0 0 0 3px rgba(0,200,255,.16); }
      .unlock { width: 100%; margin-top: 12px; padding: 11px; border: 0; border-radius: 8px; background: #008dca; color: white; font-weight: 800; cursor: pointer; }
      .error { min-height: 18px; margin-top: 10px; color: #ff8585; font-size: 12px; }
      .notice { display: none; padding: 9px 14px; background: #49340b; color: #ffe3a0; font: 12px/1.4 Segoe UI,Arial,sans-serif; }
      .notice.open { display: block; }
      .jarvis-notification { position: fixed; z-index: 2147483647; left: 50%; top: 50%; display: none; width: min(470px,calc(100vw - 32px)); transform: translate(-50%,-50%); border: 1px solid rgba(103,232,249,.36); border-radius: 20px; background: radial-gradient(circle at top left,rgba(34,211,238,.18),transparent 42%),#071323; color: #ecfeff; box-shadow: 0 26px 80px rgba(0,0,0,.72); font-family: Inter,Segoe UI,Arial,sans-serif; }
      .jarvis-notification.open { display: block; }
      .jarvis-notification.instruction { border-color:rgba(239,68,68,.78); background:linear-gradient(180deg,rgba(69,10,10,.98),rgba(24,7,12,.99)); box-shadow:0 0 34px rgba(239,68,68,.28),0 26px 80px rgba(0,0,0,.72); }
      .jarvis-notification.instruction header { color:#fecaca; }
      .jarvis-notification header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:18px 20px 12px; font-weight:800; font-size:17px; }
      .jarvis-notification p { margin:0; padding:0 20px 12px; white-space:pre-wrap; color:#cbd5e1; font-size:13px; line-height:1.55; }
      .jarvis-notification footer { padding:0 20px 18px; color:#64748b; font-size:10px; }
      .jarvis-notification button { border:0; background:transparent; color:#bae6fd; cursor:pointer; font-size:20px; }
    </style>
    <button class="launcher" type="button" aria-label="ODIN GO öffnen oder verschieben" title="Klicken zum Öffnen, gedrückt halten zum Verschieben">GO<img alt="ODIN GO" /></button>
    <div class="app-menu" role="menu" aria-label="Anwendung auswählen">
      <button class="app-choice" type="button" data-app="planner"><span class="app-symbol">S</span><span><strong>Schichtplaner</strong><small>Dienstplan, Drafts und Wellbeing</small></span></button>
      <button class="app-choice" type="button" data-app="coc"><span class="app-symbol">C</span><span><strong>CoC</strong><small>Chain of Command für Ideen und Probleme</small></span></button>
      <button class="app-choice" type="button" data-app="notices"><span class="app-symbol">N</span><span><strong>Notifications</strong><small>Aktuelle Informationen und Anweisungen</small></span></button>
    </div>
    <div class="backdrop">
      <section class="panel remote-shell" role="dialog" aria-label="ODIN GO">
        <div class="head">
          <div class="title odin-title">ODIN GO</div>
          <div class="staffing" aria-label="Aktuelle Personalstärke"><span class="early">Früh –</span><span class="late">Spät –</span><span class="night">Nacht –</span></div>
          <div class="employee"></div>
          <button class="icon options" title="VM und Mitarbeiter konfigurieren">Settings</button>
          <button class="icon expand" title="Fenster vergroessern" aria-label="Fenster vergroessern">
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <button class="icon close" title="Schliessen">X</button>
        </div>
        <div class="odin-brand"><img alt="ODIN GO" /></div>
        <div class="notice"></div>
        <nav class="tabs"></nav>
        <div class="body">
          <iframe title="Schichtplaner Inhalt"></iframe>
          <div class="offline-fallback" aria-live="polite"><img alt="ODIN GO ist vorübergehend nicht erreichbar" /></div>
          <div class="admin-login">
            <form class="card">
              <h2>Settings Admin</h2>
              <p>Excel-Upload, Generator, Planungsgrenzen und User Management sind geschützt.</p>
              <input type="password" name="password" placeholder="Admin-Passwort" autocomplete="current-password" required />
              <button class="unlock" type="submit">Adminbereich öffnen</button>
              <div class="error"></div>
            </form>
          </div>
        </div>
      </section>
    </div>`;

  const notificationPopup = document.createElement("section");
  notificationPopup.className = "jarvis-notification";
  notificationPopup.innerHTML = '<header><span></span><button type="button" aria-label="Notification schließen">×</button></header><p></p><footer></footer>';
  root.appendChild(notificationPopup);

  const launcher = root.querySelector(".launcher");
  launcher.querySelector("img").src = chrome.runtime.getURL("icons/odin-go.png");
  root.querySelector(".odin-brand img").src = chrome.runtime.getURL("icons/odin-go-hero.png");
  const appMenu = root.querySelector(".app-menu");
  const backdrop = root.querySelector(".backdrop");
  const closeButton = root.querySelector(".close");
  const expandButton = root.querySelector(".expand");
  const panel = root.querySelector(".panel");
  const optionsButton = root.querySelector(".options");
  const tabsNode = root.querySelector(".tabs");
  const iframe = root.querySelector("iframe");
  const offlineFallback = root.querySelector(".offline-fallback");
  offlineFallback.querySelector("img").src = chrome.runtime.getURL("icons/odin-unavailable.png");
  let iframeLoadTimeout = 0;
  const employeeNode = root.querySelector(".employee");
  const staffingNode = root.querySelector(".staffing");
  const notice = root.querySelector(".notice");
  const adminLogin = root.querySelector(".admin-login");
  const adminForm = root.querySelector(".admin-login form");
  const adminPasswordInput = root.querySelector('.admin-login input[name="password"]');
  const adminError = root.querySelector(".error");
  const titleNode = root.querySelector(".title");
  const notificationTitle = notificationPopup.querySelector("header span");
  const notificationBody = notificationPopup.querySelector("p");
  const notificationClose = notificationPopup.querySelector("button");
  const notificationMeta = notificationPopup.querySelector("footer");
  let settings = DEFAULTS;
  let adminToken = "";
  let identityToken = "";
  let verifiedUser = null;
  let identityVerificationPending = false;
  let lastRejectedEmail = "";
  let lastRejectedAt = 0;
  let jarvisSessionIdentity = null;
  let profileProbeAttempted = false;
  let profileButtonUsedForProbe = null;
  const sessionIdentityChannel = `shiftplanner-session-${crypto.randomUUID()}`;
  let launcherPosition = null;
  let launcherPositionLoadedForUser = "";
  let launcherDrag = null;
  let suppressLauncherClick = false;
  let remoteWorkspacePath = "/odin-go/shiftplan";
  let activeTab = "shiftplan";
  let activeApp = "planner";
  let iframeReady = false;
  let iframeAppReady = false;
  let iframeSessionSignature = "";
  let pendingNotifications = [];
  let activeNotificationId = null;
  let activeNotificationKey = null;
  let activeNotification = null;
  let notificationLoadPending = false;
  const queuedNotificationIds = new Set();
  const sessionSnoozedNotifications = new Set();
  const receivedNotificationKeys = new Set();
  let receivedNotificationStorageKey = "";

  async function loadReceivedNotificationKeys() {
    const userKey = String(verifiedUser?.id || verifiedUser?.email || "device").toLowerCase();
    receivedNotificationStorageKey = `odinGoReceivedNotifications:${userKey}`;
    const stored = await chrome.storage.local.get(receivedNotificationStorageKey);
    receivedNotificationKeys.clear();
    const keys = stored?.[receivedNotificationStorageKey];
    if (Array.isArray(keys)) keys.filter((key) => typeof key === "string").forEach((key) => receivedNotificationKeys.add(key));
  }

  function markNotificationReceived(item) {
    if (item?.preview) return;
    const key = getNotificationKey(item);
    if (!key || receivedNotificationKeys.has(key)) return;
    receivedNotificationKeys.add(key);
    if (receivedNotificationStorageKey) {
      void chrome.storage.local.set({
        [receivedNotificationStorageKey]: [...receivedNotificationKeys].slice(-500),
      });
    }
  }

  function setWorkspaceOpen(open) {
    backdrop.classList.toggle("open", open);
    launcher.classList.toggle("context-open", open);
    launcher.style.setProperty("display", open ? "none" : "", "important");
    launcher.setAttribute("aria-expanded", String(open));
    if (open) appMenu.style.display = "none";
    else window.requestAnimationFrame(() => positionLauncher());
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  function findBrandAnchor() {
    const selectors = [
      'img[alt*="equinix" i]', 'img[src*="equinix" i]',
      'img[alt*="jarvis" i]', 'img[src*="jarvis" i]',
      '[aria-label*="equinix" i]', '[title*="equinix" i]',
      '[aria-label*="jarvis" i]', '[title*="jarvis" i]',
      '[class*="brand" i]', '[class*="logo" i]'
    ];
    const anchors = [...document.querySelectorAll(selectors.join(','))]
      .map((element) => element.closest('a,button,[role="button"]') || element)
      .filter((element, index, rows) => rows.indexOf(element) === index)
      .filter((element) => {
        if (!isVisible(element)) return false;
        const rect = element.getBoundingClientRect();
        return rect.top < 70 && rect.left < Math.min(420, window.innerWidth * 0.3) && rect.width < 260 && rect.height < 70;
      });
    return anchors.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      const leftLabel = `${left.getAttribute('aria-label') || ''} ${left.getAttribute('alt') || ''} ${left.getAttribute('src') || ''} ${left.textContent || ''}`;
      const rightLabel = `${right.getAttribute('aria-label') || ''} ${right.getAttribute('alt') || ''} ${right.getAttribute('src') || ''} ${right.textContent || ''}`;
      const leftScore = (/equinix|jarvis/i.test(leftLabel) ? 1000 : 0) - leftRect.left;
      const rightScore = (/equinix|jarvis/i.test(rightLabel) ? 1000 : 0) - rightRect.left;
      return rightScore - leftScore;
    })[0] || null;
  }

  function overlaps(left, top, width, height, brandAnchor) {
    const right = left + width;
    const bottom = top + height;
    const occupied = [...document.querySelectorAll('button,a,input,select,textarea,[role="button"],[tabindex],img,svg')]
      .filter((element) => element !== host && !host.contains(element))
      .filter((element) => !brandAnchor || (element !== brandAnchor && !brandAnchor.contains(element) && !element.contains(brandAnchor)))
      .filter(isVisible)
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.top < 75 && rect.bottom > 0 && rect.width < 360 && rect.height < 90);
    return occupied.some((rect) => left < rect.right + 6 && right > rect.left - 6 && top < rect.bottom + 4 && bottom > rect.top - 4);
  }

  function normalizeLauncherPosition(value) {
    const xRatio = Number(value?.xRatio);
    const yRatio = Number(value?.yRatio);
    if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) return null;
    return {
      xRatio: Math.min(1, Math.max(0, xRatio)),
      yRatio: Math.min(1, Math.max(0, yRatio)),
    };
  }

  function getLauncherBounds() {
    const rect = launcher.getBoundingClientRect();
    const width = rect.width || 32;
    const height = rect.height || 32;
    return {
      width,
      height,
      maxLeft: Math.max(0, window.innerWidth - width),
      maxTop: Math.max(0, window.innerHeight - height),
    };
  }

  function applyLauncherPosition(value) {
    const position = normalizeLauncherPosition(value);
    if (!position) return false;
    const bounds = getLauncherBounds();
    const left = Math.round(position.xRatio * bounds.maxLeft);
    const top = Math.round(position.yRatio * bounds.maxTop);
    launcherPosition = position;
    launcher.style.left = `${left}px`;
    launcher.style.top = `${top}px`;
    launcher.style.right = "auto";
    launcher.style.display = "block";
    appMenu.style.left = `${left}px`;
    appMenu.style.top = `${Math.min(bounds.maxTop, top + bounds.height + 7)}px`;
    return true;
  }

  function launcherPositionFromPixels(left, top) {
    const bounds = getLauncherBounds();
    const clampedLeft = Math.min(bounds.maxLeft, Math.max(0, left));
    const clampedTop = Math.min(bounds.maxTop, Math.max(0, top));
    return {
      xRatio: bounds.maxLeft ? clampedLeft / bounds.maxLeft : 0,
      yRatio: bounds.maxTop ? clampedTop / bounds.maxTop : 0,
    };
  }

  function launcherStorageKey() {
    const identity = String(verifiedUser?.id || verifiedUser?.email || "device").toLowerCase();
    return `odinGoLauncherPosition:${identity}`;
  }

  async function persistLauncherPosition(position) {
    const normalized = normalizeLauncherPosition(position);
    if (!normalized) return;
    launcherPosition = normalized;
    await chrome.storage.local.set({
      [launcherStorageKey()]: normalized,
      "odinGoLauncherPosition:device": normalized,
    });
    if (!identityToken) return;
    const response = await chrome.runtime.sendMessage({
      type: "SAVE_ODIN_GO_PREFERENCES",
      identityToken,
      launcherPosition: normalized,
    }).catch(() => null);
    if (!response?.ok) console.warn("ODIN GO: Button-Position konnte nicht mit der VM synchronisiert werden.", response?.message || "");
  }

  async function loadLauncherPosition() {
    if (!verifiedUser || !identityToken) return;
    const userKey = launcherStorageKey();
    if (launcherPositionLoadedForUser === userKey) return;
    launcherPositionLoadedForUser = userKey;
    const local = await chrome.storage.local.get([userKey, "odinGoLauncherPosition:device"]);
    const localPosition = normalizeLauncherPosition(local[userKey]) || normalizeLauncherPosition(local["odinGoLauncherPosition:device"]);
    const response = await chrome.runtime.sendMessage({ type: "GET_ODIN_GO_PREFERENCES", identityToken }).catch(() => null);
    const serverPosition = response?.ok ? normalizeLauncherPosition(response.launcherPosition) : null;
    const selected = serverPosition || localPosition;
    if (selected) applyLauncherPosition(selected);
    if (response?.ok && !serverPosition && localPosition) void persistLauncherPosition(localPosition);
  }

  function positionLauncher() {
    if (launcherPosition) {
      applyLauncherPosition(launcherPosition);
      return;
    }
    const brandAnchor = findBrandAnchor();
    const brandRect = brandAnchor?.getBoundingClientRect();
    const launcherWidth = launcher.getBoundingClientRect().width || 32;
    const launcherHeight = launcher.getBoundingClientRect().height || 32;
    const preferredTop = brandRect
      ? Math.max(4, brandRect.top + (brandRect.height - launcherHeight) / 2)
      : 7;
    const preferredLeft = brandRect ? brandRect.right + 10 : 108;
    const maximumLeft = Math.min(window.innerWidth * 0.48, 760) - launcherWidth;

    const candidates = [preferredLeft];
    for (let left = Math.max(90, preferredLeft); left <= maximumLeft; left += 8) candidates.push(left);

    const freeLeft = candidates.find((left) => !overlaps(left, preferredTop, launcherWidth, launcherHeight, brandAnchor));
    if (freeLeft == null) {
      launcher.style.display = 'none';
      return;
    }

    launcher.style.top = `${Math.round(preferredTop)}px`;
    launcher.style.left = `${Math.round(freeLeft)}px`;
    launcher.style.right = 'auto';
    launcher.style.display = 'block';
    appMenu.style.top = `${Math.round(preferredTop + launcherHeight + 7)}px`;
    appMenu.style.left = `${Math.round(freeLeft)}px`;
  }

  const baseTabs = [
    ["shiftplan", "Dienstplan", "/shiftplan"],
    ["drafts", "Drafts", "/drafts"],
    ["week", "Wochenplan", "/shiftplan/week"],
    ["day", "Tagesplan", "/tagesplanung"],
    ["wellbeing", "Wellbeing", "/wellbeing"],
    ["preferences", "Settings", "/preferences"],
    ["admin", "Settings Admin", "/admin-settings"],
    ["coc", "CoC", "/coc"],
    ["projects", "Projekte", "/projects"],
    ["notices", "Notifications", "/jarvis-notifications"],
  ];
  const adminTabs = [
    ["generator", "Generator", "/shiftplan-control"],
    ["users", "User Management", "/users"],
  ];
  const cocTabs = [["coc", "CoC Übersicht", "/coc"]];
  const noticeTabs = [["notices", "Notifications", "/jarvis-notifications"]];

  function normalizeBaseUrl() { return String(settings.plannerUrl || DEFAULTS.plannerUrl).replace(/\/+$/, ""); }
  function buildUrl(path) {
    const separator = path.includes("?") ? "&" : "?";
    const params = new URLSearchParams({ embed: "1", employee: verifiedUser?.displayName || "Mitarbeiter" });
    if (settings.apiKey) params.set("apiKey", settings.apiKey);
    if (identityToken) params.set("identityToken", identityToken);
    if (adminToken) params.set("adminToken", adminToken);
    return `${normalizeBaseUrl()}${path}${separator}${params}`;
  }

  function frameSessionSignature() {
    return JSON.stringify({
      plannerUrl: normalizeBaseUrl(),
      apiKey: settings.apiKey || "",
      identityToken,
      adminToken,
      employee: verifiedUser?.displayName || "Mitarbeiter",
    });
  }

  function renderTabs() {
    const rows = adminToken ? [...baseTabs, ...adminTabs] : baseTabs;
    tabsNode.replaceChildren(...rows.map(([id, label, path]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `tab${activeTab === id ? " active" : ""}`;
      button.textContent = label;
      button.addEventListener("click", () => selectTab(id, path));
      return button;
    }));
  }

  async function restoreAdminAccess() {
    const response = await chrome.runtime.sendMessage({ type: "GET_ADMIN_SESSION" }).catch(() => null);
    const restoredToken = String(response?.token || "");
    if (response?.ok && restoredToken) {
      adminToken = restoredToken;
      renderTabs();
      return true;
    }
    adminToken = "";
    renderTabs();
    return false;
  }

  function selectTab(id, path) {
    activeTab = id;
    if ((id === "admin" || id === "coc_admin") && !adminToken) {
      adminLogin.classList.add("open");
      iframe.style.display = "none";
      window.setTimeout(() => adminPasswordInput.focus(), 0);
    } else if (path) {
      adminLogin.classList.remove("open");
      iframe.style.display = "block";
      offlineFallback.classList.remove("open");
      iframeAppReady = false;
      window.clearTimeout(iframeLoadTimeout);
      iframeLoadTimeout = window.setTimeout(() => {
        if (!iframeAppReady) offlineFallback.classList.add("open");
      }, 5000);
      const targetUrl = new URL(buildUrl(path));
      const signature = frameSessionSignature();
      if (iframeReady && iframeAppReady && iframeSessionSignature === signature && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: "ODIN_GO_NAVIGATE",
          path: `${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`,
        }, targetUrl.origin);
      } else {
        iframeReady = false;
        iframeSessionSignature = signature;
      iframe.src = targetUrl.href;
      }
    }
    renderTabs();
  }

  iframe.addEventListener("load", () => {
    iframeReady = true;
  });
  iframe.addEventListener("error", () => offlineFallback.classList.add("open"));

  async function loadSettings() {
    settings = await chrome.storage.sync.get(DEFAULTS);
    log("Einstellungen geladen", { plannerUrl: settings.plannerUrl, hasApiKey: Boolean(settings.apiKey) });
    employeeNode.textContent = verifiedUser
      ? `${verifiedUser.displayName} · SSO verifiziert`
      : "Jarvis-SSO wird geprüft";
    const localPlanner = /^https?:\/\/(localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(settings.plannerUrl || "");
    const missingSettings = !settings.plannerUrl || (!settings.apiKey && !localPlanner);
    notice.textContent = !settings.plannerUrl
      ? "Bitte zuerst die VM-Adresse in den Erweiterungsoptionen eintragen."
      : !settings.apiKey && !localPlanner
      ? "Bitte den lokalen App-Schlüssel in den Erweiterungsoptionen hinterlegen."
      : "";
    notice.classList.toggle("open", missingSettings);
  }

  function textWithoutChildren(element) {
    return [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent || "")
      .join(" ")
      .trim();
  }

  function findJarvisProfileButton() {
    const viewportWidth = window.innerWidth;
    const topRightElements = new Set(document.querySelectorAll("button, [role='button'], a, [onclick], [aria-label], [title]"));
    for (let x = viewportWidth - 12; x > viewportWidth * 0.72; x -= 20) {
      for (let y = 10; y < 82; y += 18) {
        for (const element of document.elementsFromPoint(x, y)) topRightElements.add(element);
      }
    }
    const candidates = [...topRightElements]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const text = String(textWithoutChildren(element) || element.getAttribute("aria-label") || element.getAttribute("title") || "").trim();
        const looksLikeInitials = /^[A-Z]{1,3}$/.test(text);
        const looksLikeProfile = /profile|account|user|benutzer/i.test(`${text} ${element.getAttribute("aria-label") || ""} ${element.getAttribute("title") || ""}`);
        const target = element.closest("button, [role='button'], a, [onclick]") || element.parentElement || element;
        return { element: target, rect, looksLikeInitials, looksLikeProfile };
      })
      .filter(({ rect, looksLikeInitials, looksLikeProfile }) => (looksLikeInitials || looksLikeProfile) && rect.width >= 8 && rect.height >= 8 && rect.top >= 0 && rect.top < 90 && rect.right > viewportWidth * 0.72)
      .sort((left, right) => {
        const leftScore = (left.looksLikeProfile ? 10_000 : 0) + (left.looksLikeInitials ? 5_000 : 0) + left.rect.right;
        const rightScore = (right.looksLikeProfile ? 10_000 : 0) + (right.looksLikeInitials ? 5_000 : 0) + right.rect.right;
        return rightScore - leftScore;
      });
    return candidates[0]?.element || null;
  }

  async function restoreSavedJarvisIdentity() {
    const saved = await chrome.storage.local.get("odinGoJarvisIdentity");
    const identity = saved.odinGoJarvisIdentity;
    if (!identity || typeof identity !== "object" || !String(identity.email || identity.jarvisUserName || "").trim()) return;
    jarvisSessionIdentity = {
      email: String(identity.email || "").trim().toLowerCase(),
      displayName: String(identity.displayName || "").trim(),
      jarvisUserName: String(identity.jarvisUserName || identity.email || "").trim(),
    };
    void verifyJarvisIdentity({ showPrompt: false });
  }

  function performOneTimeProfileProbe() {
    if (profileProbeAttempted || jarvisSessionIdentity || identityToken) return;
    const profileButton = findJarvisProfileButton();
    if (!profileButton) return;
    profileProbeAttempted = true;
    profileButtonUsedForProbe = profileButton;
    profileButton.click();
    window.setTimeout(() => void verifyJarvisIdentity({ showPrompt: false }), 350);
  }

  function readJarvisIdentity() {
    if (jarvisSessionIdentity) return jarvisSessionIdentity;
    const emailPattern = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[a-z0-9-]+\.)*equinix\.com/i;
    const candidates = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    let inspected = 0;
    while ((node = walker.nextNode()) && inspected < 5000) {
      inspected += 1;
      const visibleText = String(node.textContent || "").trim();
      const email = visibleText.match(emailPattern)?.[0]?.toLowerCase();
      const element = node.parentElement;
      if (!email || !element || !isVisible(element)) continue;
      candidates.push({ element, email, rect: element.getBoundingClientRect() });
    }
    const matches = candidates
      .filter(({ rect }) => rect.top < 620 && rect.width >= 1 && rect.width < 900 && rect.height < 600)
      .sort((left, right) => (right.rect.left - left.rect.left) || (left.rect.width * left.rect.height) - (right.rect.width * right.rect.height));

    const match = matches[0];
    if (!match?.email) return null;

    let container = match.element.parentElement;
    while (container && container !== document.body) {
      const rect = container.getBoundingClientRect();
      if (rect.width >= 180 && rect.width <= 520 && rect.height >= 50 && rect.height <= 520) break;
      container = container.parentElement;
    }

    const lines = String(container?.innerText || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const emailIndex = lines.findIndex((line) => line.toLowerCase().includes(match.email));
    const possibleNames = lines.slice(Math.max(0, emailIndex - 3), emailIndex)
      .filter((line) => !/@/.test(line) && /^[\p{L}][\p{L} .'-]{2,80}$/u.test(line));
    return { email: match.email, displayName: possibleNames.at(-1) || "", jarvisUserName: "" };
  }

  async function verifyJarvisIdentity({ showPrompt = true } = {}) {
    if (identityVerificationPending) return false;
    const identity = readJarvisIdentity();
    if (!identity) {
      log("Kein Jarvis-Profil erkannt; Backend-Aufruf wird noch nicht gestartet.");
      verifiedUser = null;
      identityToken = "";
      employeeNode.textContent = "Jarvis-Profil nicht erkannt";
      if (showPrompt) {
        notice.textContent = "Bitte oben rechts einmal dein Jarvis-Profil öffnen. Danach wird deine SSO-Identität automatisch übernommen.";
        notice.classList.add("open");
      }
      return false;
    }

    if (identity.email === lastRejectedEmail && Date.now() - lastRejectedAt < 30_000 && !showPrompt) return false;

    identityVerificationPending = true;
    const response = await chrome.runtime.sendMessage({ type: "VERIFY_JARVIS_IDENTITY", identity })
      .finally(() => { identityVerificationPending = false; });
    log("Identitätsprüfung beendet", { ok: Boolean(response?.ok), message: response?.message || "" });
    if (!response?.ok) {
      verifiedUser = null;
      identityToken = "";
      lastRejectedEmail = identity.email;
      lastRejectedAt = Date.now();
      employeeNode.textContent = identity.email;
      notice.textContent = response?.message || "Jarvis-Benutzer konnte nicht verifiziert werden.";
      notice.classList.add("open");
      return false;
    }

    verifiedUser = response.user;
    identityToken = response.token;
    lastRejectedEmail = "";
    lastRejectedAt = 0;
    void chrome.storage.local.set({
      odinGoJarvisIdentity: {
        email: verifiedUser.email || identity.email || "",
        displayName: verifiedUser.displayName || identity.displayName || "",
        jarvisUserName: identity.jarvisUserName || identity.email || verifiedUser.email || "",
      },
    });
    // Close the menu again when ODIN GO opened it only for the first read.
    if (profileButtonUsedForProbe) {
      profileButtonUsedForProbe.click();
      profileButtonUsedForProbe = null;
    }
    employeeNode.textContent = `${verifiedUser.displayName} · SSO verifiziert`;
    notice.classList.remove("open");
    await loadReceivedNotificationKeys();
    void loadLauncherPosition();
    void loadJarvisNotifications();
    void loadStaffing();
    return true;
  }

  function getNotificationKey(item) {
    return `${Number(item?.id)}:${String(item?.occurrence_key || (item?.preview ? "preview" : "current"))}`;
  }

  function closeCurrentNotification() {
    notificationPopup.classList.remove("open");
    notificationPopup.classList.remove("instruction");
    if (activeNotificationKey) queuedNotificationIds.delete(activeNotificationKey);
    activeNotificationId = null;
    activeNotificationKey = null;
    activeNotification = null;
  }

  function showNextJarvisNotification() {
    if (notificationPopup.classList.contains("open")) return;
    const item = pendingNotifications.shift();
    if (!item) return;
    markNotificationReceived(item);
    activeNotificationId = Number(item.id);
    activeNotificationKey = getNotificationKey(item);
    activeNotification = item;
    notificationTitle.textContent = item.title || "Notification";
    notificationBody.textContent = item.body || "";
    notificationMeta.textContent = `Erstellt von ${item.created_by || "Unbekannt"}${item.created_at ? ` · ${new Date(item.created_at).toLocaleString("de-DE")}` : ""}`;
    notificationPopup.classList.toggle("instruction", item.notification_kind === "instruction");
    notificationPopup.classList.add("open");
    notificationClose.onclick = async () => {
      const notificationKey = getNotificationKey(item);
      closeCurrentNotification();
      if (!item.preview) {
        const response = await chrome.runtime.sendMessage({ type: "DISMISS_JARVIS_NOTIFICATION", id: item.id, identityToken }).catch(() => null);
        if (!response?.ok) {
          sessionSnoozedNotifications.add(notificationKey);
          console.warn("ODIN GO: Notification konnte nicht bestätigt werden und bleibt für diese Sitzung ausgeblendet.", response?.message || "Unbekannter Fehler");
        }
      }
      window.setTimeout(() => {
        showNextJarvisNotification();
        if (!item.preview) void loadJarvisNotifications();
      }, 180);
    };
  }

  async function loadJarvisNotifications() {
    if (!identityToken || notificationLoadPending) return;
    notificationLoadPending = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "GET_JARVIS_NOTIFICATIONS", identityToken });
      if (!response?.ok) {
        if (Number(response?.status) === 401) {
          identityToken = "";
          const refreshed = await verifyJarvisIdentity({ showPrompt: false });
          if (refreshed) window.setTimeout(() => void loadJarvisNotifications(), 0);
          return;
        }
        console.warn("ODIN GO: Notifications konnten nicht geladen werden.", response?.message || "Unbekannter Fehler");
        return;
      }
      const notifications = Array.isArray(response.notifications) ? response.notifications : [];
      if (response.enabled === false) {
        pendingNotifications = [];
        queuedNotificationIds.clear();
        if (activeNotification && !activeNotification.preview) closeCurrentNotification();
        return;
      }

      const availableKeys = new Set(notifications.map(getNotificationKey));
      pendingNotifications = pendingNotifications.filter((item) => item.preview || availableKeys.has(getNotificationKey(item)));
      if (activeNotification && !activeNotification.preview && !availableKeys.has(getNotificationKey(activeNotification))) {
        closeCurrentNotification();
      }

      queuedNotificationIds.clear();
      if (activeNotificationKey) queuedNotificationIds.add(activeNotificationKey);
      for (const item of pendingNotifications) queuedNotificationIds.add(getNotificationKey(item));

      for (const item of notifications) {
        const notificationId = Number(item?.id);
        const notificationKey = getNotificationKey(item);
        if (!Number.isInteger(notificationId) || notificationId === activeNotificationId || queuedNotificationIds.has(notificationKey) || sessionSnoozedNotifications.has(notificationKey) || receivedNotificationKeys.has(notificationKey)) continue;
        queuedNotificationIds.add(notificationKey);
        pendingNotifications.push(item);
      }
      showNextJarvisNotification();
    } finally {
      notificationLoadPending = false;
    }
  }

  async function loadStaffing() {
    if (!identityToken) return;
    const response = await chrome.runtime.sendMessage({ type: "GET_JARVIS_STAFFING", identityToken });
    if (!response?.ok) return;
    staffingNode.querySelector(".early").textContent = `Früh ${response.staffing?.early ?? 0}`;
    staffingNode.querySelector(".late").textContent = `Spät ${response.staffing?.late ?? 0}`;
    staffingNode.querySelector(".night").textContent = `Nacht ${response.staffing?.night ?? 0}`;
  }

  function isTrustedPlannerMessage(event) {
    try {
      return event.source === iframe.contentWindow && event.origin === new URL(normalizeBaseUrl()).origin;
    } catch {
      return false;
    }
  }

  window.addEventListener("message", (event) => {
    if (!isTrustedPlannerMessage(event) || !event.data || typeof event.data !== "object") return;
    if (event.data.type === "ODIN_GO_EXTENSION_PING") {
      event.source?.postMessage({ type: "ODIN_GO_EXTENSION_PONG", requestId: event.data.requestId }, event.origin);
      return;
    }
    if (event.data.type === "ODIN_GO_APP_READY") {
      iframeAppReady = true;
      window.clearTimeout(iframeLoadTimeout);
      offlineFallback.classList.remove("open");
      return;
    }
    if (event.data.type === "ODIN_GO_CLOSE") {
      setWorkspaceOpen(false);
      return;
    }
    if (event.data.type === "ODIN_GO_TOGGLE_EXPAND") {
      panel.classList.toggle("expanded", event.data.expanded === true);
      return;
    }
    if (event.data.type === "ODIN_GO_ACTIVE_PATH") {
      try {
        const path = new URL(String(event.data.path || ""), normalizeBaseUrl()).pathname;
        if (path.startsWith("/odin-go/")) remoteWorkspacePath = path;
      } catch {
        // Ignore malformed navigation state from the embedded application.
      }
      return;
    }
    if (event.data.type === "ODIN_GO_ADMIN_SESSION") {
      const token = String(event.data.token || "").trim();
      if (!token) return;
      adminToken = token;
      void chrome.runtime.sendMessage({ type: "SET_ADMIN_SESSION", token });
      return;
    }
    if (event.data.type === "ODIN_GO_NOTIFICATION_PREVIEW") {
      const item = event.data.notification;
      if (!item || typeof item !== "object" || !String(item.title || "").trim()) return;
      const preview = { ...item, id: Number(item.id) || -Date.now(), preview: true, occurrence_key: `preview-${Date.now()}` };
      const previewKey = getNotificationKey(preview);
      queuedNotificationIds.add(previewKey);
      pendingNotifications.unshift(preview);
      showNextJarvisNotification();
      return;
    }
    if (event.data.type === "ODIN_GO_NOTIFICATIONS_CHANGED") {
      void (async () => {
        if (!identityToken) await verifyJarvisIdentity({ showPrompt: false });
        await loadJarvisNotifications();
      })();
    }
  });

  launcher.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const rect = launcher.getBoundingClientRect();
    launcherDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      moved: false,
    };
    launcher.classList.add("dragging");
    launcher.setPointerCapture(event.pointerId);
    event.stopPropagation();
  });

  launcher.addEventListener("pointermove", (event) => {
    if (!launcherDrag || launcherDrag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - launcherDrag.startX;
    const deltaY = event.clientY - launcherDrag.startY;
    if (!launcherDrag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    launcherDrag.moved = true;
    applyLauncherPosition(launcherPositionFromPixels(launcherDrag.startLeft + deltaX, launcherDrag.startTop + deltaY));
    event.preventDefault();
    event.stopPropagation();
  });

  function finishLauncherDrag(event) {
    if (!launcherDrag || launcherDrag.pointerId !== event.pointerId) return;
    const moved = launcherDrag.moved;
    launcherDrag = null;
    launcher.classList.remove("dragging");
    try { launcher.releasePointerCapture(event.pointerId); } catch {}
    if (moved && launcherPosition) {
      suppressLauncherClick = true;
      void persistLauncherPosition(launcherPosition);
      window.setTimeout(() => { suppressLauncherClick = false; }, 250);
      event.preventDefault();
    }
    event.stopPropagation();
  }

  launcher.addEventListener("pointerup", finishLauncherDrag);
  launcher.addEventListener("pointercancel", finishLauncherDrag);

  launcher.addEventListener("click", async () => {
    if (suppressLauncherClick) return;
    setWorkspaceOpen(true);
    await loadSettings();
    await verifyJarvisIdentity({ showPrompt: false });
    await restoreAdminAccess();
    selectTab("shiftplan", remoteWorkspacePath);
  });
  closeButton.addEventListener("click", () => setWorkspaceOpen(false));
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) setWorkspaceOpen(false); });
  optionsButton.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }));
  expandButton.addEventListener("click", () => {
    const expanded = panel.classList.toggle("expanded");
    const label = expanded ? "Fenster verkleinern" : "Fenster vergroessern";
    expandButton.title = label;
    expandButton.setAttribute("aria-label", label);
  });

  for (const eventName of ['pointerdown', 'mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'beforeinput', 'input']) {
    root.querySelector('.panel').addEventListener(eventName, (event) => event.stopPropagation());
  }

  adminForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    adminError.textContent = "Prüfe Passwort ...";
    const password = new FormData(adminForm).get("password");
    const response = await chrome.runtime.sendMessage({ type: "UNLOCK_ADMIN", password });
    if (!response?.ok) {
      adminError.textContent = response?.message || "Admin-Freigabe fehlgeschlagen.";
      return;
    }
    adminToken = response.token;
    adminForm.reset();
    adminError.textContent = "";
    selectTab("admin", "/admin-settings");
  });

  // The profile menu can already be open when the content script starts. Verify
  // immediately and keep checking briefly until Jarvis exposes the SSO profile.
  loadSettings().then(() => verifyJarvisIdentity({ showPrompt: false }));
  void restoreAdminAccess();
  void restoreSavedJarvisIdentity();
  window.setTimeout(performOneTimeProfileProbe, 900);
  let identityVerificationTimer = null;
  function scheduleIdentityVerification(delay = 700) {
    if (identityToken || identityVerificationTimer) return;
    identityVerificationTimer = window.setTimeout(() => {
      identityVerificationTimer = null;
      void verifyJarvisIdentity({ showPrompt: false });
    }, delay);
  }
  const identityObserver = new MutationObserver(() => scheduleIdentityVerification());
  identityObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", () => {
    scheduleIdentityVerification(150);
  }, { passive: true });
  window.setInterval(() => {
    if (identityToken) return;
    void verifyJarvisIdentity({ showPrompt: false });
    performOneTimeProfileProbe();
  }, 10_000);
  window.setInterval(() => void loadJarvisNotifications(), 15_000);
  window.addEventListener("focus", () => {
    if (identityToken) void loadJarvisNotifications();
    else scheduleIdentityVerification(0);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void loadJarvisNotifications();
  });
  positionLauncher();
  window.addEventListener('resize', positionLauncher, { passive: true });
  window.setTimeout(positionLauncher, 2000);
  window.setTimeout(positionLauncher, 7000);
  window.setTimeout(positionLauncher, 15000);
})();
