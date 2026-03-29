import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { logger } from "../lib/logger.js";

export function ensureSessionDir(sessionId: string): string {
  const dir = join(config.snapshotsDir, sessionId);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function writeSnapshot(
  sessionId: string,
  seq: number,
  data: Buffer,
): { filePath: string; sizeBytes: number } {
  const dir = ensureSessionDir(sessionId);
  const ext = detectImageFormat(data);
  const fileName = `${String(seq).padStart(6, "0")}.${ext}`;
  const filePath = join(dir, fileName);

  writeFileSync(filePath, data);

  logger.debug(
    { sessionId, seq, filePath, sizeBytes: data.length },
    "Canvas snapshot written",
  );

  return { filePath, sizeBytes: data.length };
}

function detectImageFormat(buf: Buffer): string {
  if (buf.length >= 4 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) {
    return "webp";
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "jpg";
  }
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return "png";
  }
  return "bin";
}
