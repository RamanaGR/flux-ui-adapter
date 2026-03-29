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
      --red: #f87171;
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
    .counter-screenshots { color: var(--green); background: var(--green-dim); }

    .controls { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 1rem; background: var(--surface); border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .btn { background: var(--surface2); color: var(--text); border: 1px solid var(--border); padding: 0.3rem 0.7rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.7rem; font-family: inherit; font-weight: 500; transition: all 0.15s; }
    .btn:hover { border-color: var(--accent); color: var(--accent); }
    .btn.active { background: var(--accent-dim); border-color: var(--accent); color: var(--accent); }
    .btn-danger:hover { border-color: var(--red); color: var(--red); }
    .controls-spacer { flex: 1; }
    .controls-label { font-size: 0.65rem; color: var(--muted); }

    .ss-panel { flex: 1; overflow-y: auto; padding: 1rem; }
    .ss-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; }
    .ss-card { background: var(--surface); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; cursor: pointer; transition: border-color 0.15s, transform 0.15s; }
    .ss-card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .ss-card.live-flash { animation: flash 0.6s ease-out; }
    @keyframes flash { 0% { background: rgba(167,139,250,0.25); } 100% { background: transparent; } }
    .ss-card img { width: 100%; height: 150px; object-fit: cover; display: block; background: var(--bg); }
    .ss-card-info { padding: 0.4rem 0.6rem; display: flex; justify-content: space-between; align-items: center; }
    .ss-card-seq { font-size: 0.68rem; color: var(--accent); font-weight: 600; }
    .ss-card-time { font-size: 0.6rem; color: var(--muted); }
    .ss-card-size { font-size: 0.58rem; color: var(--muted); }
    .ss-empty { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--muted); font-size: 0.8rem; }

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
    <span class="counter-badge counter-screenshots" id="screenshotCounter">0 screenshots</span>
  </div>

  <div class="controls">
    <button class="btn active" id="btnLive">Live</button>
    <button class="btn btn-danger" id="btnClear">Clear</button>
    <div class="controls-spacer"></div>
    <span class="controls-label" id="sessionStatus"></span>
  </div>

  <div class="ss-panel">
    <div class="ss-grid" id="ssGrid">
      <div class="loading-state" id="loadingState"><div class="spinner"></div><span>Connecting to session...</span></div>
    </div>
  </div>

  <div class="lightbox" id="lightbox">
    <button class="lightbox-close" id="lightboxClose">&times;</button>
    <img id="lightboxImg" src="" alt="Screenshot">
    <div class="lightbox-meta" id="lightboxMeta"></div>
  </div>

  <script>
    var SESSION_ID = "${sessionId}";
    var WS_URL = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/viewer/" + SESSION_ID;

    var state = {
      screenshots: [],
      live: true, pauseQueue: [],
      ws: null, reconnectDelay: 1000, reconnectTimer: null,
    };

    var $loadingState = document.getElementById("loadingState");
    var $statusDot = document.getElementById("statusDot");
    var $statusLabel = document.getElementById("statusLabel");
    var $screenshotCounter = document.getElementById("screenshotCounter");
    var $btnLive = document.getElementById("btnLive");
    var $btnClear = document.getElementById("btnClear");
    var $sessionStatus = document.getElementById("sessionStatus");
    var $ssGrid = document.getElementById("ssGrid");
    var $lightbox = document.getElementById("lightbox");
    var $lightboxImg = document.getElementById("lightboxImg");
    var $lightboxMeta = document.getElementById("lightboxMeta");

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
      if ($loadingState) $loadingState.remove();
      if (msg.session) {
        var s = msg.session;
        $sessionStatus.textContent = "Status: " + s.status + " | Started: " + new Date(s.created_at).toLocaleTimeString();
      }
      if (msg.screenshots) {
        for (var j = 0; j < msg.screenshots.length; j++) addScreenshot(msg.screenshots[j], false);
      }
      updateScreenshotCounter();
    }

    function handleLiveScreenshot(msg) {
      var entry = { seq: msg.seq, sizeBytes: msg.sizeBytes, url: msg.url, createdAt: msg.createdAt };
      if (state.live) {
        addScreenshot(entry, true);
        updateScreenshotCounter();
      } else { state.pauseQueue.push(entry); }
    }

    function addScreenshot(entry, isLive) {
      state.screenshots.push(entry);
      var ssEmpty = document.getElementById("ssEmpty");
      if (ssEmpty) ssEmpty.remove();
      var imgUrl = "/session/" + SESSION_ID + "/screenshots/" + entry.seq;
      var time = new Date(entry.createdAt).toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
      var sizeKb = entry.sizeBytes ? Math.round(entry.sizeBytes / 1024) + "KB" : "";
      var card = document.createElement("div");
      card.className = "ss-card" + (isLive ? " live-flash" : "");
      card.innerHTML = '<img src="' + imgUrl + '" alt="Screenshot #' + entry.seq + '" loading="lazy"><div class="ss-card-info"><span class="ss-card-seq">#' + entry.seq + '</span><span class="ss-card-time">' + time + '</span><span class="ss-card-size">' + sizeKb + '</span></div>';
      card.addEventListener("click", function() { openLightbox(imgUrl, entry, time); });
      $ssGrid.appendChild(card);
    }

    function updateScreenshotCounter() { var n = state.screenshots.length; $screenshotCounter.textContent = n + " screenshot" + (n !== 1 ? "s" : ""); }

    function openLightbox(imgUrl, entry, time) {
      $lightboxImg.src = imgUrl;
      $lightboxMeta.textContent = "#" + entry.seq + " — " + time + (entry.url ? " — " + entry.url : "");
      $lightbox.classList.add("open");
    }
    document.getElementById("lightboxClose").addEventListener("click", function() { $lightbox.classList.remove("open"); });
    $lightbox.addEventListener("click", function(e) { if (e.target === $lightbox) $lightbox.classList.remove("open"); });
    document.addEventListener("keydown", function(e) { if (e.key === "Escape") $lightbox.classList.remove("open"); });

    $btnLive.addEventListener("click", function() {
      state.live = !state.live;
      this.classList.toggle("active", state.live);
      this.textContent = state.live ? "Live" : "Paused";
      if (state.live) {
        state.pauseQueue.forEach(function(entry) { addScreenshot(entry, true); });
        state.pauseQueue = [];
        updateScreenshotCounter();
      }
    });
    $btnClear.addEventListener("click", function() {
      state.screenshots = [];
      $ssGrid.innerHTML = '<div class="ss-empty" id="ssEmpty">No screenshots yet. Press Cmd+Shift+6 in the extension to start capture.</div>';
      updateScreenshotCounter();
    });

    function escapeHtml(str) { var d = document.createElement("div"); d.textContent = str; return d.innerHTML; }

    connect();
  </script>
</body>
</html>`;
}
