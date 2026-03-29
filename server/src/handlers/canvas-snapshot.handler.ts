import { writeSnapshot } from "../storage/file-store.js";
import { insertCanvasSnapshotRef } from "../storage/sqlite.js";
import { emitScreenshot } from "../lib/event-bus.js";
import { ScreenshotPayloadSchema } from "../schemas/messages.js";
import { childLogger } from "../lib/logger.js";

const log = childLogger({ module: "canvas-snapshot" });

export function handleCanvasSnapshot(
  sessionId: string,
  seq: number,
  imageData: Buffer,
): void {
  const { filePath, sizeBytes } = writeSnapshot(sessionId, seq, imageData);
  insertCanvasSnapshotRef(sessionId, seq, filePath, sizeBytes);
  emitScreenshot(sessionId, seq, { filePath, sizeBytes, url: "" });
  log.info({ sessionId, seq, filePath, sizeBytes }, "Canvas snapshot persisted");
}

export function handleScreenshotJson(
  sessionId: string,
  seq: number,
  payload: unknown,
): void {
  const parsed = ScreenshotPayloadSchema.parse(payload);
  const matches = parsed.dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!matches) {
    log.warn({ sessionId, seq }, "Invalid screenshot dataUrl format");
    return;
  }

  const imageData = Buffer.from(matches[1], "base64");
  const { filePath, sizeBytes } = writeSnapshot(sessionId, seq, imageData);
  insertCanvasSnapshotRef(sessionId, seq, filePath, sizeBytes);
  emitScreenshot(sessionId, seq, {
    filePath,
    sizeBytes,
    url: parsed.url,
    width: parsed.width,
    height: parsed.height,
  });
  log.info({ sessionId, seq, filePath, sizeBytes, pageUrl: parsed.url }, "Screenshot persisted");
}
