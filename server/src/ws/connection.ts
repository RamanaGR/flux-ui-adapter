import { WebSocket } from "ws";
import { childLogger } from "../lib/logger.js";
import { config } from "../config.js";
import { completeSession } from "../storage/sqlite.js";
import { startHeartbeat, stopHeartbeat } from "./heartbeat.js";
import { connections } from "./upgrade.js";
import { routeMessage, resetSeq } from "./router.js";
import { MessageType, UiConfigSchema, type UiConfig } from "../schemas/messages.js";

const log = childLogger({ module: "connection" });

export function handleConnection(ws: WebSocket, sessionId: string): void {
  startHeartbeat(ws, sessionId, () => {
    teardown(ws, sessionId, "heartbeat_timeout");
  });

  sendCaptureConfig(ws, sessionId);

  ws.on("message", (data, isBinary) => {
    routeMessage(ws, sessionId, data, isBinary);
  });

  ws.on("close", (code, reason) => {
    log.info(
      { sessionId, code, reason: reason.toString("utf-8") },
      "WebSocket closed",
    );
    teardown(ws, sessionId, "client_close");
  });

  ws.on("error", (err) => {
    log.error({ sessionId, err }, "WebSocket error");
    teardown(ws, sessionId, "error");
  });
}

function teardown(ws: WebSocket, sessionId: string, reason: string): void {
  stopHeartbeat(sessionId);
  connections.delete(sessionId);
  resetSeq(sessionId);
  completeSession(sessionId);
  log.info({ sessionId, reason }, "Session completed");

  if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
    ws.terminate();
  }
}

export function sendConfigUpdate(sessionId: string, cfg: Omit<UiConfig, "type">): boolean {
  const ws = connections.get(sessionId);
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;

  const message: UiConfig = { type: MessageType.UI_CONFIG, ...cfg };
  UiConfigSchema.parse(message);
  ws.send(JSON.stringify(message));
  log.info({ sessionId }, "UI config sent");
  return true;
}

function sendCaptureConfig(ws: WebSocket, sessionId: string): void {
  const message = {
    type: MessageType.UI_CONFIG,
    settings: {
      screenshotsEnabled: config.screenshotsEnabled,
      screenshotIntervalMs: config.screenshotIntervalMs,
    },
  };
  ws.send(JSON.stringify(message));
  log.info({ sessionId, ...message.settings }, "Capture config sent");
}
