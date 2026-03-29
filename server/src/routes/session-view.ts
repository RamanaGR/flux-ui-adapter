import { FastifyInstance } from "fastify";
import { getDb, isDbOpen } from "../storage/sqlite.js";

export async function sessionViewRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { sessionId: string } }>(
    "/session/:sessionId/view",
    async (request, reply) => {
      const { sessionId } = request.params;

      if (!isDbOpen()) {
        return reply.status(503).send("Database unavailable");
      }

      const db = getDb();

      const session = db
        .prepare("SELECT id, status, created_at, completed_at FROM sessions WHERE id = ?")
        .get(sessionId) as
        | { id: string; status: string; created_at: number; completed_at: number | null }
        | undefined;

      if (!session) {
        return reply.status(404).send("Session not found");
      }

      const html = renderLiveViewPage(sessionId);
      return reply.type("text/html").send(html);
    },
  );
}

function renderLiveViewPage(sessionId: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live View — ${sessionId.slice(0, 8)}</title>
  <style>
    :root {
      --bg: #0a0e1a; --surface: #131825; --surface2: #1a2035;
      --text: #e2e8f0; --muted: #64748b;
      --accent: #a78bfa; --accent-dim: rgba(167,139,250,0.15);
      --border: #1e293b;
      --green: #34d399; --green-dim: rgba(52,211,153,0.12);
      --red: #f87171; --red-dim: rgba(248,113,113,0.12);
      --blue: #60a5fa; --blue-dim: rgba(96,165,250,0.12);
      --orange: #fb923c; --orange-dim: rgba(251,146,60,0.12);
      --yellow: #fbbf24;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'SF Mono','Cascadia Code','Fira Code','JetBrains Mono',monospace; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    .topbar { display: flex; align-items: center; gap: 1rem; padding: 0.6rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .topbar-title { font-size: 0.8rem; font-weight: 700; color: var(--accent); }
    .topbar-session { font-size: 0.7rem; color: var(--muted); }
    .topbar-session code { color: var(--text); font-size: 0.7rem; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--red); flex-shrink: 0; transition: background 0.3s; }
    .status-dot.connected { background: var(--green); box-shadow: 0 0 6px var(--green); }
    .status-label { font-size: 0.7rem; color: var(--muted); }
    .topbar-spacer { flex: 1; }
    .counter-badge { font-size: 0.72rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 0.25rem; }
    .counter-mutations { color: var(--accent); background: var(--accent-dim); }
    .counter-screenshots { color: var(--green); background: var(--green-dim); }

    /* Tabs */
    .tab-bar { display: flex; background: var(--surface); border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .tab-btn { padding: 0.5rem 1.2rem; font-size: 0.72rem; font-family: inherit; font-weight: 600; color: var(--muted); background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer; transition: all 0.15s; }
    .tab-btn:hover { color: var(--text); }
    .tab-btn.active { color: var(--accent); border-bottom-color: var(--accent); }
    .tab-controls { display: flex; align-items: center; gap: 0.5rem; padding: 0 1rem; margin-left: auto; }

    /* Controls */
    .controls { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .btn { background: var(--surface2); color: var(--text); border: 1px solid var(--border); padding: 0.3rem 0.7rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.7rem; font-family: inherit; font-weight: 500; transition: all 0.15s; }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
    .btn-danger:hover { border-color: var(--red); color: var(--red); }
    .divider { width: 1px; height: 20px; background: var(--border); }
    .filter-group { display: flex; gap: 0.3rem; }
    .filter-btn { font-size: 0.65rem; padding: 0.2rem 0.5rem; }
    .filter-btn.type-childList { color: var(--green); }
    .filter-btn.type-childList.active { background: var(--green-dim); border-color: var(--green); }
    .filter-btn.type-attributes { color: var(--blue); }
    .filter-btn.type-attributes.active { background: var(--blue-dim); border-color: var(--blue); }
    .filter-btn.type-characterData { color: var(--orange); }
    .filter-btn.type-characterData.active { background: var(--orange-dim); border-color: var(--orange); }
    .controls-spacer { flex: 1; }
    .controls-label { font-size: 0.65rem; color: var(--muted); }

    /* Tab panels */
    .tab-panel { display: none; flex: 1; overflow: hidden; }
    .tab-panel.active { display: flex; }

    /* Mutations panel */
    .main { display: flex; flex: 1; overflow: hidden; }
    .timeline { width: 380px; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
    .timeline-header { padding: 0.5rem 0.75rem; border-bottom: 1px solid var(--border); font-size: 0.7rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .timeline-list { flex: 1; overflow-y: auto; overflow-x: hidden; }
    .timeline-list::-webkit-scrollbar { width: 4px; }
    .timeline-list::-webkit-scrollbar-track { background: transparent; }
    .timeline-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .tl-item { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.45rem 0.75rem; border-bottom: 1px solid rgba(30,41,59,0.5); cursor: pointer; transition: background 0.1s; font-size: 0.7rem; }
    .tl-item:hover { background: var(--surface2); }
    .tl-item.selected { background: var(--accent-dim); }
    .tl-item.live-flash { animation: flash 0.4s ease-out; }
    @keyframes flash { 0% { background: rgba(167,139,250,0.25); } 100% { background: transparent; } }
    .tl-seq { color: var(--accent); font-weight: 700; min-width: 36px; text-align: right; flex-shrink: 0; }
    .tl-body { flex: 1; min-width: 0; }
    .tl-target { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; font-size: 0.68rem; }
    .tl-meta { display: flex; gap: 0.4rem; align-items: center; margin-top: 2px; }
    .tl-badge { font-size: 0.58rem; padding: 1px 5px; border-radius: 3px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
    .tl-badge.childList { background: var(--green-dim); color: var(--green); }
    .tl-badge.attributes { background: var(--blue-dim); color: var(--blue); }
    .tl-badge.characterData { background: var(--orange-dim); color: var(--orange); }
    .tl-time { font-size: 0.6rem; color: var(--muted); }
    .tl-count { font-size: 0.58rem; color: var(--muted); margin-left: auto; }

    .detail { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
    .detail-header { padding: 0.5rem 1rem; border-bottom: 1px solid var(--border); font-size: 0.7rem; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    .detail-body { flex: 1; overflow-y: auto; padding: 1rem; }
    .detail-body::-webkit-scrollbar { width: 4px; }
    .detail-body::-webkit-scrollbar-track { background: transparent; }
    .detail-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
    .detail-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); font-size: 0.8rem; }
    .detail-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 0.75rem; }
    .detail-card-header { padding: 0.5rem 0.75rem; background: var(--surface2); border-bottom: 1px solid var(--border); font-size: 0.7rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
    .detail-card-body { padding: 0.75rem; }
    .detail-row { display: flex; gap: 0.5rem; margin-bottom: 0.4rem; font-size: 0.7rem; }
    .detail-label { color: var(--muted); min-width: 80px; flex-shrink: 0; }
    .detail-value { color: var(--text); word-break: break-all; }
    .html-block { background: var(--bg); border: 1px solid var(--border); border-radius: 4px; padding: 0.5rem; margin-top: 0.4rem; font-size: 0.65rem; line-height: 1.5; overflow-x: auto; white-space: pre-wrap; word-break: break-word; max-height: 200px; overflow-y: auto; }
    .html-block.added { border-left: 3px solid var(--green); }
    .html-block.removed { border-left: 3px solid var(--red); }
    .attr-old { color: var(--red); }
    .attr-new { color: var(--green); }
    .url-display { font-size: 0.68rem; color: var(--blue); margin-bottom: 0.75rem; padding: 0.4rem 0.6rem; background: var(--blue-dim); border-radius: 4px; word-break: break-all; }

    /* Screenshots panel */
    .ss-panel { flex: 1; overflow-y: auto; padding: 1rem; }
    .ss-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; }
    .ss-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
    .ss-card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .ss-card.live-flash { animation: flash 0.6s ease-out; }
    .ss-card img { width: 100%; height: 150px; object-fit: cover; display: block; background: var(--bg); }
    .ss-card-info { padding: 0.4rem 0.6rem; display: flex; justify-content: space-between; align-items: center; }
    .ss-card-seq { font-size: 0.68rem; color: var(--accent); font-weight: 600; }
    .ss-card-time { font-size: 0.6rem; color: var(--muted); }
    .ss-card-size { font-size: 0.58rem; color: var(--muted); }
    .ss-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); font-size: 0.8rem; }

    /* Lightbox */
    .lightbox { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.9); z-index: 1000; align-items: center; justify-content: center; flex-direction: column; }
    .lightbox.open { display: flex; }
    .lightbox img { max-width: 95vw; max-height: 85vh; object-fit: contain; border-radius: 4px; }
    .lightbox-close { position: absolute; top: 1rem; right: 1rem; background: var(--surface2); color: var(--text); border: 1px solid var(--border); width: 36px; height: 36px; border-radius: 50%; cursor: pointer; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; }
    .lightbox-close:hover { border-color: var(--red); color: var(--red); }
    .lightbox-meta { margin-top: 0.75rem; font-size: 0.7rem; color: var(--muted); text-align: center; }

    .loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; gap: 0.75rem; color: var(--muted); }
    .spinner { width: 24px; height: 24px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>

  <div class="topbar">
    <span class="topbar-title">ChromaBridge Live</span>
    <div class="status-dot" id="statusDot"></div>
    <span class="status-label" id="statusLabel">Connecting...</span>
    <span class="topbar-session">Session: <code>${sessionId}</code></span>
    <div class="topbar-spacer"></div>
    <span class="counter-badge counter-mutations" id="mutationCounter">0 mutations</span>
    <span class="counter-badge counter-screenshots" id="screenshotCounter">0 screenshots</span>
  </div>

  <div class="tab-bar">
    <button class="tab-btn active" data-tab="mutations">Mutations</button>
    <button class="tab-btn" data-tab="screenshots">Screenshots</button>
    <div class="tab-controls">
      <button class="btn active" id="btnAutoScroll">Auto-scroll</button>
      <button class="btn active" id="btnLive">Live</button>
      <button class="btn btn-danger" id="btnClear">Clear</button>
    </div>
  </div>

  <div class="controls" id="mutationControls">
    <span class="controls-label">Filter:</span>
    <div class="filter-group">
      <button class="btn filter-btn type-childList active" data-type="childList">childList</button>
      <button class="btn filter-btn type-attributes active" data-type="attributes">attributes</button>
      <button class="btn filter-btn type-characterData active" data-type="characterData">characterData</button>
    </div>
    <div class="controls-spacer"></div>
    <span class="controls-label" id="sessionStatus"></span>
  </div>

  <!-- Mutations panel -->
  <div class="tab-panel active" id="panelMutations">
    <div class="main">
      <div class="timeline">
        <div class="timeline-header">Timeline</div>
        <div class="timeline-list" id="timelineList">
          <div class="loading-state" id="loadingState"><div class="spinner"></div><span>Connecting to session...</span></div>
        </div>
      </div>
      <div class="detail">
        <div class="detail-header">Mutation Detail</div>
        <div class="detail-body" id="detailBody">
          <div class="detail-empty" id="detailEmpty">Select a mutation from the timeline</div>
        </div>
      </div>
    </div>
  </div>

  <!-- Screenshots panel -->
  <div class="tab-panel" id="panelScreenshots">
    <div class="ss-panel">
      <div class="ss-grid" id="ssGrid">
        <div class="ss-empty" id="ssEmpty">No screenshots yet. Press Cmd+Shift+6 in the extension to start capture.</div>
      </div>
    </div>
  </div>

  <!-- Lightbox -->
  <div class="lightbox" id="lightbox">
    <button class="lightbox-close" id="lightboxClose">&times;</button>
    <img id="lightboxImg" src="" alt="Screenshot">
    <div class="lightbox-meta" id="lightboxMeta"></div>
  </div>

  <script>
    const SESSION_ID = "${sessionId}";
    const WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/viewer/" + SESSION_ID;

    const state = {
      mutations: [], screenshots: [],
      selectedIndex: -1, activeTab: "mutations",
      autoScroll: true, live: true, pauseQueue: [],
      filters: { childList: true, attributes: true, characterData: true },
      ws: null, reconnectDelay: 1000, reconnectTimer: null,
    };

    const $timelineList = document.getElementById("timelineList");
    const $loadingState = document.getElementById("loadingState");
    const $detailBody = document.getElementById("detailBody");
    const $detailEmpty = document.getElementById("detailEmpty");
    const $statusDot = document.getElementById("statusDot");
    const $statusLabel = document.getElementById("statusLabel");
    const $mutationCounter = document.getElementById("mutationCounter");
    const $screenshotCounter = document.getElementById("screenshotCounter");
    const $btnAutoScroll = document.getElementById("btnAutoScroll");
    const $btnLive = document.getElementById("btnLive");
    const $btnClear = document.getElementById("btnClear");
    const $sessionStatus = document.getElementById("sessionStatus");
    const $ssGrid = document.getElementById("ssGrid");
    const $ssEmpty = document.getElementById("ssEmpty");
    const $lightbox = document.getElementById("lightbox");
    const $lightboxImg = document.getElementById("lightboxImg");
    const $lightboxMeta = document.getElementById("lightboxMeta");
    const $mutationControls = document.getElementById("mutationControls");

    // ---- Tabs ----
    document.querySelectorAll(".tab-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        document.querySelectorAll(".tab-btn").forEach(function(b) { b.classList.remove("active"); });
        document.querySelectorAll(".tab-panel").forEach(function(p) { p.classList.remove("active"); });
        this.classList.add("active");
        state.activeTab = this.dataset.tab;
        document.getElementById("panel" + state.activeTab.charAt(0).toUpperCase() + state.activeTab.slice(1)).classList.add("active");
        $mutationControls.style.display = state.activeTab === "mutations" ? "" : "none";
      });
    });

    // ---- WebSocket ----
    function connect() {
      if (state.ws && (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING)) return;
      state.ws = new WebSocket(WS_URL);
      state.ws.addEventListener("open", function() {
        $statusDot.classList.add("connected");
        $statusLabel.textContent = "Connected";
        state.reconnectDelay = 1000;
      });
      state.ws.addEventListener("message", function(event) {
        var msg = JSON.parse(event.data);
        if (msg.type === "HISTORY") handleHistory(msg);
        else if (msg.type === "LIVE_MUTATION") handleLiveMutation(msg);
        else if (msg.type === "LIVE_SCREENSHOT") handleLiveScreenshot(msg);
      });
      state.ws.addEventListener("close", function() {
        $statusDot.classList.remove("connected");
        $statusLabel.textContent = "Disconnected";
        scheduleReconnect();
      });
      state.ws.addEventListener("error", function() { if (state.ws) state.ws.close(); });
    }

    function scheduleReconnect() {
      if (state.reconnectTimer) return;
      $statusLabel.textContent = "Reconnecting in " + (state.reconnectDelay / 1000) + "s...";
      state.reconnectTimer = setTimeout(function() {
        state.reconnectTimer = null;
        state.reconnectDelay = Math.min(state.reconnectDelay * 2, 30000);
        connect();
      }, state.reconnectDelay);
    }

    function handleHistory(msg) {
      $loadingState?.remove();
      if (msg.session) {
        var s = msg.session;
        $sessionStatus.textContent = "Status: " + s.status + " | Started: " + new Date(s.created_at).toLocaleTimeString();
      }
      for (var i = 0; i < msg.mutations.length; i++) addMutation(msg.mutations[i], false);
      updateMutationCounter();
      if (msg.screenshots) {
        for (var j = 0; j < msg.screenshots.length; j++) addScreenshot(msg.screenshots[j], false);
      }
      updateScreenshotCounter();
      if (state.autoScroll) scrollToBottom();
    }

    function handleLiveMutation(msg) {
      var entry = { seq: msg.seq, payload: msg.payload, createdAt: msg.createdAt };
      if (state.live) {
        addMutation(entry, true);
        updateMutationCounter();
        if (state.autoScroll) scrollToBottom();
      } else { state.pauseQueue.push({ type: "mutation", data: entry }); }
    }

    function handleLiveScreenshot(msg) {
      var entry = { seq: msg.seq, sizeBytes: msg.sizeBytes, url: msg.url, createdAt: msg.createdAt };
      if (state.live) {
        addScreenshot(entry, true);
        updateScreenshotCounter();
      } else { state.pauseQueue.push({ type: "screenshot", data: entry }); }
    }

    // ---- Mutations ----
    function addMutation(entry, isLive) {
      state.mutations.push(entry);
      renderTimelineItem(state.mutations.length - 1, entry, extractTypes(entry.payload), isLive);
    }

    function extractTypes(payload) {
      if (!payload || !payload.mutations) return ["unknown"];
      var types = new Set();
      for (var i = 0; i < payload.mutations.length; i++) types.add(payload.mutations[i].type);
      return Array.from(types);
    }

    function renderTimelineItem(index, entry, types, isLive) {
      var el = document.createElement("div");
      el.className = "tl-item" + (isLive ? " live-flash" : "");
      el.dataset.index = index;
      el.dataset.types = types.join(",");
      var target = entry.payload?.mutations?.[0]?.target || "unknown";
      var mutCount = entry.payload?.mutations?.length || 0;
      var time = new Date(entry.createdAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      el.innerHTML = '<span class="tl-seq">#' + entry.seq + '</span><div class="tl-body"><span class="tl-target">' + escapeHtml(target) + '</span><div class="tl-meta">' + types.map(function(t) { return '<span class="tl-badge ' + t + '">' + t + '</span>'; }).join("") + '<span class="tl-time">' + time + '</span>' + (mutCount > 1 ? '<span class="tl-count">' + mutCount + ' changes</span>' : '') + '</div></div>';
      el.addEventListener("click", function() { selectMutation(index); });
      applyFilterVisibility(el);
      $timelineList.appendChild(el);
    }

    function selectMutation(index) {
      state.selectedIndex = index;
      $timelineList.querySelectorAll(".tl-item.selected").forEach(function(el) { el.classList.remove("selected"); });
      var items = $timelineList.querySelectorAll(".tl-item");
      if (items[index]) items[index].classList.add("selected");
      renderDetail(state.mutations[index]);
    }

    function scrollToBottom() { $timelineList.scrollTop = $timelineList.scrollHeight; }
    function updateMutationCounter() { var n = state.mutations.length; $mutationCounter.textContent = n + " mutation" + (n !== 1 ? "s" : ""); }
    function updateScreenshotCounter() { var n = state.screenshots.length; $screenshotCounter.textContent = n + " screenshot" + (n !== 1 ? "s" : ""); }

    function renderDetail(entry) {
      if (!entry) return;
      $detailBody.innerHTML = "";
      if (entry.payload?.url) {
        var urlDiv = document.createElement("div");
        urlDiv.className = "url-display";
        urlDiv.textContent = entry.payload.url;
        $detailBody.appendChild(urlDiv);
      }
      if (!entry.payload?.mutations) { $detailBody.innerHTML = '<div class="detail-empty">No mutation data</div>'; return; }
      entry.payload.mutations.forEach(function(mut, i) {
        var card = document.createElement("div"); card.className = "detail-card";
        var header = document.createElement("div"); header.className = "detail-card-header";
        header.innerHTML = '<span>Mutation #' + (i+1) + '</span><span class="tl-badge ' + mut.type + '">' + mut.type + '</span>';
        card.appendChild(header);
        var body = document.createElement("div"); body.className = "detail-card-body";
        addDetailRow(body, "Target", mut.target);
        if (mut.type === "attributes") {
          addDetailRow(body, "Attribute", mut.attributeName || "—");
          if (mut.oldValue != null) addDetailRow(body, "Old Value", '<span class="attr-old">' + escapeHtml(String(mut.oldValue)) + '</span>', true);
          if (mut.newValue != null) addDetailRow(body, "New Value", '<span class="attr-new">' + escapeHtml(String(mut.newValue)) + '</span>', true);
        }
        if (mut.type === "characterData") {
          if (mut.oldValue != null) addDetailRow(body, "Old Text", '<span class="attr-old">' + escapeHtml(String(mut.oldValue)) + '</span>', true);
          if (mut.newValue != null) addDetailRow(body, "New Text", '<span class="attr-new">' + escapeHtml(String(mut.newValue)) + '</span>', true);
        }
        if (mut.addedNodes && mut.addedNodes.length > 0) {
          var al = document.createElement("div"); al.className = "detail-row";
          al.innerHTML = '<span class="detail-label" style="color:var(--green)">+ Added (' + mut.addedNodes.length + ')</span>';
          body.appendChild(al);
          mut.addedNodes.forEach(function(h) { var b = document.createElement("pre"); b.className = "html-block added"; b.textContent = h; body.appendChild(b); });
        }
        if (mut.removedNodes && mut.removedNodes.length > 0) {
          var rl = document.createElement("div"); rl.className = "detail-row";
          rl.innerHTML = '<span class="detail-label" style="color:var(--red)">- Removed (' + mut.removedNodes.length + ')</span>';
          body.appendChild(rl);
          mut.removedNodes.forEach(function(h) { var b = document.createElement("pre"); b.className = "html-block removed"; b.textContent = h; body.appendChild(b); });
        }
        card.appendChild(body);
        $detailBody.appendChild(card);
      });
    }

    function addDetailRow(parent, label, value, isHtml) {
      var row = document.createElement("div"); row.className = "detail-row";
      row.innerHTML = '<span class="detail-label">' + label + '</span><span class="detail-value">' + (isHtml ? value : escapeHtml(String(value))) + '</span>';
      parent.appendChild(row);
    }

    // ---- Screenshots ----
    function addScreenshot(entry, isLive) {
      state.screenshots.push(entry);
      if ($ssEmpty) { $ssEmpty.remove(); }
      var imgUrl = "/session/" + SESSION_ID + "/screenshots/" + entry.seq;
      var time = new Date(entry.createdAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      var sizeKb = entry.sizeBytes ? Math.round(entry.sizeBytes / 1024) + "KB" : "";
      var card = document.createElement("div");
      card.className = "ss-card" + (isLive ? " live-flash" : "");
      card.innerHTML = '<img src="' + imgUrl + '" alt="Screenshot #' + entry.seq + '" loading="lazy"><div class="ss-card-info"><span class="ss-card-seq">#' + entry.seq + '</span><span class="ss-card-time">' + time + '</span><span class="ss-card-size">' + sizeKb + '</span></div>';
      card.addEventListener("click", function() { openLightbox(imgUrl, entry, time); });
      $ssGrid.appendChild(card);
    }

    // ---- Lightbox ----
    function openLightbox(imgUrl, entry, time) {
      $lightboxImg.src = imgUrl;
      $lightboxMeta.textContent = "#" + entry.seq + " — " + time + (entry.url ? " — " + entry.url : "");
      $lightbox.classList.add("open");
    }
    document.getElementById("lightboxClose").addEventListener("click", function() { $lightbox.classList.remove("open"); });
    $lightbox.addEventListener("click", function(e) { if (e.target === $lightbox) $lightbox.classList.remove("open"); });
    document.addEventListener("keydown", function(e) { if (e.key === "Escape") $lightbox.classList.remove("open"); });

    // ---- Filters ----
    function applyFilterVisibility(el) {
      var types = (el.dataset.types || "").split(",");
      el.style.display = types.some(function(t) { return state.filters[t]; }) ? "" : "none";
    }
    function reapplyFilters() { $timelineList.querySelectorAll(".tl-item").forEach(applyFilterVisibility); }

    // ---- Controls ----
    $btnAutoScroll.addEventListener("click", function() {
      state.autoScroll = !state.autoScroll;
      this.classList.toggle("active", state.autoScroll);
      if (state.autoScroll) scrollToBottom();
    });
    $btnLive.addEventListener("click", function() {
      state.live = !state.live;
      this.classList.toggle("active", state.live);
      this.textContent = state.live ? "Live" : "Paused";
      if (state.live) {
        state.pauseQueue.forEach(function(item) {
          if (item.type === "mutation") { addMutation(item.data, true); }
          else if (item.type === "screenshot") { addScreenshot(item.data, true); }
        });
        state.pauseQueue = [];
        updateMutationCounter(); updateScreenshotCounter();
        if (state.autoScroll) scrollToBottom();
      }
    });
    $btnClear.addEventListener("click", function() {
      if (state.activeTab === "mutations") {
        state.mutations = []; state.selectedIndex = -1; $timelineList.innerHTML = "";
        $detailBody.innerHTML = '<div class="detail-empty">Select a mutation from the timeline</div>';
        updateMutationCounter();
      } else {
        state.screenshots = []; $ssGrid.innerHTML = '<div class="ss-empty">No screenshots yet.</div>';
        updateScreenshotCounter();
      }
    });
    document.querySelectorAll(".filter-btn").forEach(function(btn) {
      btn.addEventListener("click", function() {
        var type = this.dataset.type;
        state.filters[type] = !state.filters[type];
        this.classList.toggle("active", state.filters[type]);
        reapplyFilters();
      });
    });

    function escapeHtml(str) { var d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

    connect();
  </script>
</body>
</html>`;
}
