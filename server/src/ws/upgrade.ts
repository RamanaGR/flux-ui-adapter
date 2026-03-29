import { IncomingMessage } from "node:http";
import { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuidv4 } from "uuid";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";
import { createSession } from "../storage/sqlite.js";
import { handleConnection } from "./connection.js";

export const connections = new Map<string, WebSocket>();
export let wss: WebSocketServer;

export function createWss(): WebSocketServer {
  wss = new WebSocketServer({ noServer: true });
  return wss;
}

export function handleUpgrade(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
): void {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const apiKey = request.headers["x-api-key"] ?? url.searchParams.get("apiKey");

  if (!apiKey || apiKey !== config.apiKey) {
    logger.warn(
      { ip: request.socket.remoteAddress },
      "WebSocket upgrade rejected: invalid API key",
    );
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    const sessionId =
      (request.headers["x-session-id"] as string) ?? url.searchParams.get("sessionId") ?? uuidv4();

    connections.set(sessionId, ws);
    createSession(sessionId);

    logger.info(
      { sessionId, ip: request.socket.remoteAddress },
      "WebSocket connection established",
    );

    handleConnection(ws, sessionId);
  });
}

export function getActiveConnectionCount(): number {
  return connections.size;
}

export function sendToSession(sessionId: string, data: string | Buffer): boolean {
  const ws = connections.get(sessionId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(data);
    return true;
  }
  return false;
}

export function broadcastToAll(data: string | Buffer): void {
  for (const [, ws] of connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}
