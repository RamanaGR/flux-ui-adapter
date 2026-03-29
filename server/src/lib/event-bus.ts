import { EventEmitter } from "node:events";

export interface MutationEvent {
  sessionId: string;
  seq: number;
  payload: unknown;
  createdAt: number;
}

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

type MutationListener = (event: MutationEvent) => void;
type ScreenshotListener = (event: ScreenshotEvent) => void;

const bus = new EventEmitter();
bus.setMaxListeners(200);

function mutationKey(sessionId: string): string {
  return `mutation:${sessionId}`;
}

function screenshotKey(sessionId: string): string {
  return `screenshot:${sessionId}`;
}

export function emitMutation(sessionId: string, seq: number, payload: unknown): void {
  const event: MutationEvent = { sessionId, seq, payload, createdAt: Date.now() };
  bus.emit(mutationKey(sessionId), event);
}

export function subscribe(sessionId: string, listener: MutationListener): void {
  bus.on(mutationKey(sessionId), listener);
}

export function unsubscribe(sessionId: string, listener: MutationListener): void {
  bus.off(mutationKey(sessionId), listener);
}

export function subscriberCount(sessionId: string): number {
  return bus.listenerCount(mutationKey(sessionId));
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
