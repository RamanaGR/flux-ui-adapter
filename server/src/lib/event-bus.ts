import { EventEmitter } from "node:events";

export interface ScreenshotEvent {
  sessionId: string;
  seq: number;
  filePath: string;
  sizeBytes: number;
  url: string;
  width?: number;
  height?: number;
  createdAt: number;
}

type ScreenshotListener = (event: ScreenshotEvent) => void;

const bus = new EventEmitter();
bus.setMaxListeners(200);

function screenshotKey(sessionId: string): string {
  return `screenshot:${sessionId}`;
}

export function emitScreenshot(
  sessionId: string,
  seq: number,
  meta: { filePath: string; sizeBytes: number; url: string; width?: number; height?: number },
): void {
  const event: ScreenshotEvent = { sessionId, seq, ...meta, createdAt: Date.now() };
  bus.emit(screenshotKey(sessionId), event);
}

export function subscribeScreenshots(sessionId: string, listener: ScreenshotListener): void {
  bus.on(screenshotKey(sessionId), listener);
}

export function unsubscribeScreenshots(sessionId: string, listener: ScreenshotListener): void {
  bus.off(screenshotKey(sessionId), listener);
}
