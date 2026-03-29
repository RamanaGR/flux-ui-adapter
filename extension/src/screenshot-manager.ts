import type { WebSocketManager } from "./ws-manager.js";
import type { ScreenshotPayload } from "./types.js";

export class ScreenshotManager {
  private timer: ReturnType<typeof setInterval> | null = null;
  private capturing = false;
  private readonly wsManager: WebSocketManager;

  constructor(wsManager: WebSocketManager) {
    this.wsManager = wsManager;
  }

  start(intervalMs: number): void {
    if (this.capturing) return;
    this.capturing = true;

    this.captureOnce();

    this.timer = setInterval(() => {
      this.captureOnce();
    }, intervalMs);

    console.log(`[ChromaBridge] Screenshot capture started (every ${intervalMs}ms)`);
  }

  stop(): void {
    if (!this.capturing) return;
    this.capturing = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    console.log("[ChromaBridge] Screenshot capture stopped");
  }

  isCapturing(): boolean {
    return this.capturing;
  }

  private captureOnce(): void {
    if (!this.wsManager.isConnected()) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;

      chrome.tabs.captureVisibleTab(
        null as unknown as number,
        { format: "jpeg", quality: 70 },
        (dataUrl) => {
          if (chrome.runtime.lastError) {
            console.warn("[ChromaBridge] Screenshot failed:", chrome.runtime.lastError.message);
            return;
          }
          if (!dataUrl) return;

          const payload: ScreenshotPayload = {
            dataUrl,
            url: tab.url || "",
            width: tab.width,
            height: tab.height,
          };

          this.wsManager.sendScreenshot(payload);
          console.log(`[ChromaBridge] Screenshot sent (${Math.round(dataUrl.length / 1024)}KB)`);
        },
      );
    });
  }
}
