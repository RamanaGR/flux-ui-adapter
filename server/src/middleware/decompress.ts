import { gunzip, gunzipSync, inflateRaw, inflateRawSync } from "node:zlib";
import { logger } from "../lib/logger.js";

const GZIP_MAGIC_0 = 0x1f;
const GZIP_MAGIC_1 = 0x8b;

function isGzip(data: Buffer): boolean {
  return data.length >= 2 && data[0] === GZIP_MAGIC_0 && data[1] === GZIP_MAGIC_1;
}

export function decompressSync(data: Buffer): Buffer {
  try {
    if (isGzip(data)) {
      return gunzipSync(data);
    }
    return inflateRawSync(data);
  } catch (err) {
    logger.error({ err }, "Decompression failed");
    throw new Error("Failed to decompress payload");
  }
}

export function decompress(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const handler = (err: Error | null, result: Buffer) => {
      if (err) {
        logger.error({ err }, "Async decompression failed");
        reject(new Error("Failed to decompress payload"));
      } else {
        resolve(result);
      }
    };

    if (isGzip(data)) {
      gunzip(data, handler);
    } else {
      inflateRaw(data, handler);
    }
  });
}
