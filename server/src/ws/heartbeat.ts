import { WebSocket } from "ws";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

interface HeartbeatState {
  alive: boolean;
  interval: ReturnType<typeof setInterval>;
}

const heartbeats = new Map<string, HeartbeatState>();

export function startHeartbeat(
  ws: WebSocket,
  sessionId: string,
  onTimeout: () => void,
): void {
  const state: HeartbeatState = {
    alive: true,
    interval: setInterval(() => {
      if (!state.alive) {
        logger.warn({ sessionId }, "Heartbeat timeout — terminating connection");
        clearInterval(state.interval);
        heartbeats.delete(sessionId);
        onTimeout();
        return;
      }
      state.alive = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, config.heartbeatIntervalMs),
  };

  heartbeats.set(sessionId, state);

  ws.on("pong", () => {
    state.alive = true;
    logger.debug({ sessionId }, "Pong received");
  });
}

export function markAlive(sessionId: string): void {
  const state = heartbeats.get(sessionId);
  if (state) {
    state.alive = true;
  }
}

export function stopHeartbeat(sessionId: string): void {
  const state = heartbeats.get(sessionId);
  if (state) {
    clearInterval(state.interval);
    heartbeats.delete(sessionId);
  }
}

export function clearAllHeartbeats(): void {
  for (const [id, state] of heartbeats) {
    clearInterval(state.interval);
    heartbeats.delete(id);
  }
}
