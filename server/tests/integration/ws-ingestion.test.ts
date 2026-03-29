import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { FastifyInstance } from "fastify";
import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { buildServer } from "../../src/app.js";
import { getDb, closeDb } from "../../src/storage/sqlite.js";
import { clearAllHeartbeats } from "../../src/ws/heartbeat.js";
import { stopFlushWorker } from "../../src/storage/flush-worker.js";
import { BINARY_TYPE_CANVAS } from "../../src/schemas/messages.js";

let app: FastifyInstance;
let baseUrl: string;

beforeAll(async () => {
  process.env.DB_PATH = ":memory:";
  process.env.API_KEY = "test-key";
  process.env.SNAPSHOTS_DIR = "./data/test-snapshots";
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

function connectWs(sessionId?: string): Promise<WebSocket> {
  const headers: Record<string, string> = { "x-api-key": "test-key" };
  if (sessionId) headers["x-session-id"] = sessionId;

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(baseUrl, { headers });
    ws.on("open", () => resolve(ws));
    ws.on("error", reject);
  });
}

function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once("message", (data) => resolve(data.toString()));
  });
}

describe("DOM mutation ingestion", () => {
  it("stores a DOM mutation in SQLite", async () => {
    const sessionId = uuidv4();
    const ws = await connectWs(sessionId);

    const msg = {
      type: "TYPE_DOM_MUTATION",
      sessionId,
      timestamp: Date.now(),
      compressed: false,
      payload: {
        url: "https://test.com",
        mutations: [
          { target: "div.content", type: "childList", addedNodes: ["<p>new</p>"] },
        ],
      },
    };

    ws.send(JSON.stringify(msg));

    await new Promise((r) => setTimeout(r, 200));

    const rows = getDb()
      .prepare("SELECT * FROM dom_mutations WHERE session_id = ?")
      .all(sessionId) as Array<{ session_id: string; payload: string; seq: number }>;

    expect(rows.length).toBe(1);
    expect(rows[0].session_id).toBe(sessionId);
    const payload = JSON.parse(rows[0].payload);
    expect(payload.url).toBe("https://test.com");

    ws.close();
  });

  it("increments sequence numbers for multiple mutations", async () => {
    const sessionId = uuidv4();
    const ws = await connectWs(sessionId);

    for (let i = 0; i < 3; i++) {
      ws.send(
        JSON.stringify({
          type: "TYPE_DOM_MUTATION",
          sessionId,
          timestamp: Date.now(),
          compressed: false,
          payload: {
            url: "https://test.com",
            mutations: [{ target: "div", type: "attributes", attributeName: "data-i" }],
          },
        }),
      );
    }

    await new Promise((r) => setTimeout(r, 300));

    const rows = getDb()
      .prepare("SELECT seq FROM dom_mutations WHERE session_id = ? ORDER BY seq")
      .all(sessionId) as Array<{ seq: number }>;

    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    ws.close();
  });
});

describe("Canvas snapshot ingestion", () => {
  it("stores a binary canvas snapshot to filesystem and SQLite", async () => {
    const sessionId = uuidv4();
    const ws = await connectWs(sessionId);

    const fakeJpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(100).fill(0x42)]);
    const headerSize = 51;
    const buf = Buffer.alloc(headerSize + fakeJpg.length);
    buf.writeUInt16LE(BINARY_TYPE_CANVAS, 0);
    buf.write(sessionId, 2, 36, "ascii");
    buf.writeDoubleLE(Date.now(), 38);
    buf.writeUInt32LE(1, 46);
    buf[50] = 0;
    fakeJpg.copy(buf, headerSize);

    ws.send(buf);

    await new Promise((r) => setTimeout(r, 300));

    const rows = getDb()
      .prepare("SELECT * FROM canvas_snapshots WHERE session_id = ?")
      .all(sessionId) as Array<{ session_id: string; file_path: string; size_bytes: number }>;

    expect(rows.length).toBe(1);
    expect(rows[0].file_path).toContain(sessionId);
    expect(rows[0].size_bytes).toBe(fakeJpg.length);

    ws.close();
  });
});

