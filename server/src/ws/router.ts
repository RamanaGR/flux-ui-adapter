import { WebSocket, RawData } from "ws";
import { childLogger } from "../lib/logger.js";
import { decompressSync } from "../middleware/decompress.js";
import { parseAndValidate, ValidationError } from "../middleware/validate.js";
import {
  MessageType,
  parseBinaryHeader,
  BINARY_HEADER_SIZE,
  type MessageEnvelope,
} from "../schemas/messages.js";
import { handleCanvasSnapshot, handleScreenshotJson } from "../handlers/canvas-snapshot.handler.js";
import { markAlive } from "./heartbeat.js";

const log = childLogger({ module: "router" });

const sequenceCounters = new Map<string, number>();

export function getNextSeq(sessionId: string): number {
  const current = sequenceCounters.get(sessionId) ?? 0;
  const next = current + 1;
  sequenceCounters.set(sessionId, next);
  return next;
}

export function resetSeq(sessionId: string): void {
  sequenceCounters.delete(sessionId);
}

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

function isGzipBuffer(data: Buffer): boolean {
  return data.length >= 2 && data[0] === GZIP_MAGIC_0 && data[1] === GZIP_MAGIC_1;
}

export function routeMessage(
  ws: WebSocket,
  sessionId: string,
  raw: RawData,
  isBinary: boolean,
): void {
  try {
    if (isBinary) {
      const buf = Buffer.from(raw as ArrayBuffer);
      if (isGzipBuffer(buf)) {
        const json = decompressSync(buf).toString("utf-8");
        routeJsonMessage(ws, sessionId, json);
      } else {
        routeBinaryMessage(sessionId, buf);
      }
    } else {
      routeJsonMessage(ws, sessionId, raw.toString("utf-8"));
    }
  } catch (err) {
    if (err instanceof ValidationError) {
      log.warn({ sessionId, error: err.message }, "Validation error");
      ws.send(JSON.stringify({ error: err.message }));
    } else {
      log.error({ sessionId, err }, "Unexpected error routing message");
    }
  }
}

function routeBinaryMessage(sessionId: string, data: Buffer): void {
  const header = parseBinaryHeader(data);
  let imageData = data.subarray(BINARY_HEADER_SIZE);

  if (header.compressed) {
    imageData = decompressSync(imageData);
  }

  const seq = header.seq || getNextSeq(sessionId);
  handleCanvasSnapshot(header.sessionId, seq, imageData);
  log.debug({ sessionId, seq, size: imageData.length }, "Canvas snapshot routed");
}

function routeJsonMessage(
  ws: WebSocket,
  sessionId: string,
  raw: string,
): void {
  let jsonStr = raw;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ValidationError("Invalid JSON", []);
  }

  const envelope = parsed as { compressed?: boolean };
  if (envelope.compressed && typeof (parsed as Record<string, unknown>).payload === "string") {
    const compressedPayload = Buffer.from(
      (parsed as Record<string, string>).payload,
      "base64",
    );
    const decompressed = decompressSync(compressedPayload);
    const decompressedObj = {
      ...(parsed as Record<string, unknown>),
      compressed: false,
      payload: JSON.parse(decompressed.toString("utf-8")),
    };
    jsonStr = JSON.stringify(decompressedObj);
  }

  const validated: MessageEnvelope = parseAndValidate(jsonStr);

  switch (validated.type) {
    case MessageType.HEARTBEAT: {
      markAlive(sessionId);
      log.debug({ sessionId }, "Heartbeat processed");
      break;
    }
    case MessageType.CANVAS_SNAPSHOT: {
      const seq = getNextSeq(sessionId);
      handleScreenshotJson(validated.sessionId, seq, validated.payload);
      break;
    }
  }
}
