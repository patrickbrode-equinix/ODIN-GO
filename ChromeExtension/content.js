(() => {
  if (document.getElementById("shiftplanner-jarvis-host")) return;

  const DEFAULTS = { plannerUrl: "https://eqx-portal.corp.equinix.com", apiKey: "", employeeName: "" };
  const log = (...args) => console.info("[ODIN GO]", ...args);
  log("Content-Script gestartet", { page: location.href });
  const host = document.createElement("div");
  host.id = "shiftplanner-jarvis-host";
  document.documentElement.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = `
    <style>
      :host { all: initial; pointer-events: none; }
      /* The host itself never catches clicks meant for Jarvis; only the real controls do. */
      .launcher, .app-menu, .backdrop.open { pointer-events: auto; }
      * { box-sizing: border-box; }
      button, input { font: inherit; }
      /* Enterprise look: flat surfaces, hairline borders, one blue accent, no glow or animation. */
      /* Bottom navigation entry: icon above a small label, like the Jarvis items (Priority List, Smart Hands ...). */
      .launcher { position: fixed; z-index: 2147483646; bottom: 0; left: 8px; display: none; width: 96px; height: 56px; padding: 0; overflow: hidden; user-select:none; border: 0; border-radius: 4px; background:transparent; color:#e7ebf0; font:500 11px/1.1 "Segoe UI",system-ui,Arial,sans-serif; cursor:pointer; transition:background .12s ease; }
      .launcher.context-open { display: none !important; visibility: hidden; pointer-events: none; }
      .launcher:hover { background:rgba(255,255,255,.1); }
      .launcher:active { background:rgba(255,255,255,.16); }
      .launcher:focus-visible { outline:2px solid #4a86e8; outline-offset:-2px; }
      .launcher img { display:none; }
      .lx-face { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; width:100%; height:100%; }
      .lx-icon { display:block; width:32px; height:32px; color:#e7ebf0; filter:drop-shadow(0 0 3px rgba(138,180,248,.35)); transition:color .12s ease,filter .12s ease; }
      .launcher:hover .lx-icon { color:#8ab4f8; filter:drop-shadow(0 0 5px rgba(138,180,248,.7)); }
      .lx-dots rect { fill:#8ab4f8; stroke:none; }
      .lx-text { white-space:nowrap; color:#fff; }
      .odin-brand { flex:0 0 auto; display:flex; align-items:center; justify-content:center; height:72px; overflow:hidden; border-bottom:1px solid #2c3644; background:#0f141b; }
      .odin-brand img { display:block; width:auto; height:64px; max-width:88%; object-fit:contain; filter:none; opacity:1; }
      .odin-title { font-family:"Segoe UI",system-ui,Arial,sans-serif; font-weight:600; letter-spacing:.02em; text-shadow:none; }
      .app-menu { position: fixed; z-index: 2147483647; display: none; width: 260px; padding: 8px; border: 1px solid #2c3644; border-radius: 8px; background: #171d26; color: #e7ebf0; box-shadow: 0 6px 20px rgba(0,0,0,.4); font-family: "Segoe UI",system-ui,Arial,sans-serif; }
      .app-menu.open { display: none; }
      .app-choice { display: grid; grid-template-columns: 34px 1fr; gap: 10px; align-items: center; width: 100%; padding: 9px; border: 1px solid #2c3644; border-radius: 6px; background: #1e2631; color: #e7ebf0; text-align: left; cursor: pointer; transition: background .12s ease,border-color .12s ease; }
      .app-choice:hover { border-color: #4a86e8; background: #212a37; }
      .app-symbol { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 6px; background: #2a3544; color: #cbd5e1; font-size: 15px; font-weight: 600; }
      .app-choice strong { display: block; font-size: 13px; font-weight: 600; }
      .app-choice small { display: block; margin-top: 3px; color: #8c97a7; font-size: 11px; line-height: 1.3; }
      .backdrop { position: fixed; z-index: 2147483647; inset: 0; display: none; background: rgba(8,11,16,.55); }
      .backdrop.open { display: block; }
      .panel { position: absolute; top: 0; right: 0; width: min(1180px,100vw); max-width: 100vw; height: 100%; max-height: 100dvh; display: flex; flex-direction: column; overflow: hidden; background:#0f141b; border-left:1px solid #2c3644; box-shadow:-8px 0 24px rgba(0,0,0,.3); color:#e7ebf0; font-family:"Segoe UI",system-ui,Arial,sans-serif; transition:width .18s ease; }
      .panel.expanded { width: 100vw; max-width: 100vw; }
      @media (max-width: 700px) { .panel { width: 100vw; border-left: 0; } .head { padding: 0 10px; } .staffing, .employee { display:none; } }
      .panel.remote-shell > .head, .panel.remote-shell > .odin-brand, .panel.remote-shell > .tabs, .panel.remote-shell .admin-login { display:none !important; }
      .head { height:52px; flex:0 0 auto; display:flex; align-items:center; gap:10px; padding:0 16px; background:#171d26; border-bottom:1px solid #2c3644; }
      .title { font-size: 15px; font-weight: 600; margin-right: auto; }
      .employee { color:#b9c2ce; font-size:12px; white-space:pre-line; text-align:right; }
      .staffing { display:flex; align-items:center; gap:5px; }
      .staffing span { border:1px solid #2c3644; border-radius:5px; background:#10151c; padding:5px 8px; color:#b9c2ce; font-size:11px; font-weight:600; white-space:nowrap; }
      .icon { border:1px solid #2c3644; border-radius:6px; background:#1e2631; color:#e7ebf0; cursor:pointer; padding:7px 10px; box-shadow:none; transition:background .12s ease,border-color .12s ease; }
      .icon:hover { background:#2a3544; border-color:#3a4658; }
      .tabs { display:flex; gap:2px; padding:0 12px; overflow-x:auto; background:#131921; border-bottom:1px solid #2c3644; scrollbar-width:thin; }
      .tab { white-space:nowrap; border:0; border-bottom:2px solid transparent; border-radius:0; background:transparent; color:#8c97a7; padding:11px 12px; cursor:pointer; font-size:13px; font-weight:500; box-shadow:none; transition:color .12s ease,border-color .12s ease; }
      .tab:hover { color:#e7ebf0; border-bottom-color:#3a4658; }
      .tab.active { background:transparent; border-bottom-color:#4a86e8; color:#fff; box-shadow:none; }
      .body { position: relative; flex: 1; min-height: 0; }
      iframe { position: absolute; z-index: 1; inset: 0; width: 100%; height: 100%; border: 0; background: #0f141b; }
      .offline-fallback { position:absolute; z-index:4; inset:0; display:none; align-items:center; justify-content:center; overflow:auto; padding:24px; background:#0f141b; }
      .offline-fallback.open { display:flex; }
      .offline-fallback img { display:block; width:min(100%,1100px); max-height:100%; object-fit:contain; border-radius:8px; box-shadow:none; }
      .offline-fallback-close { position:absolute; z-index:1; top:18px; right:18px; display:grid; place-items:center; width:38px; height:38px; border:1px solid #3a4658; border-radius:6px; background:#171d26; color:#e7ebf0; font:600 20px/1 "Segoe UI",Arial,sans-serif; cursor:pointer; box-shadow:none; }
      .offline-fallback-close:hover { background:#2a3544; border-color:#4a86e8; color:#fff; }
      .admin-login { position: absolute; z-index: 20; inset: 0; display: none; place-items: center; padding: 24px; pointer-events: auto; background: #0f141b; }
      .admin-login.open { display: grid; }
      .card { position: relative; z-index: 21; width: min(400px,100%); padding: 24px; pointer-events: auto; border: 1px solid #2c3644; border-radius: 8px; background: #171d26; box-shadow: 0 1px 3px rgba(0,0,0,.35); }
      .card h2 { margin: 0 0 8px; font-size: 18px; font-weight: 600; }
      .card p { margin: 0 0 18px; color: #8c97a7; font-size: 13px; line-height: 1.5; }
      .card input { position: relative; z-index: 22; width: 100%; padding: 10px 12px; pointer-events: auto; border: 1px solid #2c3644; border-radius: 6px; background: #10151c; color: #e7ebf0; outline: none; caret-color: #8ab4f8; }
      .card input:focus { border-color: #4a86e8; box-shadow: none; }
      .unlock { width: 100%; margin-top: 12px; padding: 10px; border: 0; border-radius: 6px; background: #2f6fd0; color: white; font-weight: 600; cursor: pointer; }
      .unlock:hover { background: #3a7be0; }
      .error { min-height: 18px; margin-top: 10px; color: #f08a84; font-size: 12px; }
      .notice { display: none; padding: 9px 14px; background: #3a2e12; color: #f3d9a0; font: 12px/1.4 "Segoe UI",Arial,sans-serif; }
      .notice.open { display: block; }
      .jarvis-notification { position: fixed; z-index: 2147483647; left: 50%; top: 50%; display: none; width: min(470px,calc(100vw - 32px)); transform: translate(-50%,-50%); border: 1px solid #3a4658; border-radius: 8px; background: #171d26; color: #e7ebf0; box-shadow: 0 8px 28px rgba(0,0,0,.5); font-family: "Segoe UI",system-ui,Arial,sans-serif; }
      .jarvis-notification.open { display: block; }
      .jarvis-notification.instruction { border-color:#c0504d; background:#1f1719; box-shadow:0 8px 28px rgba(0,0,0,.5); }
      .jarvis-notification.instruction header { color:#f3b6b2; }
      .jarvis-notification header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 20px 10px; font-weight:600; font-size:16px; }
      .jarvis-notification p { margin:0; padding:0 20px 12px; white-space:pre-wrap; color:#b9c2ce; font-size:13px; line-height:1.55; }
      .jarvis-notification footer { padding:0 20px 16px; color:#707b8b; font-size:11px; }
      .jarvis-notification button { border:0; background:transparent; color:#b9c2ce; cursor:pointer; font-size:20px; }
    </style>
    <button class="launcher" type="button" aria-label="ODIN GO öffnen" title="ODIN GO öffnen"><span class="lx-face"><svg class="lx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2.4"/><path d="M3 9.6h18M8 2.6v3.8M16 2.6v3.8"/><g class="lx-dots"><rect x="6.2" y="12.2" width="3" height="2.4" rx=".6"/><rect x="10.5" y="12.2" width="3" height="2.4" rx=".6"/><rect x="14.8" y="12.2" width="3" height="2.4" rx=".6"/><rect x="6.2" y="16.3" width="3" height="2.4" rx=".6"/><rect x="10.5" y="16.3" width="3" height="2.4" rx=".6"/></g></svg><span class="lx-text">ODIN GO</span></span><img alt="ODIN GO" /></button>
    <div class="app-menu" role="menu" aria-label="Anwendung auswählen">
      <button class="app-choice" type="button" data-app="planner"><span class="app-symbol">S</span><span><strong>Schichtplaner</strong><small>Dienstplan, Drafts und Wellbeing</small></span></button>
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
          <div class="offline-fallback" aria-live="polite">
            <button class="offline-fallback-close" type="button" aria-label="ODIN GO schließen" title="ODIN GO schließen">×</button>
            <img alt="ODIN GO ist vorübergehend nicht erreichbar" />
          </div>
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
  iframe.inert = true; // closed until the workspace is opened (see setWorkspaceOpen)
  const offlineFallback = root.querySelector(".offline-fallback");
  const offlineFallbackClose = root.querySelector(".offline-fallback-close");
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
  let preferLiveProfileIdentity = false;
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

  function notifyPanelVisible(visible) {
    try {
      iframe.contentWindow?.postMessage({ type: "ODIN_GO_PANEL_VISIBLE", visible }, new URL(normalizeBaseUrl()).origin);
    } catch {
      // The app may not be loaded yet; it asks again when it is ready.
    }
  }

  // Element that had the focus in Jarvis before ODIN GO opened; it gets the focus back on close.
  let focusBeforeOpen = null;
  // Last element of the Jarvis page that had the focus (the click on the ODIN GO button moves the focus
  // to the extension itself, so it has to be tracked beforehand).
  let lastPageFocus = null;
  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (target instanceof Element && target !== host && !host.contains(target) && !target.closest(`[${NAV_ENTRY_ATTRIBUTE}]`)) lastPageFocus = target;
  }, { capture: true, passive: true });

  // After closing: is the Jarvis page really free? Logs what lies on top of the page and repairs the one case we can
  // influence (our own host element). The line in the browser console tells us the cause if buttons ever hang.
  function verifyPageInteractive() {
    try {
      if (backdrop.classList.contains("open")) return;
      const entryRect = navEntry && navEntry.isConnected ? navEntry.getBoundingClientRect() : null;
      const points = [
        [window.innerWidth / 2, 40],
        [window.innerWidth / 2, window.innerHeight / 2],
        entryRect ? [entryRect.left + entryRect.width / 2, entryRect.top + entryRect.height / 2] : [window.innerWidth / 2, window.innerHeight - 30],
      ];
      const probes = points.map(([x, y]) => {
        const element = document.elementFromPoint(x, y);
        return {
          at: `${Math.round(x)},${Math.round(y)}`,
          element: element ? `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}.${String(element.className || "").toString().slice(0, 40)}` : "none",
          ours: Boolean(element) && (element === host || host.contains(element)),
          pointerEvents: element ? window.getComputedStyle(element).pointerEvents : "",
        };
      });
      const state = {
        probes,
        hasFocus: document.hasFocus(),
        activeElement: document.activeElement ? document.activeElement.tagName.toLowerCase() : "none",
        htmlInert: document.documentElement.inert === true,
        bodyInert: document.body.inert === true,
        bodyPointerEvents: window.getComputedStyle(document.body).pointerEvents,
        htmlPointerEvents: window.getComputedStyle(document.documentElement).pointerEvents,
      };
      if (probes.some((probe) => probe.ours)) {
        // Something of ours is on top although the workspace is closed: recreate the host element.
        host.remove();
        document.documentElement.appendChild(host);
        log("Nachprüfung nach dem Schließen: ODIN GO lag noch über der Seite und wurde entfernt", state);
      } else {
        log("Nachprüfung nach dem Schließen: Seite ist frei", state);
      }
    } catch (error) {
      log("Nachprüfung nach dem Schließen fehlgeschlagen", String(error));
    }
  }

  function setWorkspaceOpen(open) {
    if (open) {
      focusBeforeOpen = lastPageFocus && lastPageFocus.isConnected ? lastPageFocus : null;
    }
    // A closed (hidden) app must not keep keyboard focus or a mouse capture: inert makes the whole
    // embedded page unreachable until the workspace is opened again.
    iframe.inert = !open;
    backdrop.classList.toggle("open", open);
    launcher.classList.toggle("context-open", open);
    launcher.style.setProperty("display", open ? "none" : "", "important");
    launcher.setAttribute("aria-expanded", String(open));
    // The iframe stays loaded while the panel is closed; let it pause clocks and polling.
    notifyPanelVisible(open);
    if (open) {
      appMenu.style.display = "none";
    } else {
      // Hand the focus back to Jarvis so its buttons react at once after closing.
      try { iframe.blur(); } catch { /* cross-origin frames may refuse */ }
      // Deliberately no focus() on a Jarvis element: Mendix widgets run on-enter/on-leave microflows on focus changes,
      // which re-render the page. Only the window itself gets the focus back.
      try { window.focus(); } catch { /* focus is best effort */ }
      focusBeforeOpen = null;
      // Closed means closed: the embedded app is emptied, so it cannot keep focus, a mouse capture or timers
      // behind the Jarvis page (this was the problem after closing the full-screen window). Opening loads it again.
      iframeReady = false;
      iframeAppReady = false;
      iframeSessionSignature = "";
      window.clearTimeout(iframeLoadTimeout);
      window.setTimeout(() => { if (!backdrop.classList.contains("open")) iframe.src = "about:blank"; }, 0);
      window.setTimeout(verifyPageInteractive, 600);
      window.requestAnimationFrame(() => positionLauncher());
    }
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

  // Measured once per positioning run. The old version re-scanned and re-styled the whole
  // Jarvis DOM for every candidate position (up to ~80 times), which froze the page.
  function collectOccupiedRects(brandAnchor) {
    const candidates = document.querySelectorAll('button,a,input,select,textarea,[role="button"],[tabindex],img,svg');
    const rects = [];
    for (const element of candidates) {
      if (element === host || host.contains(element)) continue;
      if (brandAnchor && (element === brandAnchor || brandAnchor.contains(element) || element.contains(brandAnchor))) continue;
      // Cheap geometry first; only elements inside the top strip need the style check.
      const rect = element.getBoundingClientRect();
      if (!(rect.top < 75 && rect.bottom > 0 && rect.width > 0 && rect.height > 0 && rect.width < 360 && rect.height < 90)) continue;
      if (!isVisible(element)) continue;
      rects.push(rect);
    }
    return rects;
  }

  function overlapsRects(rects, left, top, width, height) {
    const right = left + width;
    const bottom = top + height;
    return rects.some((rect) => left < rect.right + 6 && right > rect.left - 6 && top < rect.bottom + 4 && bottom > rect.top - 4);
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
    const width = rect.width || 122;
    const height = rect.height || 34;
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
    return; // fixed placement in the bottom navigation: saved drag positions are ignored
    if (!verifiedUser || !identityToken) return;
    const userKey = launcherStorageKey();
    if (launcherPositionLoadedForUser === userKey) return;
    launcherPositionLoadedForUser = userKey;
    const local = await chrome.storage.local.get([userKey, "odinGoLauncherPosition:device"]);
    const localPosition = normalizeLauncherPosition(local[userKey]) || normalizeLauncherPosition(local["odinGoLauncherPosition:device"]);
    const response = await chrome.runtime.sendMessage({ type: "GET_ODIN_GO_PREFERENCES", identityToken }).catch(() => null);
    const serverPosition = response?.ok ? normalizeLauncherPosition(response.launcherPosition) : null;
    const selected = serverPosition || localPosition;
    if (selected) {
      applyLauncherPosition(selected);
      // A position saved on another screen can lie on top of a Jarvis control here. Then the
      // automatic position is used for this session (the saved one is kept).
      const run = () => {
        const bounds = launcher.getBoundingClientRect();
        const covers = collectOccupiedRects(findBrandAnchor()).some((rect) => bounds.left < rect.right && bounds.right > rect.left && bounds.top < rect.bottom && bounds.bottom > rect.top);
        if (covers) {
          log("Gespeicherte Button-Position verdeckt ein Jarvis-Element; automatische Position wird verwendet.");
          launcherPosition = null;
          positionLauncher();
        }
      };
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 3_000 });
      else window.setTimeout(run, 1_500);
    }
    if (response?.ok && !serverPosition && localPosition) void persistLauncherPosition(localPosition);
  }

  // The launcher sits in the free area of the bottom navigation, directly left of "Priority List",
  // at the same height as the other entries. Without that item (other Jarvis page) it sits bottom left.
  let cachedNavAnchor = null;
  let cachedNavAnchorAt = 0;
  let cachedNavLabel = null;
  let lastLauncherPlacement = "";
  const NAV_LABELS = ["Priority List", "Smart Hands", "Trouble Tickets", "CC Installs", "Installs", "Deinstalls", "Other Activities", "IBX Request Central", "Equinix Service Hub"];
  let cachedNavBar = null;
  let cachedNavItems = [];

  /**
   * Finds the real bottom navigation by its nine menu names: every name must sit in the lower part of the page,
   * the closest common ancestor is the bar, and the bar's direct children that contain a name are the entries.
   * Returns the first entry or null (then the floating button is used).
   */
  function findBottomNavAnchor() {
    // The text search is cheap but not free: reuse the result while it is still on the page.
    if (cachedNavAnchor && cachedNavAnchor.isConnected && cachedNavBar?.isConnected && Date.now() - cachedNavAnchorAt < 30_000) return cachedNavAnchor;
    cachedNavAnchor = null;
    cachedNavLabel = null;
    cachedNavBar = null;
    cachedNavItems = [];
    cachedNavAnchorAt = Date.now();
    const condition = NAV_LABELS.map((label) => `normalize-space(text())='${label}'`).join(" or ");
    const result = document.evaluate(`//*[${condition}]`, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const labels = [];
    for (let index = 0; index < result.snapshotLength; index++) {
      const label = result.snapshotItem(index);
      if (!label || host.contains(label) || label.closest(`[${NAV_ENTRY_ATTRIBUTE}]`)) continue;
      const rect = label.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.top < window.innerHeight * 0.7) continue;
      labels.push(label);
    }
    if (labels.length < 3) return null;

    // closest common ancestor of all names
    let bar = labels[0].parentElement;
    while (bar && !labels.every((label) => bar.contains(label))) bar = bar.parentElement;
    if (!bar || bar.getBoundingClientRect().width < window.innerWidth * 0.5) return null;

    // entries: the direct children of the bar that contain a name (the same level for every name)
    const items = [];
    for (const label of labels) {
      let item = label;
      while (item.parentElement && item.parentElement !== bar) item = item.parentElement;
      if (item.parentElement === bar && !items.includes(item)) items.push(item);
    }
    items.sort((left, right) => left.getBoundingClientRect().left - right.getBoundingClientRect().left);
    if (items.length < 3) return null;
    const tops = items.map((item) => item.getBoundingClientRect().top);
    if (Math.max(...tops) - Math.min(...tops) > 12) return null; // no single row: not the bar

    cachedNavBar = bar;
    cachedNavItems = items;
    cachedNavAnchor = items[0];
    cachedNavLabel = firstTextElement(items[0]);
    return items[0];
  }
  /* ── ODIN GO entry inside the Jarvis bottom navigation ──
     The entry is a copy of an existing (inactive) Jarvis entry, so size, font, colours, hover and above all the
     spacing come from the page itself: the bar distributes all entries evenly, ours included. If the bar cannot be
     found (other Jarvis page) the floating button below is used instead. */
  const NAV_ENTRY_ATTRIBUTE = "data-odin-go-entry";
  let navEntry = null;

  function firstTextElement(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (String(node.textContent || "").trim()) return node.parentElement;
    }
    return null;
  }
  function nodePath(root, node) {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) return null;
      path.unshift(Array.prototype.indexOf.call(parent.childNodes, current));
      current = parent;
    }
    return path;
  }
  function nodeAt(root, path) {
    let current = root;
    for (const index of path || []) current = current?.childNodes?.[index] || null;
    return current;
  }
  function isGreenish(color) {
    const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(color || ""));
    if (!match) return false;
    const [red, green, blue] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return green > red + 25 && green > blue + 25;
  }
  function removeNavEntry() {
    if (navEntry) navEntry.remove();
    navEntry = null;
  }

  function buildNavEntry(template, entries) {
    const label = firstTextElement(template);
    if (!label) return null;
    const labelStyle = window.getComputedStyle(label);
    const labelRect = label.getBoundingClientRect();
    // Jarvis draws the footer icons as a ::before pseudo-element (30x30 background image), not as an element.
    const pseudoStyle = window.getComputedStyle(template, "::before");
    const pseudoIcon = Boolean(pseudoStyle.content) && !["none", "normal"].includes(pseudoStyle.content)
      && parseFloat(pseudoStyle.width) >= 10 && parseFloat(pseudoStyle.height) >= 10;
    const siblingEntries = (entries && entries.length ? entries : [template]).filter((child) => child !== navEntry);
    // The icon is the largest element above the label (an img, svg or a wrapper around a font icon).
    let icon = null;
    let largest = 0;
    for (const element of (pseudoIcon ? [] : template.querySelectorAll("*"))) {
      if (element === label || label.contains(element) || element.contains(label)) continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 10 || rect.height < 10 || rect.width > 90 || rect.height > 90 || rect.bottom > labelRect.top + 4) continue;
      if (rect.width * rect.height > largest) { largest = rect.width * rect.height; icon = element; }
    }
    const iconRect = icon ? icon.getBoundingClientRect() : null;
    const iconStyle = icon ? window.getComputedStyle(icon) : null;
    const labelPath = nodePath(template, label);
    const iconPath = icon ? nodePath(template, icon) : null;
    if (!labelPath) return null;

    const clone = template.cloneNode(true);
    // The copy must never look like one of the page's own widgets. Mendix (Dojo/dijit) identifies widgets by the
    // attribute widgetid and finds them by their unique names (mx-name-menuBar3-0): a duplicate confuses its widget
    // registry, its focus tracking and its event handling. So every identifying attribute and every unique name is removed;
    // the shared classes stay, so the copy still looks exactly like the other entries.
    for (const element of [clone, ...clone.querySelectorAll("*")]) {
      for (const attribute of [...element.attributes]) {
        const name = attribute.name.toLowerCase();
        if (name === "widgetid" || name === "id" || name === "href" || name === "name" || name === "for" || name.startsWith("data-") || name.startsWith("aria-controls") || name === "aria-current" || name === "aria-selected" || name === "onclick") {
          element.removeAttribute(attribute.name);
        }
      }
      for (const token of [...element.classList]) {
        if (/active|selected|current/i.test(token) || /^mx-name-.+-\d+$/.test(token) || /^mx-name-index-/.test(token)) element.classList.remove(token);
      }
    }
    if (pseudoIcon) {
      // Keep only the classes every entry shares (layout, font, hover colour); entry-specific ones (e.g. PL-link)
      // select the icon image and the badge must not be copied.
      const shared = [...template.classList].filter((token) => siblingEntries.every((entry) => entry.classList.contains(token)));
      clone.className = shared.join(" ");
      clone.querySelectorAll("[class*=badge i]").forEach((badge) => badge.remove());
    }
    clone.setAttribute(NAV_ENTRY_ATTRIBUTE, "1");
    clone.setAttribute("role", "button");
    clone.setAttribute("tabindex", "0");
    clone.setAttribute("title", "ODIN GO öffnen");
    clone.setAttribute("aria-label", "ODIN GO öffnen");
    clone.style.cursor = "pointer";

    const cloneLabel = nodeAt(clone, labelPath);
    if (!cloneLabel) return null;
    cloneLabel.textContent = "ODIN GO";

    if (pseudoIcon) {
      const activeSibling = siblingEntries.map((entry) => firstTextElement(entry)).find((element) => element && isGreenish(window.getComputedStyle(element).color));
      applyNavEntryIconStyle({
        width: parseFloat(pseudoStyle.width),
        height: parseFloat(pseudoStyle.height),
        color: labelStyle.color,
        hoverColor: activeSibling ? window.getComputedStyle(activeSibling).color : "#7ac558",
      });
      attachNavEntryEvents(clone);
      return clone;
    }
    const size = iconRect ? Math.round(Math.min(iconRect.width, iconRect.height)) : 24;
    const holder = document.createElement("span");
    holder.innerHTML = `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="16.5" rx="2.4"/><path d="M3 9.6h18M8 2.6v3.8M16 2.6v3.8"/><g fill="currentColor" stroke="none"><rect x="6.2" y="12.2" width="3" height="2.4" rx=".6"/><rect x="10.5" y="12.2" width="3" height="2.4" rx=".6"/><rect x="14.8" y="12.2" width="3" height="2.4" rx=".6"/><rect x="6.2" y="16.3" width="3" height="2.4" rx=".6"/><rect x="10.5" y="16.3" width="3" height="2.4" rx=".6"/></g></svg>`;
    const svg = holder.firstElementChild;
    svg.style.cssText = `display:block;flex:0 0 auto;color:${labelStyle.color};margin:${iconStyle ? iconStyle.margin : "0 auto"}`;
    const cloneIcon = iconPath ? nodeAt(clone, iconPath) : null;
    if (cloneIcon && ["img", "svg", "i", "canvas"].includes(cloneIcon.tagName.toLowerCase())) {
      cloneIcon.replaceWith(svg);
    } else if (cloneIcon) {
      cloneIcon.replaceChildren(svg);
      cloneIcon.style.backgroundImage = "none";
      cloneIcon.style.webkitMaskImage = "none";
      cloneIcon.style.maskImage = "none";
      svg.style.margin = "auto";
    } else {
      cloneLabel.parentNode?.insertBefore(svg, cloneLabel);
    }

    attachNavEntryEvents(clone);
    return clone;
  }

  function attachNavEntryEvents(entry) {
    const open = (event) => {
      event.preventDefault();
      event.stopPropagation();
      void openWorkspace();
    };
    entry.addEventListener("click", open);
    entry.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") open(event); });
  }

  // Icon of the entry as a ::before background image, exactly like the Jarvis entries (same box, same position).
  function applyNavEntryIconStyle({ width, height, color, hoverColor }) {
    const svg = (stroke) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="16.5" rx="2.4"/><path d="M3 9.6h18M8 2.6v3.8M16 2.6v3.8"/><g fill="${stroke}" stroke="none"><rect x="6.2" y="12.2" width="3" height="2.4" rx=".6"/><rect x="10.5" y="12.2" width="3" height="2.4" rx=".6"/><rect x="14.8" y="12.2" width="3" height="2.4" rx=".6"/><rect x="6.2" y="16.3" width="3" height="2.4" rx=".6"/><rect x="10.5" y="16.3" width="3" height="2.4" rx=".6"/></g></svg>`;
    const uri = (stroke) => `url("data:image/svg+xml,${encodeURIComponent(svg(stroke))}")`;
    let style = document.getElementById("odin-go-nav-style");
    if (!style) {
      style = document.createElement("style");
      style.id = "odin-go-nav-style";
      document.head.appendChild(style);
    }
    style.textContent = `[${NAV_ENTRY_ATTRIBUTE}]::before{content:"";background:${uri(color)} no-repeat center / ${Math.round(width)}px ${Math.round(height)}px !important}
[${NAV_ENTRY_ATTRIBUTE}]:hover::before{background-image:${uri(hoverColor)} !important}`;
  }

  // Off on purpose: every insert/remove inside the Mendix bar triggers Mendix's own resize detection, which re-runs
  // _loadAndShowContent/_showPage and its microflows (seen in the console stack: removeNavEntry -> childList -> _showPage).
  // That left Jarvis buttons "clickable but nothing loads". The floating button below never touches the page's DOM.
  const INJECT_INTO_PAGE_NAV = false;

  function injectNavEntry(anchor) {
    if (!INJECT_INTO_PAGE_NAV) return false;
    const bar = cachedNavBar;
    const items = cachedNavItems.filter((item) => item.isConnected && item !== navEntry);
    if (!bar || items.length < 3 || !items.includes(anchor)) return false;
    if (navEntry && navEntry.isConnected && navEntry.parentElement === bar) return true;
    removeNavEntry();
    const plain = items.find((item) => {
      const label = firstTextElement(item);
      return label && !isGreenish(window.getComputedStyle(label).color);
    });
    const entry = buildNavEntry(plain || items[0], items);
    if (!entry) return false;
    bar.insertBefore(entry, items[0]);
    // The entry must sit in the same row as the others (same top, comparable height); otherwise take it out again.
    const entryRect = entry.getBoundingClientRect();
    const referenceRect = items[0].getBoundingClientRect();
    const sameRow = entryRect.width > 0 && Math.abs(entryRect.top - referenceRect.top) <= 10 && Math.abs(entryRect.height - referenceRect.height) <= 14;
    if (!sameRow) {
      entry.remove();
      log("ODIN-GO-Eintrag passt nicht in die Leiste und wurde nicht eingefügt", {
        entry: { top: Math.round(entryRect.top), height: Math.round(entryRect.height), width: Math.round(entryRect.width) },
        reference: { top: Math.round(referenceRect.top), height: Math.round(referenceRect.height) },
        bar: `${bar.tagName.toLowerCase()}.${String(bar.className || "").slice(0, 60)}`,
      });
      return false;
    }
    navEntry = entry;
    log("ODIN-GO-Eintrag in die Leiste eingefügt", {
      bar: `${bar.tagName.toLowerCase()}.${String(bar.className || "").slice(0, 60)}`,
      entries: items.length,
      template: `${(plain || items[0]).tagName.toLowerCase()}.${String((plain || items[0]).className || "").slice(0, 60)}`,
    });
    return true;
  }
  async function openWorkspace() {
    setWorkspaceOpen(true);
    await loadSettings();
    await verifyJarvisIdentity({ showPrompt: false });
    await restoreAdminAccess();
    selectTab("shiftplan", remoteWorkspacePath);
  }
  function positionLauncher() {
    const anchor = findBottomNavAnchor();
    // Preferred: an entry inside the Jarvis navigation (identical look and spacing). The floating button is the fallback.
    if (anchor && injectNavEntry(anchor)) {
      launcher.style.setProperty('display', 'none', 'important');
      lastLauncherPlacement = '';
      return;
    }
    removeNavEntry();
    launcher.style.removeProperty('display');
    let width = 96;
    let height = 56;
    let left = 8;
    let top = window.innerHeight - height;
    let iconSize = 26;
    let padTop = 8;
    let gap = 4;
    let font = { family: '"Segoe UI",system-ui,Arial,sans-serif', size: 11, weight: "500", spacing: "normal", lineHeight: "1.1" };
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      height = Math.max(40, Math.round(rect.height));
      width = Math.min(110, Math.max(72, Math.round(height * 1.7)));
      top = Math.round(rect.top);
      left = Math.max(4, Math.round(rect.left / 2 - width / 2));
      // Take the look from the Jarvis entry itself: label font and the position of icon and label inside the box.
      if (cachedNavLabel) {
        const style = window.getComputedStyle(cachedNavLabel);
        const labelRect = cachedNavLabel.getBoundingClientRect();
        font = { family: style.fontFamily, size: parseFloat(style.fontSize) || 11, weight: style.fontWeight, spacing: style.letterSpacing, lineHeight: style.lineHeight };
        const iconElement = [...anchor.querySelectorAll('img,svg,i,span,div')].find((element) => {
          if (element === cachedNavLabel || cachedNavLabel.contains(element) || element.contains(cachedNavLabel)) return false;
          const iconRect = element.getBoundingClientRect();
          return iconRect.width >= 12 && iconRect.width <= 64 && iconRect.height >= 12 && iconRect.height <= 64 && iconRect.bottom <= labelRect.top + 4;
        });
        if (iconElement) {
          const iconRect = iconElement.getBoundingClientRect();
          iconSize = Math.round(Math.max(iconRect.width, iconRect.height));
          padTop = Math.max(0, Math.round(iconRect.top - rect.top));
          gap = Math.max(0, Math.round(labelRect.top - iconRect.bottom));
        } else {
          iconSize = Math.round(height * 0.5);
        }
      }
    }
    const placement = `${top}:${left}:${height}:${width}:${iconSize}:${padTop}:${gap}:${font.size}:${font.family}`;
    if (placement === lastLauncherPlacement && launcher.style.display === "block") return;
    lastLauncherPlacement = placement;
    const face = launcher.querySelector('.lx-face');
    const icon = launcher.querySelector('.lx-icon');
    const label = launcher.querySelector('.lx-text');
    launcher.style.bottom = 'auto';
    launcher.style.top = `${Math.max(0, top)}px`;
    launcher.style.left = `${left}px`;
    launcher.style.right = 'auto';
    launcher.style.width = `${width}px`;
    launcher.style.height = `${height}px`;
    if (face) { face.style.justifyContent = 'flex-start'; face.style.paddingTop = `${padTop}px`; face.style.gap = `${gap}px`; }
    if (icon) { icon.style.width = `${iconSize}px`; icon.style.height = `${iconSize}px`; }
    if (label) {
      label.style.fontFamily = font.family;
      label.style.fontSize = `${font.size}px`;
      label.style.fontWeight = font.weight;
      label.style.letterSpacing = font.spacing;
      label.style.lineHeight = font.lineHeight;
      label.style.color = '#ffffff';
    }
    launcher.style.display = 'block';
    appMenu.style.top = `${Math.max(0, top - 8)}px`;
    appMenu.style.left = `${left}px`;
  }
  const baseTabs = [
    ["shiftplan", "Dienstplan", "/shiftplan"],
    ["drafts", "Drafts", "/drafts"],
    ["week", "Wochenplan", "/shiftplan/week"],
    ["day", "Tagesplan", "/tagesplanung"],
    ["wellbeing", "Wellbeing", "/wellbeing"],
    ["preferences", "Settings", "/preferences"],
    ["admin", "Settings Admin", "/admin-settings"],
    ["projects", "Projekte", "/projects"],
    ["notices", "Notifications", "/jarvis-notifications"],
  ];
  const adminTabs = [
    ["generator", "Generator", "/shiftplan-control"],
    ["users", "User Management", "/users"],
  ];
  const noticeTabs = [["notices", "Notifications", "/jarvis-notifications"]];

  function normalizeBaseUrl() { return String(settings.plannerUrl || DEFAULTS.plannerUrl).replace(/\/+$/, ""); }
  function plannerUrlError() {
    try {
      const url = new URL(normalizeBaseUrl());
      if (location.protocol === "https:" && url.protocol !== "https:") {
        return "ODIN GO muss innerhalb von Jarvis über HTTPS erreichbar sein. Die konfigurierte Planner-URL verwendet HTTP.";
      }
      if (url.protocol !== "https:") return "Die Planner-URL muss HTTPS verwenden.";
      return "";
    } catch {
      return "Die konfigurierte Planner-URL ist ungültig.";
    }
  }
  function hasPasswordlessAdminAccess() {
    return String(verifiedUser?.displayName || "")
      .trim()
      .toLocaleLowerCase("de-DE")
      .replace(/\s+/g, " ") === "patrick brode";
  }

  function renderVerifiedEmployee() {
    if (!verifiedUser) {
      employeeNode.textContent = "Jarvis-SSO wird geprüft";
      return;
    }
    const adminLabel = hasPasswordlessAdminAccess() ? "\nAdmin" : "";
    employeeNode.textContent = `${verifiedUser.displayName} · SSO verifiziert${adminLabel}`;
  }

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
    const rows = (adminToken || hasPasswordlessAdminAccess()) ? [...baseTabs, ...adminTabs] : baseTabs;
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
    if (id === "admin" && !adminToken && !hasPasswordlessAdminAccess()) {
      adminLogin.classList.add("open");
      iframe.style.display = "none";
      window.setTimeout(() => adminPasswordInput.focus(), 0);
    } else if (path) {
      const urlError = plannerUrlError();
      if (urlError) {
        iframe.removeAttribute("src");
        iframe.style.display = "none";
        notice.textContent = urlError;
        notice.classList.add("open");
        renderTabs();
        return;
      }
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
    iframeReady = iframe.getAttribute("src") !== "about:blank";
  });
  iframe.addEventListener("error", () => offlineFallback.classList.add("open"));

  async function loadSettings() {
    // Policy > values saved on this PC > Chrome sync (merged by the service worker).
    const response = await chrome.runtime.sendMessage({ type: "GET_SETTINGS" }).catch(() => null);
    settings = response?.ok ? response.settings : await chrome.storage.sync.get(DEFAULTS);
    log("Einstellungen geladen", { plannerUrl: settings.plannerUrl, hasApiKey: Boolean(settings.apiKey) });
    renderVerifiedEmployee();
    const urlError = plannerUrlError();
    const missingSettings = Boolean(urlError) || !settings.apiKey;
    notice.textContent = urlError
      ? urlError
      : !settings.apiKey
      ? "Auf diesem PC fehlt der App-Schlüssel. Ohne ihn erreicht ODIN GO das Backend nicht."
      : "";
    if (missingSettings) showNotice(notice.textContent, { withSettings: !urlError });
    else notice.classList.remove("open");
  }

  /** Shows a notice; with `withSettings` it carries a button that opens the extension settings. */
  function showNotice(text, { withSettings = false } = {}) {
    notice.replaceChildren(document.createTextNode(text));
    if (withSettings) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "Einstellungen öffnen";
      button.style.cssText = "margin-left:10px;padding:3px 10px;border:1px solid #ffe3a0;border-radius:6px;background:transparent;color:#ffe3a0;cursor:pointer;font:inherit";
      button.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }));
      notice.appendChild(button);
    }
    notice.classList.add("open");
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
    // Never act on Jarvis while the user is working in it (typing, hidden tab).
    const active = document.activeElement;
    if (document.visibilityState !== "visible" || (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)))) return;
    const profileButton = findJarvisProfileButton();
    if (!profileButton) return;
    profileProbeAttempted = true;
    // The menu is already open (opened by the user): only read it, never toggle it.
    if (profileButton.getAttribute("aria-expanded") === "true") {
      window.setTimeout(() => void verifyJarvisIdentity({ showPrompt: false, preferLive: true }), 100);
      return;
    }
    profileButtonUsedForProbe = profileButton;
    profileButton.click();
    window.setTimeout(() => void verifyJarvisIdentity({ showPrompt: false, preferLive: true }), 550);
  }

  function readJarvisIdentity({ preferLive = false } = {}) {
    if (!preferLive && jarvisSessionIdentity) return jarvisSessionIdentity;
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

  let lastPageSessionProbeAt = 0;
  /**
   * Second source for the Jarvis user: the Mendix client object of the page (read by the service
   * worker in the page's own JavaScript world). It works even when the profile menu was never opened
   * and the DOM probe finds nothing. At most once per 30 seconds.
   */
  async function readJarvisSessionFromPage() {
    if (Date.now() - lastPageSessionProbeAt < 30_000) return null;
    lastPageSessionProbeAt = Date.now();
    const response = await chrome.runtime.sendMessage({ type: "READ_JARVIS_SESSION" }).catch(() => null);
    if (!response?.ok) return null;
    const { email, userName, displayName } = response.session || {};
    log("Jarvis-Benutzer aus der Mendix-Sitzung gelesen");
    return { email: String(email || "").toLowerCase(), displayName: displayName || "", jarvisUserName: userName || email || "" };
  }

  /**
   * The Mendix session often only knows the user name ("nschauer"). The e-mail shown in the Jarvis profile menu
   * is a second, reliable identifier, so it is read as well (open menu, or the menu is opened once and closed again).
   */
  let emailProbeAttempted = false;
  async function enrichIdentityWithEmail(identity) {
    if (!identity || identity.email) return identity;
    const merge = (found) => ({
      email: found.email,
      displayName: found.displayName || identity.displayName || "",
      jarvisUserName: identity.jarvisUserName || "",
    });
    const live = readJarvisIdentity({ preferLive: true });
    if (live?.email) return merge(live);
    if (emailProbeAttempted) return identity;
    const active = document.activeElement;
    if (document.visibilityState !== "visible" || (active instanceof HTMLElement && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)))) return identity;
    const profileButton = findJarvisProfileButton();
    if (!profileButton) return identity;
    emailProbeAttempted = true;
    const wasOpen = profileButton.getAttribute("aria-expanded") === "true";
    if (!wasOpen) profileButton.click();
    await new Promise((resolve) => window.setTimeout(resolve, 600));
    const found = readJarvisIdentity({ preferLive: true });
    if (!wasOpen && profileButton.isConnected && profileButton.getAttribute("aria-expanded") !== "false") profileButton.click();
    return found?.email ? merge(found) : identity;
  }

  // Without a recognised Jarvis user the scans must not run forever: back off 15 s, 30 s ... up to 5 min.
  let identityFailures = 0;
  let identityBackoffUntil = 0;
  function noteIdentityFailure() {
    identityFailures += 1;
    identityBackoffUntil = Date.now() + Math.min(300_000, 15_000 * 2 ** Math.min(identityFailures - 1, 5));
  }

  async function verifyJarvisIdentity({ showPrompt = true, preferLive = false } = {}) {
    if (identityVerificationPending) return false;
    if (!showPrompt && !preferLive && Date.now() < identityBackoffUntil) return false;
    // Jarvis renders the account popover asynchronously. Keep a previously
    // verified device identity when the live popover is not available yet.
    let identity = readJarvisIdentity({ preferLive })
      || (preferLive ? jarvisSessionIdentity : null)
      || await readJarvisSessionFromPage();
    if (!identity) {
      log("Kein Jarvis-Profil erkannt; Backend-Aufruf wird noch nicht gestartet.");
      noteIdentityFailure();
      verifiedUser = null;
      identityToken = "";
      employeeNode.textContent = "Jarvis-Profil nicht erkannt";
      if (showPrompt) {
        notice.textContent = "Bitte oben rechts einmal dein Jarvis-Profil öffnen. Danach wird deine SSO-Identität automatisch übernommen.";
        notice.classList.add("open");
      }
      return false;
    }

    if ((identity.email || identity.jarvisUserName) === lastRejectedEmail && Date.now() - lastRejectedAt < 30_000 && !showPrompt) return false;

    identityVerificationPending = true;
    identity = await enrichIdentityWithEmail(identity).catch(() => identity);
    const response = await chrome.runtime.sendMessage({ type: "VERIFY_JARVIS_IDENTITY", identity })
      .catch(() => null)
      .finally(() => { identityVerificationPending = false; });
    log("Identitätsprüfung beendet", { ok: Boolean(response?.ok), message: response?.message || "" });
    if (!response?.ok) {
      verifiedUser = null;
      identityToken = "";
      lastRejectedEmail = identity.email || identity.jarvisUserName || "";
      lastRejectedAt = Date.now();
      noteIdentityFailure();
      employeeNode.textContent = identity.email || identity.jarvisUserName || "Jarvis-Benutzer";
      const keyProblem = /application key/i.test(String(response?.message || ""));
      showNotice(keyProblem
        ? "Der App-Schlüssel auf diesem PC fehlt oder ist veraltet. Bitte den aktuellen Schlüssel eintragen (oder von der IT zentral verteilen lassen)."
        : (response?.message || "Jarvis-Benutzer konnte nicht verifiziert werden."), { withSettings: keyProblem });
      return false;
    }

    identityFailures = 0;
    identityBackoffUntil = 0;
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
      // Close the menu only when it is still open; a click on a closed menu would reopen it.
      if (profileButtonUsedForProbe.isConnected && profileButtonUsedForProbe.getAttribute("aria-expanded") !== "false") profileButtonUsedForProbe.click();
      profileButtonUsedForProbe = null;
    }
    renderVerifiedEmployee();
    notice.classList.remove("open");
    // Patrick Brode receives the configured passwordless admin access as soon
    // as the Jarvis identity has been verified.
    renderTabs();
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
    const response = await chrome.runtime.sendMessage({ type: "GET_JARVIS_STAFFING", identityToken }).catch(() => null);
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

  // Single place for the window size: panel class, button label and persisted state stay in sync.
  function setWindowExpanded(expanded) {
    panel.classList.toggle("expanded", expanded);
    const label = expanded ? "Fenster verkleinern" : "Fenster vergroessern";
    expandButton.title = label;
    expandButton.setAttribute("aria-label", label);
    void chrome.storage.local.set({ odinGoWindowExpanded: expanded });
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
      // The app restarts with a collapsed button; tell it the real window state.
      event.source?.postMessage({ type: "ODIN_GO_EXPAND_STATE", expanded: panel.classList.contains("expanded") }, event.origin);
      event.source?.postMessage({ type: "ODIN_GO_PANEL_VISIBLE", visible: backdrop.classList.contains("open") }, event.origin);
      return;
    }
    if (event.data.type === "ODIN_GO_CLOSE") {
      setWorkspaceOpen(false);
      return;
    }
    if (event.data.type === "ODIN_GO_TOGGLE_EXPAND") {
      setWindowExpanded(event.data.expanded === true);
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
    return; // fixed placement in the bottom navigation: no dragging
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

  launcher.addEventListener("click", () => {
    if (suppressLauncherClick) return;
    void openWorkspace();
  });
  closeButton.addEventListener("click", () => setWorkspaceOpen(false));
  offlineFallbackClose.addEventListener("click", () => setWorkspaceOpen(false));
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) setWorkspaceOpen(false); });
  optionsButton.addEventListener("click", () => chrome.runtime.sendMessage({ type: "OPEN_OPTIONS" }));
  expandButton.addEventListener("click", () => setWindowExpanded(!panel.classList.contains("expanded")));

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
  chrome.storage.local.get("odinGoWindowExpanded").then((saved) => {
    if (saved?.odinGoWindowExpanded === true) setWindowExpanded(true);
  }).catch(() => {});
  void restoreSavedJarvisIdentity();
  window.setTimeout(performOneTimeProfileProbe, 900);
  // Jarvis is a DOM-heavy single-page app. Everything below runs on its main
  // thread, so the identity scans must stay rare and must never run inside a
  // click handler: they walk thousands of nodes and force layout.
  const IDENTITY_SCAN_MIN_INTERVAL_MS = 5_000;
  let identityVerificationTimer = null;
  let lastIdentityScanAt = 0;
  function scheduleIdentityVerification(delay = 700) {
    if (identityToken || identityVerificationTimer) return;
    const sinceLastScan = Date.now() - lastIdentityScanAt;
    const wait = Math.max(delay, IDENTITY_SCAN_MIN_INTERVAL_MS - sinceLastScan);
    identityVerificationTimer = window.setTimeout(() => {
      identityVerificationTimer = null;
      if (identityToken) return;
      lastIdentityScanAt = Date.now();
      // Run when the page is idle so a click in Jarvis is never queued behind the scan.
      const run = () => void verifyJarvisIdentity({ showPrompt: false });
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 2_000 });
      else run();
    }, wait);
  }
  // Jarvis mutates its DOM constantly; once verified the observer is pointless.
  const identityObserver = new MutationObserver(() => {
    if (identityToken) {
      identityObserver.disconnect();
      return;
    }
    scheduleIdentityVerification();
  });
  identityObserver.observe(document.body, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (identityToken) return;
    // The profile button sits in the top-right corner: ignore every other click
    // without touching the DOM, and defer the lookup out of the click handler.
    if (event.clientY > 90 || event.clientX < window.innerWidth * 0.72) return;
    const target = event.target;
    window.setTimeout(() => {
      const profileButton = findJarvisProfileButton();
      if (profileButton && target instanceof Node && (target === profileButton || profileButton.contains(target))) {
        preferLiveProfileIdentity = true;
        window.setTimeout(() => {
          if (!preferLiveProfileIdentity) return;
          preferLiveProfileIdentity = false;
          void verifyJarvisIdentity({ showPrompt: false, preferLive: true });
        }, 550);
        return;
      }
      scheduleIdentityVerification(150);
    }, 0);
  }, { passive: true });
  window.setInterval(() => {
    if (identityToken || document.visibilityState !== "visible") return;
    void verifyJarvisIdentity({ showPrompt: false });
    performOneTimeProfileProbe();
  }, 10_000);
  window.setInterval(() => {
    if (document.visibilityState === "visible") void loadJarvisNotifications();
  }, 15_000);
  window.addEventListener("focus", () => {
    if (identityToken) void loadJarvisNotifications();
    else scheduleIdentityVerification(0);
  }, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void loadJarvisNotifications();
  });
  positionLauncher();
  let resizeFrame = 0;
  window.addEventListener('resize', () => {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      positionLauncher();
    });
  }, { passive: true });
  window.setTimeout(positionLauncher, 2000);
  window.setTimeout(positionLauncher, 7000);
  window.setTimeout(positionLauncher, 15000);
  // The Jarvis page is a single-page app: keep the entry next to "Priority List" after navigation.
  window.setInterval(() => { if (document.visibilityState === "visible" && !backdrop.classList.contains("open")) positionLauncher(); }, 4000);
})();
