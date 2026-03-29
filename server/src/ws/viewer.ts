import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { getDb, isDbOpen } from "../storage/sqlite.js";
import {
  subscribeScreenshots, unsubscribeScreenshots, type ScreenshotEvent,
} from "../lib/event-bus.js";
import { logger } from "../lib/logger.js";

let viewerWss: WebSocketServer;

export function createViewerWss(): WebSocketServer {
  viewerWss = new WebSocketServer({ noServer: true });
  return viewerWss;
}

export function handleViewerUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const pathParts = url.pathname.split("/").filter(Boolean);

  if (pathParts.length < 2 || pathParts[0] !== "viewer") {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  const sessionId = pathParts[1];

  viewerWss.handleUpgrade(request, socket, head, (ws) => {
    logger.info({ sessionId, ip: request.socket.remoteAddress }, "Viewer connected");
    handleViewerConnection(ws, sessionId);
  });
}

function handleViewerConnection(ws: WebSocket, sessionId: string): void {
  sendHistory(ws, sessionId);

  const screenshotListener = (event: ScreenshotEvent) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      type: "LIVE_SCREENSHOT",
      sessionId: event.sessionId,
      seq: event.seq,
      url: event.url,
      sizeBytes: event.sizeBytes,
      width: event.width,
      height: event.height,
      createdAt: event.createdAt,
    }));
  };

  subscribeScreenshots(sessionId, screenshotListener);

  ws.on("close", () => {
    unsubscribeScreenshots(sessionId, screenshotListener);
    logger.info({ sessionId }, "Viewer disconnected");
  });

  ws.on("error", () => {
    unsubscribeScreenshots(sessionId, screenshotListener);
  });
}

function sendHistory(ws: WebSocket, sessionId: string): void {
  if (!isDbOpen()) {
    ws.send(JSON.stringify({ type: "HISTORY", screenshots: [], session: null }));
    return;
  }

  const db = getDb();

  const session = db
    .prepare("SELECT id, status, created_at, completed_at FROM sessions WHERE id = ?")
    .get(sessionId) as
    | { id: string; status: string; created_at: number; completed_at: number | null }
    | undefined;

  const ssRows = db
    .prepare("SELECT seq, file_path, size_bytes, created_at FROM canvas_snapshots WHERE session_id = ? ORDER BY seq ASC")
    .all(sessionId) as Array<{ seq: number; file_path: string; size_bytes: number; created_at: number }>;

  const screenshots = ssRows.map((r) => ({
    seq: r.seq,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  }));

  ws.send(JSON.stringify({
    type: "HISTORY",
    session: session ?? null,
    screenshots,
  }));
}
