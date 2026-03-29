import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { buildServer } from "../../src/app.js";
import { closeDb } from "../../src/storage/sqlite.js";
import { clearAllHeartbeats } from "../../src/ws/heartbeat.js";
import { stopFlushWorker } from "../../src/storage/flush-worker.js";

let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  process.env.API_KEY = "test-secret-key";
  process.env.LOG_LEVEL = "silent";

  app = await buildServer();
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  if (addr && typeof addr === "object") {
    baseUrl = `ws://127.0.0.1:${addr.port}`;
  }
});

afterAll(async () => {
  stopFlushWorker();
  clearAllHeartbeats();
  await app.close();
  closeDb();
});

describe("WebSocket handshake auth", () => {
  it("rejects connections without X-API-Key", async () => {
    const ws = new WebSocket(baseUrl);

    const closed = await new Promise<{ code: number }>((resolve) => {
      ws.on("close", (code) => resolve({ code }));
      ws.on("error", () => resolve({ code: 1006 }));
    });

    expect(closed.code).not.toBe(1000);
  });

  it("rejects connections with an invalid X-API-Key", async () => {
    const ws = new WebSocket(baseUrl, { headers: { "x-api-key": "wrong-key" } });

    const closed = await new Promise<{ code: number }>((resolve) => {
      ws.on("close", (code) => resolve({ code }));
      ws.on("error", () => resolve({ code: 1006 }));
    });

    expect(closed.code).not.toBe(1000);
  });

  it("accepts connections with a valid X-API-Key", async () => {
    const ws = new WebSocket(baseUrl, {
      headers: { "x-api-key": "test-secret-key" },
    });

    const opened = await new Promise<boolean>((resolve) => {
      ws.on("open", () => resolve(true));
      ws.on("error", () => resolve(false));
    });

    expect(opened).toBe(true);
    ws.close();
  });

  it("accepts a custom session ID from headers", async () => {
    const customSessionId = "550e8400-e29b-41d4-a716-446655440000";
    const ws = new WebSocket(baseUrl, {
      headers: {
        "x-api-key": "test-secret-key",
        "x-session-id": customSessionId,
      },
    });

    const opened = await new Promise<boolean>((resolve) => {
      ws.on("open", () => resolve(true));
      ws.on("error", () => resolve(false));
    });

    expect(opened).toBe(true);
    ws.close();
  });
});

describe("HTTP endpoints", () => {
  it("GET /health returns status ok", async () => {
    const addr = app.server.address();
    if (!addr || typeof addr !== "object") throw new Error("No address");
    const res = await fetch(`http://127.0.0.1:${addr.port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body).toHaveProperty("uptime");
    expect(body).toHaveProperty("activeConnections");
  });

  it("GET / returns the landing page HTML", async () => {
    const addr = app.server.address();
    if (!addr || typeof addr !== "object") throw new Error("No address");
    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("ChromaBridge");
  });
});
