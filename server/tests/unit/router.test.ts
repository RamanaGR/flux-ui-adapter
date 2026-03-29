import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { v4 as uuidv4 } from "uuid";
import { WebSocket } from "ws";
import { routeMessage, getNextSeq, resetSeq } from "../../src/ws/router.js";

vi.mock("../../src/handlers/dom-mutation.handler.js", () => ({
  handleDomMutation: vi.fn(),
}));
vi.mock("../../src/handlers/canvas-snapshot.handler.js", () => ({
  handleCanvasSnapshot: vi.fn(),
}));
vi.mock("../../src/storage/sqlite.js", () => ({
  initDb: vi.fn(),
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn(), all: vi.fn() })),
    pragma: vi.fn(),
    exec: vi.fn(),
  })),
  createSession: vi.fn(),
  completeSession: vi.fn(),
  insertDomMutation: vi.fn(),
  insertCanvasSnapshotRef: vi.fn(),
}));
vi.mock("../../src/ws/heartbeat.js", () => ({
  markAlive: vi.fn(),
  startHeartbeat: vi.fn(),
  stopHeartbeat: vi.fn(),
}));

import { handleDomMutation } from "../../src/handlers/dom-mutation.handler.js";
import { handleCanvasSnapshot } from "../../src/handlers/canvas-snapshot.handler.js";
import { markAlive } from "../../src/ws/heartbeat.js";

function makeMockWs(): WebSocket {
  return {
    send: vi.fn(),
    readyState: WebSocket.OPEN,
    on: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
  } as unknown as WebSocket;
}

describe("routeMessage", () => {
  const sessionId = uuidv4();

  beforeEach(() => {
    vi.clearAllMocks();
    resetSeq(sessionId);
  });

  it("routes DOM mutation messages to the DOM handler", () => {
    const ws = makeMockWs();
    const msg = JSON.stringify({
      type: "TYPE_DOM_MUTATION",
      sessionId,
      timestamp: Date.now(),
      compressed: false,
      payload: {
        url: "https://example.com",
        mutations: [{ target: "body", type: "childList" }],
      },
    });

    routeMessage(ws, sessionId, Buffer.from(msg), false);
    expect(handleDomMutation).toHaveBeenCalledOnce();
    expect(handleDomMutation).toHaveBeenCalledWith(
      sessionId,
      1,
      expect.objectContaining({ url: "https://example.com" }),
    );
  });

  it("routes heartbeat messages and marks session alive", () => {
    const ws = makeMockWs();
    const msg = JSON.stringify({
      type: "TYPE_HEARTBEAT",
      sessionId,
      timestamp: Date.now(),
      compressed: false,
      payload: { tabActive: true },
    });

    routeMessage(ws, sessionId, Buffer.from(msg), false);
    expect(markAlive).toHaveBeenCalledWith(sessionId);
  });

  it("routes binary messages to the canvas handler", () => {
    const ws = makeMockWs();
    const imgData = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    const buf = Buffer.alloc(51 + imgData.length);
    buf.writeUInt16LE(0x0001, 0);
    buf.write(sessionId, 2, 36, "ascii");
    buf.writeDoubleLE(Date.now(), 38);
    buf.writeUInt32LE(7, 46);
    buf[50] = 0;
    imgData.copy(buf, 51);

    routeMessage(ws, sessionId, buf, true);
    expect(handleCanvasSnapshot).toHaveBeenCalledOnce();
    expect(handleCanvasSnapshot).toHaveBeenCalledWith(sessionId, 7, expect.any(Buffer));
  });

  it("sends error response on invalid JSON", () => {
    const ws = makeMockWs();
    routeMessage(ws, sessionId, Buffer.from("not-json"), false);
    expect(ws.send).toHaveBeenCalledWith(
      expect.stringContaining("error"),
    );
  });
});

describe("getNextSeq", () => {
  const sid = uuidv4();

  afterEach(() => resetSeq(sid));

  it("increments sequence numbers per session", () => {
    expect(getNextSeq(sid)).toBe(1);
    expect(getNextSeq(sid)).toBe(2);
    expect(getNextSeq(sid)).toBe(3);
  });

  it("resets sequence on resetSeq", () => {
    getNextSeq(sid);
    getNextSeq(sid);
    resetSeq(sid);
    expect(getNextSeq(sid)).toBe(1);
  });
});
