import { describe, it, expect } from "vitest";
import { deflateRawSync, gzipSync } from "node:zlib";
import { v4 as uuidv4 } from "uuid";
import {
  MessageEnvelopeSchema,
  HeartbeatMessageSchema,
  parseBinaryHeader,
  BINARY_TYPE_CANVAS,
  BINARY_HEADER_SIZE,
} from "../../src/schemas/messages.js";
import { decompressSync } from "../../src/middleware/decompress.js";
import { parseAndValidate, ValidationError } from "../../src/middleware/validate.js";

describe("MessageEnvelopeSchema", () => {
  const sessionId = uuidv4();

  it("rejects envelope with missing type", () => {
    const msg = { sessionId, timestamp: Date.now(), payload: {} };
    const result = MessageEnvelopeSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it("rejects envelope with invalid sessionId", () => {
    const msg = {
      type: "TYPE_HEARTBEAT",
      sessionId: "not-a-uuid",
      timestamp: Date.now(),
      payload: {},
    };
    const result = MessageEnvelopeSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it("accepts a valid heartbeat message", () => {
    const msg = {
      type: "TYPE_HEARTBEAT",
      sessionId,
      timestamp: Date.now(),
      compressed: false,
      payload: { tabActive: true, memoryUsage: 123456 },
    };
    const result = HeartbeatMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it("defaults compressed to false", () => {
    const msg = {
      type: "TYPE_HEARTBEAT",
      sessionId,
      timestamp: Date.now(),
      payload: {},
    };
    const result = MessageEnvelopeSchema.safeParse(msg);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.compressed).toBe(false);
    }
  });
});

describe("parseBinaryHeader", () => {
  it("parses a valid binary canvas header", () => {
    const sessionId = uuidv4();
    const ts = Date.now();
    const seq = 42;

    const buf = Buffer.alloc(BINARY_HEADER_SIZE + 4);
    buf.writeUInt16LE(BINARY_TYPE_CANVAS, 0);
    buf.write(sessionId, 2, 36, "ascii");
    buf.writeDoubleLE(ts, 38);
    buf.writeUInt32LE(seq, 46);
    buf[50] = 0;
    buf.write("test", BINARY_HEADER_SIZE);

    const header = parseBinaryHeader(buf);
    expect(header.sessionId).toBe(sessionId);
    expect(header.timestamp).toBe(ts);
    expect(header.seq).toBe(seq);
    expect(header.compressed).toBe(false);
  });

  it("throws on buffer too short", () => {
    const buf = Buffer.alloc(10);
    expect(() => parseBinaryHeader(buf)).toThrow("too short");
  });

  it("throws on unknown type tag", () => {
    const buf = Buffer.alloc(BINARY_HEADER_SIZE);
    buf.writeUInt16LE(0xffff, 0);
    expect(() => parseBinaryHeader(buf)).toThrow("Unknown binary type tag");
  });

  it("detects compressed flag", () => {
    const sessionId = uuidv4();
    const buf = Buffer.alloc(BINARY_HEADER_SIZE);
    buf.writeUInt16LE(BINARY_TYPE_CANVAS, 0);
    buf.write(sessionId, 2, 36, "ascii");
    buf.writeDoubleLE(Date.now(), 38);
    buf.writeUInt32LE(1, 46);
    buf[50] = 1;

    const header = parseBinaryHeader(buf);
    expect(header.compressed).toBe(true);
  });
});

describe("decompressSync", () => {
  it("decompresses deflateRaw data", () => {
    const original = Buffer.from("Hello, compressed world!");
    const compressed = deflateRawSync(original);
    const result = decompressSync(compressed);
    expect(result.toString()).toBe(original.toString());
  });

  it("decompresses gzip data", () => {
    const original = Buffer.from("Hello, gzipped world!");
    const compressed = gzipSync(original);
    expect(compressed[0]).toBe(0x1f);
    expect(compressed[1]).toBe(0x8b);
    const result = decompressSync(compressed);
    expect(result.toString()).toBe(original.toString());
  });

  it("auto-detects gzip vs raw deflate", () => {
    const text = '{"url":"https://example.com","screenshots":[]}';
    const gzipped = gzipSync(Buffer.from(text));
    const rawDeflated = deflateRawSync(Buffer.from(text));

    expect(decompressSync(gzipped).toString()).toBe(text);
    expect(decompressSync(rawDeflated).toString()).toBe(text);
  });

  it("throws on invalid compressed data", () => {
    const garbage = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    expect(() => decompressSync(garbage)).toThrow("Failed to decompress");
  });
});

describe("parseAndValidate", () => {
  const sessionId = uuidv4();

  it("parses and validates a heartbeat JSON string", () => {
    const msg = {
      type: "TYPE_HEARTBEAT",
      sessionId,
      timestamp: Date.now(),
      compressed: false,
      payload: { tabActive: true },
    };
    const result = parseAndValidate(JSON.stringify(msg));
    expect(result.type).toBe("TYPE_HEARTBEAT");
    expect(result.sessionId).toBe(sessionId);
  });

  it("throws ValidationError on invalid JSON", () => {
    expect(() => parseAndValidate("not json")).toThrow(ValidationError);
  });

  it("throws ValidationError on missing required fields", () => {
    expect(() => parseAndValidate(JSON.stringify({ foo: "bar" }))).toThrow(
      ValidationError,
    );
  });

  it("throws ValidationError on unknown message type", () => {
    const msg = {
      type: "TYPE_UNKNOWN",
      sessionId,
      timestamp: Date.now(),
      compressed: false,
      payload: {},
    };
    expect(() => parseAndValidate(JSON.stringify(msg))).toThrow(ValidationError);
  });
});