describe("Heartbeat", () => {
  it("responds correctly to heartbeat messages", async () => {
    const sessionId = uuidv4();
    const ws = await connectWs(sessionId);

    ws.send(
      JSON.stringify({
        type: "TYPE_HEARTBEAT",
        sessionId,
        timestamp: Date.now(),
        compressed: false,
        payload: { tabActive: true },
      }),
    );

    await new Promise((r) => setTimeout(r, 100));

    const session = getDb()
      .prepare("SELECT status FROM sessions WHERE id = ?")
      .get(sessionId) as { status: string } | undefined;
    expect(session?.status).toBe("ACTIVE");

    ws.close();
  });
});

describe("Error handling", () => {
  it("returns error for invalid JSON messages", async () => {
    const sessionId = uuidv4();
    const ws = await connectWs(sessionId);

    const errorPromise = waitForMessage(ws);
    ws.send("this is not valid json{{{");

    const response = await errorPromise;
    const parsed = JSON.parse(response);
    expect(parsed).toHaveProperty("error");

    ws.close();
  });
});

describe("Session replay view", () => {
  it("returns 404 for unknown session", async () => {
    const addr = app.server.address();
    if (!addr || typeof addr !== "object") throw new Error("No address");
    const res = await fetch(
      `http://127.0.0.1:${addr.port}/session/00000000-0000-0000-0000-000000000000/view`,
    );
    expect(res.status).toBe(404);
  });

  it("returns a live view page for a session with mutations", async () => {
    const sessionId = uuidv4();
    const ws = await connectWs(sessionId);

    ws.send(
      JSON.stringify({
        type: "TYPE_DOM_MUTATION",
        sessionId,
        timestamp: Date.now(),
        compressed: false,
        payload: {
          url: "https://test.com/replay",
          mutations: [{ target: "div.content", type: "childList", addedNodes: ["<p>Replayed</p>"] }],
        },
      }),
    );

    await new Promise((r) => setTimeout(r, 200));
    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    const addr = app.server.address();
    if (!addr || typeof addr !== "object") throw new Error("No address");
    const res = await fetch(`http://127.0.0.1:${addr.port}/session/${sessionId}/view`);
    expect(res.status).toBe(200);

    const html = await res.text();
    expect(html).toContain("ChromaBridge Live");
    expect(html).toContain(sessionId);
    expect(html).toContain('"/viewer/"');
  });
});

describe("Viewer WebSocket", () => {
  it("sends history on connect and streams live mutations", async () => {
    const sessionId = uuidv4();
    const ingestWs = await connectWs(sessionId);

    ingestWs.send(
      JSON.stringify({
        type: "TYPE_DOM_MUTATION",
        sessionId,
        timestamp: Date.now(),
        compressed: false,
        payload: {
          url: "https://test.com/viewer",
          mutations: [{ target: "div.old", type: "childList", addedNodes: ["<p>historic</p>"] }],
        },
      }),
    );

    await new Promise((r) => setTimeout(r, 200));

    const addr = app.server.address();
    if (!addr || typeof addr !== "object") throw new Error("No address");
    const viewerUrl = `ws://127.0.0.1:${(addr as { port: number }).port}/viewer/${sessionId}`;

    const received: string[] = [];
    const viewerWs = new WebSocket(viewerUrl);

    const historyPromise = new Promise<string>((resolve) => {
      viewerWs.once("message", (data) => resolve(data.toString()));
    });

    await new Promise<void>((resolve, reject) => {
      viewerWs.on("open", () => resolve());
      viewerWs.on("error", reject);
    });

    try {
      const historyMsg = await historyPromise;
      const history = JSON.parse(historyMsg);
      expect(history.type).toBe("HISTORY");
      expect(history.mutations.length).toBe(1);
      expect(history.mutations[0].payload.url).toBe("https://test.com/viewer");

      const livePromise = new Promise<string>((resolve) => {
        viewerWs.once("message", (data) => resolve(data.toString()));
      });

      ingestWs.send(
        JSON.stringify({
          type: "TYPE_DOM_MUTATION",
          sessionId,
          timestamp: Date.now(),
          compressed: false,
          payload: {
            url: "https://test.com/viewer",
            mutations: [{ target: "div.new", type: "attributes", attributeName: "class" }],
          },
        }),
      );

      const liveMsg = await livePromise;
      const live = JSON.parse(liveMsg);
      expect(live.type).toBe("LIVE_MUTATION");
      expect(live.payload.mutations[0].target).toBe("div.new");
    } finally {
      viewerWs.close();
      ingestWs.close();
      await new Promise((r) => setTimeout(r, 100));
    }
  });
});
